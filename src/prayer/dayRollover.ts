/**
 * When a day's card has nothing left to say.
 *
 * The hero has always rolled over on its own: `getNextPrayerDisplay` looks
 * at tomorrow as well as today, so the moment Ishāʾ passes the countdown is
 * already pointed at tomorrow's Fajr. The table under it was not — it stayed
 * on the calendar day until midnight, which left the top of the screen
 * counting down to a time the rows below it did not contain, for the four or
 * five hours of the evening when someone is most likely to be looking ahead
 * rather than back.
 *
 * ── WHAT "NOTHING LEFT" MEANS ─────────────────────────────────────────
 *
 * The last row on the card, not Ishāʾ. Which row that is depends on what the
 * reader has turned on: the First Third of the night sits after Ishāʾ (it
 * belongs to the night that BEGINS on this card — see `utils/nightTimes`),
 * so with #14's toggle on the day runs a couple of hours longer than Ishāʾ
 * and rolling at Ishāʾ would hide a row that had not happened yet.
 *
 * Islamic Midnight and the Last Third are the other way round: on this card
 * they are the small hours of THIS morning, already behind us, and they sort
 * before Fajr. Taking the latest instant on the card rather than the last
 * key in `DISPLAY_ORDER` gets both cases right without knowing which is
 * which.
 *
 * ── THE ROWS THAT CAN FALL AFTER MIDNIGHT ─────────────────────────────
 *
 * Ishāʾ and the First Third are printed on this card but can happen on the
 * next calendar day — Stockholm in June puts Ishāʾ past 00:00 — and a naive
 * "today at 00:15" is sixteen hours in the PAST, which would read as a day
 * already spent at breakfast. Each row is placed by `eventAt`, whose rule
 * (`rowDateShift`) is the scheduler's and the widgets' too.
 */
import { DISPLAY_ORDER, type TimingsMap } from '../types/prayer';
import { eventAt } from '../utils/prayerTimes';

/**
 * The instant one row of this card happens, or null when the row is absent
 * or its clock string is unreadable.
 */
function instantOf(
  key: string,
  timings: TimingsMap,
  dayStart: Date,
  clock?: string | null,
): Date | null {
  if (!timings[key]) return null;
  try {
    return eventAt(key, timings, dayStart, clock);
  } catch {
    // An unreadable time is a row that cannot be placed, not a throw: the
    // rest of the day still answers the question.
    return null;
  }
}

/**
 * The latest instant on this card — the one everything else is behind.
 *
 * Null when the card has no readable time at all, which is a card that
 * cannot say whether it is spent, not one that is.
 */
export function lastTimeOfDay(
  timings: TimingsMap,
  dayStart: Date,
  /** The clock the day is written on (`DEVICE_CLOCK`). */
  clock?: string | null,
): Date | null {
  let last: Date | null = null;
  for (const key of DISPLAY_ORDER) {
    const at = instantOf(key, timings, dayStart, clock);
    if (!at) continue;
    if (!last || at.getTime() > last.getTime()) last = at;
  }
  return last;
}

/** Whether every time on this card is behind `now`. */
export function dayIsSpent(
  timings: TimingsMap,
  dayStart: Date,
  now: Date,
  clock?: string | null,
): boolean {
  const last = lastTimeOfDay(timings, dayStart, clock);
  return last != null && now.getTime() > last.getTime();
}
