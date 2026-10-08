import {
  CalculationMethod,
  type CalculationParameters,
  Coordinates,
  Madhab,
  PrayerTimes,
} from 'adhan';
import type { PrayerTimesResult } from './types';
import { formatLocalTime } from '../utils/prayerTimes';
import { autoMethodForCoords } from './autoMethod';
import { computeImsak, DEFAULT_IMSAK_OFFSET_MINUTES } from './imsak';

// ── METHOD IDS ARE ALADHAN'S, AND SO ARE THE ANGLES ───────────────────
//
// `calculationMethod` is an AlAdhan method id everywhere in this app: the
// picker stores it, `aladhan.ts` forwards it verbatim, and this file is
// what computes with it when the network is gone. So the two must agree,
// or a user's times change depending on whether they have signal.
//
// They did not agree. This switch mapped several named methods onto some
// OTHER method's angles, silently:
//
//   id  method                        was              should be
//    0  Shia Ithna-Ashari, Qum        Tehran 17.7/14   16/14, Maghrib +16
//    8  Gulf Region                   Dubai 18.2/18.2  19.5/90-min Isha
//   12  Union Org. Islamic de France  MWL 18/17        12/12
//   14  Spiritual Adm. of Russia      Moonsighting     16/15
//   21  Morocco                       (absent → MWL)   19/17, Dhuhr+5 Maghrib+5
//
// Morocco is the one that got reported (issue #10, "prayer times in my
// location are a bit off by minutes"), and only because AlAdhan already
// auto-selects Morocco for Moroccan coordinates — so the gap showed only
// when someone picked a method by hand or dropped to this file offline.
// The others are the same bug, unreported.
//
// Every set of numbers below was checked against AlAdhan's own output for
// a city that uses it, on 2026-08-30, and they agree to the minute on
// Fajr, Sunrise, Dhuhr, Maghrib and Isha. `__tests__/calculationMethods.test.ts`
// keeps those readings.
//
// Morocco is the one deliberate exception, and it is checked against
// something better: a month of the ministry's own published table. AlAdhan
// is a very good secondary source, but where it and the authority a method
// is named after disagree, the authority wins. See the case below.
//
// Two things that table does NOT say, and which /methods will not tell
// you either — both found by comparing real output rather than reading
// the docs:
//
//   • Morocco publishes Dhuhr and Maghrib with a five-minute margin. Set
//     19/17 alone and those two are five minutes early, which is exactly
//     the complaint being fixed.
//   • Shia Ithna-Ashari holds Maghrib until the redness goes, +16 minutes
//     past sunset.
//
// Known residual: adhan.js computes Asr one to two minutes before AlAdhan
// does, for EVERY method including the presets. It is a shadow-length
// rounding difference, not a parameter, and it is left alone here rather
// than papered over per-method.

/** A method adhan.js has no preset for, built from its published angles. */
function angles(
  fajrAngle: number,
  ishaAngle: number,
  adjustments?: Partial<CalculationParameters['methodAdjustments']>,
): CalculationParameters {
  const p = CalculationMethod.Other();
  p.fajrAngle = fajrAngle;
  p.ishaAngle = ishaAngle;
  if (adjustments) {
    p.methodAdjustments = { ...p.methodAdjustments, ...adjustments };
  }
  return p;
}

function parametersForMethod(methodId: number): CalculationParameters {
  switch (methodId) {
    case 0:
      // Shia Ithna-Ashari, Leva Institute, Qum.
      return angles(16, 14, { maghrib: 16 });
    case 1:
      return CalculationMethod.Karachi();
    case 2:
      return CalculationMethod.NorthAmerica();
    case 3:
      return CalculationMethod.MuslimWorldLeague();
    case 4:
      return CalculationMethod.UmmAlQura();
    case 5:
      return CalculationMethod.Egyptian();
    case 7:
      return CalculationMethod.Tehran();
    case 8: {
      // Gulf Region: 19.5° Fajr, and Isha as a fixed 90 minutes after
      // Maghrib rather than an angle. `Dubai()` is a different method.
      const p = CalculationMethod.Other();
      p.fajrAngle = 19.5;
      p.ishaAngle = 0;
      p.ishaInterval = 90;
      return p;
    }
    case 9:
      return CalculationMethod.Kuwait();
    case 10:
      return CalculationMethod.Qatar();
    case 11:
      return CalculationMethod.Singapore();
    case 12:
      // Union Organization Islamic de France.
      return angles(12, 12);
    case 13:
      return CalculationMethod.Turkey();
    case 14:
      // Spiritual Administration of Muslims of Russia.
      return angles(16, 15);
    case 15:
      return CalculationMethod.MoonsightingCommittee();
    case 19:
      // Algeria — Ministry of Religious Affairs and Wakfs. Read from its
      // 1448 AH timetables for Algiers, Djelfa and Adrar (355 days each):
      // Fajr 18°, Isha 17°, sunrise, Dhuhr and Asr as the standard
      // calculation, and Maghrib 3.6 minutes past true sunset on average —
      // a 3-minute margin, rounded up. AlAdhan's own id 19 has the angles and
      // not the margin, which is why Maghrib there is three minutes early.
      // Where the Ministry's own table is available the app serves that
      // instead (the 'marw' provider, `marwDataset.ts`); this is the method
      // it falls back to past the published year.
      // Issue #70.
      return angles(18, 17, { maghrib: 3 });
    case 21:
      // Morocco — Ministry of Habous and Islamic Affairs.
      //
      // These three offsets are the ministry's own published margins, and
      // they are measured, not guessed. A month of the ministry's table for
      // Rabat (habous.gov.ma index.php?ville=1, Rabi' al-Awwal 1448) is
      // kept in __tests__/fixtures/habousRabat.ts; against all thirty days:
      //
      //   Chourouq is true sunrise MINUS 3   — the Fajr window is closed
      //                                        early, on the cautious side
      //   Maghrib  is true sunset  PLUS  4   — likewise, held a little late
      //   Dhuhr    is solar noon   PLUS  5
      //
      // Our own sunset agrees with theirs to the second once the +4 is
      // removed, and Dhuhr lands exactly on the ministry's minute all
      // thirty days — so these are their conventions, not our error.
      //
      // Note this deliberately does NOT match AlAdhan's method 21, which
      // omits the Chourouq margin and uses +5 for Maghrib. Where the two
      // disagree the ministry wins: it is the authority the method is
      // named after. Issue #10.
      return angles(19, 17, { sunrise: -3, dhuhr: 5, maghrib: 4 });
    default:
      return CalculationMethod.MuslimWorldLeague();
  }
}

