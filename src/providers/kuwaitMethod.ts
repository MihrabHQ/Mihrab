/**
 * Kuwait — the Ministry of Awqaf and Islamic Affairs' table, as its times
 * are computed.
 *
 * The Ministry prints one table: a year of days for Kuwait City, used again
 * every year, and for each other area a whole number of minutes on it. Read
 * off that table:
 *
 *   • the same day has the same times every year: they are the times of
 *     that day of 1978 (a year in the middle of a leap cycle), and
 *     29 February has 28 February's;
 *   • computed at Kuwait City; an area's times are the city's plus its
 *     whole minutes, which a listed area's point carries in its longitude
 *     (a quarter of a degree from the city's to the minute, west later);
 *   • Meeus's apparent sun (Morocco's) at each time's own moment, its
 *     declination and equation of time iterated;
 *   • Fajr with the sun 18° below the horizon, Isha 17.5°;
 *   • sunrise and Maghrib with the sun's centre 0.8333° below the horizon;
 *   • Dhuhr at the sun's transit;
 *   • Asr one shadow length beyond the noon shadow, the noon shadow from
 *     the declination of local noon, plus 0.15 minutes;
 *   • every time rounded to the nearest minute.
 *
 * This gives the Ministry's minute for about 95 % of the table; every other
 * time is a single minute away.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type KuwaitInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

/** The point the country's table is computed at (Kuwait City). */
export const KUWAIT_POINT = { lat: 29.33, lon: 48.005 } as const;
/** The year whose sun the table's days have. */
export const KUWAIT_TABLE_YEAR = 1978;
const FAJR = 18;
const ISHA = 17.5;
const HORIZON = 0.8333;
/** Asr after the computed moment, minutes. */
const ASR_MARGIN = 0.15;
const ITERATIONS = 4;

/** The whole minutes an area adds to the city's table (west later, east earlier). */
export function kuwaitAreaMinutes(longitude: number): number {
  return Math.floor((KUWAIT_POINT.lon - longitude) * 4 + 0.5);
}

/**
 * The times before rounding, minutes past 00:00 UT of the civil date (month
 * 0-based), for the area whose point has this longitude. The year is not
 * read: the table is the same every year.
 */
export function kuwaitRawMinutes(
  longitude: number,
  _year: number,
  month: number,
  day: number,
  asrShadow = 1,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const tableDay = month === 1 && day === 29 ? 28 : day;
  const d0 = (Date.UTC(KUWAIT_TABLE_YEAR, month, tableDay) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  const { lat, lon } = KUWAIT_POINT;
  const add = kuwaitAreaMinutes(longitude);
  let noon = 720 - 4 * lon;
  for (let i = 0; i < 3; i++) noon = 720 - 4 * lon - at(noon).eot;
  const sp = Math.sin(lat * RAD);
  const cp = Math.cos(lat * RAD);
  const asrAltitude = Math.atan(1 / (asrShadow + Math.tan(Math.abs(lat * RAD - at(noon).dec)))) / RAD;
  const event = (altitude: number, sign: number, start: number): number => {
    let t = noon + start;
    for (let i = 0; i < ITERATIONS; i++) {
      const s = at(t);
      const c = (Math.sin(altitude * RAD) - sp * Math.sin(s.dec)) / (cp * Math.cos(s.dec));
      t = 720 - 4 * lon - s.eot + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  return {
    fajr: event(-FAJR, -1, -420) + add,
    sunrise: event(-HORIZON, -1, -360) + add,
    dhuhr: noon + add,
    asr: event(asrAltitude, 1, 200) + ASR_MARGIN + add,
    maghrib: event(-HORIZON, 1, 360) + add,
    isha: event(-ISHA, 1, 420) + add,
  };
}

/**
 * The Ministry's times for the civil date (month 0-based) in the area whose
 * point has this longitude, each on the minute it prints (rounded to the
 * nearest).
 */
export function kuwaitTimes(longitude: number, year: number, month: number, day: number, asrShadow = 1): KuwaitInstants {
  const r = kuwaitRawMinutes(longitude, year, month, day, asrShadow);
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
