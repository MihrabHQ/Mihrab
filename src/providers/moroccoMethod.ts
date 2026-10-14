/**
 * Morocco — the Ministry of Habous and Islamic Affairs's method, as its
 * timetable is computed (issue #10).
 *
 * Read off 77 days of the ministry's tables for its 164 located cities
 * (the git history of `data/prayer-times/morocco`, gathered by
 * `tools/verify-methods/history-union.py`) with `table-exact.py`:
 *
 *   • a precise Sun — Meeus's apparent Sun with the full nutation and his
 *     chapter-28 equation of time; a JPL ephemeris fits no better, NOAA's
 *     and the Almanac's series far worse — taken at each prayer's own
 *     moment (iterated), declination and equation of time alike;
 *   • Fajr 19°, Isha 17°, Asr one shadow length (Shafi'i);
 *   • Dhuhr five minutes after the transit;
 *   • sunrise 2.9 minutes before, and Maghrib 3.85 after, the Sun at
 *     −0.833° less the city's own horizon dip — which at Maghrib counts
 *     0.86 of what it does at sunrise;
 *   • Fajr rounded down to the minute, the rest to the nearest.
 *
 * The dip is the ministry's own per city, fitted from its table
 * (`data/moroccoMethodPoints.json`, about 0.02° per √metre of height);
 * elsewhere it is 0.02°·√height. At its cities this gives the ministry's
 * printed minute for about 98.7 % of times, and is never further than one
 * (tools/verify-methods/README.md).
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type MoroccoInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

/** Meeus's apparent Sun at `d` days from J2000.0: declination (rad), equation of time (minutes). */
export function meeusApparentSun(d: number): { dec: number; eot: number } {
  const T = d / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360) + 360) % 360;
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD;
  const C =
    (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const om = (125.04 - 1934.136 * T) * RAD;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const Lm = (280.4665 + 36000.7698 * T) * RAD;
  const Lmoon = (218.3165 + 481267.8813 * T) * RAD;
  const dpsi = (-17.2 * Math.sin(om) - 1.32 * Math.sin(2 * Lm) - 0.23 * Math.sin(2 * Lmoon) + 0.21 * Math.sin(2 * om)) / 3600;
  const deps = (9.2 * Math.cos(om) + 0.57 * Math.cos(2 * Lm) + 0.1 * Math.cos(2 * Lmoon) - 0.09 * Math.cos(2 * om)) / 3600;
  const lambda = (L0 + C - 0.00569 + dpsi) * RAD;
  const eps = (eps0 + deps) * RAD;
  const ra = (((Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD) % 360) + 360) % 360;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const E = L0 - 0.0057183 - ra + dpsi * Math.cos(eps);
  const eot = ((((E + 180) % 360) + 360) % 360 - 180) * 4;
  return { dec, eot };
}

const ITERATIONS = 3;
/** The share of the horizon dip Maghrib takes, against sunrise's whole. */
export const MOROCCO_MAGHRIB_DIP_SHARE = 0.86;
/** Degrees of dip per √metre where the ministry's own value is not known. */
export const MOROCCO_DIP_PER_SQRT_M = 0.02;

/** Exact times, minutes past 00:00 UT of the civil date, margins applied, before rounding. NaN where one does not form. */
export function moroccoRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  dipDeg = 0,
  asrShadow = 1,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < ITERATIONS; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  const event = (altitudeOf: (dec: number) => number, sign: 1 | -1, start: number): number => {
    let t = start;
    for (let i = 0; i < ITERATIONS; i++) {
      const { dec, eot } = at(t);
      const c = (Math.sin(altitudeOf(dec) * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
      if (!(Math.abs(c) <= 1)) return NaN;
      t = 720 - 4 * longitude - eot + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  const fixed = (a: number) => () => a;
  const asrAltitude = (dec: number) =>
    Math.atan(1 / (asrShadow + Math.tan(Math.abs(latitude - dec / RAD) * RAD))) / RAD;
  return {
    fajr: event(fixed(-19), -1, noon - 420) - 0.5,
    sunrise: event(fixed(-0.833 - dipDeg), -1, noon - 360) - 2.9,
    dhuhr: noon + 5,
    asr: event(asrAltitude, 1, noon + 200),
    maghrib: event(fixed(-0.833 - MOROCCO_MAGHRIB_DIP_SHARE * dipDeg), 1, noon + 360) + 3.85,
    isha: event(fixed(-17), 1, noon + 420),
  };
}

/**
 * The ministry's times for a point and civil date (month 0-based), on the
 * minute. Null when a time does not form there.
 */
export function moroccoTimes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  dipDeg = 0,
  asrShadow = 1,
): MoroccoInstants | null {
  const r = moroccoRawMinutes(latitude, longitude, year, month, day, dipDeg, asrShadow);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
