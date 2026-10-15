/**
 * The Congress method's last minutes for Sweden: the few times (about one in
 * five thousand) that Diyanet's own program puts on the other side of a
 * minute's rounding point — a hundredth of a second away, from its
 * arithmetic, not from the method. Each entry moves one printed time of one
 * point on one date by a minute. The list (`data/swedenCorrections.json`) is
 * written by MihrabHQ/mihrab-methods (`npm run corrections`) from the
 * timetables and covers the years they do; with it the method is on every
 * printed minute of Diyanet's and Islamiska Förbundet's tables, 2024–2027.
 */
import list from './data/swedenCorrections.json';
import diyanetList from './data/diyanetCorrections.json';
import moroccoList from './data/moroccoCorrections.json';
import algeriaList from './data/algeriaCorrections.json';
import indonesiaList from './data/indonesiaCorrections.json';

type Key = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
type Corrections = { from: string; to: string; points: Record<string, string[]> };

type Index = Map<string, Map<string, Partial<Record<Key, number>>>>;
let index: Index | null = null;
let diyanetIndex: Index | null = null;
let moroccoIndex: Index | null = null;
let algeriaIndex: Index | null = null;
let indonesiaIndex: Index | null = null;

function build(from: Corrections = list as Corrections): Index {
  const out: Index = new Map();
  for (const [point, entries] of Object.entries(from.points)) {
    const byDate = new Map<string, Partial<Record<Key, number>>>();
    for (const e of entries) {
      const [date, key, step] = e.split(' ');
      byDate.set(date, { ...byDate.get(date), [key as Key]: Number(step) });
    }
    out.set(point, byDate);
  }
  return out;
}

/** The minutes to add to a point's printed times on a date (month 0-based), if any. */
export function swedenCorrection(lat: number, lon: number, year: number, month: number, day: number): Partial<Record<Key, number>> | undefined {
  index ??= build();
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return index.get(`${lat.toFixed(3)},${lon.toFixed(3)}`)?.get(date);
}

/** The dates the list covers. */
export const swedenCorrectionsCoverage = { from: (list as Corrections).from, to: (list as Corrections).to };

/**
 * The same for Diyanet's places beyond Sweden — its worldwide places and
 * Türkiye's districts (`data/diyanetCorrections.json`, written by
 * mihrab-methods' `npm run corrections -- diyanet`).
 */
export function diyanetCorrection(lat: number, lon: number, year: number, month: number, day: number): Partial<Record<Key, number>> | undefined {
  diyanetIndex ??= build(diyanetList as Corrections);
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return diyanetIndex.get(`${lat.toFixed(3)},${lon.toFixed(3)}`)?.get(date);
}

/**
 * Morocco's: the ministry's few times (about one in a hundred) its program
 * puts on the other side of a minute from the method, at its cities' points
 * (`data/moroccoCorrections.json`, mihrab-methods' `npm run corrections -- morocco`).
 */
export function moroccoCorrection(lat: number, lon: number, year: number, month: number, day: number): Partial<Record<Key, number>> | undefined {
  moroccoIndex ??= build(moroccoList as Corrections);
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return moroccoIndex.get(`${lat.toFixed(3)},${lon.toFixed(3)}`)?.get(date);
}

const dateKeyOf = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Algeria's: the Ministry's few times its program puts on the other side of a
 * minute from the method, at its cities' points (`data/algeriaCorrections.json`,
 * mihrab-methods' `npm run corrections -- algeria`).
 */
export function algeriaCorrection(lat: number, lon: number, year: number, month: number, day: number): Partial<Record<Key, number>> | undefined {
  algeriaIndex ??= build(algeriaList as Corrections);
  return algeriaIndex.get(`${lat.toFixed(3)},${lon.toFixed(3)}`)?.get(dateKeyOf(year, month, day));
}

/**
 * Indonesia's: Kemenag's few times on the other side of a minute, at its
 * regencies' points (`data/indonesiaCorrections.json`, mihrab-methods'
 * `npm run corrections -- indonesia`).
 */
export function indonesiaCorrection(lat: number, lon: number, year: number, month: number, day: number): Partial<Record<Key, number>> | undefined {
  indonesiaIndex ??= build(indonesiaList as Corrections);
  return indonesiaIndex.get(`${lat.toFixed(3)},${lon.toFixed(3)}`)?.get(dateKeyOf(year, month, day));
}
