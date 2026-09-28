/**
 * WHAT THE READER DOES TO A KHATMAH — start one, pace it by a date or by a
 * length, read in it (a page turn, a page ticked or unticked), pin a place
 * in it, finish today or step back, start today or the whole plan again,
 * and abandon it. Each is one write through the store (`quranState.ts`),
 * built from the pure edits in `khatmahEdits.ts`.
 *
 * `khatmahTracksPage` is here too: it is the question every page turn
 * asks before it writes — whether reading on this page counts towards the
 * plan at all.
 *
 * Moved out of `quranState.ts` unchanged (docs/rewrite-plan.md, step
 * 2.4), and its importers pointed here in the same step, so the store
 * never re-exported it and no import ever ran in a circle.
 */
import { TOTAL_AYAHS, ayahIndexOf } from './ayahIndex';
import { firstAyahOfPage } from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import {
  addRange,
  normalizeRanges,
  rangesCover,
  rangesEqual,
  subtractRange,
} from './khatmahDone';
import type { KhatmahPlan, QuranState } from './quranTypes';
import {
  activeKhatmah,
  ayahsThroughHafsPage,
  ayahsThroughPage,
  isLivePlan,
  khatmahAyahsRead,
  khatmahDone,
  khatmahReachAyah,
  khatmahStartAyah,
  localYmd,
  pagesThroughAyahs,
  planFrom,
} from './khatmahProgress';
import {
  khatmahCreditWindow,
  khatmahCurrentPortion,
  khatmahPaceToday,
  khatmahPageInWindow,
  planDays,
  portionEnd,
} from './khatmahSchedule';
import {
  khatmahDurationForDaysLeft,
  khatmahFinishTarget,
} from './khatmahStatus';
import {
  doneFilled,
  doneRewound,
  pacingStamp,
  pinned,
  planStart,
  repaced,
  settled,
  unpaced,
  withDaySnapshot,
  withMark,
  withMarks,
  withPaceOfDay,
} from './khatmahEdits';
import { getQuranState, updateQuranState } from './quranState';

/**
 * Begin a plan.
 *
 * `startingAt` is for a khatmah already under way: the page the reader is
 * ON, in the muṣḥaf they are reading it in. Everything before that page
 * counts as read, and the plan's days cover what is left.
 *
 * The page is the reader's own — Warsh page 143 is not Ḥafṣ page 143 —
 * so it is converted through ayahs, which every riwayah agrees on. See
 * `planStart` for why progress keeps that exact figure while the day cut
 * takes the Ḥafṣ page below it.
 */
export function startKhatmah(
  targetDays: number,
  startingAt?: { page: number; riwayah?: RiwayahId },
  /**
   * A date to finish by — the plan is then paced by the calendar rather
   * than by `targetDays`, which is still stored so that taking the date
   * off later lands on a plan of a sensible length rather than on one.
   */
  deadline?: string,
): void {
  const { from, ayahs } = startingAt
    ? planStart(startingAt)
    : { from: 0, ayahs: 0 };
  const now = Date.now();
  const plan: KhatmahPlan = {
    id: `${now}`,
    startedAt: now,
    targetDays,
    fromPage: from,
    pagesRead: pagesThroughAyahs(ayahs),
    ayahsRead: ayahs,
    completedAt: null,
    /**
     * THE PACING IS STAMPED FROM THE FIRST MOMENT, whichever mode it is
     * in — a plan made today and a plan re-paced today are the same kind
     * of claim, and only a stamp on both lets the merge tell which of two
     * devices spoke last (`pacedAt`).
     */
    pacedAt: now,
    pacedDay: localYmd(now),
    pacedFrom: from,
    ...(deadline ? { deadline } : {}),
  };
  const paced = deadline ? withPaceOfDay(plan, now) : plan;
  updateQuranState(prev => ({
    ...prev,
    // One active plan at a time; completed plans stay for history.
    khatmah: [...prev.khatmah.filter(k => !isLivePlan(k)), paced],
  }));
}

/**
 * Give a plan a date to be finished by.
 *
 * It is how a plan is created with a deadline, the re-pace for a plan
 * whose date has gone by, and the switch for a reader who started with a
 * length and now has a day in mind. Setting the date re-cuts today as
 * well, because the old cut was made against a number of days that no
 * longer applies — which is the one moment the pace is allowed to change
 * mid-day.
 */
