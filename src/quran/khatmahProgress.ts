/**
 * WHERE THE READER IS in a khatmah — the plan's units (pages and ayahs,
 * the Ḥafṣ page every cut is made in, the local day), the set of what
 * was read, the reach, and the holes left behind.
 *
 * Pure: every function takes a plan and answers, and nothing here reads
 * or writes the store. The one piece of module state is a memo of the
 * last hole walk, which the store's test reset clears.
 *
 * Moved out of `quranState.ts` unchanged (docs/rewrite-plan.md, step
 * 2.2); the store re-exports what was exported, so importers are the same
 * until step 2.5.
 */
import { TOTAL_AYAHS, ayahAtIndex, ayahIndexOf } from './ayahIndex';
import {
  findPageForAyah,
  firstAyahOfPage,
  totalPagesForRiwayah,
} from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import { islamicDayKey } from '../hijri/islamicDay';
import {
  applyMarks,
  firstMissingFrom,
  countWithin,
  highestCovered,
  rangesCover,
  type AyahRange,
} from './khatmahDone';
import type { KhatmahPlan, QuranState } from './quranTypes';

export const KHATMAH_TOTAL_PAGES = 604;

/**
 * Progress is ayahs now; this is what a plan is measured against.
 *
 * `KHATMAH_TOTAL_PAGES` stays for the page-shaped UI (the scrubber, the
 * "page N of 604" line) and for the `pagesRead` mirror, but completion is
 * decided here.
 */
export const KHATMAH_TOTAL_AYAHS = TOTAL_AYAHS;

/**
 * The ayahs a plan has read, however old the plan is.
 *
 * A plan from before the ayah switch has only `pagesRead`, a Hafs page
 * count. Converting it through Hafs pagination is exact for the only
 * riwayah those plans could ever have been reading.
 */
/**
 * The first ayah the plan is responsible for — one past whatever was
 * already behind the reader when it was made (`fromPage`).
 */
export function khatmahStartAyah(plan: KhatmahPlan): number {
  const from = Math.trunc(plan.fromPage ?? 0);
  if (!Number.isFinite(from) || from <= 0) return 1;
  return ayahsThroughPage(Math.min(KHATMAH_TOTAL_PAGES - 1, from), DEFAULT_RIWAYAH) + 1;
}

/**
 * What the plan has read, as a set — the one place old plans are brought
 * forward. Without a stored set, the high-water mark IS the set: one run
 * from the plan's start to wherever it had got to.
 */
/**
 * The resolved set, once per plan object.
 *
 * Replaying the claims builds a new array, and this is called for every
 * page of the gap scan and again by everything that asks whether a page
 * is read — so without this, a plan with one claim on it re-resolved
 * itself several hundred times per render. A plan is replaced wholesale
 * on every write (`updateQuranState` maps to new objects), so the object
 * itself is the key: same plan, same answer, and nothing to invalidate.
 */
const doneCache = new WeakMap<KhatmahPlan, AyahRange[]>();

export function khatmahDone(plan: KhatmahPlan): AyahRange[] {
  const hit = doneCache.get(plan);
  if (hit) return hit;
  const base = (() => {
    if (plan.done && plan.done.length > 0) return plan.done;
    const read = khatmahAyahsRead(plan);
    const start = khatmahStartAyah(plan);
    return read < start ? [] : [[start, read] as AyahRange];
  })();
  // Replaying claims the local set already reflects is a no-op — both
  // range operations are idempotent — so this needs no special case for
  // "already resolved". What it catches is a `done` that came from a
  // legacy high-water mark, or from a merge, with claims outstanding.
  const resolved =
    !plan.marks || plan.marks.length === 0
      ? base
      : applyMarks(base, plan.marks, TOTAL_AYAHS);
  doneCache.set(plan, resolved);
  return resolved;
}

/** Is this page of this muṣḥaf read — every ayah of it? */
/**
 * Does the plan reach this page at all?
 *
 * A khatmah begun at page 143 owns what FOLLOWS page 143; the pages
 * behind it are not its to mark, and offering to mark them would be
 * offering something `toggleKhatmahPageDone` then declines to do.
 */
export function khatmahCoversPage(
  plan: KhatmahPlan,
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): boolean {
  return ayahsThroughPage(page, riwayah) >= khatmahStartAyah(plan);
}

