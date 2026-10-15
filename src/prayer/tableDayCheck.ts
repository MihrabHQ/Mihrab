/**
 * Is a published day's row the day it claims to be?
 *
 * A timetable that has not published a year yet may serve the same date
 * of the current year in its place. For most of the year that is within a
 * minute of the truth, since the sun keeps to its calendar; but the clocks
 * do not change on the same dates two years running, so for the days
 * between the two changes every time is an hour off — Fajr an hour before
 * dawn.
 *
 * The test needs no table of the authority's habits: Dhuhr is solar noon
 * plus a few minutes of caution wherever it is published, so a Dhuhr
 * more than a quarter of an hour from the sun's own noon is not this
 * day's Dhuhr. Pure arithmetic — the method checks run it on every row.
 */

const RAD = Math.PI / 180;

/** The clock's offset from UTC in `timeZone` at the instant `at`, in minutes. */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The equation of time on `day`, minutes (apparent minus mean solar time).
 * The almanac's low-precision series; good to a quarter of a minute,
 * which a check in units of an hour does not notice.
 */
export function equationOfTimeMinutes(day: Date): number {
  const n = (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  let alpha = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  alpha = ((alpha % 360) + 360) % 360;
  let diff = L - alpha;
  diff = ((diff + 180) % 360 + 360) % 360 - 180; // into (−180, 180]
  return diff * 4;
}

/**
 * Solar noon on `dateKey` (YYYY-MM-DD) at `longitude`, as minutes past
 * midnight on the clock of `timeZone`.
 */
export function solarNoonMinutes(dateKey: string, longitude: number, timeZone: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const offset = zoneOffsetMinutes(timeZone, new Date(noonUtc));
  const noon = 720 - 4 * longitude - equationOfTimeMinutes(new Date(noonUtc));
  return noon + offset;
}

/** "HH:MM" → minutes past midnight, or NaN. */
export function clockMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Beyond this, a Dhuhr is some other day's — or some other hour's. */
export const DHUHR_NOON_TOLERANCE_MIN = 20;

/**
 * How far the published Dhuhr sits from solar noon, minutes (positive =
 * later). The authorities' own margins are two to five minutes; an hour
 * means the row belongs to the other side of a clock change.
 */
export function dhuhrOffsetFromNoon(
  dateKey: string,
  dhuhr: string,
  longitude: number,
  timeZone: string,
): number {
  return clockMinutes(dhuhr) - solarNoonMinutes(dateKey, longitude, timeZone);
}

export function isPlausibleTableDay(
  dateKey: string,
  dhuhr: string,
  longitude: number,
  timeZone: string,
): boolean {
  const off = dhuhrOffsetFromNoon(dateKey, dhuhr, longitude, timeZone);
  return Number.isFinite(off) && Math.abs(off) <= DHUHR_NOON_TOLERANCE_MIN;
}
