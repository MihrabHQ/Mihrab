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

type Key = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
type Corrections = { from: string; to: string; points: Record<string, string[]> };

let index: Map<string, Map<string, Partial<Record<Key, number>>>> | null = null;

function build(): Map<string, Map<string, Partial<Record<Key, number>>>> {
  const out = new Map<string, Map<string, Partial<Record<Key, number>>>>();
  for (const [point, entries] of Object.entries((list as Corrections).points)) {
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
