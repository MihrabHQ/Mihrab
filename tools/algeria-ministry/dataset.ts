/**
 * The pure half of the Algeria builder: rows from the Ministry's database
 * in, checked city tables out. No files, no processes — `build.ts` does
 * those — so the checks that decide whether a build may ship can be tested
 * on their own (`__tests__/marwBuilder.test.ts`).
 */
import {
  CalculationParameters,
  Coordinates,
  Madhab,
  PrayerTimes,
} from 'adhan';
import type { DatasetDayTuple } from '../../src/providers/datasetTuple';
import { ALGERIA_CITY_COORDS, cityKey } from './cities';

/** Algeria keeps UTC+1 all year; the database is in local time. */
export const ALGERIA_UTC_OFFSET_MIN = 60;
export const ALGERIA_TIMEZONE = 'Africa/Algiers';
/** Imsak is not in the yearly table (only Ramadan's); ten minutes before Fajr, as elsewhere in the app. */
export const IMSAK_BEFORE_FAJR_MIN = 10;
/**
 * How far a published time may sit from the Ministry's own method (18° /
 * 17°, Maghrib three minutes after sunset) at the city's coordinates.
 * Across a whole year the real data stays within about three minutes (Isha
 * runs a little early in high summer); five catches a wrong city, a shifted
 * day or a garbled cell without tripping on the Ministry's own rounding.
 */
export const MAX_METHOD_DEVIATION_MIN = 5;

export type MinistryCity = { id: number; name: string; parentId: number | null };
export type MinistryRow = {
  cityId: number;
  date: string; // YYYY-MM-DD
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
};

export type BuiltCity = {
  id: number;
  name: string;
  nameEn: string;
  lat: number;
  lon: number;
  /** date → minutes after midnight: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha. */
  minutes: Record<string, number[]>;
};

/** "5:24" / "05:24" / "05:24:00" → minutes after midnight, or NaN. */
export function parseClock(value: string): number {
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(String(value));
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayTuple(m: number[]): DatasetDayTuple {
  return [
    formatClock(m[0] - IMSAK_BEFORE_FAJR_MIN),
    formatClock(m[0]),
    formatClock(m[1]),
    formatClock(m[2]),
    formatClock(m[3]),
    formatClock(m[4]),
    formatClock(m[5]),
  ];
}

/** The Ministry's method at a point, in Algerian local minutes. */
export function methodMinutes(lat: number, lon: number, date: string): number[] {
  const params = new CalculationParameters('Other', 18, 17);
  params.madhab = Madhab.Shafi;
  params.methodAdjustments = { ...params.methodAdjustments, maghrib: 3 };
  const [y, mo, d] = date.split('-').map(Number);
  const t = new PrayerTimes(new Coordinates(lat, lon), new Date(y, mo - 1, d), params);
  const local = (x: Date) =>
    (x.getUTCHours() * 60 + x.getUTCMinutes() + ALGERIA_UTC_OFFSET_MIN + 1440) % 1440;
  return [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map(local);
}

/**
 * Is the noon sun within 2° of the zenith, or north of it, at this latitude?
 *
 * Only the far south reaches this (In Guezzam, Tamanrasset, Bordj Badji
 * Mokhtar, late May to July). There the Ministry's Asr parts from the
 * textbook one: as the sun passes north of the zenith the standard shadow
 * formula makes Asr later again, while the Ministry's stays put — 15:43 at
 * In Guezzam through early June 2027, up to 13 minutes before the formula.
 * That is the Ministry's published figure, and what its own app and the
 * mosques there use, so it is served as published; the method check simply
 * does not apply to Asr on those days. Ordering is still checked.
 */
export function sunNearZenithAtNoon(lat: number, date: string): boolean {
  const start = Date.UTC(Number(date.slice(0, 4)), 0, 1);
  const n = Math.round((Date.parse(`${date}T00:00:00Z`) - start) / 86400000) + 1;
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + n)) / 365);
  return decl >= lat - 2;
}

export class BuildError extends Error {}

/**
 * Turn database rows into per-city tables for [from, to], checking
 * everything a user would be hurt by:
 *
 *   - every listed city has coordinates (an unknown city fails the build);
 *   - every city has every day of the window, exactly once;
 *   - every time parses, and the six run in order through the day;
 *   - every time is within MAX_METHOD_DEVIATION_MIN of the Ministry's own
 *     method at that city — which catches a city whose rows belong to
 *     another, a table shifted by a day, and a corrupted value.
 */
export function buildCities(
  cities: MinistryCity[],
  rows: MinistryRow[],
  from: string,
  to: string,
): BuiltCity[] {
  if (to < from) throw new BuildError(`empty window ${from}..${to}`);
  const problems: string[] = [];
  const out = new Map<number, BuiltCity>();
  for (const c of cities) {
    const coords = ALGERIA_CITY_COORDS[cityKey(c.name)];
    if (!coords) {
      problems.push(`city ${c.id} "${c.name}" has no coordinates in tools/algeria-ministry/cities.ts`);
      continue;
    }
    out.set(c.id, { id: c.id, name: cityKey(c.name), ...coords, minutes: {} });
  }
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    const city = out.get(r.cityId);
    if (!city) continue;
    if (city.minutes[r.date]) {
      problems.push(`${city.nameEn} ${r.date}: duplicate row`);
      continue;
    }
    const m = [r.fajr, r.sunrise, r.dhuhr, r.asr, r.maghrib, r.isha].map(parseClock);
    if (m.some(x => Number.isNaN(x))) {
      problems.push(`${city.nameEn} ${r.date}: unreadable time in ${JSON.stringify(r)}`);
      continue;
    }
    for (let i = 1; i < 6; i++) {
      if (m[i] <= m[i - 1]) problems.push(`${city.nameEn} ${r.date}: times out of order`);
    }
    const calc = methodMinutes(city.lat, city.lon, r.date);
    const asrExempt = sunNearZenithAtNoon(city.lat, r.date);
    for (let i = 0; i < 6; i++) {
      if (i === 3 && asrExempt) continue;
      if (Math.abs(m[i] - calc[i]) > MAX_METHOD_DEVIATION_MIN) {
        problems.push(
          `${city.nameEn} ${r.date}: ${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'][i]} ` +
            `${formatClock(m[i])} is ${m[i] - calc[i]} min from the method (${formatClock(calc[i])})`,
        );
      }
    }
    city.minutes[r.date] = m;
  }
  for (const city of out.values()) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!city.minutes[d]) {
        problems.push(`${city.nameEn}: no row for ${d}`);
        break;
      }
    }
  }
  if (problems.length) {
    throw new BuildError(
      `${problems.length} problem(s):\n  ` + problems.slice(0, 40).join('\n  '),
    );
  }
  return [...out.values()].sort((a, b) => a.id - b.id);
}

/**
 * Days whose published times changed from a previous build, per city. A
 * Ministry correction is possible and is not a failure, but it is listed in
 * the pull request so a person looks at it.
 */
export function changedDays(
  previous: Record<string, DatasetDayTuple> | undefined,
  next: Record<string, number[]>,
): string[] {
  if (!previous) return [];
  const out: string[] = [];
  for (const [date, m] of Object.entries(next)) {
    const old = previous[date];
    if (!old) continue;
    const now = dayTuple(m);
    if (old.slice(1).join() !== now.slice(1).join()) out.push(date);
  }
  return out;
}
