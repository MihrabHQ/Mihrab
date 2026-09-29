/**
 * HOW THE PLAN STANDS — today's state and its pages, the days left, the
 * finish target and the ayah the marker sends the reader to, how far a
 * dated plan is behind, whether the reading has outgrown its pace, and the
 * length a duration plan needs to finish in a given number of days.
 *
 * Pure, over `khatmahSchedule` and `khatmahProgress`. Moved out of
 * `quranState.ts` unchanged (docs/rewrite-plan.md, step 2.2); the store
 * re-exports what was exported.
 */
import { TOTAL_AYAHS, ayahAtIndex } from './ayahIndex';
import { findPageForAyah, totalPagesForRiwayah } from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import { daysAway } from './khatmahDayWhen';
import { daysToDeadline, deadlineTotalDays } from './khatmahPace';
import { rangesCover } from './khatmahDone';
import type { KhatmahPlan } from './quranTypes';
import {
  KHATMAH_TOTAL_PAGES,
  khatmahAyahsRead,
  khatmahDone,
  khatmahIsComplete,
  khatmahReachAyah,
  khatmahReachPage,
  khatmahUnreadPages,
  localYmd,
  planFrom,
} from './khatmahProgress';
import {
  khatmahCurrentPortion,
  khatmahDeadline,
  khatmahPaceToday,
  khatmahPortion,
  type KhatmahPortion,
  khatmahPortionOf,
  pacedInstant,
  planDays,
} from './khatmahSchedule';

/**
 * The `targetDays` that leaves this reader `days` days of reading.
 *
 * A duration plan's day number is a fact about the READING — the portion
 * holding the next unread ayah — so "how many days are left" is
 * `targetDays` less that number, and the length that answers a given
 * number of days depends on where the reader is standing. The estimate is
 * the arithmetic (the whole span over the portion size the request
 * implies); the walk around it is because the portions are cut on page
 * boundaries and rounding can land the answer a day either side.
 *
 * Pure, and exported for the sheet: the reader sees the pace their choice
 * would ask for before they commit to it.
 */
export function khatmahDurationForDaysLeft(
  plan: KhatmahPlan,
  days: number,
  now: number = Date.now(),
): number {
  const want = Math.min(3650, Math.max(1, Math.round(days) || 1));
  const from = planFrom(plan);
  const span = Math.max(1, KHATMAH_TOTAL_PAGES - from);
  // What the request is actually about: the pages in front of the reader
  // — from the plan's own start when they have not begun, because a plan
  // begun at page 143 has 461 pages ahead of it, not 604.
  const ahead = Math.max(
    1,
    KHATMAH_TOTAL_PAGES - Math.max(from, khatmahReachPage(plan)),
  );
  /**
   * A PORTION IS AT LEAST A PAGE, which caps how slow a khatmah can be.
   *
   * Past `span` the model stops cutting by pages and falls back to an
   * even share of the ayahs (`portionEnd`), where the day a reader is
   * standing in no longer follows from the page they are on — so a
   * solution found there would not be one. A reader with forty pages
   * left who asks for a year gets a page a day, which is the gentlest
   * plan this model has; the sheet shows them the pace before they
   * commit, so it is on screen rather than a surprise.
   */
  const estimate = Math.min(
    span,
    Math.max(1, Math.round((span * want) / ahead) || 1),
  );
  const daysLeftIf = (targetDays: number): number => {
    const probe: KhatmahPlan = { ...plan, targetDays };
    delete probe.deadline;
    delete probe.pace;
    return Math.max(0, targetDays - khatmahCurrentPortion(probe, now).day + 1);
  };
  /**
   * THE LENGTH IN HAND, if it already answers. A duration plan whose
   * reader asks for exactly the days it has left should come back the
   * same plan — not a neighbouring length that happens to leave the same
   * number of days while moving every portion boundary a page, so that
   * "day 10 of 30" reads "day 9 of 29" for having changed nothing.
   */
  if (!khatmahDeadline(plan) && daysLeftIf(plan.targetDays) === want) {
    return Math.max(1, Math.trunc(plan.targetDays) || 1);
  }
  let best = estimate;
  let bestMiss = Math.abs(daysLeftIf(estimate) - want);
  for (let n = Math.max(1, estimate - 16); n <= Math.min(span, estimate + 16); n++) {
    const miss = Math.abs(daysLeftIf(n) - want);
    // Strictly better only, and the scan runs upwards: two lengths that
    // are equally close give the shorter one, on both devices alike.
    if (miss < bestMiss) {
      best = n;
      bestMiss = miss;
    }
  }
  return best;
}

