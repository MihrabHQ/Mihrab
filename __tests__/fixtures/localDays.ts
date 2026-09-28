/**
 * Local calendar days, counted as the calendar counts them.
 *
 * `ymd(Date.now() + n * DAY)` is not "n days from today". Across the night
 * the clocks go back a day is 25 hours, so in the first hour after midnight
 * n × 24 hours lands on the day BEFORE — which is how four khatmah suites
 * failed for exactly one hour a night, on a Stockholm machine, in the weeks
 * before the October change, and never on the UTC CI runner (found
 * 2026-09-29, 00:51). Step the date, not the milliseconds.
 */

/** YYYY-MM-DD of `at` in the device's zone. */
export function ymd(at: number): string {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD of the local day `days` calendar days after `from`'s. */
export function ymdIn(days: number, from: number = Date.now()): string {
  const d = new Date(from);
  const noon = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    12,
    0,
    0,
    0,
  );
  return ymd(noon.getTime());
}
