/**
 * Iran — the Institute of Geophysics of the University of Tehran: the
 * method its Calendar Center's yearly sheets for the province capitals are
 * computed by.
 *
 * Read off two years of the sheets for the thirty-one capitals. It is a
 * plain program, with no margins:
 *
 *   • Meeus's apparent sun (Morocco's) at each time's own moment, its
 *     declination and equation of time iterated;
 *   • Fajr with the sun 17.7° below the horizon;
 *   • sunrise and sunset with the sun's centre 0.8333° below it;
 *   • Dhuhr at the sun's transit;
 *   • Maghrib with the sun 4.5° below the horizon, after sunset;
 *   • every time rounded to the nearest minute.
 *
 * The sheets print Fajr, sunrise, Dhuhr, sunset, Maghrib and midnight, and
 * neither Asr nor Isha. Those two are computed as the method is everywhere
 * given — Asr at one shadow length beyond the noon shadow, Isha with the
 * sun 14° below the horizon — and there is nothing printed to hold them to.
 * The sheets' midnight is halfway from sunset to the next day's Fajr
 * (`tehranSunsetAndMidnight`).
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type TehranInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

/** The sun's depression at Fajr, degrees. */
export const TEHRAN_FAJR_DEG = 17.7;
/** The sun's depression at Maghrib, degrees. */
export const TEHRAN_MAGHRIB_DEG = 4.5;
/** The sun's depression at Isha, degrees — the method's usual figure; the sheets print no Isha. */
export const TEHRAN_ISHA_DEG = 14;
const HORIZON = -0.8333;
const ITERATIONS = 3;

function program(latitude: number, longitude: number, year: number, month: number, day: number) {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < ITERATIONS; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  const event = (altitude: number, sign: 1 | -1, start: number): number => {
    let t = start;
    for (let i = 0; i < ITERATIONS; i++) {
      const { dec, eot } = at(t);
      const c = (Math.sin(altitude * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
      if (!(Math.abs(c) <= 1)) return NaN;
      t = 720 - 4 * longitude - eot + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  return { noon, event, at };
}

/** Exact times, minutes past 00:00 UT of the civil date (month 0-based), before rounding. NaN where one does not form. */
export function tehranRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const { noon, event, at } = program(latitude, longitude, year, month, day);
  // Asr: the shadow at the transit plus the shadow lengths asked for
  const asrAltitude = Math.atan(1 / (asrShadow + Math.tan(Math.abs(latitude * RAD - at(noon).dec)))) / RAD;
  return {
    fajr: event(-TEHRAN_FAJR_DEG, -1, noon - 420),
    sunrise: event(HORIZON, -1, noon - 360),
    dhuhr: noon,
    asr: event(asrAltitude, 1, noon + 200),
    maghrib: event(-TEHRAN_MAGHRIB_DEG, 1, noon + 380),
    isha: event(-TEHRAN_ISHA_DEG, 1, noon + 420),
  };
}

/**
 * The Institute's times for a point and civil date (month 0-based), each on
 * the minute it prints (rounded to the nearest). Null when a time does not
 * form there.
 */
export function tehranTimes(latitude: number, longitude: number, year: number, month: number, day: number, asrShadow = 1): TehranInstants | null {
  const r = tehranRawMinutes(latitude, longitude, year, month, day, asrShadow);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}

/**
 * The sheets' other two columns, by the same program and without a
 * correction list: sunset, and midnight — halfway from sunset to the next
 * day's Fajr — each rounded to the nearest minute. Null where one does not
 * form.
 */
export function tehranSunsetAndMidnight(latitude: number, longitude: number, year: number, month: number, day: number): { sunset: Date; midnight: Date } | null {
  const today = program(latitude, longitude, year, month, day);
  const sunset = today.event(HORIZON, 1, today.noon + 360);
  const next = new Date(Date.UTC(year, month, day) + DAY_MS);
  const tomorrow = program(latitude, longitude, next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
  const fajr = tomorrow.event(-TEHRAN_FAJR_DEG, -1, tomorrow.noon - 420);
  if (!Number.isFinite(sunset) || !Number.isFinite(fajr)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { sunset: at(sunset), midnight: at((sunset + fajr + 1440) / 2) };
}
