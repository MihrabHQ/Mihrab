/**
 * Imsak (Suhoor cutoff) helpers — task #7.
 *
 * Imsak marks the start of the fast and the end of Suhoor during Ramadan. By
 * convention it falls a small number of minutes before Fajr. Different schools
 * and methods use different offsets:
 *
 *   • MWL, ISNA, Egyptian, Karachi, Tehran: Imsak = Fajr − 10 min (default).
 *   • Umm al-Qura: Imsak = Fajr (no distinct Imsak; people stop eating at Fajr).
 *   • Some communities use 15 or 20 min.
 *
 * The default offset is 10 minutes — the most common across providers. The
 * eventual Settings → Calculation → "Imsak rule" picker (task #21) will let
 * users override it; until then this constant is the single source of truth.
 */

export const DEFAULT_IMSAK_OFFSET_MINUTES = 10;

/**
 * Subtract `minutes` from a HH:MM string, wrapping past midnight if needed.
 *
 * Example: `timeMinusMinutes("00:05", 10) === "23:55"` (the previous day).
 *
 * @param hhmm   Source time, e.g. "04:30".
 * @param minutes Non-negative offset; clamped to [0, 24h).
 * @returns The shifted time as HH:MM.
 */
export function timeMinusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return hhmm; // best-effort: leave malformed input alone
  }
  const offset = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  let total = h * 60 + m - offset;
  while (total < 0) total += 1440;
  total = total % 1440;
  const oh = Math.floor(total / 60);
  const om = total % 60;
  return `${String(oh).padStart(2, '0')}:${String(om).padStart(2, '0')}`;
}

/**
 * Compute Imsak from Fajr using the configured offset.
 *
 * @returns A new HH:MM string. Caller is responsible for assigning it onto
 *          the timings map.
 */
export function computeImsak(
  fajr: string,
  offsetMinutes: number = DEFAULT_IMSAK_OFFSET_MINUTES,
): string {
  return timeMinusMinutes(fajr, offsetMinutes);
}

/**
 * Imsak from Fajr's instant, written on the clock Fajr is written on.
 *
 * Fajr − 10 minutes on the clock face is a time the clock never shows on
 * the morning it springs forward: Fajr at 03:05 CEST put Imsak at 02:55,
 * inside the hour that does not exist. Taken on the instant — ten minutes
 * before Fajr's — and written on the same clock, it is 01:55 CET, the
 * moment ten minutes before Fajr. Any other morning the two agree to the
 * minute, since the formatter maps a whole-minute step to a whole-minute
 * step. Where Fajr has no instant (it does not form), the clock-face rule.
 */
export function computeImsakAt(
  fajr: Date,
  format: (d: Date) => string,
  offsetMinutes: number = DEFAULT_IMSAK_OFFSET_MINUTES,
): string {
  if (!Number.isFinite(fajr.getTime())) {
    return computeImsak(format(fajr), offsetMinutes);
  }
  const offset = Math.max(0, Math.min(offsetMinutes, 24 * 60 - 1));
  return format(new Date(fajr.getTime() - offset * 60_000));
}
