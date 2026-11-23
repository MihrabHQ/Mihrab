/**
 * Tunisia — the Institut National de la Météorologie's method, as the
 * prayer times it gives for a place and a day are computed.
 *
 * Read off its answers for a year at twenty-six places — the twenty-four
 * governorates' seats, Aïn Draham in the Kroumirie and Rjim Maatoug in
 * the desert:
 *
 *   • Meeus's apparent sun (Morocco's), with THE INSTITUTE'S EQUATION OF
 *     TIME: its sun's transit stands up to three seconds from Meeus's, the
 *     same way every year — a curve of the sun's mean longitude with six
 *     ripples a year, read off two years of its Dhuhr at twenty-six
 *     longitudes (`EOT_SERIES_SECONDS`; fitted to one year it holds on
 *     the other: Meeus alone was a minute off on 12 Dhuhr times in 1000,
 *     with it on 4);
 *   • Dhuhr and Asr on THE SUN OF THE DAY — its declination and equation
 *     of time at 0 h UT, held for both: Dhuhr seven minutes after that
 *     sun's transit, Asr where its shadow is one length beyond the noon
 *     shadow (plain geometry, no refraction);
 *   • Fajr and Isha with the sun 18° below the horizon, the sun taken at
 *     each time's own moment (iterated) — the moment ON THE PLACE'S OWN
 *     MEAN-TIME CLOCK read as if it were UT, so four minutes later per
 *     degree of longitude east (36 minutes at Tunis); it is what its times
 *     say (with the ripple above it takes the method alone from one time
 *     in 44 a minute off to one in 97, never further) — and, through 2026, the horizon lowered by the place's
 *     allowance: its height's dip, 0.06° on the coast to 0.88° at Le Kef;
 *   • Maghrib two minutes after sunset, sunset with the sun's centre
 *     0.8333° below the horizon lowered by the place's allowance;
 *   • every time rounded to the nearest minute.
 *
 * The Institute gives no sunrise. The one here is the mirror of its
 * sunset — the same horizon, the same allowance, no margin — and is not
 * checked against anything.
 *
 * THE ALLOWANCE AT FAJR AND ISHA ENDS. Two places (Kairouan, Sidi Bouzid)
 * lost theirs in 2026: a plain 18°, the allowance kept at sunset only
 * (revision 2). From 1 January 2027 that is every place: the first days
 * the Institute gave for 2027 put Fajr up to five minutes later and Isha
 * as much earlier at the high places than the allowance would, and are a
 * plain 18° everywhere, sunset unchanged (seen 23 November 2026, 1–7
 * January at all twenty-six places: 263 of 364 Fajr and Isha times off
 * with the allowance, by up to five minutes; without it all on the minute
 * or a minute from it). So every place carries its earlier allowance and
 * the last year it applies to (`tunisiaTwilightDip`), and a year after it
 * is computed at 18° (revision 3).
 *
 * WHAT IS NOT KNOWN YET. Those first days of 2027 also stand about two
 * seconds later than the two years before, at every time but Maghrib —
 * not enough days to say what moved, so nothing is made of it here: the
 * correction list carries the minutes it moves, and the question is to be
 * looked at again when the Institute has given some months of 2027.
 *
 * From MihrabHQ/mihrab-methods, revision 3.
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
/**
 * Seconds the Institute's equation of time stands from Meeus's, as harmonics
 * of the sun's mean longitude L: the constant, then (cos kL, sin kL) for
 * k = 1…6. Fitted to its 2025 and 2026 times, all five a day.
 */
export const EOT_SERIES_SECONDS = [
  0.134, -0.095, -0.059, 0.082, 0.532, 0.661, -0.437, -0.13, 0.468, 0.7, 0.272, -0.01, -0.409,
] as const;

/** The Institute's sun at `d` days from J2000.0: Meeus's declination (rad), and its equation of time with the Institute's ripple (minutes). */
export function tunisiaSun(d: number): { dec: number; eot: number } {
  const sun = meeusApparentSun(d);
  const L = (280.46646 + (d / 36525) * 36000.76983) * RAD;
  let seconds: number = EOT_SERIES_SECONDS[0];
  for (let k = 1; k <= 6; k++) {
    seconds += EOT_SERIES_SECONDS[2 * k - 1] * Math.cos(k * L) + EOT_SERIES_SECONDS[2 * k] * Math.sin(k * L);
  }
  return { dec: sun.dec, eot: sun.eot + seconds / 60 };
}

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
  const sun0 = tunisiaSun(d0);
  // A time's own moment, on the place's mean-time clock read as UT.
  const ahead = 4 * longitude;
  const noon0 = 720 - 4 * longitude - sun0.eot;
  const event = (altitude: number, sign: 1 | -1, start: number): number => {
    let t = start;
    for (let i = 0; i < ITERATIONS; i++) {
      const { dec, eot } = tunisiaSun(d0 + (t + ahead) / 1440);
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
