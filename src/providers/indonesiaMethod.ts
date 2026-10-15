/**
 * Indonesia — the Ministry of Religious Affairs' (Kemenag) method, as its
 * timetable is computed.
 *
 * Read off its table for all 517 regencies and cities (October–December
 * 2026, `data/prayer-times/indonesia`) with `tools/verify-methods/
 * table-exact.py` and the scripts beside it:
 *
 *   • the precise apparent Sun (`preciseApparentSun`, as JPL's to a tenth
 *     of a second), taken at each prayer's own moment, iterated — Meeus's
 *     shorter series drifts by a second and left a minute in two hundred
 *     off;
 *   • Fajr 20°, Isha 18°; sunrise and Maghrib at −1°, and at −2° in the
 *     regencies the ministry classes as highland — in six highland
 *     regencies of Papua the degree is taken off Fajr and Isha too;
 *   • Asr when the shadow is its length plus the noon shadow, the noon
 *     shadow from the Sun's declination at 00:00 UT of the day (as an
 *     almanac's daily entry gives it), the hour angle from the Sun at Asr;
 *   • every time rounded up, after a margin of two minutes (three for
 *     Dhuhr, minus three for sunrise).
 *
 * At each regency's own point (fitted to the table) this gives the
 * ministry's minute for 99.965 % of its times, and never a minute further.
 */
import { preciseApparentSun } from './preciseSun';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const ITERATIONS = 3;

export type KemenagInstants = { fajr: Date; sunrise: Date; dhuhr: Date; asr: Date; maghrib: Date; isha: Date };

export type KemenagPlaceOptions = {
  /** The ministry's highland class: sunrise and Maghrib at −2° rather than −1°. */
  highland?: boolean;
  /** The highland degree on Fajr and Isha as well (six regencies of Papua). */
  twilightDip?: boolean;
  asrShadow?: number;
};

const MARGIN = { fajr: 2, sunrise: -3, dhuhr: 3, asr: 2, maghrib: 2, isha: 2 };
const ASR_ITERATIONS = 4;

/** Exact times with the margins, minutes past 00:00 UT of the civil date, before rounding. */
export function kemenagRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  opts: KemenagPlaceOptions = {},
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => preciseApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < ITERATIONS; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  const hourAngle = (alt: number, dec: number) => {
    const c = (Math.sin(alt * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
    return Math.abs(c) <= 1 ? (4 * Math.acos(c)) / RAD : NaN;
  };
  const event = (alt: number, sign: 1 | -1, start: number): number => {
    let t = start;
    for (let i = 0; i < ITERATIONS; i++) {
      const { dec, eot } = at(t);
      t = 720 - 4 * longitude - eot + sign * hourAngle(alt, dec);
      if (!Number.isFinite(t)) return NaN;
    }
    return t;
  };
  const twilight = opts.twilightDip ? 1 : 0;
  const horizon = opts.highland ? -2 : -1;
  // The noon shadow from the declination at 00:00 UT; the hour angle from the Sun at Asr, iterated.
  const shadowDec = at(0).dec;
  const asrAlt = Math.atan(1 / ((opts.asrShadow ?? 1) + Math.tan(Math.abs(latitude * RAD - shadowDec)))) / RAD;
  let asr = noon + 200;
  for (let i = 0; i < ASR_ITERATIONS; i++) {
    const { dec, eot } = at(asr);
    asr = 720 - 4 * longitude - eot + hourAngle(asrAlt, dec);
  }
  return {
    fajr: event(-20 - twilight, -1, noon - 420) + MARGIN.fajr,
    sunrise: event(horizon, -1, noon - 360) + MARGIN.sunrise,
    dhuhr: noon + MARGIN.dhuhr,
    asr: asr + MARGIN.asr,
    maghrib: event(horizon, 1, noon + 360) + MARGIN.maghrib,
    isha: event(-18 - twilight, 1, noon + 420) + MARGIN.isha,
  };
}

/** The ministry's times for a point and civil date (month 0-based), on the minute; null where one does not form. */
export function kemenagTimes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  opts: KemenagPlaceOptions = {},
): KemenagInstants | null {
  const r = kemenagRawMinutes(latitude, longitude, year, month, day, opts);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.ceil(m - 1e-9) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
