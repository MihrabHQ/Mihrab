/**
 * A reading plan: a list — Riyāḍ aṣ-Ṣāliḥīn, a book, a set — read through
 * in thirty, sixty or ninety days, so many hadith a day.
 *
 * Pure. The plan itself is three values in the reader's record
 * (`hadithRecord.ts`: the list, the days, the day it began); everything
 * shown is worked out here from those and the read marks the record
 * already keeps. Nothing is stored about "today": a hadith read today is
 * one whose mark is stamped since the reader's own midnight.
 *
 * THE DAY'S SHARE DOES NOT SHRINK AS IT IS READ. It is what was unread
 * this morning over the days left, this one included — so reading eight of
 * today's twelve leaves four, not a new, smaller twelfth of what remains.
 * A day missed is not a debt on tomorrow alone: what is left is shared
 * over the days left, and past the last day the share is what is left.
 */
import { isRead, type HadithRecord, type ReadingPlan } from './hadithRecord';

/** A calendar day as the device has it: YYYY-MM-DD. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The device's midnight that began `d`'s day, in epoch ms. */
export const localDayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole calendar days from one YYYY-MM-DD to another (0 for the same day; never negative). */
export function daysBetween(from: string, to: string): number {
  const at = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((at(to) - at(from)) / 86_400_000));
}

export type PlanProgress = {
  /** Which day of the plan this is, from 1; past `days` once the plan has run over. */
  day: number;
  days: number;
  /** The hadith of the list on this device, and how many of them are read. */
  total: number;
  read: number;
  /** Today's share, and how much of it is read. */
  target: number;
  doneToday: number;
  /** Every hadith of the list is read. */
  finished: boolean;
  /** The first unread hadith of the list, to read on from; null when finished. */
  next: string | null;
};

export function planProgress(plan: ReadingPlan, rowIds: readonly string[], rec: HadithRecord, now: Date): PlanProgress {
  const day = daysBetween(plan.from, localDay(now)) + 1;
  const since = localDayStart(now);
  let read = 0;
  let doneToday = 0;
  let next: string | null = null;
  for (const id of rowIds) {
    if (isRead(rec, id)) {
      read++;
      if ((rec.items[id]?.r?.[1] ?? 0) >= since) doneToday++;
    } else if (next === null) next = id;
  }
  const unread = rowIds.length - read;
  const daysLeft = Math.max(1, plan.days - day + 1);
  const target = Math.ceil((unread + doneToday) / daysLeft);
  return { day, days: plan.days, total: rowIds.length, read, target, doneToday, finished: rowIds.length > 0 && unread === 0, next };
}
