/**
 * Algeria — the Ministry of Religious Affairs and Wakfs's method, as its
 * timetable is computed (issue #70).
 *
 * Read off the Ministry's own 1448 AH table (68 cities, 248 days each):
 *
 *   • the Sun from NOAA's formulas (the solar-calculator series for the
 *     equation of time; its declination). They fit the table far better
 *     than a precise ephemeris (JPL DE421) or Meeus's chapter-25 Sun, so
 *     this is what the Ministry's program uses, not an approximation of it;
 *   • Dhuhr at the Sun's transit, the equation of time taken there;
 *   • every other time the transit plus or minus the hour angle, with the
 *     declination taken at that prayer's own moment (iterated) and the
 *     equation of time kept at noon's value;
 *   • Fajr 18°, Isha 17°, sunrise and sunset at −0.833°;
 *   • Asr from the noon shadow tan(φ − δ) WITH its sign, so where the Sun
 *     culminates north of the zenith (In Guezzam, Bordj Badji Mokhtar,
 *     Tamanrasset around June) Asr comes earlier, up to thirteen minutes;
 *   • Maghrib three minutes after sunset;
 *   • every time rounded UP to the minute.
 *
 * At each city's own point this gives the Ministry's minute for 99.4% of
 * the published times; every other one is a single minute, where the
 * exact time falls within about a second of a minute's edge (see
 * `tools/verify-methods/README.md`).
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type AlgeriaInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

/** NOAA's Sun at `d` days from J2000.0 (UT): declination (rad), equation of time (minutes). */
export function noaaSun(d: number): { dec: number; eot: number } {
  const T = d / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const ecc = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C =
    (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  const om = (125.04 - 1934.136 * T) * RAD;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(om);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(om);
  const dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps0 * RAD) / 2) ** 2;
  const L0r = L0 * RAD;
  const eot =
    (4 / RAD) *
    (y * Math.sin(2 * L0r) -
      2 * ecc * Math.sin(Mr) +
      4 * ecc * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * ecc * ecc * Math.sin(2 * Mr));
  return { dec, eot };
}

const ITERATIONS = 3;

/**
 * The day's exact times, minutes past 00:00 UT of the civil date, before
 * rounding. NaN where the Sun never reaches the angle (not in Algeria).
 */
export function algeriaRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; sunset: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => noaaSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < ITERATIONS; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const transit = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  const event = (altitudeOf: (dec: number) => number, sign: 1 | -1, start: number): number => {
    let t = start;
    for (let i = 0; i < ITERATIONS; i++) {
      const { dec } = at(t);
      const c = (Math.sin(altitudeOf(dec) * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
      if (!(Math.abs(c) <= 1)) return NaN;
      t = transit + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  const fixed = (a: number) => () => a;
  // The Ministry's signed noon shadow is a northern one: south of the
  // equator the Sun is north of the zenith most of the year, and the signed
  // shadow there put Asr at Dhuhr or hours early (Pago Pago, 21 June). The
  // method computed there (the 'marw' provider abroad, method 19 by hand)
  // takes the shadow's length, as every other method does.
  const asrAltitude = (dec: number) => {
    const noonShadow = Math.tan((latitude - dec / RAD) * RAD);
    return Math.atan(1 / (asrShadow + (latitude >= 0 ? noonShadow : Math.abs(noonShadow)))) / RAD;
  };
  return {
    fajr: event(fixed(-18), -1, noon - 420),
    sunrise: event(fixed(-0.833), -1, noon - 360),
    dhuhr: noon,
    asr: event(asrAltitude, 1, noon + 200),
    sunset: event(fixed(-0.833), 1, noon + 360),
    isha: event(fixed(-17), 1, noon + 420),
  };
}

const MAGHRIB_AFTER_SUNSET_MIN = 3;

/** Rounded up to the minute, as the Ministry prints. */
function up(m: number): number {
  return Math.ceil(m - 1e-9);
}

/**
 * The Ministry's times for a point and civil date (month 0-based), as
 * instants on the minute. Null when a time does not form at that point.
 */
export function algeriaTimes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
): AlgeriaInstants | null {
  const r = algeriaRawMinutes(latitude, longitude, year, month, day, asrShadow);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.sunset, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + up(m) * 60_000);
  return {
    fajr: at(r.fajr),
    sunrise: at(r.sunrise),
    dhuhr: at(r.dhuhr),
    asr: at(r.asr),
    maghrib: at(r.sunset + MAGHRIB_AFTER_SUNSET_MIN),
    isha: at(r.isha),
  };
}
