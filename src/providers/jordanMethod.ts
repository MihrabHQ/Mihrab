/**
 * Jordan — the Ministry of Awqaf, Islamic Affairs and Holy Places' method,
 * as the times it prints for its zones are computed.
 *
 * Read off its year for seventeen zones. It is the same kind of program as
 * Morocco's ministry's, with Jordan's own figures:
 *
 *   • Meeus's apparent sun (Morocco's) at each time's own moment, its
 *     declination and equation of time iterated;
 *   • Fajr and Isha with the sun 18° below the horizon; a zone's Fajr is
 *     earlier by that zone's own margin, between nothing and a minute;
 *   • sunrise and Maghrib with the sun's upper limb on the horizon — 34′ of
 *     refraction and the semi-diameter for the sun's distance that day —
 *     lowered by the zone's horizon allowance, one eastward and one
 *     westward (the Jordan Valley's about 0.15°, the highlands' up to 1.6°);
 *     no minutes are added;
 *   • Dhuhr at the sun's transit;
 *   • Asr on the apparent sun, as Morocco's: the noon shadow from the
 *     refracted noon altitude, and the moment the refracted sun casts it
 *     plus one length;
 *   • every time rounded to the nearest minute.
 *
 * Each zone is computed at its own point; none is another's times plus
 * minutes.
 *
 * From MihrabHQ/mihrab-methods, revision 1.
 */
import { meeusApparentSun, refractionFromApparent, refractionFromTrue } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type JordanInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

const FAJR = 18;
const ISHA = 18;
const ITERATIONS = 3;

/** Exact times, minutes past 00:00 UT of the civil date (month 0-based), before rounding. NaN where one does not form. */
export function jordanRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  /** The zone's horizon allowance eastward, at sunrise, degrees. */
  dipDeg = 0,
  asrShadow = 1,
  /** The zone's horizon allowance westward, at Maghrib, degrees. */
  dipMaghribDeg = dipDeg,
  /** The zone's margin on Fajr, minutes (negative: earlier). */
  fajrMinutes = 0,
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
  const noonTrue = 90 - Math.abs(latitude - at(noon).dec / RAD);
  const noonApparent = noonTrue + refractionFromTrue(noonTrue);
  const asrApparent = Math.atan(1 / (asrShadow + 1 / Math.tan(noonApparent * RAD))) / RAD;
  const asrTrue = asrApparent - refractionFromApparent(asrApparent);
  return {
    fajr: event(-FAJR, -1, noon - 420) + fajrMinutes,
    sunrise: event(horizon - dipDeg, -1, noon - 360),
    dhuhr: noon,
    asr: event(asrTrue, 1, noon + 200),
    maghrib: event(horizon - dipMaghribDeg, 1, noon + 360),
    isha: event(-ISHA, 1, noon + 420),
  };
}

/**
 * The Ministry's times for a point and civil date (month 0-based), each on
 * the minute it prints (rounded to the nearest). Null when a time does not
 * form there.
 */
export function jordanTimes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  dipDeg = 0,
  asrShadow = 1,
  dipMaghribDeg = dipDeg,
  fajrMinutes = 0,
): JordanInstants | null {
  const r = jordanRawMinutes(latitude, longitude, year, month, day, dipDeg, asrShadow, dipMaghribDeg, fajrMinutes);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
