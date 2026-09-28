/**
 * THE EDITS A KHATMAH WRITER MAKES to a plan — a new plan's starting
 * point, the day's snapshot and today's pinned cut, a dated re-pace, the
 * claim log, the pinned position, and keeping the read set and the
 * high-water fields in step when either moves.
 *
 * Pure: a plan in, a plan (or a field of one) out; the one clock read is
 * `pacingStamp`'s now. Only the writers in `khatmahActions.ts` apply them,
 * and the store's coerce takes the claim log's bound from here.
 *
 * Moved out of `quranState.ts` unchanged (docs/rewrite-plan.md, step 2.4).
 */
import { TOTAL_AYAHS } from './ayahIndex';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import {
  addRange,
  applyMarks,
  compactMarks,
  contiguousFrom,
  rangesCover,
  subtractRange,
  type AyahMark,
  type AyahRange,
} from './khatmahDone';
import type { KhatmahPlan } from './quranTypes';
import {
  ayahsThroughHafsPage,
  ayahsThroughPage,
  KHATMAH_TOTAL_PAGES,
  khatmahDone,
  khatmahReachAyah,
  khatmahReachPage,
  khatmahStartAyah,
  localYmd,
  pagesThroughAyahs,
  planFrom,
} from './khatmahProgress';
import {
  khatmahDeadline,
  khatmahPaceToday,
  paceStillFits,
} from './khatmahSchedule';

/** At most this many claims travel with a plan — newest kept. */
/**
 * A backstop, not a budget. The log is one claim per page the plan has
 * read plus its denials (`compactMarks`), so a plan that has read the
 * whole book holds about six hundred; the cap only ever bites a log
 * that has gone wrong, and takes the oldest claims first.
 */
export const KHATMAH_MARK_LIMIT = 1024;

/**
 * Where a reader who is ON `page` of `riwayah` stands, for a new plan.
 *
 * Two numbers, and they are answers to different questions.
 *
 * `ayahs` is progress, and it is the reader's own: everything before
 * their page, counted in their muṣḥaf. Nothing rounds it, so "continue"
 * puts them back at the top of the page they named rather than a page to
 * either side of it.
 *
 * `from` is where the plan's DAYS are cut, and the cut is in Ḥafṣ pages
 * (see `portionEnd`) — so it is the last Ḥafṣ page that ends at or before
 * them. Their page boundary is not Ḥafṣ's, so this can sit a fraction of
 * a page behind their position; that is the right side to be on. It makes
 * the first portion open a line or two before the reader rather than past
 * them, and it never hands out a page they have not read.
 */
export function planStart(at: { page: number; riwayah?: RiwayahId }): {
  from: number;
  ayahs: number;
} {
  const page = Math.trunc(at.page);
  if (!Number.isFinite(page) || page <= 1) return { from: 0, ayahs: 0 };
  const riwayah = at.riwayah ?? DEFAULT_RIWAYAH;
  const ayahs = ayahsThroughPage(page - 1, riwayah);
  if (ayahs <= 0) return { from: 0, ayahs: 0 };
  let from = 0;
  for (let p = 1; p < KHATMAH_TOTAL_PAGES; p++) {
    if (ayahsThroughHafsPage(p) > ayahs) break;
    from = p;
  }
  return { from, ayahs };
}

/** Snapshot pagesRead at the first progress of each local day. */
export function withDaySnapshot(plan: KhatmahPlan, now?: number): KhatmahPlan {
  const today = localYmd(now);
  const paced = withPaceOfDay(plan, now);
  if (paced.dayStartDate === today) return paced;
  return {
    ...paced,
    dayStartDate: today,
    dayStartPagesRead: plan.pagesRead,
    // The REACH, like everything else that answers "where is the reader"
    // — a snapshot taken from the contiguous run would put the day back
    // at a hole every morning.
    dayStartAyahsRead: khatmahReachAyah(plan),
  };
}

/**
 * PIN TODAY'S CUT, once a day, for a deadline plan.
 *
 * Every writer that touches a plan goes through `withDaySnapshot`, and
 * this rides with it for the same reason: the first thing the reader does
 * today is when "today" has to be decided. Before that the cut is
 * computed on the fly and is the same answer — it is only once reading
 * starts that holding it still matters (`khatmahPace.ts`).
 *
 * A duration plan never gets one, and a plan that loses its deadline
 * loses the pace with it, so nothing stale is left to be read by a mode
 * that does not use it.
 */