export function setKhatmahDeadline(deadline: string): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const at = pacingStamp(active);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k => {
        if (k.id !== active.id) return k;
        const next = { ...repaced(k, at), deadline };
        delete next.pace;
        const pace = khatmahPaceToday(next);
        return pace ? { ...next, pace } : next;
      }),
    };
  });
}

/**
 * Pace the plan by a number of days again — `days` of reading from today.
 *
 * This is the other half of the switch, and it is also how the length of
 * a duration plan is changed, which was not possible before: both are the
 * same sentence, "I want what is left to take this many days".
 *
 * `targetDays` is the plan's whole length, not what remains, so it is
 * solved for rather than assigned (`khatmahDurationForDaysLeft`) — a
 * reader two thirds of the way through a book who asks for ten more days
 * is asking for portions a third of the book divided by ten, and the plan
 * that hands those out is a thirty-day one, not a ten-day one.
 */
export function setKhatmahDuration(days: number): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const at = pacingStamp(active);
    const targetDays = khatmahDurationForDaysLeft(active, days, at);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k => {
        if (k.id !== active.id) return k;
        const next = { ...repaced(k, at), targetDays };
        // The date, and the cut that was made against it. A duration plan
        // reads neither, and a stale one left on the blob would be synced
        // by every device and understood by none.
        delete next.deadline;
        delete next.pace;
        return next;
      }),
    };
  });
}

export function recordKhatmahProgress(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  /**
   * The first page of the stretch actually turned past.
   *
   * It is what the reading credits and what it may claim. A turn knows
   * it (`recordKhatmahPageTurn` passes it) and crediting only the pages
   * crossed is the honest reading of one.
   *
   * ABSENT MEANS "I HAVE READ UP TO HERE" — a catch-up rather than a
   * turn, credited from the plan's start, which is what a caller naming
   * a page and nothing else can only mean. Nothing in the app takes that
   * path today; it is the shape of the function's own contract.
   */
  fromPage?: number,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    // The page is converted to ayahs FIRST, then compared. Comparing pages
    // would be comparing two different muṣḥafs the moment the reader
    // switched riwayah, and the high-water mark would jump or stall.
    const reached = ayahsThroughPage(page, riwayah);
    /**
     * THE SET FIRST; the high-water fields are written FROM it.
     *
     * Everything read up to `page` that falls inside the plan's credit
     * window is marked done. The window is what stops a future day being
     * banked (`khatmahCreditWindow`); within it, a page read is a page
     * done however the reader got there.
     */
    const window = khatmahCreditWindow(active);
    const start = khatmahStartAyah(active);
    const credited = Math.min(reached, window[1]);
    const floor = Math.max(start, window[0]);
    const turnedFrom =
      fromPage === undefined
        ? floor
        : (() => {
            const at = firstAyahOfPage(
              Math.max(1, Math.min(fromPage, page)),
              riwayah,
            );
            return Math.max(floor, ayahIndexOf(at.surah, at.ayah));
          })();
    /**
     * ── WHAT A TURN CREDITS IS WHAT IT TURNED PAST ────────────────────
     *
     * It used to credit everything from the plan's start to the page
     * reached, on the reasoning that a page read is a page done however
     * the reader got there. That was a deliberate trade with a stated
     * bound: a ten-page slack, the most a plan
     * could ever be wrong by, because a turn starting further ahead than
     * that was refused outright.
     *
     * Replacing the slack with the portion window took the bound away
     * and nothing said so. A portion is a twentieth of the book on a
     * thirty-day plan and an eighth of it on a seven-day one, so an
     * arrival mid-portion plus one page turn could bank eighty pages
     * nobody had read — silently, and reported as progress.
     *
     * The pages turned past are known (`recordKhatmahPageTurn` passes
     * them) and they are the honest answer. A fling still credits every
     * page it crossed, which is what issue #44 asked for; an arrival
     * followed by reading on credits what was read and leaves the pages
     * behind it unread — which is exactly what the card's own row now
     * offers to send the reader back for.
     */
    const filled =
      credited >= turnedFrom
        ? addRange(khatmahDone(active), turnedFrom, credited, TOTAL_AYAHS)
        : khatmahDone(active);
    /**
     * READING IS A DATED CLAIM TOO — AND ONLY ABOUT THE PAGES IT CROSSED.
     *
     * It used to log one only when the reading crossed something this
     * device had denied, on the reasoning that the union carries the
     * rest. The union does carry it, and carries it UNDATED, which is
     * where the "khatmah dragged back to its old point" report came from:
     * a stretch un-marked on the phone on Monday and read on the Mac on
     * Tuesday merged as Monday's denial replayed over Tuesday's reading,
     * every round, because nothing said Tuesday was later. The reading
     * this device just did is a fact with a time on it, exactly like the
     * un-mark it has to out-rank, so it is logged like one.
     *
     * The width matters more than it looks. Crediting runs from the
     * plan's start, so a claim over the credited span would say "all of
     * this is read" and erase every skipped page behind the reader — one
     * page turn after an un-mark and the hole closed itself. The pages
     * turned past are what the reader can honestly claim.
     *
     * The log does not grow a claim per turn: `compactMarks` resolves the
     * run of turns back into the stretch they amount to.
     */
    const marks =
      credited >= turnedFrom
        ? withMark(active, turnedFrom, credited, 1, true)
        : active.marks;
    const next = settled(active, filled, marks);
    // By CONTENT, not identity: every range operation builds a new array,
    // and a turn that re-reads credited ground must not persist, re-render
    // two screens and throw away two memos for a set that did not change.
    if (
      marks === active.marks &&
      rangesEqual(next.done, khatmahDone(active)) &&
      next.ayahsRead <= khatmahAyahsRead(active)
    ) {
      return prev;
    }
    const done = next.ayahsRead;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...next,
              // A PIN IS A STARTING POINT, NOT AN ANCHOR.
              //
              // `khatmahCurrentPage` answers with the pinned page while a
              // pin is set, whatever has been read since. That was already
              // odd — "Continue" kept offering a page the reader had gone
              // past — and it became a stall once reading was gated on the
              // plan's own frontier: pin at page 300, read one page, and
              // the next turn is judged against a frontier still sitting
              // at 300 and refused. The plan froze a page after the pin.
              //
              // So the pin is spent when the reading reaches it, exactly as
              // `finishKhatmahPortion` spends one inside the portion it
              // finishes. Tracking goes back to being derived from what has
              // been read, which is where it can move.
              ...pinned(
                k,
                k.position &&
                  ayahIndexOf(k.position.surah, k.position.ayah) <= done
                  ? null
                  : k.position,
              ),
              completedAt: done >= TOTAL_AYAHS ? Date.now() : null,
            }
          : k,
      ),
    };
  });
}

