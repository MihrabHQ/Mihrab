/**
 * Egypt — the Egyptian General Authority of Survey's method, as the times it
 * publishes for a place are computed.
 *
 * Read off its published year for places from 22.2° to 31.5° N:
 *
 *   • Meeus's apparent sun (Morocco's), taken at each time's own moment:
 *     the declination and the equation of time both, iterated;
 *   • Dhuhr at the sun's transit;
 *   • Fajr with the sun 19.5° below the horizon, Isha 17.5°;
 *   • sunrise and Maghrib with the sun's centre 0.845° below the horizon;
 *   • Asr one shadow length beyond the noon shadow, the noon shadow from
 *     the declination of local noon (the hour angle from the sun at Asr);
 *   • no margin on any time;
 *   • every time rounded to the nearest minute.
 *
 * At each place's own point this gives the Authority's minute for about
 * 99.4 % of the published times; every other one is a single minute.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type EgyptInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

const FAJR = 19.5;
const ISHA = 17.5;
/** The sun's centre below the horizon at sunrise and Maghrib, degrees. */
const HORIZON = 0.845;
const ITERATIONS = 4;

/** The times before rounding, minutes past 00:00 UT of the civil date (month 0-based). */
export function egyptRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < 3; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  const asrAltitude = Math.atan(1 / (asrShadow + Math.tan(Math.abs(latitude * RAD - at(noon).dec)))) / RAD;
  const event = (altitude: number, sign: number, start: number): number => {
    let t = noon + start;
    for (let i = 0; i < ITERATIONS; i++) {
      const s = at(t);
      const c = (Math.sin(altitude * RAD) - sp * Math.sin(s.dec)) / (cp * Math.cos(s.dec));
      if (!(Math.abs(c) <= 1)) return NaN;
      t = 720 - 4 * longitude - s.eot + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  return {
    fajr: event(-FAJR, -1, -420),
    sunrise: event(-HORIZON, -1, -360),
    dhuhr: noon,
    asr: event(asrAltitude, 1, 200),
    maghrib: event(-HORIZON, 1, 360),
    isha: event(-ISHA, 1, 420),
  };
}

/**
 * The Authority's times for the civil date (month 0-based) at the point,
 * each on the minute it prints (rounded to the nearest). Null where a time
 * does not form.
 */
export function egyptTimes(latitude: number, longitude: number, year: number, month: number, day: number, asrShadow = 1): EgyptInstants | null {
  const r = egyptRawMinutes(latitude, longitude, year, month, day, asrShadow);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
