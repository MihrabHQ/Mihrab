/**
 * The Central Muftiate of Russia — the Central Spiritual Administration of
 * Muslims of Russia's method, as the times in its yearly timetables are
 * computed.
 *
 * Read off its year for eighteen cities from 46° to 60° N:
 *
 *   • Kazakhstan's sun and arithmetic: the short series for the sun, the day
 *     counted from 0h of the civil date at the place's own meridian, and
 *     each time computed once with the sun taken at a fixed first guess of
 *     its hour (Fajr 5h, sunrise 6h, Dhuhr 12h, Asr 13h, sunset and Isha
 *     18h), not iterated;
 *   • Fajr at 18° and Isha at 17°; sunrise and sunset at −0.833°; Asr at two
 *     shadow lengths beyond the noon shadow (Hanafi);
 *   • a margin of 2 minutes on every time: Fajr and sunrise that much
 *     earlier, Dhuhr, Asr, Maghrib and Isha that much later; each then
 *     rounded to the nearest minute;
 *   • where the sun does not reach 18° in the morning, or 17° in the
 *     evening — the white nights, from late April to mid-August in the north
 *     of the list — the 45th parallel's share of the night: the same day's
 *     times are computed, margins and rounding included, at latitude 45° on
 *     the place's meridian; the minutes from its Fajr to its sunrise, and
 *     from its Maghrib to its Isha, are scaled by the place's night over the
 *     parallel's (the night being the day less Maghrib-minus-sunrise, on the
 *     printed minutes), and the result is taken before the printed sunrise
 *     and after the printed Maghrib, the minute cut off, not rounded. The
 *     morning and the evening are judged each on its own.
 *
 * Where the sun does not rise or set the timetable prints the 45th
 * parallel's own day; no place listed here is that far north, and the
 * method gives no times there.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { kazakhstanSunAt as sunAt, kazakhstanJulian as julian } from './kazakhstanMethod';

const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const tan = (d: number) => Math.tan(d * RAD);
const fix = (a: number, b: number) => a - b * Math.floor(a / b);

export type CdumInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

type Six = { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number };

const FAJR = 18;
const ISHA = 17;
const HORIZON = 0.833;
/** Shadow lengths beyond the noon shadow at Asr. */
const ASR_SHADOW = 2;
/** Minutes: Fajr and sunrise earlier, the rest later. */
const MARGIN = 2;
/** The parallel whose share of the night stands in where the twilight does not form. */
export const CDUM_REFERENCE_LATITUDE = 45;

/** The six times with margin and rounding, whole minutes past 00:00 UT of the civil date (month 0-based); NaN where the sun does not reach a time's altitude. */
function printed(latitude: number, longitude: number, year: number, month: number, day: number): Six {
  const jd = julian(year, month + 1, day) - longitude / 360;
  const midday = (t: number) => fix(12 - sunAt(jd + t).eqt, 24);
  const at = (angle: number, t: number, before: boolean) => {
    const { decl } = sunAt(jd + t);
    const x = (-sin(angle) - sin(decl) * sin(latitude)) / (cos(decl) * cos(latitude));
    if (!(Math.abs(x) <= 1)) return NaN;
    const h = Math.acos(x) / RAD / 15;
    return midday(t) + (before ? -h : h);
  };
  const asrAngle = -Math.atan(1 / (ASR_SHADOW + tan(Math.abs(latitude - sunAt(jd + 13 / 24).decl)))) / RAD;
  // local mean time (hours) to the printed minute past 00:00 UT of the date
  const minute = (h: number, margin: number) => Math.floor((h - longitude / 15) * 60 + margin + 0.5);
  return {
    fajr: minute(at(FAJR, 5 / 24, true), -MARGIN),
    sunrise: minute(at(HORIZON, 6 / 24, true), -MARGIN),
    dhuhr: minute(midday(12 / 24), MARGIN),
    asr: minute(at(asrAngle, 13 / 24, false), MARGIN),
    maghrib: minute(at(HORIZON, 18 / 24, false), MARGIN),
    isha: minute(at(ISHA, 18 / 24, false), MARGIN),
  };
}

/**
 * The times as the timetable prints them, whole minutes past 00:00 UT of
 * the civil date (month 0-based). Null where the sun does not rise or set.
 */
export function cdumMinutes(latitude: number, longitude: number, year: number, month: number, day: number): Six | null {
  const p = printed(latitude, longitude, year, month, day);
  if (![p.sunrise, p.dhuhr, p.asr, p.maghrib].every(Number.isFinite)) return null;
  if (Number.isFinite(p.fajr) && Number.isFinite(p.isha)) return p;
  const r = printed(CDUM_REFERENCE_LATITUDE, longitude, year, month, day);
  const night = 1440 - (p.maghrib - p.sunrise);
  const nightThere = 1440 - (r.maghrib - r.sunrise);
  return {
    ...p,
    // whole minutes throughout, so the cut is exact: the time's minute cut off
    fajr: Number.isFinite(p.fajr) ? p.fajr : p.sunrise - Math.ceil(((r.sunrise - r.fajr) * night) / nightThere),
    isha: Number.isFinite(p.isha) ? p.isha : p.maghrib + Math.floor(((r.isha - r.maghrib) * night) / nightThere),
  };
}

/**
 * The Muftiate's times for the civil date (month 0-based) at the point,
 * each on the minute it prints; Asr is the Hanafi one its timetable
 * carries. Null where the sun does not rise or set.
 */
export function cdumTimes(latitude: number, longitude: number, year: number, month: number, day: number): CdumInstants | null {
  const r = cdumMinutes(latitude, longitude, year, month, day);
  if (!r) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + m * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
