/**
 * WHICH HIJRI CALENDAR, and by how many days to move it.
 *
 * Until this existed the app had one Hijri calendar, the arithmetic
 * (tabular) one in `convert.ts`. It is a good average and it is nobody's
 * announcement. In Indonesia the three that matter differ by a day more
 * often than not at the months people fast and celebrate: Ramadan 1447
 * began on 18 February 2026 for Muhammadiyah and on the 19th for the
 * government and NU, and Eid al-Fitr on 20 and 21 March. Asked for by
 * email (2026-10-08).
 *
 *   'tabular'  The arithmetic calendar — the app's default, unchanged.
 *   'mabims'   Indonesia, government (Kemenag) and NU: MABIMS 3° / 6.4°.
 *   'khgt'     Indonesia, Muhammadiyah: the Global Hijri Calendar, 5° / 8°.
 *
 * The two Indonesian ones are tables (`data/monthStarts.json`), worked out
 * in advance from the moon's position by `tools/hijri-calendars` and checked
 * against every date each body has announced since adopting its rule.
 * Before a table begins and after it ends, the tabular calendar answers.
 *
 * The adjustment is for everyone else: a local announcement a day either
 * side of whichever calendar is chosen. +1 shows tomorrow's Hijri date.
 *
 * Module state, not React state: the conversion is called from places that
 * have no React around them (notification scheduling, the widget payload),
 * and every one of them should agree. `storage.ts` sets it whenever
 * settings are loaded or saved; components that print a Hijri date list
 * `useHijriCalendarVersion()` among their dependencies.
 */
import data from './data/monthStarts.json';
import bundledOverrides from '../../data/hijri/v1/overrides.json';
import { isRealDay, parseOverrides } from './overridesFile';

export type HijriCalendarId = 'tabular' | 'mabims' | 'khgt';

export const HIJRI_CALENDAR_IDS: readonly HijriCalendarId[] = ['tabular', 'mabims', 'khgt'];

/** The adjustment's range, in days. */
export const HIJRI_ADJUST_MIN = -2;
export const HIJRI_ADJUST_MAX = 2;

let active: HijriCalendarId = 'tabular';
let adjust = 0;
let version = 0;
const listeners = new Set<() => void>();

export function coerceHijriCalendarId(value: unknown): HijriCalendarId {
  return HIJRI_CALENDAR_IDS.includes(value as HijriCalendarId)
    ? (value as HijriCalendarId)
    : 'tabular';
}

export function coerceHijriAdjust(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(HIJRI_ADJUST_MAX, Math.max(HIJRI_ADJUST_MIN, Math.round(value)));
}

/** Make this the calendar every Hijri date is read in. */
export function setHijriCalendar(id: unknown, adjustDays: unknown): void {
  const nextId = coerceHijriCalendarId(id);
  const nextAdjust = coerceHijriAdjust(adjustDays);
  if (nextId === active && nextAdjust === adjust) return;
  active = nextId;
  adjust = nextAdjust;
  version += 1;
  listeners.forEach(l => l());
}

export function activeHijriCalendar(): { id: HijriCalendarId; adjustDays: number } {
  return { id: active, adjustDays: adjust };
}

export function hijriCalendarVersion(): number {
  return version;
}

export function subscribeHijriCalendar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── The tables ───────────────────────────────────────────────────────────

type RawTable = { year: number; month: number; start: string; lengths: string };

export type MonthTable = {
  /** Julian Day Number of the first day of each month; one more than months. */
  starts: number[];
  year: number;
  month: number;
};

