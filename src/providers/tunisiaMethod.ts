/**
 * Tunisia — the Institut National de la Météorologie's method, as the
 * prayer times it gives for a place and a day are computed.
 *
 * Read off its answers for a year at twenty-six places — the twenty-four
 * governorates' seats, Aïn Draham in the Kroumirie and Rjim Maatoug in
 * the desert:
 *
 *   • Meeus's apparent sun (Morocco's);
 *   • Dhuhr and Asr on THE SUN OF THE DAY — its declination and equation
 *     of time at 0 h UT, held for both: Dhuhr seven minutes after that
 *     sun's transit, Asr where its shadow is one length beyond the noon
 *     shadow (plain geometry, no refraction);
 *   • Fajr and Isha with the sun 18° below the horizon, the sun taken at
 *     each time's own moment (iterated), and the horizon lowered by the
 *     place's allowance — its height's dip, 0.06° on the coast to 0.88° at
 *     Le Kef;
 *   • Maghrib two minutes after sunset, sunset with the sun's centre
 *     0.8333° below the horizon lowered by the place's allowance;
 *   • every time rounded to the nearest minute.
 *
 * The Institute gives no sunrise. The one here is the mirror of its
 * sunset — the same horizon, the same allowance, no margin — and is not
 * checked against anything.
 *
 * Two places (Kairouan, Sidi Bouzid) take their allowance at sunset only:
 * their Fajr and Isha are at a plain 18°. That is the Institute's practice
 * from 2026; through 2025 it lowered their Fajr and Isha by the same
 * allowance as their sunset, like every other place — so a place carries
 * the earlier allowance and the last year it applies to (revision 2).
 *
 * From MihrabHQ/mihrab-methods, revision 2.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

/** The allowance at Fajr and Isha for a place in a year: the earlier one up to its last year, then the current one. */
export function tunisiaTwilightDip(
  place: { dipDeg?: number; dipDegEarlier?: number; dipDegUntil?: number },
  year: number,
): number {
  if (place.dipDegEarlier !== undefined && place.dipDegUntil !== undefined && year <= place.dipDegUntil) {
    return place.dipDegEarlier;
  }
  return place.dipDeg ?? 0;
}

export type TunisiaInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

const FAJR = 18;
const ISHA = 18;
const HORIZON = 0.8333;
const ITERATIONS = 3;
/** Minutes after the day's transit that the Institute gives Dhuhr. */
export const TUNISIA_DHUHR_MINUTES = 7;
/** Minutes after sunset that the Institute gives Maghrib. */
export const TUNISIA_MAGHRIB_MINUTES = 2;

/** Exact times, minutes past 00:00 UT of the civil date (month 0-based), before rounding. NaN where one does not form. */
export function tunisiaRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
  /** The place's horizon allowance at Fajr and Isha, degrees. */
  dipDeg = 0,
  /** The place's horizon allowance at sunset (and the sunrise that mirrors it), degrees. */
  dipSunsetDeg = dipDeg,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number } {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  // the sun of the day: 0 h UT
  const sun0 = meeusApparentSun(d0);
  const noon0 = 720 - 4 * longitude - sun0.eot;
  const event = (altitude: number, sign: 1 | -1, start: number): number => {
    let t = start;
    for (let i = 0; i < ITERATIONS; i++) {
      const { dec, eot } = meeusApparentSun(d0 + t / 1440);
      const c = (Math.sin(altitude * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
      if (!(Math.abs(c) <= 1)) return NaN;
      t = 720 - 4 * longitude - eot + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  const asrAltitude = Math.atan(1 / (asrShadow + Math.tan(Math.abs(latitude * RAD - sun0.dec))));
  const cAsr = (Math.sin(asrAltitude) - sp * Math.sin(sun0.dec)) / (cp * Math.cos(sun0.dec));
  return {
    fajr: event(-FAJR - dipDeg, -1, noon0 - 400),
    sunrise: event(-HORIZON - dipSunsetDeg, -1, noon0 - 360),
    dhuhr: noon0 + TUNISIA_DHUHR_MINUTES,
    asr: Math.abs(cAsr) <= 1 ? noon0 + (4 * Math.acos(cAsr)) / RAD : NaN,
    maghrib: event(-HORIZON - dipSunsetDeg, 1, noon0 + 360) + TUNISIA_MAGHRIB_MINUTES,
    isha: event(-ISHA - dipDeg, 1, noon0 + 400),
  };
}

/**
 * The Institute's times for a point and civil date (month 0-based), each on
 * the minute it gives (rounded to the nearest). Null when a time does not
 * form there.
 */
export function tunisiaTimes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
  dipDeg = 0,
  dipSunsetDeg = dipDeg,
): TunisiaInstants | null {
  const r = tunisiaRawMinutes(latitude, longitude, year, month, day, asrShadow, dipDeg, dipSunsetDeg);
  const all = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.floor(m + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
