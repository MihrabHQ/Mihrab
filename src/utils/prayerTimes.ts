import type { NextSalahName, TimingsMap } from '../types/prayer';
import { isNonPrayerEvent, NEXT_SALAH_ORDER } from '../types/prayer';
import { civilInZone, deviceZone, instantOnZoneClock } from './zoneClock';

/**
 * WHOSE CLOCK A DAY'S "HH:mm" STRINGS ARE WRITTEN ON.
 *
 * Every time the app holds is a wall-clock string, and a string is only an
 * instant once a clock is named. Most answers are written on the phone's
 * (`'device'`); an authority's table for a place in another zone is written
 * on the place's (`providers/locationClock.ts`), and so is AlAdhan's answer
 * for it. Read on the phone's clock, a saved Rabat on a phone in Stockholm
 * counted down to, and alerted at, 05:05 Stockholm time for the ministry's
 * 05:05 GMT — an hour early. So each answer says which clock it is on
 * (`PrayerTimesResult.clock`), the cache keeps it with the day, and the
 * instant is made here, in one place, on that clock.
 *
 * An IANA zone, or `'device'`. Absent is `'device'`: what every day stored
 * before this existed was read as.
 */
export const DEVICE_CLOCK = 'device';

/**
 * The zone to read a day on, or null for the phone's own clock: for
 * `'device'`, for no tag, and for the phone's own zone (read on the phone's
 * clock, as before — its zone data, stale or not, is what its alarms run on).
 */
export function readZone(clock: string | null | undefined): string | null {
  if (!clock || clock === DEVICE_CLOCK) return null;
  if (clock === deviceZone()) return null;
  return clock;
}

/**
 * The instant `hour`:`minute` on a zone's clock, on the day that zone is on
 * at the phone's noon of `day` — the place's own date for the phone's, as
 * the producers chose it (`placeCivilDay`). Null where the phone cannot say.
 */
function onZoneClock(
  day: Date,
  hour: number,
  minute: number,
  zone: string,
): Date | null {
  const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const civil = civilInZone(noon, zone);
  if (!civil) return null;
  return instantOnZoneClock(zone, civil.y, civil.m - 1, civil.d, hour, minute);
}

export function extractClock(timeStr: string): {
  hour: number;
  minute: number;
} {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    throw new Error(`Unrecognized time format: ${timeStr}`);
  }
  return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
}

