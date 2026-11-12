/**
 * Pakistan — Jamia Uloom-ul-Islamia, Banuri Town (Karachi): the method its
 * prayer-times page gives as its own, as the times it prints are computed.
 * This is the university the "Karachi" convention of 18° and 18° is named
 * after.
 *
 * Read off its year for a hundred cities of Pakistan:
 *
 *   • Kazakhstan's sun and arithmetic: the short series for the sun, the day
 *     counted from 0h of the civil date at the place's own meridian, and
 *     each time computed once with the sun taken at a fixed first guess of
 *     its hour (Fajr 5h, sunrise 6h, the zenith 12h, Asr 13h, sunset and
 *     Isha 18h), not iterated;
 *   • Fajr and Isha at 18°; sunrise and sunset at −0.833°; the zenith
 *     (zawal) at the transit — the page prints that, and it stands here as
 *     Dhuhr; sunset as Maghrib;
 *   • Asr at two shadow lengths beyond the noon shadow, the Hanafi Asr the
 *     page gives unless asked otherwise; at one where its other setting
 *     (Shafi'i, Hanbali) is chosen;
 *   • no margin on any time; each rounded to the nearest minute.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { kazakhstanSunAt as sunAt, kazakhstanJulian as julian } from './kazakhstanMethod';

const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const tan = (d: number) => Math.tan(d * RAD);
const fix = (a: number, b: number) => a - b * Math.floor(a / b);

export type BanuriInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

const TWILIGHT = 18;
const HORIZON = 0.833;
/** The Asr the page prints by default: two shadow lengths (Hanafi). */
export const BANURI_ASR_SHADOW = 2;

/**
 * The times before rounding, minutes past 00:00 UT of the civil date (month
 * 0-based); NaN where the sun does not reach a time's altitude (nowhere in
 * Pakistan).
 */
export function banuriRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = BANURI_ASR_SHADOW,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const jd = julian(year, month + 1, day) - longitude / 360;
  const midday = (t: number) => fix(12 - sunAt(jd + t).eqt, 24);
  const at = (angle: number, t: number, before: boolean) => {
    const { decl } = sunAt(jd + t);
    const x = (-sin(angle) - sin(decl) * sin(latitude)) / (cos(decl) * cos(latitude));
    if (!(Math.abs(x) <= 1)) return NaN;
    const h = Math.acos(x) / RAD / 15;
    return midday(t) + (before ? -h : h);
  };
  const asrAngle = -Math.atan(1 / (asrShadow + tan(Math.abs(latitude - sunAt(jd + 13 / 24).decl)))) / RAD;
  // local mean time (hours) to minutes past 00:00 UT of the date
  const ut = (h: number) => (h - longitude / 15) * 60;
  return {
    fajr: ut(at(TWILIGHT, 5 / 24, true)),
    sunrise: ut(at(HORIZON, 6 / 24, true)),
    dhuhr: ut(midday(12 / 24)),
    asr: ut(at(asrAngle, 13 / 24, false)),
    maghrib: ut(at(HORIZON, 18 / 24, false)),
    isha: ut(at(TWILIGHT, 18 / 24, false)),
  };
}

/**
 * The Jamia's times for the civil date (month 0-based) at the point, each
 * on the minute its page prints (rounded to the nearest); Asr is the Hanafi
 * one unless one shadow length is asked for. Null where a time does not
 * form.
 */
export function banuriTimes(latitude: number, longitude: number, year: number, month: number, day: number, asrShadow = BANURI_ASR_SHADOW): BanuriInstants | null {
  const r = banuriRawMinutes(latitude, longitude, year, month, day, asrShadow);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