/**
 * WHERE THE SUN DOES NOT RISE OR SET — issue #61.
 *
 * Inside the polar circles there are days with no sunrise or no sunset at
 * all: midsummer in Tromsø or Svalbard, most of the year at the poles.
 * adhan.js answers those days honestly, with Invalid Date for every time
 * that hangs on the horizon, and that went on to the screen as "NaN:NaN" —
 * which the Today card could not read, so the app closed on launch, every
 * launch, with the location that caused it saved.
 *
 * For those days the times are taken at the NEAREST LATITUDE where the day
 * still has a sunrise and a sunset all year (aqrab al-bilād, the "nearest
 * place" opinion), on the same longitude, so Dhuhr stays the local solar
 * noon. 48.5° is the usual choice for it: the highest latitude at which
 * the sun still sinks 18° below the horizon on midsummer night, so even
 * Fajr and Isha are real there all year. Only a day that cannot be
 * computed is moved; every ordinary day, however far north, keeps its own
 * sun.
 */
export const NEAREST_LATITUDE = 48.5;

/**
 * Every time is a real instant, and they come in order. The order is
 * checked as instants, not clock faces, so it does not care what timezone
 * the phone is in. Near the polar circles adhan.js can return a Fajr from
 * the evening before, after its own sunrise — a day it could compute but
 * not sensibly; that day is moved too.
 */
function allTimesValid(pt: PrayerTimes): boolean {
  const times = [pt.fajr, pt.sunrise, pt.dhuhr, pt.asr, pt.maghrib, pt.isha];
  if (!times.every(d => d instanceof Date && !Number.isNaN(d.getTime()))) return false;
  for (let i = 1; i < times.length; i++) {
    if (!(times[i - 1].getTime() < times[i].getTime())) return false;
  }
  return true;
}

/**
 * The latitude a day is actually computed at: the real one, or — where the
 * real one has no sunrise or sunset that day — the nearest latitude, on the
 * same side of the equator.
 */
export function computedLatitude(
  latitude: number,
  longitude: number,
  dayDate: Date,
  calc: CalculationParameters,
): number {
  if (allTimesValid(new PrayerTimes(new Coordinates(latitude, longitude), dayDate, calc))) {
    return latitude;
  }
  return (latitude < 0 ? -1 : 1) * Math.min(Math.abs(latitude), NEAREST_LATITUDE);
}

export function computeLocalAdhanTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  calculationMethod: number | 'auto';
  school: number;
  /** Minutes before Fajr that Imsak fires. Defaults to the canonical 10. */
  imsakOffsetMinutes?: number;
}): PrayerTimesResult {
  const y = params.date.getFullYear();
  const m = params.date.getMonth();
  const day = params.date.getDate();
  const dayDate = new Date(y, m, day);
  
  // "Automatic" is AlAdhan's server-side choice; off the network we make the
  // same choice ourselves from the coordinates (see `autoMethod.ts`), rather
  // than falling back to MWL in a country that publishes its own parameters.
  const methodId =
    params.calculationMethod === 'auto'
      ? autoMethodForCoords(params.latitude, params.longitude)
      : params.calculationMethod;
  const calc = parametersForMethod(methodId);
  
  calc.madhab = params.school === 1 ? Madhab.Hanafi : Madhab.Shafi;
  const latitude = computedLatitude(params.latitude, params.longitude, dayDate, calc);
  const pt = new PrayerTimes(new Coordinates(latitude, params.longitude), dayDate, calc);
  const fajrStr = formatLocalTime(pt.fajr);
  // Imsak is computed locally (adhan.js does not expose it). Default offset
  // is the most-common 10 minutes; will become user-configurable via task #21.
  const imsakOffset =
    params.imsakOffsetMinutes ?? DEFAULT_IMSAK_OFFSET_MINUTES;
  return {
    timings: {
      Fajr: fajrStr,
      Sunrise: formatLocalTime(pt.sunrise),
      Dhuhr: formatLocalTime(pt.dhuhr),
      Asr: formatLocalTime(pt.asr),
      Maghrib: formatLocalTime(pt.maghrib),
      Isha: formatLocalTime(pt.isha),
      Imsak: computeImsak(fajrStr, imsakOffset),
    },
  };
}