export function withPaceOfDay(plan: KhatmahPlan, now?: number): KhatmahPlan {
  const by = khatmahDeadline(plan);
  if (!by) {
    if (plan.pace === undefined) return plan;
    const rest = { ...plan };
    delete rest.pace;
    return rest;
  }
  const today = localYmd(now);
  if (plan.pace && paceStillFits(plan, plan.pace, today)) return plan;
  const pace = khatmahPaceToday(plan, now ?? Date.now());
  return pace ? { ...plan, pace } : plan;
}

/**
 * ── RE-PACING A KHATMAH THAT IS ALREADY UNDER WAY ─────────────────────
 *
 * The two modes are one question asked two ways, so the reader may answer
 * it again at any point, in either direction, without losing a page:
 * `setKhatmahDeadline` makes the plan the calendar's, `setKhatmahDuration`
 * makes it the reader's again. Progress, the holes behind, the pinned
 * position and the day's baseline are untouched by both — the only thing
 * that changes is what the plan asks of today.
 *
 * Both stamp `pacedAt` and `pacedFrom`: the decision is dated, so it can
 * be merged (see `mergeKhatmah`), and it remembers where the reader stood
 * when it was made, so nothing measures the new promise against the old
 * one's calendar (`khatmahBehindBy`, `khatmahPaceOutgrown`).
 */
export function repaced(plan: KhatmahPlan, at: number): KhatmahPlan {
  return {
    ...plan,
    pacedAt: at,
    pacedDay: localYmd(at),
    // Never behind the plan's own start: a khatmah begun at page 143 with
    // nothing read yet has a reach of zero, and its schedule starts at
    // 143, not at the opening it was never going to cover.
    pacedFrom: Math.max(planFrom(plan), khatmahReachPage(plan)),
  };
}

/** The plan without today's cut. */
export function unpaced(plan: KhatmahPlan): KhatmahPlan {
  if (plan.pace === undefined) return plan;
  const rest = { ...plan };
  delete rest.pace;
  return rest;
}

/** A stamp that is this device's now, and never older than the last one. */
export function pacingStamp(plan: KhatmahPlan): number {
  return Math.max(Date.now(), (plan.pacedAt ?? 0) + 1);
}

/**
 * THE SET HAS TO MOVE WITH EVERY REWIND AND EVERY CLAIM.
 *
 * Progress used to be one number, so rewinding it was one assignment.
 * With a set of read ranges, an assignment to `ayahsRead` alone leaves
 * the ranges claiming pages the reader has just taken back: "reset
 * today" would leave every check green, and — since the reach is read
 * from the set — leave the plan's next page where it was. These two put
 * the set where the number says it is.
 */
/**
 * Log a claim, newest last and bounded.
 *
 * Only hand-made claims and readings that cross one come through here —
 * see `AyahMark`. A page turn that touches nothing the reader has denied
 * needs no date, because the union already carries it.
 */
export function withMarks(
  plan: KhatmahPlan,
  claims: ReadonlyArray<readonly [from: number, to: number, read: 0 | 1]>,
  /**
   * A page turn, as opposed to something the reader said by hand — a
   * pin, a tap on a page, "finish today". See below.
   */
  turned = false,
): AyahMark[] | undefined {
  const have = plan.marks ?? [];
  /**
   * A TURN OVER GROUND THE LOG ALREADY SAYS IS READ ADDS NOTHING.
   *
   * Flipping back through credited pages on the way somewhere is not a
   * fresh reading of them, and logging it as one would both write state
   * on every such turn and re-date the pages — which, replayed on the
   * other device, would override an un-mark it had made of one of them
   * in between. What the log says of them stands, at the time it said
   * it. A turn that crosses anything currently denied is a new claim,
   * because that is the one thing it changes.
   *
   * Only turns. A claim made BY HAND is the reader speaking — a pin says
   * "everything before here is read" whatever this device's log thought
   * — and it is recorded at its own time so that it also beats a denial
   * the other device made in between and this one has not seen yet.
   */
  const saidRead = turned ? applyMarks([], have, TOTAL_AYAHS) : null;
  const usable = claims.filter(
    ([from, to, read]) =>
      to >= from && !(saidRead && read === 1 && rangesCover(saidRead, from, to)),
  );
  if (usable.length === 0) return plan.marks;
  /**
   * MONOTONIC, because replay order IS the rule.
   *
   * The wall clock is what lets two devices' claims be ordered against
   * each other, and it is too coarse to order two claims made here: a
   * reader who un-marks a page and reads it again in the same
   * millisecond — or a test, or a pin, which is two claims in one act —
   * would have them replayed in whatever order the array sort happened
   * to pick, and the later claim could lose to the earlier one. One past
   * the newest claim we already hold is both later than it and still a
   * wall-clock time the other device can compare against.
   */
  let at = Math.max(Date.now(), (have[have.length - 1]?.[2] ?? 0) + 1);
  const next: AyahMark[] = [...have];
  for (const [from, to, read] of usable) {
    next.push([from, to, at, read]);
    at += 1;
  }
  /**
   * Resolved on the way in, not trimmed on the way out. Page turns are
   * claims now (see `AyahMark`), so an unresolved log would grow by one
   * per turn and a blind `slice` would drop the oldest — which is where
   * the un-marks live. `compactMarks` keeps every verdict and only the
   * claims still deciding one; the cap below is a backstop it should
   * never reach.
   */
  const compacted = compactMarks(next, TOTAL_AYAHS).slice(-KHATMAH_MARK_LIMIT);
  /**
   * THE SAME LOG IS THE SAME OBJECT.
   *
   * Re-reading ground this device already claimed compacts back to the
   * claim it already held — the new turn is absorbed into it, at the
   * earlier time. Handing back a fresh array for that would make every
   * turn over credited pages a state write, and `recordKhatmahProgress`
   * ends on an identity check precisely so that a turn which changes
   * nothing re-renders nothing.
   */
  return sameMarks(compacted, have) ? plan.marks : compacted;
}

