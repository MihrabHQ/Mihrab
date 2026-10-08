/**
 * The announced-month-starts file (data/hijri/v1/overrides.json): its shape
 * and its validation. Pure — no storage, no network — so the calendar can
 * apply the bundled copy from its first conversion, and the build tools
 * and tests can read it too. Fetching lives in `overrides.ts`.
 *
 * STRICT ON PURPOSE. This file moves the dates people fast and celebrate
 * on, it is edited by hand, and phones apply it without a release. So the
 * whole file is refused for anything that is not exactly right: another
 * schema, an `updated` that is not a date or UTC time, a month outside
 * 1–12, a day that does not exist (2027-02-30), or the same month listed
 * twice in one calendar.
 */
import type { MonthStartOverride } from './calendar';

export type OverridesFile = {
  schema: 1;
  /** yyyy-mm-dd or yyyy-mm-ddThh:mm:ssZ; a newer one replaces an older. */
  updated: string;
  mabims: MonthStartOverride[];
  khgt: MonthStartOverride[];
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UPDATED = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/;

/** A real calendar day, written yyyy-mm-dd — not one Date would roll over. */
export function isRealDay(ymd: string): boolean {
  if (!YMD.test(ymd)) return false;
  const ms = Date.parse(`${ymd}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === ymd;
}

function validEntry(e: unknown): e is MonthStartOverride {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  return (
    Number.isInteger(o.year) &&
    (o.year as number) >= 1400 &&
    (o.year as number) <= 1600 &&
    Number.isInteger(o.month) &&
    (o.month as number) >= 1 &&
    (o.month as number) <= 12 &&
    typeof o.start === 'string' &&
    isRealDay(o.start)
  );
}

function validList(v: unknown): MonthStartOverride[] | null {
  if (!Array.isArray(v) || !v.every(validEntry)) return null;
  const seen = new Set<number>();
  for (const e of v as MonthStartOverride[]) {
    const key = e.year * 100 + e.month;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return (v as MonthStartOverride[]).map(({ year, month, start }) => ({ year, month, start }));
}

/** `updated` as a moment, for ordering two files (a bare date is its midnight UTC). */
export function updatedMs(updated: string): number {
  const ms = Date.parse(updated.length === 10 ? `${updated}T00:00:00Z` : updated);
  return Number.isNaN(ms) ? -Infinity : ms;
}

/** The file, or null when anything in it is not what it should be. */
export function parseOverrides(raw: unknown): OverridesFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (f.schema !== 1) return null;
  if (typeof f.updated !== 'string' || !UPDATED.test(f.updated) || !isRealDay(f.updated.slice(0, 10))) {
    return null;
  }
  const mabims = validList(f.mabims ?? []);
  const khgt = validList(f.khgt ?? []);
  if (!mabims || !khgt) return null;
  return { schema: 1, updated: f.updated, mabims, khgt };
}
