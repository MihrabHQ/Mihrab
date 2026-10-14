/**
 * Is a Swedish table row the year it claims to be, or the previous year's
 * figures served for the date?
 *
 * The Dhuhr test (`tableDayCheck.ts`) catches the hour-off rows between
 * the two years' clock changes; the rest of a copied year passes it, since
 * the sun keeps to its calendar. But the Congress method does not: the
 * share of the night it carries through the summer is fixed on the last
 * day the 18° dawn forms, and that day — and the share with it — moves
 * from year to year, by ten minutes at Umeå between 2026 and 2027. So a
 * row whose Fajr or Isha is minutes from the year's own computation and
 * on the minute of the previous year's is the previous year's row.
 */
import { congressTimes } from '../providers/congressMethod';
import { clockMinutes, zoneOffsetMinutes } from './tableDayCheck';

/** Minutes from the year's own figure that no rounding explains. */
const ANOTHER_YEAR_MIN = 2;
/** Minutes within which the previous year's figure must lie. */
const SAME_AS_LAST_YEAR_MIN = 1;

/** The method's Fajr and Isha for the date, as printed in `timeZone`, minutes past midnight. */
function fajrIsha(year: number, month: number, day: number, lat: number, lon: number, timeZone: string): [number, number] {
  const t = congressTimes(lat, lon, year, month, day);
  const clock = (d: Date) => {
    const rounded = new Date(Math.round(d.getTime() / 60_000) * 60_000);
    const local = rounded.getTime() + zoneOffsetMinutes(timeZone, rounded) * 60_000;
    return (((local / 60_000) % 1440) + 1440) % 1440;
  };
  return [clock(t.fajr), clock(t.isha)];
}

function circular(a: number, b: number): number {
  let d = a - b;
  while (d > 720) d -= 1440;
  while (d <= -720) d += 1440;
  return Math.abs(d);
}

/**
 * True when the row's Fajr or Isha is the previous year's rather than this
 * year's: minutes from this year's computation, on the minute of last
 * year's. `fajr` and `isha` are the row's "HH:MM" strings.
 */
export function isPreviousYearsRow(
  dateKey: string,
  fajr: string,
  isha: string,
  latitude: number,
  longitude: number,
  timeZone: string,
): boolean {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!(y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const row = [clockMinutes(fajr), clockMinutes(isha)];
  const thisYear = fajrIsha(y, m - 1, d, latitude, longitude, timeZone);
  const lastYear = fajrIsha(y - 1, m - 1, d, latitude, longitude, timeZone);
  return row.some(
    (v, i) =>
      Number.isFinite(v) &&
      circular(v, thisYear[i]) >= ANOTHER_YEAR_MIN &&
      circular(v, lastYear[i]) <= SAME_AS_LAST_YEAR_MIN,
  );
}
