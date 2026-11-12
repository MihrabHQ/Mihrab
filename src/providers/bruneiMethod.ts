/**
 * Brunei — the Ministry of Religious Affairs' method, as the times it
 * publishes are computed.
 *
 * Read off its published years:
 *
 *   • one table for the country, computed at Bandar Seri Begawan; a
 *     district's times are that table's plus whole minutes (Tutong one,
 *     Belait three) — the minutes its seat lies west of the capital, four
 *     to a degree, rounded;
 *   • Meeus's apparent sun (Morocco's) taken once for the day, at 0h
 *     Universal Time of the civil date: its declination and equation of
 *     time serve every time of the day, nothing iterated;
 *   • Dhuhr 1.06 minutes after the sun's transit (about the time half the
 *     sun's disc takes to cross the meridian);
 *   • Fajr with the sun 20° below the horizon, Isha 18°;
 *   • sunrise and Maghrib with the sun's centre 0.833° below the horizon;
 *   • Asr one shadow length beyond the noon shadow;
 *   • every time rounded to the nearest minute.
 *
 * This gives the Ministry's minute for about 99.7 % of the published times;
 * every other one is a single minute.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type BruneiInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

/** The point the country's table is computed at (Bandar Seri Begawan). */
export const BRUNEI_POINT = { lat: 4.892, lon: 114.9355 } as const;
const FAJR = 20;
const ISHA = 18;
const HORIZON = 0.833;
/** Dhuhr after the transit, minutes. */
const DHUHR_AFTER_TRANSIT = 1.06;

/** The whole minutes a district adds to the capital's table: those its longitude lies west of the capital's. */
export function bruneiDistrictMinutes(longitude: number): number {
  return Math.max(0, Math.round((BRUNEI_POINT.lon - longitude) * 4));
}

/**
 * The times before rounding, minutes past 00:00 UT of the civil date (month
 * 0-based), for the district whose point has this longitude.
 */
export function bruneiRawMinutes(
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const s = meeusApparentSun(d0);
  const add = bruneiDistrictMinutes(longitude);
  const transit = 720 - 4 * BRUNEI_POINT.lon - s.eot;
  const sp = Math.sin(BRUNEI_POINT.lat * RAD);
  const cp = Math.cos(BRUNEI_POINT.lat * RAD);
  const event = (altitude: number, sign: number): number => {
    const c = (Math.sin(altitude * RAD) - sp * Math.sin(s.dec)) / (cp * Math.cos(s.dec));
    return transit + (sign * 4 * Math.acos(c)) / RAD;
  };
  const asrAltitude = Math.atan(1 / (asrShadow + Math.tan(Math.abs(BRUNEI_POINT.lat * RAD - s.dec)))) / RAD;
  return {
    fajr: event(-FAJR, -1) + add,
    sunrise: event(-HORIZON, -1) + add,
    dhuhr: transit + DHUHR_AFTER_TRANSIT + add,
    asr: event(asrAltitude, 1) + add,
    maghrib: event(-HORIZON, 1) + add,
    isha: event(-ISHA, 1) + add,
  };
}

/**
 * The Ministry's times for the civil date (month 0-based) in the district
 * whose point has this longitude, each on the minute it prints (rounded to
 * the nearest).
 */
export function bruneiTimes(longitude: number, year: number, month: number, day: number, asrShadow = 1): BruneiInstants {
  const r = bruneiRawMinutes(longitude, year, month, day, asrShadow);
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
