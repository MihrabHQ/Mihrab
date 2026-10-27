/**
 * How far back the practice graph reaches — the Log's and Home's alike
 * (PracticeStrip). It lived beside the grid of one square a day, which
 * went from the app; the reach-back did not.
 */

/** The fewest weeks the graph is drawn with: its shape on a fresh install. */
export const HISTORY_WEEKS = 13;

/** Noon-anchored, so adding days never lands on a DST hour that doesn't exist. */
function atNoon(d: Date): Date {
  const out = new Date(d);
  out.setHours(12, 0, 0, 0);
  return out;
}

/** The Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const out = atNoon(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How many week columns are needed to reach back to `earliest`.
 *
 * Never fewer than `HISTORY_WEEKS`, so the graph keeps its shape on a fresh
 * install. A key that cannot be parsed — or one in the future, which no
 * honest log has — falls back to the minimum rather than producing a graph
 * of unknown size.
 */
export function weeksToCover(earliest: string | null | undefined, now: Date = new Date()): number {
  if (!earliest) return HISTORY_WEEKS;
  const first = parseDayKey(earliest);
  if (!first) return HISTORY_WEEKS;
  const from = mondayOf(first);
  const to = mondayOf(now);
  const weeks = Math.round((to.getTime() - from.getTime()) / (7 * 86400000)) + 1;
  return Math.max(HISTORY_WEEKS, weeks);
}
