/**
 * WHAT THE PLAN ASKS — its mode (a duration or a date), its days, the
 * portion each ayah falls in, today's cut for a dated plan, the window a
 * page may be credited in, and the report of the holes by day.
 *
 * Pure, over `khatmahProgress`. Moved out of `quranState.ts` unchanged
 * (docs/rewrite-plan.md, step 2.2); the store re-exports what was
 * exported.
 */
import { TOTAL_AYAHS, ayahIndexOf } from './ayahIndex';
import { firstAyahOfPage } from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import {
  daysToDeadline,
  deadlineDayNumber,
  deadlineInstant,
  deadlineTotalDays,
  paceCut,
  type KhatmahPace,
} from './khatmahPace';
import { lastReadAt, type AyahRange } from './khatmahDone';
import type { KhatmahPlan } from './quranTypes';
import {
  ayahsThroughHafsPage,
  ayahsThroughPage,
  type GapWalk,
  KHATMAH_TOTAL_PAGES,
  khatmahGapPages,
  khatmahGapWalk,
  khatmahReachAyah,
  khatmahStartAyah,
  khatmahUnreadPages,
  localYmd,
  pagesThroughAyahs,
  planFrom,
} from './khatmahProgress';

/**
 * The instant the schedule counts from — noon of `pacedDay` when the
 * plan has one, so that a decision taken after maghrib counts from the
 * day the store was already on. The raw instant for a plan re-paced by a
 * build that wrote no day, and the plan's start for one never paced.
 */
export function pacedInstant(plan: KhatmahPlan): number {
  if (plan.pacedDay) {
    const at = deadlineInstant(plan.pacedDay);
    if (at !== null) return at;
  }
  return plan.pacedAt ?? plan.startedAt;
}

/**
 * WHICH DAY OF THE CALENDAR A PLAN'S DAY NUMBER MEANS.
 *
 * `khatmahDayWhen` turns "day 9" into "Thursday" by counting from the day
 * the plan began, because day N is due N-1 days after day one. That is
 * true right up until the plan is re-paced: a reader who was on day
 * nineteen and asked for the rest in a week is on a plan whose portions
 * have been recut, so they are now on (say) day six of twenty-three, and
 * measuring THAT from the plan's birthday puts today's reading a
 * fortnight in the past — every portion would read "today", including
 * tomorrow's.
 *
 * So a re-paced plan is counted from the day it was re-paced, with the
 * day number the reader had then. Returned as the epoch `khatmahDayWhen`
 * should measure from, which is that day less the days before it — a
 * virtual "day one" that lands every other day where it belongs.
 *
 * Duration plans only. A dated plan's day number is already the
 * calendar's, counted from `startedAt` by `deadlineDayNumber`, and its
 * portions are cut from today outwards rather than renumbered.
 */
export function khatmahDayAnchor(plan: KhatmahPlan): number {
  if (khatmahDeadline(plan)) return plan.startedAt;
  const from = plan.pacedFrom;
  if (plan.pacedAt === undefined || from === undefined) return plan.startedAt;
  const page = Math.min(KHATMAH_TOTAL_PAGES, Math.max(planFrom(plan), from));
  const day = durationPortionOf(plan, ayahsThroughHafsPage(page) + 1);
  // Counted in calendar days back from the re-pace, at noon, not in
  // multiples of 24 hours: across the night the clocks go back that lands
  // an hour off, and an hour off a re-pace made near midnight is another
  // date — every day of the plan then named a day wrong.
  const paced = new Date(pacedInstant(plan));
  return new Date(
    paced.getFullYear(),
    paced.getMonth(),
    paced.getDate() - (day - 1),
    12,
  ).getTime();
}

