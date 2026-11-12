/**
 * The correction lists: for each authority whose method the phone computes
 * — Sweden (Islamiska Förbundet's tables, which are Diyanet's), Diyanet
 * worldwide, Morocco, Algeria, Indonesia, Tatarstan, Russia's Central
 * Muftiate, Albania, Bulgaria, Egypt, Kuwait, Qatar, Jordan, Kazakhstan,
 * Brunei, Pakistan's Jamia Banuri Town — the few times the authority's
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

type Key = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type Corrections = { from: string; to: string; points: Record<string, string[]> };
export type CorrectionAuthority = 'sweden' | 'diyanet' | 'morocco' | 'algeria' | 'indonesia' | 'tatarstan' | 'cdum' | 'albania' | 'bulgaria' | 'egypt' | 'kuwait' | 'qatar' | 'jordan' | 'kazakhstan' | 'brunei' | 'banuri';
export const CORRECTION_AUTHORITIES: readonly CorrectionAuthority[] = ['sweden', 'diyanet', 'morocco', 'algeria', 'indonesia', 'tatarstan', 'cdum', 'albania', 'bulgaria', 'egypt', 'kuwait', 'qatar', 'jordan', 'kazakhstan', 'brunei', 'banuri'];

type Index = Map<string, Map<string, Partial<Record<Key, number>>>>;

// The bundled lists are read when an authority is first asked about, not
// when this module loads: it loads at launch, on the way to the first
// times, and Diyanet's list alone was 5 ms of the start for a reader its
// places never cover (tools/startup-trace).
const BUNDLED: Record<CorrectionAuthority, () => Corrections> = {
  sweden: () => require('./data/swedenCorrections.json') as Corrections,
  diyanet: () => require('./data/diyanetCorrections.json') as Corrections,
  morocco: () => require('./data/moroccoCorrections.json') as Corrections,
  algeria: () => require('./data/algeriaCorrections.json') as Corrections,
  indonesia: () => require('./data/indonesiaCorrections.json') as Corrections,
  tatarstan: () => require('./data/tatarstanCorrections.json') as Corrections,
  cdum: () => require('./data/cdumCorrections.json') as Corrections,
  albania: () => require('./data/albaniaCorrections.json') as Corrections,
  bulgaria: () => require('./data/bulgariaCorrections.json') as Corrections,
  egypt: () => require('./data/egyptCorrections.json') as Corrections,
  kuwait: () => require('./data/kuwaitCorrections.json') as Corrections,
  qatar: () => require('./data/qatarCorrections.json') as Corrections,
  jordan: () => require('./data/jordanCorrections.json') as Corrections,
  kazakhstan: () => require('./data/kazakhstanCorrections.json') as Corrections,
  brunei: () => require('./data/bruneiCorrections.json') as Corrections,
  banuri: () => require('./data/banuriCorrections.json') as Corrections,
};
const inForce: Partial<Record<CorrectionAuthority, Corrections>> = {};
const listInForce = (authority: CorrectionAuthority): Corrections =>
  (inForce[authority] ??= BUNDLED[authority]());
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
  const index = (indexes[authority] ??= build(listInForce(authority)));
  return index.get(`${lat.toFixed(3)},${lon.toFixed(3)}`)?.get(dateKeyOf(year, month, day));
}

/** A list's identity: the dates it covers and how many times it moves (as mihrab-methods' certification.json gives it). */
export type CorrectionsSummary = { from: string; to: string; entries: number };
export function summarize(list: Corrections): CorrectionsSummary {
  return { from: list.from, to: list.to, entries: Object.values(list.points).reduce((n, e) => n + e.length, 0) };
}
/**
 * The list in force for an authority. Kept once summarised: the stored
 * times' cache key carries it (prayer/prayerStorage.ts), so the launch
 * sweep asked for it once a slot, and each answer was a walk of every
 * point in the list.
 */
const summaries: Partial<Record<CorrectionAuthority, CorrectionsSummary>> = {};
export function correctionsInForce(authority: CorrectionAuthority): CorrectionsSummary {
  return (summaries[authority] ??= inForce[authority]
    ? summarize(inForce[authority])
    : // The bundled list's, written at build time (scripts/build-corrections-summaries.js),
      // so the comparison at launch does not run the list itself.
      (require('./data/correctionsSummaries.json') as Record<CorrectionAuthority, CorrectionsSummary>)[authority]);
}
/** A short key for the list in force, for what is stored under it. */
export function correctionsKey(authority: CorrectionAuthority): string {
  const s = correctionsInForce(authority);
  return `${s.to}#${s.entries}`;
}

/**
 * The outline of a list — its dates and that it has points — without the
 * walk of every entry: what the launch checks before a stored copy of its
 * own is put in force (`methodCurrency.ts`), the whole check following
 * after the first frame.
 */
export function hasCorrectionsOutline(x: unknown): x is Corrections {
  if (!x || typeof x !== 'object') return false;
  const c = x as Corrections;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof c.from !== 'string' || typeof c.to !== 'string' || !date.test(c.from) || !date.test(c.to) || c.from > c.to) return false;
  return !!c.points && typeof c.points === 'object';
}

/** A list that does not have the shape of one is refused whole. */
export function isCorrections(x: unknown): x is Corrections {
  if (!hasCorrectionsOutline(x)) return false;
  const c = x as Corrections;
  const entry = /^\d{4}-\d{2}-\d{2} (fajr|sunrise|dhuhr|asr|maghrib|isha) [+-]1$/;
  return Object.entries(c.points).every(
    ([k, v]) => /^-?\d+\.\d{3},-?\d+\.\d{3}$/.test(k) && Array.isArray(v) && v.every(e => typeof e === 'string' && entry.test(e)),
  );
}

/** Put a newer list in force (one certified for this build's method; `methodCurrency.ts` decides). */
export function setCorrections(authority: CorrectionAuthority, list: Corrections): void {
  inForce[authority] = list;
  delete indexes[authority];
  delete summaries[authority];
}
/** The bundled list back in force for an authority (a stored copy that failed its check). */
export function clearCorrections(authority: CorrectionAuthority): void {
  delete inForce[authority];
  delete indexes[authority];
  delete summaries[authority];
}
/** Tests: back to the bundled lists. */
export function _resetCorrectionsForTests(): void {
  for (const a of CORRECTION_AUTHORITIES) {
    delete inForce[a];
    delete indexes[a];
    delete summaries[a];
  }
}

export const swedenCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('sweden', lat, lon, y, m, d);
/** Diyanet's places beyond Sweden: its worldwide places and Türkiye's districts. */
export const diyanetCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('diyanet', lat, lon, y, m, d);
export const moroccoCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('morocco', lat, lon, y, m, d);
export const algeriaCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('algeria', lat, lon, y, m, d);
export const indonesiaCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('indonesia', lat, lon, y, m, d);
export const tatarstanCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('tatarstan', lat, lon, y, m, d);
/** The Central Spiritual Administration of Muslims of Russia's cities. */
export const cdumCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('cdum', lat, lon, y, m, d);
/** By a town's own point of the table (`balkanTowns.ts`). */
export const albaniaCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('albania', lat, lon, y, m, d);
export const bulgariaCorrection = (lat: number, lon: number, y: number, m: number, d: number) => correctionFor('bulgaria', lat, lon, y, m, d);

/** The dates Sweden's bundled list covers. */
export const swedenCorrectionsCoverage = (): { from: string; to: string } => {
  const l = BUNDLED.sweden();
  return { from: l.from, to: l.to };
};