/**
 * Is the reading in front of the reader the khatmah's own reading?
 *
 * A khatmah is a promise about ONE trail through the muṣḥaf, and the
 * reader has every other reason to be somewhere else in it: a bookmark,
 * a juz they wanted to hear, Al-Kahf on a Friday, the surah a search
 * landed on. Progress used to be credited from wherever the pages were
 * turning, so an evening in juz 30 could carry a plan sitting at page 50
 * to page 590 — six hundred pages the reader never read, and no way back
 * to the real place except by hand.
 *
 * The test is the trail, not the button that opened the reader. A page at
 * or behind the plan's own next page IS the khatmah — that is what
 * "Continue" hands you, and what a bookmark on the same page means too.
 * A page ahead of it is not, however the reader got there, and reading
 * there leaves the plan exactly where it was.
 *
 * Which leaves two ways to take the plan somewhere else on purpose, both
 * of them explicit and neither of them gated by this: pinning a position
 * from an ayah's own panel (`setKhatmahPosition` — the frontier becomes
 * the pinned page, so reading from there counts immediately), and marking
 * the portion read (`finishKhatmahPortion` — the frontier moves to the
 * start of the next one). Reading is what has to prove it belongs; saying
 * so out loud does not.
 *
 * ── AND A FEW PAGES AHEAD IS STILL THE SAME TRAIL — #44, second round ─
 *
 * The test above was `page <= frontier` exactly, and that is a hair
 * trigger: the plan's frontier sits ON the page the reader is turning
 * from, every single turn, so there is no slack in it anywhere. Get one
 * page ahead — by ANY means, and the ordinary ones are enough: open the
 * reader at a page, follow a link, let a fast flick settle somewhere the
 * pager corrected — and this said no to that turn, and then to every turn
 * after it, because each one starts from a page further ahead than the
 * last. The plan stopped moving for the rest of the session while the
 * pages kept turning, with nothing on screen to say why. That is the
 * second half of #44: the crossing was fixed and the hair trigger was
 * not, and it was reported back as "works for about six swipes, then it
 * blocks again".
 *
 * So the trail has a width. A page within ten pages of
 * the frontier is the plan's own reading and the turn from it counts —
 * which credits the pages in between, because a high-water mark is the
 * only shape progress has here. That is the trade: skip five pages on
 * purpose and read on, and the plan will count those five. A hizb is the
 * most it can ever be wrong by, it is wrong in the direction the reader
 * can see and correct, and it cannot be wrong silently for ever.
 *
 * Beyond that width nothing changes: juz 30 on a Friday is four hundred
 * pages from a plan sitting at page 50, a bookmark across the muṣḥaf is
 * hundreds, and both are still refused.
 */