export function isKhatmahPageDone(
  plan: KhatmahPlan,
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): boolean {
  const first = firstAyahOfPage(page, riwayah);
  const from = ayahIndexOf(first.surah, first.ayah);
  const to = ayahsThroughPage(page, riwayah);
  if (to < from) return false;
  return rangesCover(khatmahDone(plan), from, to);
}

export function khatmahAyahsRead(plan: KhatmahPlan): number {
  if (typeof plan.ayahsRead === 'number') {
    return Math.min(TOTAL_AYAHS, Math.max(0, Math.trunc(plan.ayahsRead)));
  }
  return ayahsThroughPage(plan.pagesRead, DEFAULT_RIWAYAH);
}

/**
 * Ayahs completed once `page` has been finished, in a given riwayah.
 *
 * "Finished page N" means "read up to the last ayah on page N", which is
 * the ayah before the first ayah of page N+1. Page 0 is nothing read.
 */
export function ayahsThroughPage(page: number, riwayah: RiwayahId): number {
  const p = Math.trunc(page);
  if (p <= 0) return 0;
  const total = totalPagesForRiwayah(riwayah);
  if (p >= total) return TOTAL_AYAHS;
  const next = firstAyahOfPage(p + 1, riwayah);
  return Math.max(0, ayahIndexOf(next.surah, next.ayah) - 1);
}

/**
 * Ḥafṣ pages FULLY read by that many ayahs — for the `pagesRead` mirror.
 *
 * Fully, not reached: a run ending mid-page has not read that page, and
 * the mirror is a count of finished pages. It made no difference while
 * every caller passed a page's last ayah; it does now that a pin or a
 * rewind can leave the run ending anywhere.
 */
export function pagesThroughAyahs(
  ayahs: number,
  /**
   * WHOSE PAGES. Ḥafṣ by default, because that is the unit every cut in
   * this app is made in and it must not move when the reader switches
   * muṣḥaf. Pass the reader's own when the answer is going on screen:
   * "fourteen pages left today" is a promise about the book in their
   * hands, and Warsh, Qālūn and Shuʿbah each break the text across their
   * fifteen lines differently.
   */
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  if (ayahs <= 0) return 0;
  const total = totalPagesForRiwayah(riwayah);
  if (ayahs >= TOTAL_AYAHS) return total;
  const at = ayahAtIndex(ayahs);
  const page = findPageForAyah(at.surah, at.ayah, riwayah);
  return ayahsThroughPage(page, riwayah) <= ayahs ? page : page - 1;
}

/**
 * How long an abandoned plan is remembered as abandoned — the same ninety
 * days, for the same reason, as the sunnah tombstones and the peer
 * removals: long enough for a tablet that has been in a drawer to learn
 * about it, short enough that the blob does not grow for ever.
 */
export const KHATMAH_TOMBSTONE_TTL_DAYS = 90;

/**
 * A plan the reader is actually on: not finished, and not abandoned.
 *
 * The single place that guarantees an abandoned plan reads as gone, the
 * way `indexByDate` is for cleared prayers.
 */
export function isLivePlan(k: KhatmahPlan): boolean {
  return k.completedAt == null && k.abandonedAt == null && k.supersededBy == null;
}

/**
 * Not finished and not abandoned by the reader — live, or set aside
 * behind another live plan (`supersededBy`). What starting a new khatmah
 * ends.
 */
export function isOpenPlan(k: KhatmahPlan): boolean {
  return k.completedAt == null && k.abandonedAt == null;
}

/** The plan without its `supersededBy` marker — the same object if it had none. */
export function withoutSupersede(k: KhatmahPlan): KhatmahPlan {
  if (!('supersededBy' in k)) return k;
  const rest = { ...k };
  delete rest.supersededBy;
  return rest;
}

export function activeKhatmah(s: QuranState): KhatmahPlan | undefined {
  return s.khatmah.find(isLivePlan);
}