/**
 * What the plan may be told about RIGHT NOW — from its start through the
 * end of the portion the reader is standing in.
 *
 * ── A GAP MUST NOT FREEZE THE FRONTIER ────────────────────────────────
 *
 * The obvious reading of "where is the reader" is `khatmahCurrentPortion`
 * — the portion holding the first UNREAD ayah. It is the right answer for
 * the day pill and the page marker, and it was the wrong one here,
 * because it is measured from the contiguous run and so a hole stops it
 * dead. Read pages 1–10, scrub to 15 and read 15–20, and the frontier is
 * still page 10: the window still ends where day one ends, and tomorrow's
 * pages are refused for four pages nobody remembers skipping. The plan
 * looks stuck, silently — the same stall as issue #44, by another route.
 *
 * So the window takes the FURTHEST ayah read (`highestCovered`) as the
 * reader's position and ends at the end of the portion that follows it.
 * Reading on is credited while the hole stays open; the hole is reported
 * separately and can be gone to (`khatmahGap`), rather than quietly
 * taxing every day after it.
 *
 * It still refuses al-Kahf to a plan in Aal-Imran, which is the whole
 * point of having a window: reach is where the reader has BEEN, and a
 * page fifty portions ahead of that is not a page they have read.
 *
 * The lower bound stays the gap's own portion, so going back to fill it
 * is always credited.
 */
export function khatmahCreditWindow(
  plan: KhatmahPlan,
  now: number = Date.now(),
): AyahRange {
  // From the plan's own start, so going back for a hole is credited, to
  // the end of the portion the reader is STANDING IN — which on a plan
  // paced to a date is not the same as today's. Today's cut is pinned to
  // today whatever is read (that is what makes reading ahead show as
  // `extra` rather than as time travel), so a window ending there would
  // refuse every page past it: forty pages read, twenty-one credited,
  // and the reader watching their own reading disappear.
  return [khatmahStartAyah(plan), khatmahReachPortion(plan, now).to];
}

/**
 * EVERY PAGE LEFT UNREAD BEHIND THE READER, and the first one to go to.
 *
 * Holes come in sets. Skip five pages, read one, miss another, read on —
 * that is two stretches, and reporting only the first would leave the
 * reader closing a gap they were told about, being told about the next
 * one, and never knowing how much was actually outstanding. So the count
 * is all of it and the destination is the nearest of it.
 *
 * Counted in PAGES by asking each page, rather than by measuring the
 * ayah holes: a hole can sit inside one page, two holes can share a
 * page, and a page is what the reader is being asked to go and read.
 *
 * Only holes with reading PAST them count. The first unread ayah at the
 * frontier is not a hole, it is where they stopped.
 */
export type KhatmahGapReport = {
  page: number;
  pages: number;
  day: number;
  oneDay: boolean;
};

/**
 * The named report, kept for a DURATION plan, whose day numbers are a
 * function of the walk and the plan's own cut and nothing else. On a
 * dated plan they are today's answer, and today moves, so those are
 * named on the way out every time.
 */
let gapReportMemo: {
  walk: GapWalk;
  targetDays: number;
  from: number;
  report: KhatmahGapReport;
} | null = null;

export function khatmahGap(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): KhatmahGapReport | null {
  const walk = khatmahGapWalk(plan, riwayah);
  if (!walk) return null;
  const dated = khatmahDeadline(plan) !== null;
  const from = planFrom(plan);
  if (
    !dated &&
    gapReportMemo &&
    gapReportMemo.walk === walk &&
    gapReportMemo.targetDays === plan.targetDays &&
    gapReportMemo.from === from
  ) {
    return gapReportMemo.report;
  }
  const day = khatmahPortionOf(plan, walk.firstMissing);
  const lastDay = khatmahPortionOf(
    plan,
    ayahsThroughPage(walk.lastUnread, riwayah),
  );
  // Naming one day is only honest while they all belong to it.
  const report = { page: walk.page, pages: walk.pages, day, oneDay: day === lastDay };
  if (!dated) gapReportMemo = { walk, targetDays: plan.targetDays, from, report };
  return report;
}

/**
 * Is this page one the plan may act on RIGHT NOW?
 *
 * The portion, not a distance — see `khatmahCreditWindow`. A page counts
 * when any of it lies in the window: the reader read that page, and a
 * page straddling the portion's end is still this reading.
 *
 * This is the one gate. Reading credit passes through it, and so does
 * every hand-made claim about the plan — marking a page read, moving the
 * khatmah's position. A plan sitting in Aal-Imran has no business being
 * told that a page of al-Kahf is done, or that its position is there:
 * whichever way that claim arrived, it is about a portion the plan has
 * not reached, and the plan would have to invent the fifty portions in
 * between to make sense of it.
 */
