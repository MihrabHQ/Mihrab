/**
 * The hero's rails, as arithmetic: where the head stands between two
 * prayers, and where it and the prayers stand along the day.
 *
 * Out of the hero's component (HeroToday.tsx), where they were two
 * `useMemo`s; nothing here knows React.
 */
import { DISPLAY_ORDER } from '../../types/prayer';
import type { TimingsMap } from '../../types/prayer';
import { eventAt } from '../../utils/prayerTimes';

const DAY = 86_400_000;

export type IntervalRail = { from: { key: string; at: Date }; pct: number };
export type DayRail = { marks: Array<{ key: string; at: number }>; pct: number };

/**
 * The rail measures the CURRENT interval — from the prayer that has most
 * recently passed to the one being counted down to. Without a previous
 * time to anchor it (before Fajr, or when the day's earlier entries are
 * hidden by the optional-times toggles) there is no interval to be a
 * fraction of, so the rail is simply not drawn.
 */
export function intervalRail(today: TimingsMap, now: Date, targetAt: Date, dayClock?: string | null): IntervalRail | null {
  // An evening row past midnight (Isha, the First Third — a Stockholm
  // June Isha is "00:47") belongs to tomorrow's date: `eventAt`'s rule.
  // Read as today's it had already "passed" at 23:00, and the rail ran
  // from Isha to Isha with nothing in it.
  const instant = (key: string): Date => eventAt(key, today, now, dayClock);
  // Today's instants AND yesterday's: before Fajr nothing of today has
  // passed, and the rail used to vanish for the whole small-hours
  // stretch — the one time a "how far into the night" bar is the most
  // use. Last night's Isha is the same clock a day earlier.
  const passed = DISPLAY_ORDER.map(key => ({
    key,
    raw: today[key],
  }))
    .filter(e => e.raw)
    .flatMap(e => {
      const at = instant(e.key);
      const yesterday = new Date(at);
      yesterday.setDate(yesterday.getDate() - 1);
      return [
        { key: e.key as string, at },
        { key: e.key as string, at: yesterday },
      ];
    })
    .filter(e => e.at.getTime() <= now.getTime())
    .sort((x, y) => x.at.getTime() - y.at.getTime());
  const from = passed[passed.length - 1];
  if (!from) return null;
  const span = targetAt.getTime() - from.at.getTime();
  if (span <= 0) return null;
  const pct = Math.max(0, Math.min(1, (now.getTime() - from.at.getTime()) / span));
  return { from, pct };
}

/**
 * Minimal's rail is the DAY, not the interval: Fajr to the next Fajr,
 * with a mark at each prayer along it and the head where now is. The
 * interval rail needed its two labels to say what it ran between; a
 * day with its prayers marked on it is read without any — the head
 * stands between the marks it has passed and the ones to come, and the
 * caption under the figures names the next. The target's mark is a
 * step larger. A day is taken as 24 hours from the last Fajr, which is
 * within a minute or two of the next one and invisible at this size.
 */
export function dayRailOf(today: TimingsMap, now: Date, dayClock?: string | null): DayRail | null {
  if (!today.Fajr) return null;
  const instant = (key: string): number => eventAt(key, today, now, dayClock).getTime();
  let start = instant('Fajr');
  if (start > now.getTime()) start -= DAY;
  const end = start + DAY;
  const within = (at: number): number => (at < start ? at + DAY : at > end ? at - DAY : at);
  const marks = (['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const)
    .filter(key => today[key])
    .map(key => ({ key: key as string, at: key === 'Fajr' ? 0 : (within(instant(key)) - start) / DAY }))
    .concat([{ key: 'Fajr', at: 1 }]);
  const pct = Math.max(0, Math.min(1, (now.getTime() - start) / DAY));
  return { marks, pct };
}