export function formatDisplayTime(timeStr: string): string {
  const { hour, minute } = extractClock(timeStr);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatLocalTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The instant a day's time names. `clock` is the clock the time is written on
 * (see `DEVICE_CLOCK`); without one, or where the phone cannot read the zone,
 * the phone's.
 */
export function combineLocalDateAndTime(
  day: Date,
  timeStr: string,
  clock?: string | null,
): Date {
  const { hour, minute } = extractClock(timeStr);
  const zone = readZone(clock);
  if (zone) {
    const at = onZoneClock(day, hour, minute, zone);
    if (at) return at;
  }
  const out = new Date(day);
  out.setHours(hour, minute, 0, 0);
  return out;
}

export function addDays(day: Date, days: number): Date {
  const out = new Date(day);
  out.setDate(out.getDate() + days);
  return out;
}

export function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * The date a day's entry actually falls on.
 *
 * Every row of a day card is that day's clock time on that day — with one
 * exception. The first third of the night belongs to the night the day
 * BEGINS (see `nightTimes.ts`), and at high latitude in midsummer that
 * night's first third can land past local midnight: Maghrib 22:00 with
 * Fajr 02:00 gives 23:20, which is fine, but push Maghrib to 23:10 and it
 * reads 00:23 — the small hours of the NEXT day, not of this one. Pinned
 * to this day it would be counted down to, and announced, some twenty-three
 * hours early.
 *
 * Any night mark whose clock falls before Maghrib's is therefore on the
 * other side of midnight. Nothing else on the card needs this: Islamic
 * Midnight and the Last Third belong to the night that ENDS here, and
 * their pre-dawn times are already this day's.
 */
/**
 * When an event on `base`'s card actually happens.
 *
 * Exported because it is the one place that knows the First Third of the
 * night belongs to the evening it starts in and not to the date its clock
 * time falls on. Anything asking "which occurrence is this row" has to
 * ask the same way the scheduler does, or the two name different
 * instants for the same row.
 */
export function eventAt(
  name: string,
  timings: TimingsMap,
  base: Date,
  clock?: string | null,
): Date {
  const at = combineLocalDateAndTime(base, timings[name], clock);
  if (name !== 'Firstthird' || !timings.Maghrib) return at;
  return at < combineLocalDateAndTime(base, timings.Maghrib, clock)
    ? combineLocalDateAndTime(addDays(base, 1), timings[name], clock)
    : at;
}

/**
 * A day's times rewritten from the clock they are on to another, the same
 * instants: `to` a zone, or `'device'` for the phone's. For what cannot be
 * told which clock to read on — the widgets and the Live Activity, whose
 * native code reads every time on the phone's clock, and the alert
 * schedule's many readers — and for putting the days of one place on one
 * clock. Anything that is not a time passes through; with both clocks the
 * same, the day itself is returned.
 */
export function onClock(
  timings: TimingsMap,
  base: Date,
  from: string | null | undefined,
  to: string | null | undefined,
): TimingsMap {
  const fromZone = readZone(from);
  const toZone = readZone(to);
  if (fromZone === toZone) return timings;
  const out: TimingsMap = {};
  for (const [key, value] of Object.entries(timings)) {
    const m =
      typeof value === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
    if (!m) {
      out[key] = value;
      continue;
    }
    const at = combineLocalDateAndTime(base, value, from);
    if (!toZone) {
      out[key] = formatLocalTime(at);
      continue;
    }
    const c = civilInZone(at, toZone, true);
    out[key] = c
      ? `${String(c.h).padStart(2, '0')}:${String(c.min).padStart(2, '0')}`
      : value;
  }
  return out;
}

/**
 * For DISPLAY only: a Date whose phone-local fields read `at` on `clock`'s
 * wall clock, so a formatter that writes the phone's local time (the app's
 * `fromDate`) writes it as the day's rows are written. `at` itself where the
 * clock is the phone's or cannot be read. Never an instant to schedule on.
 */
export function wallClockDate(
  at: Date,
  clock: string | null | undefined,
): Date {
  const zone = readZone(clock);
  if (!zone) return at;
  const c = civilInZone(at, zone, true);
  return c ? new Date(c.y, c.m - 1, c.d, c.h, c.min) : at;
}

/** A day on the phone's clock — `onClock` to `'device'`. */
export function onDeviceClock(
  timings: TimingsMap,
  base: Date,
  clock: string | null | undefined,
): TimingsMap {
  return onClock(timings, base, clock, DEVICE_CLOCK);
}

/** Consecutive days from `base` (`days[i]` is `base + i`) on the phone's clock. */
export function daysOnDeviceClock(
  days: TimingsMap[],
  base: Date,
  clock: string | null | undefined,
): TimingsMap[] {
  if (!readZone(clock)) return days;
  return days.map((d, i) => onDeviceClock(d, addDays(base, i), clock));
}

export function computeNextSalah(
  timings: TimingsMap,
  now: Date,
  /** The clock the day is written on (`DEVICE_CLOCK`). */
  clock?: string | null,
): { name: NextSalahName; at: Date } | null {
  const dayStart = startOfLocalDay(now);
  for (const name of NEXT_SALAH_ORDER) {
    const raw = timings[name];
    if (!raw) {
      continue;
    }
    const at = eventAt(name, timings, dayStart, clock);
    if (at > now) {
      return { name, at };
    }
  }
  return null;
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '0m';
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

/**
 * The same countdown, split so the seconds can be drawn differently.
 *
 * Seconds belong in a quieter colour at a smaller size: they are the part
 * that moves, and at the size of the hours they would pull the eye away
 * from the number the screen exists to show. Kept zero-padded so the line
 * does not jump a pixel every ten seconds.
 */
export type CountdownParts = {
  /** Hours and minutes, exactly as `formatCountdown` writes them. */
  main: string;
  /** Two digits, no unit. */
  seconds: string;
};

export function countdownParts(totalSeconds: number): CountdownParts {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return {
    main: h > 0 ? `${h}h ${m}m` : `${m}m`,
    seconds: String(safe % 60).padStart(2, '0'),
  };
}

/** The hero's units, as the app's language writes them. */
export type CountdownUnits = { hour: string; minute: string; second: string };

/**
 * The countdown as separate pieces — hours, minutes, seconds — each a
 * number with its unit, so a row can lay them out in reading order.
 *
 * As one string ("5h 25m") the hours and minutes were a single Latin run
 * inside a right-to-left row, which kept them in left-to-right order while
 * the row put the seconds to their LEFT: read from the right in Arabic,
 * that is minutes, hours, seconds (#71). As pieces, the row's own direction
 * orders them — hours first from whichever side the language starts on —
 * and each unit can be the language's own ("5س 25د 31ث").
 */
export function countdownPieces(
  totalSeconds: number,
  units: CountdownUnits,
): { hours: string | null; minutes: string; seconds: string } {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return {
    hours: h > 0 ? `${h}${units.hour}` : null,
    minutes: `${m}${units.minute}`,
    seconds: `${String(safe % 60).padStart(2, '0')}${units.second}`,
  };
}

export function getNextPrayerDisplay(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
  /** The clock both days are written on (`DEVICE_CLOCK`). */
  clock?: string | null,
): { name: string; at: Date } | null {
  // Gather every still-upcoming event from today plus every event tomorrow,
  // then return the chronologically earliest. This is order-agnostic, so it
  // correctly surfaces a pre-dawn night time (Islamic Midnight / Last Third)
  // as the next event after Isha when those toggles are on — they sit before
  // tomorrow's Fajr. For the default five-salāh-plus-sunrise map it behaves
  // exactly as before (next salāh during the day; tomorrow's Fajr after Isha).
  const dayStart = startOfLocalDay(now);
  const candidates: { name: string; at: Date }[] = [];
  for (const name of NEXT_SALAH_ORDER) {
    const raw = today[name];
    if (!raw) continue;
    const at = eventAt(name, today, dayStart, clock);
    if (at > now) candidates.push({ name, at });
  }
  if (tomorrow) {
    const tomorrowDay = addDays(dayStart, 1);
    for (const name of NEXT_SALAH_ORDER) {
      const raw = tomorrow[name];
      if (!raw) continue;
      candidates.push({
        name,
        at: eventAt(name, tomorrow, tomorrowDay, clock),
      });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  return candidates[0];
}

const NOTIFICATION_BUFFER_MS = 15_000;

export function buildUpcomingSalahEvents(
  today: TimingsMap,
  tomorrow: TimingsMap | undefined,
  now: Date,
  /**
   * The LOCAL calendar day the `today` map was fetched for (v2.7.38).
   * Defaults to `now`'s day for backward compatibility, but callers that
   * can hold stale state across midnight (the notification scheduler)
   * MUST pass it: anchoring a yesterday-fetched map to "now" pins
   * yesterday's clock times onto today's date — the schedule then fires
   * 1–2 min off and a later resync adds a second alert at the true time.
   * With the anchor, a stale `today` map yields correctly-dated (past,
   * filtered) events and the `tomorrow` map covers the actual today.
   */
  baseDay: Date = now,
  /**
   * Cached days AFTER tomorrow (i.e. `week[2..]`), scheduled at day offsets
   * 2, 3, … from `baseDay` (v2.7.40). Extends alert coverage so the adhan
   * still fires when the app hasn't been opened for a couple of days —
   * previously coverage was exactly today+tomorrow, so 2 days without an
   * app open meant every alert silently lapsed. (The Live Activity's
   * foreground service used to mask this by keeping the app alive; users
   * who turned it off hit the gap directly.)
   */
  extraDays: TimingsMap[] = [],
  /** The clock every one of the days is written on (`DEVICE_CLOCK`). */
  clock?: string | null,
): { name: string; at: Date }[] {
  const dayStart = startOfLocalDay(baseDay);
  const events: { name: string; at: Date }[] = [];
  const pushDay = (timings: TimingsMap, dayOffset: number) => {
    const base = dayOffset === 0 ? dayStart : addDays(dayStart, dayOffset);
    for (const name of NEXT_SALAH_ORDER) {
      const raw = timings[name];
      if (raw) {
        events.push({ name, at: eventAt(name, timings, base, clock) });
      }
    }
  };
  pushDay(today, 0);
  if (tomorrow) pushDay(tomorrow, 1);
  extraDays.forEach((t, i) => pushDay(t, 2 + i));
  const cutoff = now.getTime() + NOTIFICATION_BUFFER_MS;
  return events
    .filter(e => e.at.getTime() > cutoff)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * One alert per instant.
 *
 * Two events can fall on the same minute: in the polar night Diyanet's
 * tables (and Sweden's, the same method) print Asr at Dhuhr's time when it
 * never forms — Tromsø on 21 December, Dhuhr and Asr both 11:47 — and two
 * alerts would ring, and two adhans play, at once. The first in the day's
 * order is kept (Dhuhr, whose time it is), and a prayer before Sunrise or a
 * night mark on the same instant. `events` must be in time order, as
 * `buildUpcomingSalahEvents` returns them.
 */
export function oneEventPerInstant<T extends { name: string; at: Date }>(
  events: T[],
): T[] {
  const out: T[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (prev && prev.at.getTime() === e.at.getTime()) {
      if (isNonPrayerEvent(prev.name) && !isNonPrayerEvent(e.name))
        out[out.length - 1] = e;
      continue;
    }
    out.push(e);
  }
  return out;
}

/**
 * Advance reminders N minutes before each upcoming prayer.
 * Skips reminders that would fall in the past or after the prayer time.
 */
export function buildPrePrayerReminderEvents(
  salahEvents: { name: string; at: Date }[],
  minutesBefore: number,
  now: Date,
): { name: string; at: Date }[] {
  if (minutesBefore <= 0) {
    return [];
  }
  const ms = minutesBefore * 60_000;
  const cutoff = now.getTime() + NOTIFICATION_BUFFER_MS;
  const out: { name: string; at: Date }[] = [];
  for (const e of salahEvents) {
    const atReminder = new Date(e.at.getTime() - ms);
    if (atReminder.getTime() <= cutoff) {
      continue;
    }
    if (atReminder.getTime() >= e.at.getTime()) {
      continue;
    }
    out.push({ name: e.name, at: atReminder });
  }
  return out;
}