/**
 * WHAT READING CAN COUNT RIGHT NOW — the plan's own rule, in ayahs.
 *
 * A page read inside today's portion counts, however the reader arrived:
 * another session, the index, a surah opened for its own sake. Reading
 * that belongs to a FUTURE day does not — it has not been earned, and
 * counting it would let a plan be finished out of order without ever
 * having read what lies between.
 *
 * With one exception, which is the same principle rather than a hole in
 * it: once today's portion is finished, reading on into the next one
 * counts too. Reading ahead is still reading, and a reader who has done
 * their day and carries on should not be told it did not happen.
 *
 * This replaces the ten-page slack, which approximated the same
 * idea with distance — ten pages either side of the frontier, chosen
 * because a high-water mark had to count everything in between and ten
 * was the most it could be wrong by. A set of pages read has no such
 * cost, so the window can be what it always should have been: the
 * portion.
 */
/**
 * Mark one page of the plan read, or unread — by hand, from the mark
 * beside the surah name.
 *
 * NOT GATED BY THE CREDIT WINDOW, and deliberately: the window is what
 * READING has to satisfy, because reading is ambiguous — the app is
 * inferring intent from page turns and must not bank a future day off a
 * glance. A tap is not an inference. It is the reader saying which pages
 * they have read, which is the same standing `finishKhatmahPortion` and
 * `setKhatmahPosition` already have: "reading is what has to prove it
 * belongs; saying so out loud does not".
 *
 * So this is also the way out of a wrong count in either direction —
 * pages the plan credited that you had not read, and pages you read
 * somewhere it could not see.
 *
 * Unmarking is what the old shape could never do. A high-water mark can
 * only be wound back to a point, taking everything after it along; a set
 * can lose one page out of the middle and keep the rest.
 */
export function toggleKhatmahPageDone(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const first = firstAyahOfPage(page, riwayah);
    const from = Math.max(khatmahStartAyah(active), ayahIndexOf(first.surah, first.ayah));
    const to = ayahsThroughPage(page, riwayah);
    // A page entirely behind the plan's own start is not its to mark.
    if (to < from) return prev;
    // Nor is one beyond what the plan may credit today. A tap is a claim
    // about a page, not a licence to skip the portions in between — see
    // `khatmahPageInWindow`. The mark is not offered out there either;
    // this is the same rule, held where it cannot be got around.
    if (!khatmahPageInWindow(active, page, riwayah)) return prev;
    const current = khatmahDone(active);
    const wasDone = rangesCover(current, from, to);
    const changed = wasDone
      ? subtractRange(current, from, to, TOTAL_AYAHS)
      : addRange(current, from, to, TOTAL_AYAHS);
    // A TAP IS THE READER SPEAKING, so it is dated and travels. Without
    // this the other device's set would put an un-marked page straight
    // back on the next merge — see `AyahMark`.
    const next = settled(active, changed, withMark(active, from, to, wasDone ? 0 : 1));
    const start = khatmahStartAyah(active);
    const everything = rangesCover(next.done, start, TOTAL_AYAHS);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...next,
              // Unmarking a page of a finished khatmah re-opens it; the
              // plan is only complete while everything really is read.
              completedAt: everything ? (k.completedAt ?? Date.now()) : null,
            }
          : k,
      ),
    };
  });
}

export function khatmahTracksPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  s: QuranState = getQuranState(),
): boolean {
  const plan = activeKhatmah(s);
  if (!plan) return false;
  return khatmahPageInWindow(plan, page, riwayah);
}