export function khatmahPageInWindow(
  plan: KhatmahPlan,
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): boolean {
  const window = khatmahCreditWindow(plan);
  const first = firstAyahOfPage(page, riwayah);
  const from = ayahIndexOf(first.surah, first.ayah);
  const to = ayahsThroughPage(page, riwayah);
  return to >= window[0] && from <= window[1];
}

// ── Khatmah portions ─────────────────────────────────────────────────
//
// A plan cuts the book into `targetDays` portions of equal length and the
// reader walks them in order. Which one is CURRENT is a fact about
// progress, not about the calendar: it is the portion holding the next
// ayah not yet read.
//
// That single rule is the whole of the behaviour:
//
//   • finish the portion you are on and the next one is current from that
//     moment, so tomorrow's reading is there tonight;
//   • stop halfway into a later portion and THAT portion is current,
//     however far ahead of the calendar it is;
//   • finish a portion you were reading ahead in and the one after it
//     becomes current.
//
// Nothing is reconciled at midnight and no day is ever "missed" into a
// different state, so there is no moment at which the reader can be shown
// a place other than the one they actually stopped at. The calendar is
// used for one thing only — deciding which portion was the day's, so the
// card can say today is done and count anything past it as extra.

/** One portion of the plan: a slice of the book, read in one sitting. */
export type KhatmahPortion = {
  /** 1-based. Portion n of `targetDays`. */
  day: number;
  /** Index of its first ayah, 1-based and inclusive. */
  from: number;
  /** Index of its last ayah, inclusive. */
  to: number;
};

/**
 * THE MODE, asked once and answered everywhere else by branching on it.
 *
 * A plan with a `deadline` is paced by the calendar; one without is paced
 * by its duration, exactly as every plan made before 2.25 was. The field
 * being absent IS the answer, so nothing has to be migrated.
 */
export function khatmahDeadline(plan: KhatmahPlan): string | null {
  return typeof plan.deadline === 'string' && plan.deadline ? plan.deadline : null;
}

/**
 * The plan's length in days — `targetDays` for a duration plan, and the
 * span from its first day to its deadline for a dated one. Exported
 * because "day 9 of 30" has to say the same 30 the plan is paced by.
 */
export function planDays(plan: KhatmahPlan): number {
  const by = khatmahDeadline(plan);
  // The whole length of a deadline plan is the calendar's: the day it
  // began to the day it is due. `targetDays` is still carried — a plan
  // that was a duration before it was given a date keeps the number it
  // was made with — but it is not what the plan means any more.
  if (by) return deadlineTotalDays(plan.startedAt, by);
  return Math.max(1, Math.trunc(plan.targetDays) || 1);
}

/**
 * TODAY'S CUT for a deadline plan — the pinned one if today pinned it.
 *
 * Pure: a read of a day nobody has written to yet still answers, with the
 * cut that the first write of the day will pin. That matters for the card
 * on a morning where nothing has been read: it shows the quota it is
 * about to commit to, not yesterday's.
 */