/**
 * ONE LIVE PLAN, whatever a sync brings together.
 *
 * Two devices that each start a khatmah before they have heard of the
 * other's used to keep both after the merge, and every screen showed the
 * one started first — the other plan, and all the reading done in it,
 * hidden until the first was finished or deleted. The rule is Hassan's
 * (2026-09-29): the plan with more reading in it stays, even if it was
 * started later; with equal reading, the one started last, as the most
 * recent decision. Reading is counted inside each plan's own span, so a
 * plan begun at page 300 is not credited with the 299 pages it skipped.
 *
 * The others are SET ASIDE (`supersededBy`), not abandoned. The choice
 * is made from the reading one device can see, and a device merging an
 * out-of-date copy of the other's file can see less than there is: when
 * it was written down as `abandonedAt` — permanent, and one side's word
 * enough — two devices could each abandon the other's plan and leave
 * none. So every earlier choice is cleared first and made again from the
 * plans as they now are; the plans' content converges, and the choice
 * converges with it, in any order of merges.
 *
 * The merge (`mergeKhatmah`) and the store's reading of a stored blob
 * (`coerceQuranState`) both pass their plans through here. The same list
 * comes back when there is nothing to settle.
 */
export function oneLivePlan(input: KhatmahPlan[]): KhatmahPlan[] {
  const plans = input.some(k => 'supersededBy' in k)
    ? input.map(withoutSupersede)
    : input;
  const live = plans.filter(isLivePlan);
  if (live.length < 2) return plans;
  const read = new Map(
    live.map(p => [
      p,
      countWithin(khatmahDone(p), khatmahStartAyah(p), TOTAL_AYAHS),
    ]),
  );
  const beats = (a: KhatmahPlan, b: KhatmahPlan) =>
    read.get(a)! - read.get(b)! ||
    a.startedAt - b.startedAt ||
    (a.id > b.id ? 1 : a.id < b.id ? -1 : 0);
  const kept = live.reduce((best, p) => (beats(p, best) > 0 ? p : best));
  return plans.map(p =>
    p === kept || !isLivePlan(p)
      ? p
      : { ...p, supersededBy: kept.id },
  );
}

/**
 * WHICH DAY THE KHATMAH IS ON — the Islamic one, which begins at maghrib.
 *
 * A khatmah read in Ramadan is counted in Islamic days: tarawih at 21:00
 * belongs to the day that has just begun, not the one that is ending. It
 * also stops a sitting being split down the middle — 21:00 to 01:00 used
 * to be two days, the card reporting "today's reading done" at 23:59 and
 * offering a fresh empty portion at 00:01 while the reader had not moved.
 *
 * Read from `hijri/islamicDay`, which falls back to the civil date when
 * maghrib is unknown — so this store keeps its own purity: no location, no
 * prayer times, no network, and the same answer it always gave until the
 * moment something publishes tonight's maghrib.
 */
export function localYmd(now: number = Date.now()): string {
  return islamicDayKey(new Date(now));
}

/**
 * One entry, keyed on the set's identity.
 *
 * The scan asks every page from the first hole to the reach, which is up
 * to six hundred page lookups and range scans, and `selectQuranCardState`
 * calls it on every render of the home card and the Qur'an tab — and the
 * tab stays mounted under the reader, so that is every page turn. The
 * ranges are replaced wholesale on each write, so their identity is a
 * sound key: same array, same answer.
 */
/**
 * The walk's own findings, before any day is named for them.
 *
 * Kept apart from the report because naming the day asks the PLAN which
 * portion an ayah is in, and on a dated plan that means today's cut,
 * which means the unread pages, which means this walk — a loop that ran
 * until the stack gave out, on the first morning a reader with a skipped
 * page opened a khatmah paced to a date. The cut needs only the count;
 * the count needs nothing from the cut.
 */
export type GapWalk = {
  page: number;
  pages: number;
  firstMissing: number;
  lastUnread: number;
};

let gapMemo: {
  done: readonly AyahRange[];
  riwayah: RiwayahId;
  start: number;
  walk: GapWalk | null;
} | null = null;

export function khatmahGapWalk(plan: KhatmahPlan, riwayah: RiwayahId): GapWalk | null {
  const done = khatmahDone(plan);
  const memoStart = khatmahStartAyah(plan);
  if (
    gapMemo &&
    gapMemo.done === done &&
    gapMemo.riwayah === riwayah &&
    gapMemo.start === memoStart
  ) {
    return gapMemo.walk;
  }
  const walk = walkKhatmahGap(plan, riwayah, done);
  gapMemo = { done, riwayah, start: memoStart, walk };
  return walk;
}

/** Pages skipped behind the reader — the number and nothing else. */
export function khatmahGapPages(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  return khatmahGapWalk(plan, riwayah)?.pages ?? 0;
}

