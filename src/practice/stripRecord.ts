/**
 * The record by prayer: one column a day, one row a prayer (the data;
 * PracticeStrip.tsx draws it).
 *
 * The heatmap (PracticeHeatmap) sums a day into one number — five prayers
 * weighted into a depth of green — and that number throws away the fact a
 * prayer log is kept for: WHICH prayer. Nobody misses "1.3 of 5"; they miss
 * Fajr, on weekdays, for a month, and a depth-of-green cannot show it. So
 * the strip turns the grid on its side: rows are Fajr to Isha, columns are
 * days, and every cell is one fact — on time, late, missed, made up, or
 * nothing. A row that is pale across is a habit you can see.
 *
 * Fasting is a sixth row (the Monday/Thursday rhythm reads as a rhythm),
 * the sunnah a seventh (a fraction of the cell), with the night prayer on
 * it. Every cell carries one fact, so a cell can be small and plain.
 *
 * Same span rules as the heatmap: from the Monday of the earliest entry (or
 * the weeks asked for) to the end of this week, so the two views agree
 * about what history there is.
 */
import type { JournalEntry, JournalPrayer, JournalStatus } from '../journal/journal';
import { isLogged } from '../journal/journal';
import { dayAt, sunnahFraction, type SunnahLog } from '../journal/sunnah';
import { dayKey } from './practiceStore';

/** The rows, in the order the day prays them. */
export const STRIP_PRAYERS: readonly JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/** A cell's one fact. `null` is nothing recorded. */
export type StripStatus = Exclude<JournalStatus, 'cleared'> | null;

export type StripDay = {
  key: string;
  /** Monday 0 … Sunday 6, for the week gaps and the weekday labels. */
  weekday: number;
  /** One per `STRIP_PRAYERS`. */
  prayers: StripStatus[];
  fasted: boolean;
  /** 0…1, how much of the day's sunnah was prayed. */
  sunnah: number;
  qiyam: boolean;
  /** Inside the record, finished, and not fully accounted for — see HeatmapDay. */
  unaccounted: boolean;
  /** Before the record began: nothing to show and nothing to miss. */
  beforeRecord: boolean;
  future: boolean;
  /** The first of a month — carries the month's label over the column. */
  monthStart: boolean;
};

function atNoon(d: Date): Date {
  const out = new Date(d);
  out.setHours(12, 0, 0, 0);
  return out;
}

function mondayOf(d: Date): Date {
  const out = atNoon(d);
  // getDay(): Sunday 0 … Saturday 6; Monday-first weeks.
  const back = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - back);
  return out;
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return atNoon(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Each day's five statuses, from the flat journal. Later entries win. */
export function statusesByDay(entries: JournalEntry[]): Map<string, Map<JournalPrayer, StripStatus>> {
  const out = new Map<string, Map<JournalPrayer, StripStatus>>();
  for (const e of entries) {
    if (!isLogged(e)) continue;
    let day = out.get(e.date);
    if (!day) {
      day = new Map();
      out.set(e.date, day);
    }
    day.set(e.prayer, e.status as StripStatus);
  }
  return out;
}

/**
 * The strip's days, oldest first, from the Monday `weeks` weeks before this
 * one to the Sunday of this week — the same window `buildHeatmap` draws, so
 * the two views scroll over the same history.
 */
export function buildStrip(
  entries: JournalEntry[],
  fastedDays: Set<string>,
  now: Date = new Date(),
  weeks = 13,
  sunnahLog: SunnahLog = {},
  since: string | null = null,
): StripDay[] {
  const today = atNoon(now);
  const from = since ? parseDayKey(since) : null;
  const span = Math.max(1, Math.floor(weeks));
  const start = mondayOf(today);
  start.setDate(start.getDate() - (span - 1) * 7);
  const byDay = statusesByDay(entries);

  const days: StripDay[] = [];
  for (let i = 0; i < span * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    const statuses = byDay.get(key);
    const prayers = STRIP_PRAYERS.map(p => statuses?.get(p) ?? null);
    const sun = dayAt(sunnahLog, key);
    const future = d.getTime() > today.getTime();
    const beforeRecord = from != null && d.getTime() < from.getTime();
    const finished = d.getTime() < today.getTime();
    days.push({
      key,
      weekday: i % 7,
      prayers,
      fasted: fastedDays.has(key),
      sunnah: sunnahFraction(sun),
      qiyam: sun.qiyam > 0,
      unaccounted: from != null && !beforeRecord && finished && prayers.some(s => s == null),
      beforeRecord,
      future,
      monthStart: d.getDate() === 1,
    });
  }
  return days;
}

/** The label over a column that starts a month: "Oct", "Nov". */
export function monthLabelFor(key: string, locale: string): string {
  const d = parseDayKey(key);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(d);
  } catch {
    return '';
  }
}