export function khatmahPaceToday(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahPace | null {
  const by = khatmahDeadline(plan);
  if (!by) return null;
  const day = localYmd(now);
  if (plan.pace && paceStillFits(plan, plan.pace, day)) return plan.pace;
  const cut = paceCut({
    reach: khatmahReachAyah(plan),
    // Ḥafṣ on both, explicitly: the cut is the one thing here that must
    // NOT move when the reader changes muṣḥaf mid-plan.
    reachPage: pagesThroughAyahs(khatmahReachAyah(plan), DEFAULT_RIWAYAH),
    unreadPages: khatmahUnreadPages(plan, DEFAULT_RIWAYAH),
    totalPages: KHATMAH_TOTAL_PAGES,
    total: TOTAL_AYAHS,
    daysLeft: daysToDeadline(by, now),
    ayahsThroughPage: ayahsThroughHafsPage,
  });
  return { day, from: cut.from, to: cut.to, at: now };
}

/**
 * HAS THE DATE GONE BY? Asked of the date, and of nothing else.
 *
 * `khatmahDaysLeft` answers 0 for a plan that is FINISHED as well as for
 * one whose date has passed — it is "how many days of reading are left",
 * and a finished plan has none. Deriving "the date passed" from it told a
 * reader who had just completed their khatmah that they were late for it.
 */
export function khatmahDatePassed(
  plan: KhatmahPlan,
  now: number = Date.now(),
): boolean {
  const by = khatmahDeadline(plan);
  return by != null && daysToDeadline(by, now) <= 0;
}

/**
 * IS THIS CUT STILL TODAY'S — and still in front of the reader?
 *
 * The day key is the obvious half. The other half is that progress can
 * move BACKWARDS underneath a pinned cut: "restart the khatmah", "step
 * back a day", an un-marked stretch arriving from another device. The cut
 * would then start somewhere the reader has not reached, and the card
 * would offer "21 pages left today" for a portion with a hundred pages
 * of unread book in front of it, while "continue" sent them somewhere
 * else entirely. A cut that no longer touches where the reader is is not
 * today's cut; the day is re-made from where they now are.
 *
 * Reading FORWARD never triggers this — that is the whole point of
 * pinning — so the day still cannot recede as it is read.
 */
export function paceStillFits(
  plan: KhatmahPlan,
  pace: KhatmahPace,
  today: string,
): boolean {
  if (pace.day !== today) return false;
  const reach = khatmahReachAyah(plan);
  if (pace.from > reach + 1) return false;
  /**
   * NOR A CUT MADE FROM A PLACE THE PLAN HAD ALREADY LEFT (2026-09-22).
   *
   * Two devices used without a sync between them each pin today's cut
   * from their own reach, and the one that was behind — a Mac last
   * opened days ago — cuts a day out of pages the phone read last week.
   * Held as today's cut, on either device, it reads as a day already
   * done, the reading actually done today counted as "extra", the pill
   * moved on to tomorrow. The merge tells such a cut from a real one
   * when it has both (`pickPace`); this is for the one it did not — the
   * only cut of the day, arriving by sync, or this device's own, made
   * from stale knowledge. The test is the same: the reading past the cut
   * came AFTER it was cut (the day was cut and then read, and the cut
   * stands, however far the reading went — that is what pinning is
   * for), or it came BEFORE (the cut was stale the moment it was made,
   * and the day is re-made from where the reading really stands). The
   * log dates every page read; a cut from a build that did not date
   * itself is kept, as it always was.
   */
  if (pace.to >= reach || pace.at === undefined) return true;
  const readAt = lastReadAt(plan.marks, reach);
  return readAt === undefined || readAt > pace.at;
}

/**
 * Ayahs completed once portion `day` is finished. Day 0 is nothing.
 *
 * ── WHY THE BOOK IS CUT BY PAGES AND NOT BY AYAHS ─────────────────────
 *
 * Because ayahs are not spread evenly across the pages, and a plan cut
 * into equal ayah counts is not a plan anyone would recognise. Al-Baqarah
 * runs at a handful of long ayahs to the page and juzʾ ʿamma at forty
 * short ones, so an even thirtieth of the 6,236 ayahs asked for 36 pages
 * on day two of a thirty-day khatmah and 8 on day twenty-eight — four and
 * a half times the reading, on a plan whose whole promise is that every
 * day is the same. Cut by page it is 20 or 21 every day, which is the
 * number every khatmah in the world is quoted in.
 *
 * Ḥafṣ's pages, whichever muṣḥaf is being read. The division belongs to
 * the PLAN, not to the muṣḥaf in hand — a boundary that moved when the
 * reader changed riwayah would move their day under them, which is the
 * one thing this model exists to prevent. All four muṣḥafs run to 604
 * pages, so the portion is the same reading either way; only the page
 * NUMBERS shown alongside it are the reader's own (`khatmahPages`).
 *
 * The boundary is still an ayah, so progress needs no conversion and the
 * marker still falls on something the page can point at.
 */
export function portionEnd(days: number, day: number, from: number = 0): number {
  const base = ayahsThroughHafsPage(from);
  if (day <= 0) return base;
  if (day >= days) return TOTAL_AYAHS;
  const span = KHATMAH_TOTAL_PAGES - from;
  // A plan longer than the pages it covers cannot have a page a day, so
  // it falls back to the even ayah cut rather than handing out empty days.
  if (days > span) {
    return base + Math.round(((TOTAL_AYAHS - base) * day) / days);
  }
  return ayahsThroughHafsPage(from + Math.round((span * day) / days));
}

/**
 * Which portion an ayah falls in, by its index.
 *
 * On a deadline plan this is asked ABOUT TODAY'S CUT, for the same reason
 * `khatmahPortion` answers from it: the days before today were cut by a
 * pace that no longer applies, and the days after today have not been cut
 * yet. Anything at or before today's portion is today's day number, and
 * anything past it is however many of today's lengths beyond it lands.
 */
export function khatmahPortionOf(
  plan: KhatmahPlan,
  index: number,
  now: number = Date.now(),
): number {
  const pace = khatmahPaceToday(plan, now);
  if (pace) {
    const today = deadlineDayNumber(plan.startedAt, plan.deadline!, now);
    const at = Math.min(TOTAL_AYAHS, Math.max(1, Math.trunc(index)));
    if (at <= pace.to) return today;
    const len = Math.max(1, pace.to - pace.from + 1);
    return Math.min(
      planDays(plan),
      today + Math.ceil((at - pace.to) / len),
    );
  }
  return durationPortionOf(plan, index);
}

function durationPortionOf(plan: KhatmahPlan, index: number): number {
  const days = planDays(plan);
  const from = planFrom(plan);
  const base = ayahsThroughHafsPage(from);
  const at = Math.min(TOTAL_AYAHS, Math.max(1, Math.trunc(index)));
  const span = Math.max(1, TOTAL_AYAHS - base);
  // The boundaries are rounded, so the proportional guess can land either
  // side of one. Walk it onto the right side rather than trusting it.
  let day = Math.min(
    days,
    Math.max(1, Math.ceil(((at - base) * days) / span)),
  );
  while (day > 1 && portionEnd(days, day - 1, from) >= at) day -= 1;
  while (day < days && portionEnd(days, day, from) < at) day += 1;
  return day;
}

export function khatmahPortion(
  plan: KhatmahPlan,
  day: number,
  now: number = Date.now(),
): KhatmahPortion {
  const days = planDays(plan);
  const d = Math.min(days, Math.max(1, Math.trunc(day)));
  /**
   * A DEADLINE PLAN IS CUT FROM TODAY OUTWARDS, not from page one.
   *
   * There is no standing cut of the book to ask for day nine of: the cut
   * is made each morning out of what is left (`khatmahPaceToday`). Today
   * is that cut; a later day is the same length again, laid end to end
   * after it, which is what the plan intends to do tomorrow if today is
   * kept; and an earlier day is behind the reader, where the portions are
   * no longer a promise about anything. Only today and the day after it
   * are ever asked for — the card's "finish day N too" is the one caller
   * that looks forward.
   */
  const pace = khatmahPaceToday(plan, now);
  if (pace) {
    const today = deadlineDayNumber(plan.startedAt, plan.deadline!, now);
    const step = d - today;
    if (step <= 0) return { day: d, from: pace.from, to: pace.to };
    /**
     * LAID OUT IN PAGES, THE WAY THE CUT WILL BE. Tomorrow's cut is made
     * tomorrow by `paceCut`: what is left then, in Ḥafṣ pages, over the
     * days left then, from the page today's cut closes on. The same
     * arithmetic here, assuming today's cut gets read and nothing else
     * changes — so "Finish day 6 (tomorrow)", and the marker under it,
     * name the ayah tomorrow's cut will actually close on. Today's LENGTH
     * IN AYAHS counted on from today's end (which this used to do) lands
     * a page or two off wherever the ayahs run long or short, and the
     * marker then jumped when the day turned and the real cut was pinned.
     */
    let endPage = pagesThroughAyahs(pace.to, DEFAULT_RIWAYAH);
    // Owed once today's cut is read: the book past it, plus the holes
    // behind the reader that the pace already carries. From today's END,
    // not from wherever the reader has got to — the days are laid out
    // whole and stay put while they read on, so "day 6" names one place
    // all day and a day read ahead is skipped, not re-cut under them.
    let unread = Math.max(
      0,
      KHATMAH_TOTAL_PAGES - endPage + khatmahGapPages(plan, DEFAULT_RIWAYAH),
    );
    let daysLeft = daysToDeadline(plan.deadline!, now);
    let from = pace.from;
    let to = pace.to;
    for (let k = 0; k < step; k++) {
      daysLeft = Math.max(1, daysLeft - 1);
      const share = Math.max(1, Math.ceil(unread / daysLeft));
      from = Math.min(TOTAL_AYAHS, to + 1);
      endPage = Math.min(KHATMAH_TOTAL_PAGES, endPage + share);
      to = Math.max(from, Math.min(TOTAL_AYAHS, ayahsThroughHafsPage(endPage)));
      unread = Math.max(0, unread - share);
    }
    return { day: d, from, to };
  }
  const from = planFrom(plan);
  return {
    day: d,
    from: portionEnd(days, d - 1, from) + 1,
    to: portionEnd(days, d, from),
  };
}

/** The portion the reader is in — the one holding the page they are on. */
/**
 * THE PORTION THE READER IS STANDING IN — where the reading has got to.
 *
 * On a duration plan this is the same thing as "the portion in hand",
 * because the day number is derived from the reading. On a deadline plan
 * it is not: the day is today's cut, and a reader who has read on past it
 * is standing in a later one. Credit follows the reader (see
 * `khatmahCreditWindow`); the DAY does not (see `khatmahCurrentPortion`).
 */
export function khatmahReachPortion(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahPortion {
  const reach = khatmahReachAyah(plan);
  const last = planDays(plan);
  if (reach >= TOTAL_AYAHS) return khatmahPortion(plan, last, now);
  /**
   * ON A DEADLINE PLAN, WALK THE DAYS AS THEY ARE CUT. `khatmahPortionOf`
   * numbers a day by the book's proportions — a sixtieth of it per day —
   * which is the duration plan's rule and nothing to do with a plan cut
   * from today's page outward. Asking it for the reach and then asking
   * `khatmahPortion` for THAT day found a day that had no relation to
   * where the reader stood: reading on past tomorrow's cut stalled at
   * its end (the window it drew closed there), and a pin placed ahead
   * of the calendar left the reader on a page the plan would not credit
   * until the day turned. So: from today's cut, forward, the first day
   * whose cut reaches the ayah the reader is about to read.
   */
  if (khatmahDeadline(plan)) {
    const today = deadlineDayNumber(plan.startedAt, plan.deadline!, now);
    let day = today;
    let portion = khatmahPortion(plan, day, now);
    while (portion.to < reach + 1 && day < last) {
      day += 1;
      portion = khatmahPortion(plan, day, now);
    }
    return portion;
  }
  return khatmahPortion(plan, khatmahPortionOf(plan, reach + 1, now), now);
}

export function khatmahCurrentPortion(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahPortion {
  const reach = khatmahReachAyah(plan);
  // A deadline plan's portion in hand is TODAY'S, whether or not the
  // reader has got to it: the calendar decides which day it is, so
  // reading ahead does not move them into tomorrow's reading the way it
  // does on a duration plan (it shows as `extra`, which is what the
  // overflow marker from 2.24.0 already reports).
  const pace = khatmahPaceToday(plan, now);
  if (pace) {
    return {
      day: deadlineDayNumber(plan.startedAt, plan.deadline!, now),
      from: pace.from,
      to: pace.to,
    };
  }
  if (reach >= TOTAL_AYAHS) return khatmahPortion(plan, planDays(plan), now);
  return khatmahPortion(plan, khatmahPortionOf(plan, reach + 1, now), now);
}
