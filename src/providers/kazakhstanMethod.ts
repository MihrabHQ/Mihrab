/**
 * Kazakhstan — the Spiritual Administration of Muslims of Kazakhstan's
 * method, as the times it publishes for a place are computed.
 *
 * Read off its published year for places from 40.8° to 54.9° N:
 *
 *   • a short series for the sun: mean anomaly g and mean longitude q linear
 *     in the days D from J2000.0, the ecliptic longitude
 *     L = q + 1.915° sin g + 0.020° sin 2g, the obliquity 23.439° − 0.00000036° D,
 *     and from them the declination and the equation of time;
 *   • the day counted from 0h of the civil date at the place's own meridian
 *     (the Julian day of the date less longitude/360);
 *   • each time computed once, with the sun taken at a fixed first guess of
 *     its hour (Fajr 5h, sunrise 6h, Dhuhr 12h, Asr 13h, sunset and Isha
 *     18h), not iterated;
 *   • Fajr and Isha at 15°; sunrise and sunset at −0.833°; Asr at two shadow
 *     lengths beyond the noon shadow (Hanafi);
 *   • where Fajr would fall more than a quarter of the night before sunrise,
 *     or Isha more than a quarter of the night after sunset — or the sun does
 *     not reach 15° — the quarter of the night is taken (the night from
 *     sunset to sunrise);
 *   • a margin of 3 minutes, 5 minutes from 48° N: sunrise that much
 *     earlier, Dhuhr and Asr that much later, Maghrib that much after
 *     sunset; none on Fajr or Isha;
 *   • every time rounded to the nearest minute.
 *
 * With that the method gives every published time of the places read, with
 * no correction list.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */

const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const tan = (d: number) => Math.tan(d * RAD);
/** a − b·⌊a/b⌋: into [0, b). */
const fix = (a: number, b: number) => a - b * Math.floor(a / b);

export type KazakhstanInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

/** Fajr's and Isha's depression, degrees. */
const TWILIGHT = 15;
const HORIZON = 0.833;
/** Shadow lengths beyond the noon shadow at Asr. */
const ASR_SHADOW = 2;
/** The latitude from which the margin is five minutes, not three. */
const NORTH = 48;
/** The first guess of each time's hour, at which its sun is taken. */
const GUESS = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 } as const;

/** The Julian day of 0h UT of a civil date (month 1-based). */
export function kazakhstanJulian(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

/** The method's sun at a Julian day: declination (degrees), equation of time (hours). */
export function kazakhstanSunAt(jd: number): { decl: number; eqt: number } {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = Math.atan2(cos(e) * sin(L), cos(L)) / RAD / 15;
  return { decl: Math.asin(sin(e) * sin(L)) / RAD, eqt: q / 15 - fix(ra, 24) };
}

/** The margin at a latitude, minutes. */
export function kazakhstanMargin(latitude: number): number {
  return latitude >= NORTH ? 5 : 3;
}

/**
 * The times before rounding, minutes past 00:00 UT of the civil date (month
 * 0-based), and the sunset the method prints beside Maghrib.
 */
export function kazakhstanRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; sunset: number; maghrib: number; isha: number } {
  const jd = kazakhstanJulian(year, month + 1, day) - longitude / 360;
  const midday = (t: number) => fix(12 - kazakhstanSunAt(jd + t).eqt, 24);
  /** Hours (local mean time) at which the sun is `angle` degrees below the horizon; NaN where it is not. */
  const at = (angle: number, t: number, before: boolean) => {
    const { decl } = kazakhstanSunAt(jd + t);
    const x = (-sin(angle) - sin(decl) * sin(latitude)) / (cos(decl) * cos(latitude));
    if (!(Math.abs(x) <= 1)) return NaN;
    const h = Math.acos(x) / RAD / 15;
    return midday(t) + (before ? -h : h);
  };
  const asrAngle = (t: number) => -Math.atan(1 / (ASR_SHADOW + tan(Math.abs(latitude - kazakhstanSunAt(jd + t).decl)))) / RAD;
  let fajr = at(TWILIGHT, GUESS.fajr / 24, true);
  const sunrise = at(HORIZON, GUESS.sunrise / 24, true);
  const dhuhr = midday(GUESS.dhuhr / 24);
  const asr = at(asrAngle(GUESS.asr / 24), GUESS.asr / 24, false);
  const sunset = at(HORIZON, GUESS.sunset / 24, false);
  let isha = at(TWILIGHT, GUESS.isha / 24, false);
  // the quarter of the night, where the angle is further than that or is not reached
  const portion = (TWILIGHT / 60) * fix(sunrise - sunset, 24);
  if (!Number.isFinite(fajr) || fix(sunrise - fajr, 24) > portion) fajr = sunrise - portion;
  if (!Number.isFinite(isha) || fix(isha - sunset, 24) > portion) isha = sunset + portion;
  const margin = kazakhstanMargin(latitude);
  // local mean time (hours) to minutes past 00:00 UT of the date
  const ut = (h: number) => (h - longitude / 15) * 60;
  return {
    fajr: ut(fajr),
    sunrise: ut(sunrise) - margin,
    dhuhr: ut(dhuhr) + margin,
    asr: ut(asr) + margin,
    sunset: ut(sunset),
    maghrib: ut(sunset) + margin,
    isha: ut(isha),
  };
}

/**
 * The Administration's times for the civil date (month 0-based) at the
 * point, each on the minute it prints (rounded to the nearest); Asr is the
 * Hanafi one its table carries. Null where a time does not form.
 */
export function kazakhstanTimes(latitude: number, longitude: number, year: number, month: number, day: number): KazakhstanInstants | null {
  const r = kazakhstanRawMinutes(latitude, longitude, year, month, day);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
