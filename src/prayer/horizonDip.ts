/**
 * A town on a hill sees the sun earlier in the morning and later in the
 * evening: its horizon lies below the plain's. Several authorities allow
 * for it — Morocco's ministry for every city it lists, JAKIM for its
 * summit zones (Gunung Jerai, Kinabalu, the Cameron Highlands), Kemenag
 * for the highland regencies — and a stand-in that computes those places
 * at sea level is minutes early at sunrise and late at Maghrib (October
 * 2026, read off the tables by tools/verify-methods).
 *
 * The dip of the horizon from a height h is close to k·√h degrees. The
 * textbook k, with refraction, is 1.76′ = 0.0293° per √m, and JAKIM's
 * tables follow it; the Moroccan ministry's tables follow a gentler
 * 0.020° per √m — fitted, not derived, and kept per method in
 * `localAdhan.ts`.
 */

const RAD = Math.PI / 180;

/** The horizon's dip from a height, degrees. */
export function horizonDipDegrees(heightM: number, degreesPerSqrtM: number): number {
  if (!(heightM > 0)) return 0;
  return degreesPerSqrtM * Math.sqrt(heightM);
}

/**
 * The sun's declination on the day, degrees (the almanac's low-precision
 * series, a hundredth of a degree — the dip is in tenths).
 */
export function solarDeclinationDegrees(day: Date): number {
  const n = (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  return Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / RAD;
}

/** Sunrise and sunset are reckoned at this altitude: refraction and the sun's half-width. */
const RISE_SET_ALTITUDE = -0.833;

/**
 * How many minutes earlier the sun rises, and later it sets, seen from
 * `heightM` at `latitude` on `day`, for a horizon dipped `k·√h` degrees.
 * The dip is small, so the shift is the dip over the sun's rate of climb
 * at the plain's sunrise: 15°·cos φ·cos δ·sin H per hour. Where the sun
 * barely rises or sets (polar edges) the rate goes to nothing; the shift
 * is capped rather than let run away.
 */
export function horizonDipMinutes(
  latitude: number,
  day: Date,
  heightM: number,
  degreesPerSqrtM: number,
): number {
  const dip = horizonDipDegrees(heightM, degreesPerSqrtM);
  if (dip === 0) return 0;
  const phi = latitude * RAD;
  const delta = solarDeclinationDegrees(day) * RAD;
  const cosH = (Math.sin(RISE_SET_ALTITUDE * RAD) - Math.sin(phi) * Math.sin(delta)) / (Math.cos(phi) * Math.cos(delta));
  if (!(cosH > -1 && cosH < 1)) return 0; // no sunrise or sunset that day
  const sinH = Math.sqrt(1 - cosH * cosH);
  const degreesPerHour = 15 * Math.cos(phi) * Math.cos(delta) * sinH;
  const minutes = (dip / degreesPerHour) * 60;
  return Math.min(minutes, 30);
}