/** Where the reader stands in the portion the day's reading belongs to. */
export type KhatmahDayState = {
  portion: KhatmahPortion;
  /** Its length, in ayahs. */
  length: number;
  /** How many of them are read. */
  read: number;
  /** True once the whole portion is behind the reader. */
  done: boolean;
  /** Ayahs read PAST it — reading ahead, counted apart from the day. */
  extra: number;
};

/**
 * What this reader has actually been managing, in pages a day.
 *
 * Pages read since the plan began over the days since it began — the
 * only record of their real pace the app keeps, and enough to tell "a
 * plan that has slipped" from "a plan that never fitted".
 */
export function khatmahRealizedPace(
  plan: KhatmahPlan,
  now: number = Date.now(),
): number {
  const span = Math.max(1, KHATMAH_TOTAL_PAGES - planFrom(plan));
  const done = Math.max(0, span - khatmahUnreadPages(plan));
  const days = Math.max(1, -daysAway(plan.startedAt, now) + 1);
  return done / days;
}

/**
 * Pages a day the plan asked for when it was last paced.
 *
 * From where the reader stood then to the end of the book, over the days
 * that decision gave itself — which for a plan made and never re-paced is
 * the whole book over its whole length, as it always was.
 */
function pacePromised(plan: KhatmahPlan): number {
  const from = Math.min(
    KHATMAH_TOTAL_PAGES,
    Math.max(planFrom(plan), plan.pacedFrom ?? planFrom(plan)),
  );
  const left = Math.max(1, KHATMAH_TOTAL_PAGES - from);
  const by = khatmahDeadline(plan);
  const days =
    by && plan.pacedAt !== undefined
      ? deadlineTotalDays(pacedInstant(plan), by)
      : planDays(plan);
  return left / Math.max(1, days);
}

/**
 * HAS THE DATE OUTGROWN THE READER? (issue #53)
 *
 * An automatically growing quota has a failure mode this app must not
 * ship: miss days, the quota grows, the growth makes missing likelier,
 * and the khatmah becomes the thing you avoid opening. A simulation of a
 * reader doing half of each day's portion shows it plainly — 21 pages a
 * day becomes 34 by the third week and 120 by the last.
 *
 * So the card offers a new date, once and quietly, when the pace has run
 * away. TWO tests, and it needs both:
 *
 *   • half again the pace the plan was MADE for — so a plan being kept,
 *     or one that absorbed a missed day or two, never triggers it; and
 *   • half again what the reader has actually been READING — so a fast
 *     reader who can clearly take it is not offered a way out, and a
 *     plan that never fitted is caught early rather than at the end.
 *
 * Not before the plan has a few days of evidence behind it: on day one
 * the realized pace is whatever happened in one morning.
 */
export function khatmahPaceOutgrown(
  plan: KhatmahPlan,
  now: number = Date.now(),
): boolean {
  if (!khatmahDeadline(plan)) return false;
  if (khatmahIsComplete(plan)) return false;
  const elapsed = -daysAway(plan.startedAt, now);
  if (elapsed < 3) return false;
  const needed = khatmahPerDayPages(plan, now);
  /**
   * THE PACE THE READER AGREED TO, which is the one they agreed to LAST.
   *
   * `planDays` is the whole span from the plan's first day to its date,
   * and dividing the whole book by it describes a plan nobody is on the
   * moment a date is set mid-khatmah: a reader who is four fifths through
   * and gives themselves a week has signed up for that week's pace, not
   * for the gentle average of the three months since they began. Measured
   * the old way, the card would open by telling them the date had
   * outgrown them — about a date they had just chosen.
   */
  const planned = Math.max(1, Math.ceil(pacePromised(plan)));
  const realized = Math.max(1, khatmahRealizedPace(plan, now));
  return needed >= 1.5 * planned && needed >= 1.5 * realized;
}

/** The pace a deadline plan needs from today on, in Ḥafṣ pages a day. */
export function khatmahPerDayPages(
  plan: KhatmahPlan,
  now: number = Date.now(),
  /** The reader's muṣḥaf — this number is for them, not for the cut. */
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  const by = khatmahDeadline(plan);
  if (!by) return 0;
  const left = khatmahUnreadPages(plan, riwayah);
  if (left <= 0) return 0;
  return Math.max(1, Math.ceil(left / Math.max(1, daysToDeadline(by, now))));
}

