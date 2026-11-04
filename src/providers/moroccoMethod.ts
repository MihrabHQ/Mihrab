/**
 * Morocco — the Ministry of Habous and Islamic Affairs's method, as its
 * timetable is computed (issue #10).
 *
 * Read off the ministry's tables: 96 days of 2026 for its 164 located
 * cities, and — through the Internet Archive — its pages of 2014–2025 for
 * Rabat, Figuig, Tangier, Casablanca, Laayoune and a dozen more, every
 * month of the year. The ministry's program changed between 2019 and
 * 2023; this is the one it has used since (2023–2026), and what it does:
 *
 *   • a precise Sun — Meeus's apparent Sun with the full nutation and his
 *     chapter-28 equation of time; a JPL ephemeris fits no better, NOAA's
 *     and the Almanac's series far worse — taken at each prayer's own
 *     moment (iterated), declination and equation of time alike;
 *   • Fajr 19° and Isha 17°, true altitudes;
 *   • Dhuhr five minutes after the transit;
 *   • Asr on the APPARENT Sun, by the classical rule: a gnomon's shadow at
 *     noon (the noon declination, the noon altitude raised by refraction)
 *     plus one length (Shafi'i), and the moment the apparent Sun casts it
 *     — refraction by Sæmundsson's formula from the true altitude at noon,
 *     Bennett's from the apparent at Asr (Meeus 16.4 and 16.3);
 *   • sunrise one minute before, and Maghrib 1.8 minutes after, the Sun
 *     on an altitude −(34′ + s) − dip: refraction, the semi-diameter for
 *     its distance that day, and the city's own allowance for its horizon;
 *   • Fajr rounded down to the minute, the rest to the nearest.
 *
 * The horizon allowance ("dip") is the ministry's own per city and per
 * side — east at sunrise, west at Maghrib — fitted from its tables with
 * the city's point (`data/moroccoMethodPoints.json`); it follows the
 * city's height closely (about 0.32° + 0.025°·√metres east, 0.37° +
 * 0.021°·√metres west; 92 % correlation), which is what a city off the
 * list gets. It is an angle, not minutes: the allowance in minutes grows
 * towards the solstices, as the ministry's does, and the fixed minute
 * margins are the small rest. Fitted on the autumn alone (the first
 * version of this method) the two could not be told apart, and the method
 * drifted a tenth of a minute by late November.
 *
 * On the 2026 tables this is the ministry's printed minute for 99.88 % of
 * times (114 of 94,350 off, each within a second or two of a minute's
 * edge: the ministry's Sun and this one differ by that much), and never
 * further than one; `data/corrections/morocco.json` holds the rest. On
 * the archive's 2023–2026 pages, every month of the year, 99.3 %.
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
/** Minutes before the horizon crossing that the ministry prints sunrise, and after it Maghrib. */
export const MOROCCO_SUNRISE_MARGIN = -1.0;
export const MOROCCO_MAGHRIB_MARGIN = 1.8;
/** The horizon allowance of a city whose own is not known: degrees, from its height in metres, east (sunrise) and west (Maghrib). */
export const moroccoDipEast = (heightM: number): number => 0.32 + 0.025 * Math.sqrt(Math.max(heightM, 0));
export const moroccoDipWest = (heightM: number): number => 0.37 + 0.021 * Math.sqrt(Math.max(heightM, 0));

/** Refraction (degrees) that lifts a TRUE altitude h (degrees) to its apparent one — Sæmundsson, Meeus 16.4. */
export const refractionFromTrue = (h: number): number => (1.02 / Math.tan((h + 10.3 / (h + 5.11)) * RAD)) / 60;
/** Refraction (degrees) under an APPARENT altitude h (degrees) — Bennett, Meeus 16.3. */
export const refractionFromApparent = (h: number): number => (1 / Math.tan((h + 7.31 / (h + 4.4)) * RAD)) / 60;

/** Exact times, minutes past 00:00 UT of the civil date, margins applied, before rounding. NaN where one does not form. */
export function moroccoRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  /** The horizon allowance eastward, at sunrise, degrees: the city's own, else `moroccoDipEast(height)`. */
  dipDeg = moroccoDipEast(0),
  asrShadow = 1,
  /** The horizon allowance westward, at Maghrib; `moroccoDipWest(0)` offset by the east's excess when not known. */
  dipMaghribDeg = dipDeg + (moroccoDipWest(0) - moroccoDipEast(0)),
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < ITERATIONS; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  // the upper limb on the horizon: refraction 34′ and the semi-diameter for the Sun's distance that day
  const T = (d0 + noon / 1440) / 36525;
  const Ma = (357.52911 + 35999.05029 * T) * RAD;
  const horizon = -(34 / 60 + 0.26667 / (1.00014 - 0.016708 * Math.cos(Ma) - 0.00014 * Math.cos(2 * Ma)));
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
  // Asr on the apparent Sun: the noon shadow of a gnomon from the apparent noon altitude (the noon
  // declination), plus `asrShadow` lengths; the Sun's apparent altitude that casts it; the true
  // altitude under it is what the hour angle is solved for, with the declination at the event.
  const noonDec = at(noon).dec;
  const noonTrue = 90 - Math.abs(latitude - noonDec / RAD);
  const noonApparent = noonTrue + refractionFromTrue(noonTrue);
  const asrApparent = Math.atan(1 / (asrShadow + 1 / Math.tan(noonApparent * RAD))) / RAD;
  const asrTrue = asrApparent - refractionFromApparent(asrApparent);
  return {
    fajr: event(fixed(-19), -1, noon - 420) - 0.5,
    sunrise: event(fixed(horizon - dipDeg), -1, noon - 360) + MOROCCO_SUNRISE_MARGIN,
    dhuhr: noon + 5,
    asr: event(fixed(asrTrue), 1, noon + 200),
    maghrib: event(fixed(horizon - dipMaghribDeg), 1, noon + 360) + MOROCCO_MAGHRIB_MARGIN,
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
  dipDeg?: number,
  asrShadow = 1,
  dipMaghribDeg?: number,
): MoroccoInstants | null {
  const r = moroccoRawMinutes(latitude, longitude, year, month, day, dipDeg, asrShadow, dipMaghribDeg);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
