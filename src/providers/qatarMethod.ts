/**
 * Qatar — the Qatar Calendar House's method, as the times it prints for
 * Doha are computed.
 *
 * Read off its calendar from 1448 AH on (the year its times changed; the
 * earlier years are another method and are not this one):
 *
 *   • Meeus's apparent sun (Morocco's) at each time's own moment, its
 *     declination and equation of time iterated;
 *   • Fajr with the sun 18° below the horizon, less 1.12 minutes;
 *   • sunrise with the sun's centre 0.8333° below the horizon, less 0.10;
 *   • Dhuhr 0.95 minutes after the sun's transit;
 *   • Asr one shadow length beyond the noon shadow, plus 0.87 minutes;
 *   • Maghrib at sunset (the same 0.8333°) plus 2.02 minutes;
 *   • each of those rounded to the nearest minute;
 *   • Isha ninety minutes after the Maghrib printed.
 *
 * The margins are the calendar's own, to the hundredth of a minute they
 * can be read to: about a minute before at Fajr, a minute after at Dhuhr
 * and Asr, two after at Maghrib.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type QatarInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

const FAJR = 18;
/** The sun's centre below the horizon at sunrise and sunset, degrees. */
const HORIZON = 0.8333;
/** Minutes on each computed time before rounding. */
const MARGIN = { fajr: -1.12, sunrise: -0.1, dhuhr: 0.95, asr: 0.87, maghrib: 2.02 } as const;
/** Isha after the printed Maghrib, minutes. */
const ISHA_AFTER_MAGHRIB = 90;
const ITERATIONS = 4;

/**
 * The times before rounding, minutes past 00:00 UT of the civil date (month
 * 0-based). Isha is already whole: ninety minutes on the rounded Maghrib.
 */
export function qatarRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  /** sign 0: the transit; altitude null: Asr's, from the declination of the moment. */
  const event = (altitude: number | null, sign: number): number => {
    let t = 720 - 4 * longitude;
    for (let i = 0; i < ITERATIONS; i++) {
      const s = at(t);
      const transit = 720 - 4 * longitude - s.eot;
      if (sign === 0) {
        t = transit;
        continue;
      }
      const a = altitude ?? Math.atan(1 / (asrShadow + Math.tan(Math.abs(latitude * RAD - s.dec)))) / RAD;
      const c = (Math.sin(a * RAD) - sp * Math.sin(s.dec)) / (cp * Math.cos(s.dec));
      if (!(Math.abs(c) <= 1)) return NaN;
      t = transit + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  const maghrib = event(-HORIZON, 1) + MARGIN.maghrib;
  return {
    fajr: event(-FAJR, -1) + MARGIN.fajr,
    sunrise: event(-HORIZON, -1) + MARGIN.sunrise,
    dhuhr: event(0, 0) + MARGIN.dhuhr,
    asr: event(null, 1) + MARGIN.asr,
    maghrib,
    isha: Math.floor(maghrib + 0.5) + ISHA_AFTER_MAGHRIB,
  };
}

/**
 * The House's times for the civil date (month 0-based) at the point, each
 * on the minute it prints. Null where a time does not form.
 */
export function qatarTimes(latitude: number, longitude: number, year: number, month: number, day: number, asrShadow = 1): QatarInstants | null {
  const r = qatarRawMinutes(latitude, longitude, year, month, day, asrShadow);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