/**
 * The ayah that closes the portion the finish pill acts on — the one the
 * page marks, and the one the pill sits under. Null once the book is
 * finished.
 *
 * THE SAME PORTION AS THE PILL'S LABEL (`khatmahFinishTarget`), not the
 * portion in hand. On a deadline plan those part company the moment
 * today's cut is read: the portion in hand stays today's, the pill moves
 * on to tomorrow's — and with the marker still on today's last ayah the
 * reader who had just pressed "Finish day 5" on it was shown "Finish
 * day 6 (tomorrow)" on that very ayah, as if tomorrow ended where today
 * did.
 */
export function khatmahMarkerAyah(
  plan: KhatmahPlan,
  now: number = Date.now(),
): { surah: number; ayah: number } | null {
  if (!khatmahCanFinish(plan, now)) return null;
  return ayahAtIndex(khatmahFinishTarget(plan, now).to);
}

/**
 * WOULD "DONE" DO ANYTHING? False once the portion it acts on
 * (`khatmahFinishTarget`) is read in full.
 *
 * Which is the case when all that is left are pages skipped on the way —
 * the reader has reached the end, the last portion is covered, and the
 * holes behind it are not a portion. `finishKhatmahPortion` then declines,
 * so the card's button, the reader's pill and the marker at the portion's
 * end must not be offered: they did nothing when pressed. The way on from
 * there is the skipped pages themselves (the Home door says so).
 */
export function khatmahCanFinish(
  plan: KhatmahPlan,
  now: number = Date.now(),
): boolean {
  if (khatmahAyahsRead(plan) >= TOTAL_AYAHS) return false;
  const target = khatmahFinishTarget(plan, now);
  return !rangesCover(khatmahDone(plan), target.from, target.to);
}

/**
 * The day's portion and how much of it is read.
 *
 * The portion is the one that was current when the day's reading STARTED,
 * not the one current now: finishing it and reading on must leave the day
 * showing as done, with the rest counted as extra, rather than silently
 * becoming a new unfinished day. On a day with no reading yet the two are
 * the same thing.
 */
