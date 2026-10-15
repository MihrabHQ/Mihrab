/**
 * The correction lists: for each authority whose method the phone computes
 * — Sweden (Islamiska Förbundet's tables, which are Diyanet's), Diyanet
 * worldwide, Morocco, Algeria, Indonesia — the few times the authority's
 * own program puts on the other side of a minute's rounding point from the
 * method. Each entry moves one printed time of one point on one date by a
 * minute. The lists are written by MihrabHQ/mihrab-methods
 * (`npm run corrections -- <authority>`) from the authorities' tables and
 * cover the dates those do; with them the method is on every printed minute.
 *
 * Bundled with the build (`data/<authority>Corrections.json`); a newer list
 * certified for the same method can replace one at run time
 * (`methodCurrency.ts`).
 */
import swedenList from './data/swedenCorrections.json';
import diyanetList from './data/diyanetCorrections.json';
import moroccoList from './data/moroccoCorrections.json';
import algeriaList from './data/algeriaCorrections.json';
import indonesiaList from './data/indonesiaCorrections.json';

type Key = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type Corrections = { from: string; to: string; points: Record<string, string[]> };
export type CorrectionAuthority = 'sweden' | 'diyanet' | 'morocco' | 'algeria' | 'indonesia';
export const CORRECTION_AUTHORITIES: readonly CorrectionAuthority[] = ['sweden', 'diyanet', 'morocco', 'algeria', 'indonesia'];

type Index = Map<string, Map<string, Partial<Record<Key, number>>>>;

const BUNDLED: Record<CorrectionAuthority, Corrections> = {
  sweden: swedenList as Corrections,
  diyanet: diyanetList as Corrections,
  morocco: moroccoList as Corrections,
  algeria: algeriaList as Corrections,
  indonesia: indonesiaList as Corrections,
};
const inForce: Record<CorrectionAuthority, Corrections> = { ...BUNDLED };
const indexes: Partial<Record<CorrectionAuthority, Index>> = {};

function build(from: Corrections): Index {
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

const dateKeyOf = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** The minutes to add to a point's printed times on a date (month 0-based), if any. */
export function correctionFor(
  authority: CorrectionAuthority,
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
): Partial<Record<Key, number>> | undefined {
  const index = (indexes[authority] ??= build(inForce[authority]));
  return index.get(`${lat.toFixed(3)},${lon.toFixed(3)}`)?.get(dateKeyOf(year, month, day));
}

/** A list's identity: the dates it covers and how many times it moves (as mihrab-methods' certification.json gives it). */
export type CorrectionsSummary = { from: string; to: string; entries: number };
export function summarize(list: Corrections): CorrectionsSummary {
  return { from: list.from, to: list.to, entries: Object.values(list.points).reduce((n, e) => n + e.length, 0) };
}
/** The list in force for an authority. */
export function correctionsInForce(authority: CorrectionAuthority): CorrectionsSummary {
  return summarize(inForce[authority]);
}
/** A short key for the list in force, for what is stored under it. */
export function correctionsKey(authority: CorrectionAuthority): string {
  const s = correctionsInForce(authority);
  return `${s.to}#${s.entries}`;
}

/** A list that does not have the shape of one is refused whole. */
export function isCorrections(x: unknown): x is Corrections {
  if (!x || typeof x !== 'object') return false;
  const c = x as Corrections;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof c.from !== 'string' || typeof c.to !== 'string' || !date.test(c.from) || !date.test(c.to) || c.from > c.to) return false;
  if (!c.points || typeof c.points !== 'object') return false;
  const entry = /^\d{4}-\d{2}-\d{2} (fajr|sunrise|dhuhr|asr|maghrib|isha) [+-]1$/;
  return Object.entries(c.points).every(
    ([k, v]) => /^-?\d+\.\d{3},-?\d+\.\d{3}$/.test(k) && Array.isArray(v) && v.every(e => typeof e === 'string' && entry.test(e)),
  );
}

/** Put a newer list in force (one certified for this build's method; `methodCurrency.ts` decides). */
export function setCorrections(authority: CorrectionAuthority, list: Corrections): void {
  inForce[authority] = list;
  delete indexes[authority];
}
/** Tests: back to the bundled lists. */
export function _resetCorrectionsForTests(): void {
  for (const a of CORRECTION_AUTHORITIES) {
    inForce[a] = BUNDLED[a];
    delete indexes[a];
  }
}

export const swedenCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('sweden', lat, lon, y, m, d);
/** Diyanet's places beyond Sweden: its worldwide places and Türkiye's districts. */
export const diyanetCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('diyanet', lat, lon, y, m, d);
export const moroccoCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('morocco', lat, lon, y, m, d);
export const algeriaCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('algeria', lat, lon, y, m, d);
export const indonesiaCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('indonesia', lat, lon, y, m, d);

/** The dates Sweden's list covers. */
export const swedenCorrectionsCoverage = { from: BUNDLED.sweden.from, to: BUNDLED.sweden.to };
