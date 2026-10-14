/**
 * The International Prayer Times Congress method (Istanbul, 2021 — the
 * Diyanet and the European Council for Fatwa and Research) as Diyanet's
 * tables realise it. Islamiska Förbundet's Swedish tables are those
 * tables, row for row, so this is Sweden's method (id 24).
 *
 * The published rules (awqatsalah.com, "Tespit Kriterleri"):
 *  - Dhuhr five minutes after transit; Asr one shadow (Dhuhr when the
 *    shadow never forms), four minutes late; sunrise seven early,
 *    Maghrib seven late ("temkin").
 *  - Neither the day nor the night is shorter than five hours.
 *  - True Fajr at 18°, true Isha at 16°. Where the 18° dawn no longer
 *    forms, the share of the night the sharia night's third took on the
 *    last day it did is carried: Isha that share of the night after
 *    Maghrib, Fajr the same share scaled by 18/16 before sunrise.
 *  - The move from true times to the carried ones is gradual, starting
 *    twenty minutes before (Isha) or after (Fajr) the takdir.
 *
 * What the tables turn out to do with them (tools/verify-methods/
 * congress-model.py, every city checked within a minute on every day):
 *  - The sun's position is the Astronomical Almanac's low-precision one,
 *    taken once a day at 0h UT; nothing is iterated.
 *  - The night a share is taken of is the day's own: 24 h less the
 *    printed day, sunrise to Maghrib.
 *  - The five-hour floors hold each end separately, 150 minutes from the
 *    printed Dhuhr or from the midnight after it. Where midsummer's
 *    night is floored at both ends, that night anchors the whole season:
 *    no earlier sunrise and no later Maghrib than midsummer's — and no
 *    earlier Fajr nor later Isha either.
 *  - The gradual transition is a straight line across the days next to
 *    the gap on which the true time lies within twenty minutes of the
 *    takdir at the gap's edge: twenty minutes away at the far end, the
 *    takdir at the edge.
 *
 * Times are minutes past 0h UT of the date, a frame the clock changes
 * cannot bend; `congressTimes` turns them into instants.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const RISE_SET = -0.833;
const FAJR_ANGLE = -18;
const ISHA_ANGLE = -16;
const TEMKIN = { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 } as const;
/** Minutes: the day and the night are never shorter. */
const FLOOR = 300;
/** Minutes: the gradual transition's reach. */
const BAND = 20;
/** Minutes: a midsummer night this close to the five-hour floor counts as floored. */
const ANCHOR_SLACK = 1;
/** Days to look for a dawn or a transition before giving up. */
const SEARCH_DAYS = 200;

/** A calendar date as whole days since 1970-01-01 (UTC). */
type DayKey = number;
const dayKeyOf = (y: number, m: number, d: number): DayKey => Date.UTC(y, m, d) / DAY_MS;
const yearOf = (k: DayKey): number => new Date(k * DAY_MS).getUTCFullYear();
const midsummerOf = (k: DayKey): DayKey => dayKeyOf(yearOf(k), 5, 21);