export function withMark(
  plan: KhatmahPlan,
  from: number,
  to: number,
  read: 0 | 1,
  turned = false,
): AyahMark[] | undefined {
  return withMarks(plan, [[from, to, read]], turned);
}

function sameMarks(a: readonly AyahMark[], b: readonly AyahMark[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, i) => m[0] === b[i][0] && m[1] === b[i][1] && m[2] === b[i][2] && m[3] === b[i][3])
  );
}

type Pin = KhatmahPlan['position'];

function samePin(a: Pin, b: Pin): boolean {
  if (!a || !b) return !a && !b;
  return a.surah === b.surah && a.ayah === b.ayah;
}

/**
 * THE PIN AND THE DATE ON IT, written together or not at all.
 *
 * Every writer that moves the pin — a reader pinning one, reading past
 * one, clearing one, rewinding over one — goes through here, because a
 * pin whose stamp was forgotten is exactly the pin that comes back from
 * the other device (see `positionAt`). Unchanged pins keep their stamp:
 * re-stamping a value nobody touched would let a device that merely
 * opened the reader talk over a removal made elsewhere.
 *
 * The clock is nudged past the pin's own stamp for the same reason
 * `withMarks` nudges a claim past the last one: two acts in the same
 * millisecond — a pin and the clear that a page turn makes of it — must
 * still be orderable, here and on the device that receives them.
 */
export function pinned(plan: KhatmahPlan, next: Pin): Pick<KhatmahPlan, 'position' | 'positionAt'> {
  if (samePin(plan.position ?? null, next ?? null)) {
    return {
      position: plan.position ?? null,
      ...(plan.positionAt != null ? { positionAt: plan.positionAt } : {}),
    };
  }
  return {
    position: next ?? null,
    positionAt: Math.max(Date.now(), (plan.positionAt ?? 0) + 1),
  };
}

/**
 * WHAT EVERY WRITER STORES: the resolved set and the mirror derived from it.
 *
 * Three fields say one thing and they have to agree. The set is stored
 * with the claims already replayed, so a merge that replays them again
 * gets the same set back (idempotence, which the P2P cycle rests on).
 * The legacy mirror is the CONTIGUOUS run of that set — never a number
 * a writer chose, because a chosen number can point past a hole and tell
 * an older device about pages nobody read.
 */
export function settled(
  plan: KhatmahPlan,
  done: readonly AyahRange[],
  marks: AyahMark[] | undefined,
): { done: AyahRange[]; ayahsRead: number; pagesRead: number; marks?: AyahMark[] } {
  const resolved = marks?.length ? applyMarks(done, marks, TOTAL_AYAHS) : [...done];
  const contiguous = Math.max(
    0,
    contiguousFrom(resolved, khatmahStartAyah(plan), TOTAL_AYAHS),
  );
  return {
    done: resolved,
    ayahsRead: contiguous,
    pagesRead: pagesThroughAyahs(contiguous),
    ...(marks === undefined ? {} : { marks }),
  };
}

export function doneRewound(plan: KhatmahPlan, to: number): AyahRange[] {
  return subtractRange(khatmahDone(plan), to + 1, TOTAL_AYAHS, TOTAL_AYAHS);
}

export function doneFilled(plan: KhatmahPlan, to: number): AyahRange[] {
  const start = khatmahStartAyah(plan);
  return to >= start
    ? addRange(khatmahDone(plan), start, to, TOTAL_AYAHS)
    : khatmahDone(plan);
}