function walkKhatmahGap(
  plan: KhatmahPlan,
  riwayah: RiwayahId,
  done: readonly AyahRange[],
): GapWalk | null {
  const start = khatmahStartAyah(plan);
  const reach = highestCovered(done);
  if (reach < start) return null;
  /**
   * WALK THE HOLES, NOT THE PAGES.
   *
   * A page is unread exactly when some ayah of it is missing — so the
   * unread pages are the pages the holes touch, and the holes are the
   * gaps between the ranges of a set that is already sorted and disjoint.
   * Asking all six hundred pages instead cost two ayah-to-page
   * conversions each and answered the same question; holes are almost
   * always one or two.
   *
   * Nothing past the reach is a hole. That is the frontier — where the
   * reader stopped — and it is not something they skipped.
   */
  let pages = 0;
  let firstUnread = 0;
  let lastUnread = 0;
  let firstMissing = 0;
  let at = start;
  for (const [f, t] of done) {
    if (at > reach) break;
    if (f > at) {
      const holeTo = Math.min(f - 1, reach);
      if (firstMissing === 0) firstMissing = at;
      const from = pageOfAyahIndex(at, riwayah);
      const to = pageOfAyahIndex(holeTo, riwayah);
      // A page can be touched by two holes — a read stretch inside one
      // page — and it is still one page to go and read.
      const countFrom = Math.max(from, lastUnread + 1);
      if (to >= countFrom) pages += to - countFrom + 1;
      if (firstUnread === 0) firstUnread = from;
      lastUnread = Math.max(lastUnread, to);
    }
    at = Math.max(at, t + 1);
  }
  if (pages === 0) return null;
  return { page: firstUnread, pages, firstMissing, lastUnread };
}

/**
 * The page the reader should land on to continue the khatmah.
 *
 * Derived through the ayah rather than stored, which is what makes a
 * riwayah switch keep your place: the next unread AYAH is the same in
 * both muṣḥafs, and each one is asked which of its pages holds it.
 */
export function khatmahCurrentPage(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  if (plan.position) {
    // A pinned position is authoritative, but its `page` belongs to the
    // muṣḥaf it was pinned in; re-resolve it through the ayah.
    return findPageForAyah(plan.position.surah, plan.position.ayah, riwayah);
  }
  // Where they are, not where the contiguous run stopped — see
  // `khatmahReachAyah`. One un-marked page used to send "Continue
  // khatmah" back to it, every time, from every door.
  const reach = khatmahReachAyah(plan);
  if (reach >= TOTAL_AYAHS) {
    /**
     * NOTHING AHEAD. Continuing means going back for what was left.
     *
     * A hole keeps a plan from completing (`khatmahIsComplete`), so a
     * reader who has reached the last page with pages still unread has a
     * live plan and no forward page to offer. This used to hand back the
     * last page, over and over, while the only reading left was behind
     * them — the plan's own door pointing at the one place it was
     * finished with.
     */
    const missing = firstMissingFrom(
      khatmahDone(plan),
      khatmahStartAyah(plan),
      TOTAL_AYAHS,
    );
    if (missing <= TOTAL_AYAHS) return pageOfAyahIndex(missing, riwayah);
    return totalPagesForRiwayah(riwayah);
  }
  const next = ayahAtIndex(reach + 1);
  return findPageForAyah(next.surah, next.ayah, riwayah);
}

/**
 * Ayahs of this plan still unread — INCLUDING pages skipped behind.
 *
 * The quota is "what is left over the days that are left", and what is
 * left is not "the book minus how far I got": a reader who skipped four
 * pages on Tuesday still owes them. `khatmahDone` is the set of what was
 * actually read, so the arithmetic is the plan's span less that set, and
 * the holes pay for themselves in the pace rather than being discovered
 * at the end. Where they ARE is `khatmahGap`'s job, and it offers to take
 * the reader back to them.
 */
export function khatmahUnreadAyahs(plan: KhatmahPlan): number {
  const start = khatmahStartAyah(plan);
  const span = Math.max(0, TOTAL_AYAHS - start + 1);
  return Math.max(0, span - countWithin(khatmahDone(plan), start, TOTAL_AYAHS));
}

/**
 * PAGES STILL OWED — ahead of the reader, and behind them.
 *
 * The pace is what finishes the book, so a page skipped on Tuesday is
 * still work: the count is what lies ahead plus the holes that were left
 * behind (`khatmahGap` already walks and memoizes those). In Ḥafṣ pages,
 * because that is the unit every cut in this app is made in.
 */