export function khatmahDay(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahDayState {
  // Where the reader is, not where the contiguous run stopped. One
  // un-marked page behind them used to make a finished day report itself
  // unfinished and nag for pages they had read — see `khatmahReachAyah`.
  const read = khatmahReachAyah(plan);
  /**
   * A DEADLINE PLAN'S DAY IS TODAY'S CUT, full stop.
   *
   * The dance below — hold the day at the portion the reading STARTED in,
   * so finishing it and reading on leaves the day done rather than
   * dragging the reader into tomorrow — is what a duration plan needs,
   * because its day number comes from where the reading is. A deadline
   * plan's day number comes from the date, and its portion was pinned
   * when the day opened, so the same behaviour falls out of asking for it
   * directly: today's cut, what has been read of it, and the rest as
   * `extra`.
   */
  const pace = khatmahPaceToday(plan, now);
  const portion = pace
    ? khatmahCurrentPortion(plan, now)
    : (() => {
        const opened =
          plan.dayStartDate === localYmd(now)
            ? Math.min(read, Math.max(0, plan.dayStartAyahsRead ?? read))
            : read;
        const day =
          read >= TOTAL_AYAHS && opened >= TOTAL_AYAHS
            ? planDays(plan)
            : khatmahPortionOf(plan, Math.min(TOTAL_AYAHS, opened + 1), now);
        return khatmahPortion(plan, day, now);
      })();
  const length = portion.to - portion.from + 1;
  return {
    portion,
    length,
    read: Math.max(0, Math.min(length, read - portion.from + 1)),
    done: read >= portion.to,
    extra: Math.max(0, read - portion.to),
  };
}

/**
 * Mark the portion in hand as read, in full.
 *
 * The button behind the "I missed the marker" case and the page pill both
 * land here. It always finishes the CURRENT portion, so pressing it after
 * today's is already done reads the next one ahead — which is the same
 * thing reading ahead by hand would do, and leaves the reader in exactly
 * the place the rule above says they are.
 */
/**
 * THE PORTION THE FINISH BUTTON WOULD ACT ON.
 *
 * On a duration plan this is always the portion in hand: the day number
 * is derived from the reading, so finishing today's moves the reader into
 * the next one and the button follows them there.
 *
 * A deadline plan's portion is TODAY'S and stays today's however much is
 * read — that is what makes reading ahead show as `extra` rather than as
 * time travel. Which would leave the card's "✓ finish day 10 too" button
 * pointing at a portion already covered, and `finishKhatmahPortion`
 * declining to do anything at all. So once today's cut is read, the
 * button means the next day's, and this is the one place that decides
 * that — the label and the action must not disagree about which day they
 * are talking about.
 */
export function khatmahFinishTarget(
  plan: KhatmahPlan,
  now: number = Date.now(),
): KhatmahPortion {
  const portion = khatmahCurrentPortion(plan, now);
  if (!khatmahDeadline(plan)) return portion;
  // The first portion from today on that is not read yet: read ahead past
  // tomorrow's cut as well and the pill (and the marker with it) means the
  // day after, not a day already covered that pressing would do nothing
  // for. Bounded by the plan's last day, which is where it stops.
  const done = khatmahDone(plan);
  const last = planDays(plan);
  let at = portion;
  while (rangesCover(done, at.from, at.to) && at.to < TOTAL_AYAHS && at.day < last) {
    const next = khatmahPortion(plan, at.day + 1, now);
    if (next.to <= at.to) break;
    at = next;
  }
  return at;
}

/**
 * The days of reading still in front of the reader.
 *
 * ── WHY THIS IS NOT THE CALENDAR ──────────────────────────────────────
 *
 * It was, and it contradicted the line beside it. The day NUMBER comes
 * from the portion the reader has reached — that is the whole point of
 * the portion model, so that reading ahead or falling behind moves the
 * reader and not the schedule — while the days left came from midnights
 * elapsed since the plan started. On a plan begun today and read four
 * portions into, the card said "day 4 of 30" and "30 days left" in the
 * same breath.
 *
 * ── AND WHY IT IS NOT THE DAY'S PORTION EITHER ────────────────────────
 *
 * Because that is pinned, on purpose. `khatmahDay` reports the portion
 * the day STARTED in, so that finishing it and reading on leaves the day
 * showing as done rather than silently becoming a new unfinished one —
 * and a reader who sat down at page 90 and read to page 551 is still on
 * "day 5" until tomorrow, which is what was asked for.
 *
 * What is left of the BOOK is a different question, and its answer is
 * where the reader actually is. Saying "25 days to go" to someone with
 * fifty pages in front of them is the same fault in another place.
 */
export function khatmahDaysLeft(
  plan: KhatmahPlan,
  now: number = Date.now(),
): number {
  // Complete means every ayah, so a plan with a hole still has a day in
  // it however far the reader has reached.
  if (khatmahIsComplete(plan)) return 0;
  /**
   * ON A DEADLINE PLAN THIS IS THE CALENDAR'S ANSWER, and that is the
   * whole point of the mode — it is the number issue #53 was reported
   * about. A target of 30 September seen on 16 September is fourteen
   * days, whatever the reader has or has not read; portions remaining
   * would say eighteen and be describing a different plan.
   *
   * Zero once the date has passed. The card says so and offers another
   * date; nothing counts the days that went by.
   */
  const by = khatmahDeadline(plan);
  if (by) return daysToDeadline(by, now);
  return Math.max(
    0,
    plan.targetDays - khatmahCurrentPortion(plan, now).day + 1,
  );
}

/**
 * How far behind the calendar the reading is, in pages.
 *
 * The one number here that IS the calendar's, and rightly: being behind
 * is a statement about the schedule, not about where the reader is.
 */
export function khatmahBehindBy(
  plan: KhatmahPlan,
  now: number = Date.now(),
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  /**
   * A DEADLINE PLAN IS NEVER BEHIND — its pace is.
   *
   * "You are 40 pages behind" is a statement about a schedule that does
   * not move. A deadline plan's schedule moves every morning: what was
   * missed is already inside today's quota, and saying it twice would be
   * charging the reader for it twice. What the card shows instead is the
   * pace itself — `khatmahPerDayPages` — which goes up when days are
   * missed and is the same fact said forwards.
   */
  if (khatmahDeadline(plan)) return 0;
  /**
   * DAYS, COUNTED THE WAY THE READER'S DAYS ROLL.
   *
   * This used to be `floor((now - startedAt) / 86_400_000)` — a rolling
   * twenty-four hours from the moment the plan was made, which is a
   * boundary the app does not use anywhere else. A khatmah begun at 23:00
   * gained a day at 23:00 every night, an hour before the day pill did
   * and hours after maghrib for a reader whose day starts there, so the
   * card could say "one page behind" beside a day number that disagreed.
   *
   * `daysAway` counts whole days from the store's own today (see
   * `khatmahDayWhen`), which is the same today the portion, the snapshot
   * and the pill are keyed on. Day one is the day it began: elapsed is
   * how many days have PASSED since then, so the plan is not behind on
   * the morning it was made.
   */
  /**
   * FROM THE DAY THE PLAN WAS LAST PACED, AND FROM WHERE THE READER THEN
   * STOOD (`pacedFrom`).
   *
   * A schedule is a promise, and re-pacing a khatmah replaces the promise:
   * a reader nineteen days into a plan who asks for the rest in a
   * fortnight has just agreed to a line that starts today, at the page
   * they are on. Measured from the plan's birthday instead, the very next
   * render would tell them they were three hundred pages behind something
   * they had already given up on, and the card would offer them a way out
   * of the plan they had chosen one second earlier.
   *
   * A plan that has never been re-paced stamps the pair when it is made,
   * so this is the day it began and the page it began at — the arithmetic
   * this always did. Older plans carry neither and fall back to exactly
   * that.
   */
  const daysElapsed = Math.max(0, -daysAway(pacedInstant(plan), now));
  // Against the plan's own span, not the whole book: a khatmah begun at
  // page 143 is not five days behind on the morning it was made.
  const from = planFrom(plan);
  const span = KHATMAH_TOTAL_PAGES - from;
  const origin = Math.min(
    KHATMAH_TOTAL_PAGES,
    Math.max(from, plan.pacedFrom ?? from),
  );
  const expected = Math.min(
    KHATMAH_TOTAL_PAGES,
    origin + Math.round((span / planDays(plan)) * daysElapsed),
  );
  // Against the reach, not the contiguous mirror: pages behind a hole are
  // already reported as unread (`khatmahGap`), and counting them here as
  // well would tell the reader they are sixty pages behind schedule over
  // two pages they skipped. And never below the plan's own start: the
  // reach of a khatmah begun at page 143 with nothing read yet is zero,
  // which read as "142 pages behind" on the morning it was made.
  return Math.max(0, expected - Math.max(from, khatmahReachPage(plan, riwayah)));
}

/** What a khatmah has left, counted in pages of the muṣḥaf in hand. */
export type KhatmahPages = {
  /** Pages the day's portion covers, first to last. */
  today: number;
  /** How many of those the reader has finished. */
  doneToday: number;
  /** What is left of today — `today` less `doneToday`. */
  leftToday: number;
  /** Pages read past the day's portion. */
  extraToday: number;
  /** Pages from where the reader is to the end of the muṣḥaf. */
  remaining: number;
  /** Pages in this riwayah's muṣḥaf. */
  total: number;
};

/**
 * The plan's progress in PAGES, for the muṣḥaf the reader is actually in.
 *
 * ── WHY THE RIWAYAH IS AN ARGUMENT ────────────────────────────────────
 *
 * Because a page is not a fixed quantity of Qur'an. Progress is kept in
 * ayahs, which every riwayah agrees on, and pages are the reader's own
 * unit — "four pages left today" is a thing anyone can picture where
 * "sixty-one ayahs" is not. But the four pages are four pages OF SOMETHING,
 * and Warsh, Qālūn and Shuʿbah each break the text across their fifteen
 * lines differently. Answering out of the Ḥafṣ pagination for a reader in
 * Shuʿbah is quietly wrong by a page here and there all the way down the
 * book.
 *
 * So the ayahs are converted through the pagination of the muṣḥaf in
 * hand. `pagesForRiwayah` falls back to Ḥafṣ for a riwayah this build
 * cannot draw, which is the right way to be wrong: that reader is in
 * Ḥafṣ anyway.
 */
export function khatmahPages(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
  now: number = Date.now(),
): KhatmahPages {
  const pageOf = (index: number) => {
    const at = ayahAtIndex(
      Math.max(1, Math.min(TOTAL_AYAHS, Math.trunc(index))),
    );
    return findPageForAyah(at.surah, at.ayah, riwayah);
  };
  const total = totalPagesForRiwayah(riwayah);
  const day = khatmahDay(plan, now);
  const read = khatmahReachAyah(plan);
  const first = pageOf(day.portion.from);
  const last = pageOf(day.portion.to);
  const today = Math.max(1, last - first + 1);
  // Full when the portion is finished, however the reader got there — a
  // page count taken from the last ayah read can land one short of the
  // portion's own last page, and "1 page left" on a day that is done is
  // exactly the nag this is meant to avoid.
  const doneToday = day.done
    ? today
    : Math.max(
        0,
        Math.min(
          today,
          read >= day.portion.from ? pageOf(read) - first + 1 : 0,
        ),
      );
  return {
    today,
    doneToday,
    leftToday: Math.max(0, today - doneToday),
    extraToday: read > day.portion.to ? Math.max(0, pageOf(read) - last) : 0,
    remaining: read >= TOTAL_AYAHS ? 0 : total - pageOf(read + 1) + 1,
    total,
  };
}