/**
 * Credit a page turn to the khatmah, if the turn belongs to it.
 *
 * The pager's step is the muṣḥaf's, not the plan's: a phone turns one
 * page and a spread turns two, and in both cases what was completed is
 * the page (or pages) left behind. `recordKhatmahProgress` is a
 * high-water mark, so naming the last completed page covers the pair.
 *
 * ── A FLING CROSSES MORE THAN TWO — issue #44 ─────────────────────────
 *
 * This used to credit a step of exactly one or two and nothing else, on
 * the reasoning that one is a phone and two is a spread. But the pager
 * reports where a scroll came to REST, and a hard fling on Android
 * crosses several pages before it settles: the reader sees every one of
 * them go past and the plan is told about none of it.
 *
 * That alone would be a page or two lost. What made it a stall is the
 * gate above: the next turn starts from a page now AHEAD of the plan's
 * frontier, `khatmahTracksPage` says no, and every turn after it says no
 * too. One fling and the plan is frozen for the rest of the session,
 * silently — reported as a khatmah card stuck at page 254 while the
 * reader was at 264, with "Continue reading" tracking correctly the
 * whole time, because the marker has no such gate.
 *
 * So: any FORWARD settle credits the page left behind, however many that
 * crossing covered. What it does not do is credit a jump — those do not
 * come through here as a step at all. `jumpToPage` reports the same page
 * as both arguments (see mushafReaderCore), so the rail, go-to-page, a
 * bookmark and a search result all land with nothing completed, which is
 * the distinction this function actually cares about.
 */
export function recordKhatmahPageTurn(
  prevPage: number,
  newPage: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): void {
  if (!khatmahTracksPage(prevPage, riwayah)) return;
  if (newPage <= prevPage) return;
  // The pages left behind are `prevPage … newPage - 1` — every one of
  // them, because a fling settles several pages on (#44) and the reader
  // saw all of them. That span is also what the reading may CLAIM about
  // pages it was told were skipped; see `recordKhatmahProgress`.
  recordKhatmahProgress(newPage - 1, riwayah, prevPage);
}

/**
 * Pin an explicit "I am here" position (v2.7.28). Also aligns
 * `pagesRead` to the pinned page (pages before it count as read) —
 * moving backward is allowed: an explicit pin is authoritative.
 */
export function setKhatmahPosition(
  surah: number,
  ayah: number,
  page: number,
): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...pinned(k, { surah, ayah, page }),
              // Pages before the pinned AYAH count as read. Derived from
              // the ayah, not the page, so pinning in one riwayah and
              // reading in the other agree.
              // Ayahs before the pinned one count as read — the same
              // "everything before here" rule the page form has always
              // had, expressed in the coordinate that survives a riwayah
              // switch.
              // A pin is the reader saying where they are, and it is
              // authoritative in both directions — what is behind it is
              // read, what is ahead is not — which is what the mirror has
              // always said of a pin. Two claims, one act, in that order;
              // the second is the one the union would otherwise undo.
              ...settled(
                k,
                normalizeRanges(
                  ayahIndexOf(surah, ayah) - 1 >= khatmahStartAyah(k)
                    ? [[khatmahStartAyah(k), ayahIndexOf(surah, ayah) - 1]]
                    : [],
                  TOTAL_AYAHS,
                ),
                withMarks(k, [
                  [khatmahStartAyah(k), ayahIndexOf(surah, ayah) - 1, 1],
                  [ayahIndexOf(surah, ayah), TOTAL_AYAHS, 0],
                ]),
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/** Clear the pinned position (falls back to automatic page tracking). */
export function clearKhatmahPosition(): void {
  updateQuranState(prev => ({
    ...prev,
    khatmah: prev.khatmah.map(k =>
      k.completedAt == null ? { ...k, ...pinned(k, null) } : k,
    ),
  }));
}

/** Rewind only today's progress (to the day-start snapshot). */
export function resetKhatmahToday(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const today = localYmd();
    // No progress today — nothing to rewind. The REACH, not the
    // contiguous run: with a hole behind the reader the run stops at the
    // hole, and "nothing to rewind" rewound everything past it (caught
    // by the two-device fuzz, 2026-09-22).
    const baseAyahs =
      active.dayStartDate === today
        ? (active.dayStartAyahsRead ??
          ayahsThroughPage(
            active.dayStartPagesRead ?? active.pagesRead,
            DEFAULT_RIWAYAH,
          ))
        : khatmahReachAyah(active);
    const basePages = pagesThroughAyahs(baseAyahs);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...settled(
                k,
                doneRewound(k, baseAyahs),
                withMark(k, baseAyahs + 1, TOTAL_AYAHS, 0),
              ),
              dayStartDate: today,
              dayStartPagesRead: basePages,
              dayStartAyahsRead: baseAyahs,
              // Drop a pin that now sits ahead of where the rewind left
              // us — compared as ayahs, since the pin's page may belong
              // to the other muṣḥaf.
              ...pinned(
                k,
                k.position &&
                  ayahIndexOf(k.position.surah, k.position.ayah) > baseAyahs + 1
                  ? null
                  : k.position,
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

/** Restart the active plan from page 0 with a fresh clock. */
export function resetKhatmahAll(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    // Back to where the PLAN began, which is page 0 for most plans and
    // the reader's own start for one begun partway (issue #17). Rewinding
    // such a plan to the opening would hand it back a hundred pages the
    // reader never asked it to cover.
    const from = planFrom(active);
    const ayahs = ayahsThroughHafsPage(from);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              // Without the day's cut: it was made against reading that
              // is being undone, and the first write of the new schedule
              // makes a fresh one.
              ...unpaced(k),
              startedAt: Date.now(),
              ...settled(
                k,
                doneRewound(k, ayahs),
                withMark(k, ayahs + 1, TOTAL_AYAHS, 0),
              ),
              /**
               * "With a fresh schedule" includes the page the schedule is
               * measured from (`pacedFrom`). A plan re-paced at page 300
               * and then restarted would otherwise be three hundred pages
               * behind the moment it began again. The length or the date
               * is kept — that is the plan; this is the reading.
               */
              pacedAt: pacingStamp(k),
              pacedDay: localYmd(),
              pacedFrom: from,
              ...pinned(k, null),
              dayStartDate: localYmd(),
              dayStartPagesRead: from,
              dayStartAyahsRead: ayahs,
              completedAt: null,
            }
          : k,
      ),
    };
  });
}