/** Declination (radians) and equation of time (minutes): the Almanac's low-precision sun. */
function sunAt(utcMs: number): { dec: number; eot: number } {
  const D = utcMs / DAY_MS - 10957.5; // days since J2000.0
  const g = ((357.529 + 0.98560028 * D) % 360) * RAD;
  const q = (280.459 + 0.98564736 * D) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360;
  const e = (23.439 - 0.00000036 * D) * RAD;
  let ra = Math.atan2(Math.cos(e) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD / 15;
  ra = ((ra % 24) + 24) % 24;
  let eqt = q / 15 - ra;
  eqt = ((((eqt + 12) % 24) + 24) % 24) - 12;
  return { dec: Math.asin(Math.sin(e) * Math.sin(L * RAD)), eot: eqt * 60 };
}

/** One day's sun: transit and the crossings, minutes past the day's 0h UT. */
class Solar {
  readonly dec: number;
  readonly transit: number;
  constructor(readonly day: DayKey, readonly lat: number, readonly lon: number) {
    const { dec, eot } = sunAt(day * DAY_MS);
    this.dec = dec;
    this.transit = 720 - 4 * lon - eot;
  }
  private hourAngle(alt: number): number | null {
    const c =
      (Math.sin(alt * RAD) - Math.sin(this.lat * RAD) * Math.sin(this.dec)) /
      (Math.cos(this.lat * RAD) * Math.cos(this.dec));
    if (c < -1 || c > 1) return null;
    return (Math.acos(c) / RAD) * 4;
  }
  rising(alt: number): number | null {
    const h = this.hourAngle(alt);
    return h === null ? null : this.transit - h;
  }
  setting(alt: number): number | null {
    const h = this.hourAngle(alt);
    return h === null ? null : this.transit + h;
  }
  /** Asr: the shadow of a thing is its noon shadow plus `shadow` lengths. */
  asr(shadow: number): number | null {
    const noonAlt = 90 - Math.abs(this.lat - this.dec / RAD);
    if (noonAlt <= 0) return null;
    const alt = Math.atan(1 / (shadow + Math.tan((90 - noonAlt) * RAD))) / RAD;
    return this.setting(alt);
  }
}

type RiseSet = { sr: number; ss: number };
type Ramp = { edge: DayKey; T: number; far: DayKey | null };

/** The method for one place and one year; everything it needs of the year is worked out once. */
class CongressYear {
  private readonly solars = new Map<DayKey, Solar>();
  private readonly riseSets = new Map<DayKey, RiseSet>();
  private ratioValue: number | null | undefined;
  private gap: [DayKey, DayKey] | null | undefined;
  private floors: boolean | undefined;
  private readonly ramps = new Map<string, Ramp>();

  constructor(readonly lat: number, readonly lon: number, readonly year: number) {}

  solar(day: DayKey): Solar {
    let s = this.solars.get(day);
    if (!s) {
      s = new Solar(day, this.lat, this.lon);
      this.solars.set(day, s);
    }
    return s;
  }

  /** Printed (temkin) sunrise and Maghrib with the five-hour floors. */
  riseSet(day: DayKey): RiseSet {
    const cached = this.riseSets.get(day);
    if (cached) return cached;
    const s = this.solar(day);
    const dhuhr = s.transit + TEMKIN.dhuhr;
    const half = FLOOR / 2;
    const rawSr = s.rising(RISE_SET);
    const rawSs = s.setting(RISE_SET);
    let sr: number;
    let ss: number;
    if (rawSr === null || rawSs === null) {
      // the sun neither rises nor sets: midnight sun (up at noon) or polar night
      const noonUp = 90 - Math.abs(this.lat - s.dec / RAD) > RISE_SET;
      [sr, ss] = noonUp ? [dhuhr - 720 + half, dhuhr + 720 - half] : [dhuhr - half, dhuhr + half];
    } else {
      sr = rawSr + TEMKIN.sunrise;
      ss = rawSs + TEMKIN.maghrib;
    }
    // the day no shorter than five hours about the printed Dhuhr, each end on its own …
    sr = Math.min(sr, dhuhr - half);
    ss = Math.max(ss, dhuhr + half);
    // … nor the night, about the midnight after
    sr = Math.max(sr, dhuhr - 720 + half);
    ss = Math.min(ss, dhuhr + 720 - half);
    // and where midsummer's night is floored at both ends, that night anchors the season
    if (this.midsummerFloors(day)) {
      const sol = this.solar(midsummerOf(day)).transit + TEMKIN.dhuhr;
      sr = Math.max(sr, sol - 720 + half);
      ss = Math.min(ss, sol + 720 - half);
    }
    const rs = { sr, ss };
    this.riseSets.set(day, rs);
    return rs;
  }

  /**
   * Is midsummer's night floored at both ends — the day's own floors
   * leaving it five hours, or within a minute of five (Torsby's 300.5 is
   * anchored, Fagersta's 302 is not)? Then that night anchors the season.
   */
  midsummerFloors(day: DayKey): boolean {
    if (this.floors === undefined) {
      const s = this.solar(midsummerOf(day));
      const sr = s.rising(RISE_SET);
      const ss = s.setting(RISE_SET);
      const dhuhr = s.transit + TEMKIN.dhuhr;
      const half = FLOOR / 2;
      if (sr === null || ss === null) this.floors = true;
      else {
        const psr = Math.max(sr + TEMKIN.sunrise, dhuhr - 720 + half);
        const pss = Math.min(ss + TEMKIN.maghrib, dhuhr + 720 - half);
        this.floors = 1440 - (pss - psr) <= FLOOR + ANCHOR_SLACK;
      }
    }
    return this.floors;
  }

  /** The day's night: 24 h less the printed day. */
  night(day: DayKey): number {
    const { sr, ss } = this.riseSet(day);
    return 1440 - (ss - sr);
  }

  fajr18(day: DayKey): number | null {
    return this.solar(day).rising(FAJR_ANGLE);
  }
  isha16(day: DayKey): number | null {
    return this.solar(day).setting(ISHA_ANGLE);
  }
  trueTime(key: 'fajr' | 'isha', day: DayKey): number | null {
    return key === 'fajr' ? this.fajr18(day) : this.isha16(day);
  }

  /** First and last day on which the 18° dawn does not form, or null when it forms all year. */
  gapDays(): [DayKey, DayKey] | null {
    if (this.gap !== undefined) return this.gap;
    const mid = dayKeyOf(this.year, 5, 21);
    if (this.fajr18(mid) !== null) {
      this.gap = null;
      return null;
    }
    let a = mid;
    while (this.fajr18(a - 1) === null && mid - a < SEARCH_DAYS) a -= 1;
    let b = mid;
    while (this.fajr18(b + 1) === null && b - mid < SEARCH_DAYS) b += 1;
    this.gap = [a, b];
    return this.gap;
  }

  /**
   * The carried ratio: a third of the sharia night (this day's Maghrib to
   * the next dawn — the last one, a day on) over the day's night, on the
   * last day before midsummer on which the 18° dawn forms.
   */
  ratio(): number | null {
    if (this.ratioValue !== undefined) return this.ratioValue;
    let d = dayKeyOf(this.year, 5, 21);
    let f = this.fajr18(d);
    let steps = 0;
    while (f === null && steps < SEARCH_DAYS) {
      d -= 1;
      f = this.fajr18(d);
      steps += 1;
    }
    if (f === null) {
      this.ratioValue = null;
      return null;
    }
    const { ss } = this.riseSet(d);
    const S = f + 1440 - ss;
    this.ratioValue = S / 3 / this.night(d);
    return this.ratioValue;
  }

  /** Fajr and Isha from the carried ratio, with midsummer's as the bound where its floors are in force. */
  carried(day: DayKey): [number, number] {
    const r = this.ratio() ?? 0;
    const { sr, ss } = this.riseSet(day);
    const n = this.night(day);
    let fajr = sr - r * (FAJR_ANGLE / ISHA_ANGLE) * n;
    let isha = ss + r * n;
    const mid = midsummerOf(day);
    if (day !== mid && this.midsummerFloors(day)) {
      const [mf, mi] = this.carried(mid);
      fajr = Math.max(fajr, mf);
      isha = Math.min(isha, mi);
    }
    return [fajr, isha];
  }

  /** The gradual transition between the true time and the takdir. */
  ramp(day: DayKey, side: 'in' | 'out', key: 'fajr' | 'isha'): number | null {
    const gap = this.gapDays();
    if (!gap) return this.trueTime(key, day);
    const [d1, d2] = gap;
    const idx = key === 'fajr' ? 0 : 1;
    const cacheKey = side + key;
    let ramp = this.ramps.get(cacheKey);
    if (!ramp) {
      const edge = side === 'in' ? d1 : d2;
      const T = this.carried(edge)[idx];
      const step = side === 'in' ? -1 : 1;
      let far: DayKey | null = null;
      // walking away from the gap the true time starts far beyond T, enters the
      // band and leaves it again; the far end is the last day of that run
      for (let d = edge + step; Math.abs(d - edge) < SEARCH_DAYS; d += step) {
        const t = this.trueTime(key, d);
        if (t !== null && Math.abs(t - T) <= BAND) far = d;
        else if (far !== null) break;
      }
      ramp = { edge, T, far };
      this.ramps.set(cacheKey, ramp);
    }
    const { edge, T, far } = ramp;
    if (far === null) return this.trueTime(key, day);
    const inside = side === 'in' ? far <= day && day < edge : edge < day && day <= far;
    if (!inside) return this.trueTime(key, day);
    const sign = key === 'fajr' ? 1 : -1; // Fajr sits later than the takdir, Isha earlier
    return T + (sign * BAND * Math.abs(day - edge)) / Math.abs(far - edge);
  }

  /** The day's six times, minutes past its 0h UT. */
  times(day: DayKey, asrShadow: number): Record<'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', number> {
    const s = this.solar(day);
    const { sr, ss } = this.riseSet(day);
    const dhuhr = s.transit + TEMKIN.dhuhr;
    const rawAsr = s.asr(asrShadow);
    let asr = rawAsr === null ? dhuhr + 2 : rawAsr + TEMKIN.asr;
    asr = Math.max(dhuhr, Math.min(asr, ss));
    let fajr = this.fajr18(day);
    let isha = this.isha16(day);
    const gap = this.gapDays();
    if (gap) {
      const [d1, d2] = gap;
      if (d1 <= day && day <= d2) [fajr, isha] = this.carried(day);
      else if (day < d1) {
        fajr = this.ramp(day, 'in', 'fajr');
        isha = this.ramp(day, 'in', 'isha');
      } else {
        fajr = this.ramp(day, 'out', 'fajr');
        isha = this.ramp(day, 'out', 'isha');
      }
    }
    return {
      fajr: fajr ?? sr - 60,
      sunrise: sr,
      dhuhr,
      asr,
      maghrib: ss,
      isha: isha ?? ss + 60,
    };
  }
}

const years = new Map<string, CongressYear>();
const MAX_CACHED_YEARS = 12;

function yearFor(lat: number, lon: number, year: number): CongressYear {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)},${year}`;
  let cy = years.get(key);
  if (!cy) {
    if (years.size >= MAX_CACHED_YEARS) years.delete(years.keys().next().value as string);
    cy = new CongressYear(lat, lon, year);
    years.set(key, cy);
  }
  return cy;
}

export type CongressInstants = { fajr: Date; sunrise: Date; dhuhr: Date; asr: Date; maghrib: Date; isha: Date };

/**
 * The Congress method's times for a calendar date (year, month 0–11, day),
 * as instants, unrounded. `asrShadow` is 1 for the standard Asr, 2 for the
 * Hanafi one; the tables print the standard.
 */
export function congressTimes(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  day: number,
  asrShadow = 1,
): CongressInstants {
  const key = dayKeyOf(year, month, day);
  const t = yearFor(latitude, longitude, year).times(key, asrShadow);
  const start = key * DAY_MS;
  const at = (m: number) => new Date(start + m * 60_000);
  return { fajr: at(t.fajr), sunrise: at(t.sunrise), dhuhr: at(t.dhuhr), asr: at(t.asr), maghrib: at(t.maghrib), isha: at(t.isha) };
}

/** For tests and the verification tool: the year's structure as the method sees it. */
export function congressYearInfo(latitude: number, longitude: number, year: number): {
  gap: [string, string] | null;
  ratio: number | null;
  midsummerFloors: boolean;
} {
  const cy = yearFor(latitude, longitude, year);
  const iso = (k: DayKey) => new Date(k * DAY_MS).toISOString().slice(0, 10);
  const gap = cy.gapDays();
  return {
    gap: gap ? [iso(gap[0]), iso(gap[1])] : null,
    ratio: cy.ratio(),
    midsummerFloors: cy.midsummerFloors(dayKeyOf(year, 5, 21)),
  };
}
