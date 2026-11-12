/**
 * United Kingdom — Wifaqul Ulama (Britain): the method its yearly
 * timetables for some eighty towns are computed by.
 *
 * Read off its calendars for 2026 and 2027. Its page states the angles and
 * the two margins; the rest is read from the tables.
 *
 *   • Meeus's apparent sun (Morocco's) at each time's own moment, its
 *     declination and equation of time iterated;
 *   • Fajr with the sun 18° below the horizon, the search starting from the
 *     sun of 0h UT (which decides, at the very edge, whether it forms).
 *     Near the edge of the summer twilight, where the sun of the event's
 *     own moment no longer reaches 18°, the sun of 0h UT of the date is
 *     asked instead; and on the nights
 *     neither reaches it, Fajr is the middle between that date's sunset and
 *     the sunrise of the day before, twelve hours earlier (the page's
 *     "Nisful-Layl", as the tables have it);
 *   • sunrise and sunset with the sun's centre 0.8333° below the horizon;
 *   • Zuhr four minutes after the sun's transit;
 *   • Asr at one shadow length beyond the noon shadow (Shafi'i) or two
 *     (Hanafi), the noon shadow taken from the sun's declination an hour and
 *     a half before 0h UT of the date;
 *   • Maghrib five minutes after sunset;
 *   • Isha with the sun 15° below the horizon, or a seventh of the night
 *     (sunset to the next sunrise) after sunset where that is earlier —
 *     from about February to October — or 15° is not reached;
 *   • every time rounded to the nearest minute, the Shafi'i Asr alone
 *     rounded down.
 *
 * The timetables print both Asrs. The one this method's correction list is
 * for is the Hanafi, which the page names as the one to follow where no
 * local scholar says otherwise.
 *
 * From MihrabHQ/mihrab-methods, revision 2.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type WifaqInstants = {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
};

const FAJR = 18;
const ISHA = 15;
const HORIZON = -0.8333;
const ITERATIONS = 3;
/** Minutes after the sun's transit that Zuhr is printed. */
export const WIFAQ_DHUHR_MINUTES = 4;
/** Minutes after sunset that Maghrib is printed. */
export const WIFAQ_MAGHRIB_MINUTES = 5;
/** Minutes before 0h UT of the date at which the noon shadow's declination is read. */
const SHADOW_SUN_MINUTES = -90;

function program(latitude: number, longitude: number, year: number, month: number, day: number) {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude - at(720).eot;
  for (let i = 0; i < 2; i++) noon = 720 - 4 * longitude - at(noon).eot;
  const sp = Math.sin(latitude * RAD);
  const cp = Math.cos(latitude * RAD);
  /** The moment the sun is at an altitude; `fixed`: the sun read at that minute for every pass instead of at the moment itself. */
  const event = (altitude: number, sign: 1 | -1, start: number, fixed?: number): number => {
    let t = start;
    for (let i = 0; i < ITERATIONS; i++) {
      const { dec, eot } = at(fixed ?? t);
      const c = (Math.sin(altitude * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
      if (!(Math.abs(c) <= 1)) return NaN;
      t = 720 - 4 * longitude - eot + (sign * 4 * Math.acos(c)) / RAD;
    }
    return t;
  };
  return { noon, event, at };
}

const shifted = (year: number, month: number, day: number, by: number) => {
  const d = new Date(Date.UTC(year, month, day) + by * DAY_MS);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()] as const;
};

/**
 * Exact times, minutes past 00:00 UT of the civil date (month 0-based),
 * before rounding. `isha` is the 15° one (NaN where it does not form) and
 * `ishaSeventh` the seventh of the night: the printed Isha is the earlier of
 * the two after rounding. NaN where a time does not form.
 */
export function wifaqRawMinutes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 2,
): { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number; ishaSeventh: number } {
  const { noon, event, at } = program(latitude, longitude, year, month, day);
  const sunrise = event(HORIZON, -1, noon - 360);
  const sunset = event(HORIZON, 1, noon + 360);
  // the first pass reads the sun at 0h UT: at the very edge of the twilight that decides whether Fajr forms
  let fajr = event(-FAJR, -1, 0);
  if (!Number.isFinite(fajr)) fajr = event(-FAJR, -1, noon - 420, 0);
  if (!Number.isFinite(fajr)) {
    const b = shifted(year, month, day, -1);
    const before = program(latitude, longitude, b[0], b[1], b[2]);
    fajr = (sunset + before.event(HORIZON, -1, before.noon - 360)) / 2 - 720;
  }
  const asrAltitude = Math.atan(1 / (asrShadow + Math.tan(Math.abs(latitude * RAD - at(SHADOW_SUN_MINUTES).dec)))) / RAD;
  const n = shifted(year, month, day, 1);
  const next = program(latitude, longitude, n[0], n[1], n[2]);
  const nextSunrise = next.event(HORIZON, -1, next.noon - 360) + 1440;
  return {
    fajr,
    sunrise,
    dhuhr: noon + WIFAQ_DHUHR_MINUTES,
    asr: event(asrAltitude, 1, noon + 200),
    maghrib: sunset + WIFAQ_MAGHRIB_MINUTES,
    isha: event(-ISHA, 1, noon + 420),
    ishaSeventh: sunset + (nextSunrise - sunset) / 7,
  };
}

/**
 * The timetable's times for a point and civil date (month 0-based), each on
 * the minute it prints. `asrShadow` 2 (the default here) is the Hanafi Asr,
 * 1 the Shafi'i. Null when a time does not form there.
 */
export function wifaqTimes(latitude: number, longitude: number, year: number, month: number, day: number, asrShadow = 2): WifaqInstants | null {
  const r = wifaqRawMinutes(latitude, longitude, year, month, day, asrShadow);
  const near = (m: number) => Math.floor(m + 0.5);
  const seventh = near(r.ishaSeventh);
  const isha = Number.isFinite(r.isha) ? Math.min(near(r.isha), seventh) : seventh;
  const asr = asrShadow === 1 ? Math.floor(r.asr) : near(r.asr);
  const all = [r.fajr, r.sunrise, r.dhuhr, asr, r.maghrib, isha];
  if (!all.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + m * 60_000);
  return { fajr: at(near(r.fajr)), sunrise: at(near(r.sunrise)), dhuhr: at(near(r.dhuhr)), asr: at(asr), maghrib: at(near(r.maghrib)), isha: at(isha) };
}