export function khatmahUnreadPages(
  plan: KhatmahPlan,
  /**
   * The reader's muṣḥaf when this number is going on screen, and Ḥafṣ
   * when it is feeding the CUT. Both callers exist and they want
   * different things: the cut has to stay put when the reader switches
   * riwayah (`paceCut`), and the sentence beside it has to count the
   * pages they are actually turning (`khatmahPages`).
   */
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  const ahead = Math.max(
    0,
    totalPagesForRiwayah(riwayah) -
      pagesThroughAyahs(khatmahReachAyah(plan), riwayah),
  );
  // The count alone — `khatmahGap` names days, and naming a day on a
  // dated plan asks for today's cut, which asks for this.
  return ahead + khatmahGapPages(plan, riwayah);
}

/**
 * The Ḥafṣ page the plan starts after. 0 for a khatmah from the opening.
 *
 * Clamped one short of the book: a plan that began at the last page has
 * nothing to cut, and one portion of nothing is not a plan.
 */
export function planFrom(plan: KhatmahPlan): number {
  const from = Math.trunc(plan.fromPage ?? 0);
  if (!Number.isFinite(from) || from <= 0) return 0;
  return Math.min(KHATMAH_TOTAL_PAGES - 1, from);
}

/**
 * Where each Ḥafṣ page ends, in ayahs. Built once, walked often.
 *
 * `portionEnd` is called inside a search, per render, so the 604 lookups
 * it needs are done a single time rather than every time.
 */
let pageEnds: number[] | null = null;

export function ayahsThroughHafsPage(page: number): number {
  if (!pageEnds) {
    pageEnds = [0];
    for (let p = 1; p <= KHATMAH_TOTAL_PAGES; p++) {
      pageEnds.push(ayahsThroughPage(p, DEFAULT_RIWAYAH));
    }
  }
  return pageEnds[Math.max(0, Math.min(KHATMAH_TOTAL_PAGES, page))];
}

/**
 * HOW FAR THE READER HAS GOT — the furthest ayah read, holes and all.
 *
 * `khatmahAyahsRead` is the contiguous run from the plan's start, and it
 * has to stay that: it is the legacy mirror, and a device still reading
 * it must never be told about progress past a hole. But it is the wrong
 * answer to "where is the reader", because one un-marked page behind them
 * winds it back to that page — and then the plan's next page, its day
 * number and its portion all point at somewhere they left long ago.
 *
 * The hole is not forgotten; it is reported and offered on its own
 * (`khatmahGap`), which is what lets everything else look forward.
 */
export function khatmahReachAyah(plan: KhatmahPlan): number {
  return Math.max(
    khatmahStartAyah(plan) - 1,
    highestCovered(khatmahDone(plan)),
    khatmahAyahsRead(plan),
  );
}

/** Which page of a given muṣḥaf holds an ayah index. */
function pageOfAyahIndex(index: number, riwayah: RiwayahId): number {
  const at = ayahAtIndex(Math.max(1, Math.min(TOTAL_AYAHS, Math.trunc(index))));
  return findPageForAyah(at.surah, at.ayah, riwayah);
}

/** The reach, in pages of the muṣḥaf in hand. */
export function khatmahReachPage(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  const reach = khatmahReachAyah(plan);
  return reach < khatmahStartAyah(plan) ? 0 : pageOfAyahIndex(reach, riwayah);
}

/**
 * The plan has run out of pages AHEAD, and only holes are left behind.
 *
 * The end state of a khatmah read out of order: nothing forward to
 * continue to, and a live plan, because holes keep it from completing.
 * What "continue" means then is going back, which is what
 * `khatmahCurrentPage` answers — this is so the card can say so rather
 * than reporting a day as done and a plan as running.
 */
export function khatmahOnlyGapsLeft(plan: KhatmahPlan): boolean {
  return (
    khatmahReachAyah(plan) >= TOTAL_AYAHS && !khatmahIsComplete(plan)
  );
}

/** Every ayah from the plan's start is read — the only thing that finishes one. */
export function khatmahIsComplete(plan: KhatmahPlan): boolean {
  const start = khatmahStartAyah(plan);
  return rangesCover(khatmahDone(plan), start, TOTAL_AYAHS);
}

/** Forget the memoized walk — the store's test reset calls it. */
export function resetKhatmahGapMemo(): void {
  gapMemo = null;
}