/** JDN of a proleptic Gregorian date. */
export function julianDay(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * The bundled table, decoded — or null when it is not exactly what the
 * build writes (a start date, a month 1–12, lengths of only '9' and '0'),
 * in which case the arithmetic calendar answers rather than a guess.
 */
export function expand(raw: RawTable | undefined): MonthTable | null {
  if (
    !raw ||
    !Number.isInteger(raw.year) ||
    !Number.isInteger(raw.month) ||
    raw.month < 1 ||
    raw.month > 12 ||
    typeof raw.lengths !== 'string' ||
    !/^[90]+$/.test(raw.lengths)
  ) {
    return null;
  }
  const start = ymdToJd(raw.start);
  if (start == null) return null;
  const starts = [start];
  for (const ch of raw.lengths) {
    starts.push(starts[starts.length - 1] + (ch === '9' ? 29 : 30));
  }
  return { starts, year: raw.year, month: raw.month };
}

const tables: Partial<Record<HijriCalendarId, MonthTable>> = {};

// ── Announced corrections ────────────────────────────────────────────────

/**
 * A month start as announced, replacing the table's: Kemenag's sidang isbat
 * can overrule the MABIMS prediction, and this is how the app hears about
 * it without a release. See `overrides.ts` (fetching) and
 * data/hijri/v1/overrides.json (the file).
 */
export type MonthStartOverride = { year: number; month: number; start: string };

/** How far an announcement may move a month from the table's date. */
export const MAX_OVERRIDE_SHIFT_DAYS = 2;

// The copy bundled with this build, from the first conversion on.
const bundled = parseOverrides(bundledOverrides);
let overrides: Partial<Record<HijriCalendarId, MonthStartOverride[]>> = bundled
  ? { mabims: bundled.mabims, khgt: bundled.khgt }
  : {};
let overridesUpdated = bundled?.updated ?? '';

/** The `updated` date of the corrections in force ('' for none). */
export function hijriOverridesUpdated(): string {
  return overridesUpdated;
}

/** Replace the announced corrections; every table is rebuilt with them. */
export function setHijriOverrides(
  next: Partial<Record<HijriCalendarId, MonthStartOverride[]>>,
  updated = '',
): void {
  overrides = next;
  overridesUpdated = updated;
  for (const k of Object.keys(tables) as HijriCalendarId[]) delete tables[k];
  version += 1;
  listeners.forEach(l => l());
}

function ymdToJd(ymd: unknown): number | null {
  if (typeof ymd !== 'string' || !isRealDay(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return julianDay(y, m, d);
}

/**
 * Put announced starts into a table. A month is 29 or 30 days, so:
 *   • an announcement more than two days from the table's own date is a
 *     mistake in the file (the wrong month or year), not an announcement,
 *     and is skipped;
 *   • an announcement that would make the month BEFORE it shorter than 29
 *     or longer than 30 days cannot be right for this table and is skipped;
 *   • the months AFTER it are moved, as little as possible, until each is
 *     29 or 30 days again — Ramadan announced a day late ends a day late
 *     unless Syawal is announced too.
 */
export function applyOverrides(table: MonthTable, list: readonly MonthStartOverride[]): MonthTable {
  const starts = table.starts.slice();
  const sorted = [...list].sort((a, b) => a.year - b.year || a.month - b.month);
  for (const o of sorted) {
    const i = (o.year - table.year) * 12 + (o.month - table.month);
    const jd = ymdToJd(o.start);
    if (jd == null || i <= 0 || i >= starts.length) continue;
    if (Math.abs(jd - table.starts[i]) > MAX_OVERRIDE_SHIFT_DAYS) continue;
    const before = jd - starts[i - 1];
    if (before < 29 || before > 30) continue;
    starts[i] = jd;
    for (let k = i + 1; k < starts.length; k++) {
      const len = starts[k] - starts[k - 1];
      if (len < 29) starts[k] = starts[k - 1] + 29;
      else if (len > 30) starts[k] = starts[k - 1] + 30;
      else break;
    }
  }
  return { ...table, starts };
}

export function monthTable(id: HijriCalendarId): MonthTable | null {
  if (id === 'tabular') return null;
  if (!tables[id]) {
    const table = expand((data as unknown as Record<string, RawTable | undefined>)[id]);
    if (!table) return null;
    tables[id] = applyOverrides(table, overrides[id] ?? []);
  }
  return tables[id] ?? null;
}

/**
 * The Hijri date of the day `jd` in a table, or null when the table does not
 * cover it.
 */
export function fromTable(
  table: MonthTable,
  jd: number,
): { year: number; month: number; day: number } | null {
  const s = table.starts;
  if (jd < s[0] || jd >= s[s.length - 1]) return null;
  let lo = 0;
  let hi = s.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid] <= jd) lo = mid;
    else hi = mid - 1;
  }
  const index = table.month - 1 + lo;
  return {
    year: table.year + Math.floor(index / 12),
    month: (index % 12) + 1,
    day: jd - s[lo] + 1,
  };
}