export function abandonKhatmah(id: string): void {
  const at = Date.now();
  updateQuranState(prev => ({
    ...prev,
    // A WRITE, not a deletion — see `abandonedAt`. The row stays so the
    // abandonment can reach the other devices; `coerceKhatmah` drops it
    // once it is older than any peer could still argue about.
    khatmah: prev.khatmah.map(k =>
      k.id === id && k.abandonedAt == null ? { ...k, abandonedAt: at } : k,
    ),
  }));
}

export function finishKhatmahPortion(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const portion = khatmahFinishTarget(active);
    const to = portion.to;
    // Already covered — by the set, not the mirror, which a hole behind
    // the reader would hold back even with the portion fully read.
    if (rangesCover(khatmahDone(active), portion.from, to)) return prev;
    /**
     * The claim is THE PORTION, not everything from the plan's start.
     * "Finish today's reading" says nothing about a page the reader
     * un-marked last week, and a claim from the start would be newer than
     * that denial and erase it. The fill still runs from the start, as
     * reading credit does; the replay puts the older holes back.
     */
    const next = settled(
      active,
      doneFilled(active, to),
      withMark(active, portion.from, to, 1),
    );
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...withDaySnapshot(k),
              ...next,
              // A pin inside the portion just read is spent; leaving it
              // would send "continue" backwards into finished ground.
              ...pinned(
                k,
                k.position && ayahIndexOf(k.position.surah, k.position.ayah) <= to
                  ? null
                  : k.position,
              ),
              completedAt: rangesCover(next.done, khatmahStartAyah(k), TOTAL_AYAHS)
                ? (k.completedAt ?? Date.now())
                : null,
            }
          : k,
      ),
    };
  });
}

/**
 * Step back one portion, so the one before the current becomes current.
 *
 * The undo for a "done" pressed by mistake, and the way back into
 * yesterday's reading. Progress is rewound to the end of the portion
 * before last, which is what makes the previous one current again; the
 * day snapshot moves with it so the card does not go on claiming a day
 * the reader has just stepped out of.
 */
export function stepKhatmahBack(): void {
  updateQuranState(prev => {
    const active = prev.khatmah.find(isLivePlan);
    if (!active) return prev;
    const days = planDays(active);
    const current = khatmahCurrentPortion(active).day;
    const to = portionEnd(days, current - 2, planFrom(active));
    if (to >= khatmahAyahsRead(active)) return prev;
    const today = localYmd();
    const pages = pagesThroughAyahs(to);
    return {
      ...prev,
      khatmah: prev.khatmah.map(k =>
        k.id === active.id
          ? {
              ...k,
              ...settled(k, doneRewound(k, to), withMark(k, to + 1, TOTAL_AYAHS, 0)),
              dayStartDate: today,
              dayStartAyahsRead: to,
              dayStartPagesRead: pages,
              ...pinned(
                k,
                k.position && ayahIndexOf(k.position.surah, k.position.ayah) > to + 1
                  ? null
                  : k.position,
              ),
              completedAt: null,
            }
          : k,
      ),
    };
  });
}
