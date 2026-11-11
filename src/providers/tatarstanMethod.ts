/**
 * Tatarstan — the Spiritual Administration of Muslims of the Republic of
 * Tatarstan's method, as the times in its yearly timetable are computed
 * (from MihrabHQ/mihrab-methods, revision 1).
 *
 * Read off its year for forty-four places:
 *
 *   • Meeus's apparent sun (Morocco's) at each time's own moment, its
 *     declination and equation of time iterated;
 *   • the dawn — the end of sahur, and the Fajr printed here — with the sun
 *     18° below the horizon, rounded **down**;
 *   • sunrise and Maghrib with the sun's centre 0.8333° below the horizon
 *     and the place's small horizon allowance, the zenith at the transit,
 *     Isha with the sun 15° below the horizon, each rounded **up**;
 *   • Asr at two shadow lengths on the apparent sun, as Morocco's is at
 *     one: the noon shadow from the refracted noon altitude, and the moment
 *     the refracted sun casts it plus two lengths; rounded up;
 *   • on the days the sun does not reach 18° below the horizon — May to
 *     early August at these latitudes — the dawn is 121 minutes before the
 *     printed sunrise and Isha 90 minutes after the printed Maghrib; each
 *     follows its own twilight, the dawn the morning's and Isha the
 *     evening's.
 *
 * The timetable also prints two times of the mosques, which are not
 * computed here: the morning prayer as it is read in the mosques, 91
 * minutes before the printed sunrise every day of the year, and Dhuhr at a
 * fixed clock time (12:00 in most districts). The Dhuhr here is the zenith
 * column, the sun's transit.
 */
import { meeusApparentSun, refractionFromApparent, refractionFromTrue } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type TatarstanInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

const DAWN = 18;
const ISHA = 15;
const HORIZON = 0.8333;
/** The Asr the timetable prints: two shadow lengths. */
const ASR_SHADOW = 2;
/** Where the 18° twilight does not form: the dawn before the printed sunrise, Isha after the printed Maghrib, minutes. */
const DAWN_BEFORE_SUNRISE = 121;
const ISHA_AFTER_MAGHRIB = 90;
const ITERATIONS = 6;

/**
 * The times as the timetable prints them, whole minutes past 00:00 UT of
 * the civil date (month 0-based). The rounding is part of the rule (the
 * dawn down, the rest up), so these are not "before rounding".
 */
export function tatarstanMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  /** The place's horizon allowance, degrees. */
  dipDeg = 0,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < 3; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  /** NaN when, on the last pass, the sun does not reach the altitude. */
  const event = (altitude: number, sign: 1 | -1): number => {
    let t = noon + sign * 300;
    let forms = true;
    for (let i = 0; i < ITERATIONS; i++) {
      const s = at(t);
      const c = (Math.sin(altitude * RAD) - sp * Math.sin(s.dec)) / (cp * Math.cos(s.dec));
      forms = Math.abs(c) <= 1;
      t = 720 - 4 * longitude - s.eot + (sign * 4 * Math.acos(Math.max(-1, Math.min(1, c)))) / RAD;
    }
    return forms ? t : NaN;
  };
  const noonTrue = 90 - Math.abs(latitude - at(noon).dec / RAD);
  const noonApparent = noonTrue + refractionFromTrue(noonTrue);
  const asrApparent = Math.atan(1 / (ASR_SHADOW + 1 / Math.tan(noonApparent * RAD))) / RAD;
  const asrTrue = asrApparent - refractionFromApparent(asrApparent);
  const horizon = -(HORIZON + dipDeg);
  const sunrise = Math.ceil(event(horizon, -1));
  const maghrib = Math.ceil(event(horizon, 1));
  const dawn = event(-DAWN, -1);
  const dusk = event(-DAWN, 1);
  return {
    fajr: Number.isFinite(dawn) ? Math.floor(dawn) : sunrise - DAWN_BEFORE_SUNRISE,
    sunrise,
    dhuhr: Math.ceil(noon),
    asr: Math.ceil(event(asrTrue, 1)),
    maghrib,
    isha: Number.isFinite(dusk) ? Math.ceil(event(-ISHA, 1)) : maghrib + ISHA_AFTER_MAGHRIB,
  };
}

/**
 * The Administration's times for the civil date (month 0-based) at the
 * point, each on the minute it prints. Null where a time does not form.
 */
export function tatarstanTimes(latitude: number, longitude: number, year: number, month: number, day: number, dipDeg = 0): TatarstanInstants | null {
  const r = tatarstanMinutes(latitude, longitude, year, month, day, dipDeg);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + m * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
