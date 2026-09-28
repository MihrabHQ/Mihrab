/**
 * Contract time on the app's side — the reference the two native WallClock
 * helpers (ios/Contract/WallClock.swift, android/…/contract/WallClock.kt)
 * are held to.
 *
 * Contract times are wall clock: minutes after the local midnight that
 * starts a day's `dateKey`. The app holds its prayer times as canonical
 * 24-hour `HH:mm` (see clockFormat.ts), and this is where those become the
 * numbers payload v2 carries — and where the text a widget will draw from
 * them is defined, so a test can compare it with what the app itself draws.
 */
import {
  clockParts,
  dayPeriodNames,
  hour12Of,
  joinClockParts,
} from '../utils/clockFormat';
import type { WidgetContractClock } from './contract.generated';

export const MINUTES_PER_DAY = 1440;

/** What a time that does not occur (high latitudes) is drawn as. */
export const NO_TIME = '—';

/**
 * "05:12" → 312. Null for anything that is not a canonical clock: the em
 * dash for a time that does not occur at this latitude, an empty string, a
 * 12-hour display string.
 */
export function minutesFromHHmm(
  text: string | null | undefined,
): number | null {
  const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(text ?? '');
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * The clock block of payload v2, resolved from the user's choice and the
 * app's language — the same markers clockFormat.ts would print.
 */
export function contractClock(
  hour12: boolean,
  locale: string,
): WidgetContractClock {
  if (!hour12) return { hour12: false };
  const names = dayPeriodNames(locale);
  return {
    hour12: true,
    am: names.am,
    pm: names.pm,
    periodFirst: names.prefix,
  };
}

/**
 * A contract time as the widgets will write it. Defined here, from the
 * app's own formatter, so the native helpers have one answer to match.
 */
export function formatContractMinutes(
  minutes: number | null | undefined,
  clock: WidgetContractClock,
): string {
  if (minutes == null || !Number.isFinite(minutes)) return NO_TIME;
  const m =
    ((Math.trunc(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  const hour = Math.floor(m / 60);
  const minute = m % 60;
  // A 24-hour clock needs no locale; the locale passed is never read.
  if (!clock.hour12) return joinClockParts(clockParts(hour, minute, false, ''));
  return joinClockParts({
    digits: `${hour12Of(hour)}:${String(minute).padStart(2, '0')}`,
    dayPeriod: hour < 12 ? clock.am ?? 'AM' : clock.pm ?? 'PM',
    dayPeriodFirst: clock.periodFirst ?? false,
  });
}

/** Local YYYY-MM-DD of a date, in the device's zone. */
export function contractDateKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * The device's UTC offset at local noon of `dateKey`, in minutes east of
 * UTC — what `Day.utcOffsetMinutes` records. Noon, because it is the one
 * hour of the day no daylight-saving change ever lands on.
 */
export function utcOffsetMinutesAtNoon(dateKey: string): number | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(dateKey);
  if (!m) return null;
  const noon = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    12,
    0,
    0,
    0,
  );
  if (Number.isNaN(noon.getTime())) return null;
  // getTimezoneOffset is minutes WEST of UTC; the contract counts east,
  // as Foundation's secondsFromGMT and Java's getOffset do.
  const west = noon.getTimezoneOffset();
  return west === 0 ? 0 : -west;
}
