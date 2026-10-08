/**
 * How long a prayer alert may be snoozed, given how long the prayer has left.
 *
 * A snooze used to be a fixed menu, however little of the window remained:
 * at 16:50 with Asr ending at 17:10, "Snooze 30 min" was on offer, and
 * pressing it was a decision to miss the prayer that read as a decision to
 * be reminded. The menu now follows the clock.
 *
 *   • A snooze of N minutes is offered only if it leaves at least
 *     `SNOOZE_KEEP_MIN` before the prayer ends — what is left must still be
 *     enough to stand up and pray.
 *   • When even the smallest one no longer fits, there is no snooze left
 *     to offer. The last button becomes "Last chance to pray X", which
 *     brings the alert back once more, shortly before the end.
 *   • Inside the final minutes there is nothing honest to offer, so there
 *     is no snooze at all.
 *
 * "Ends" is the next entry of the day's own order: Fajr ends at sunrise,
 * and Dhuhr, Asr, Maghrib and Isha at the next prayer (Isha at the next
 * Fajr). The pure arithmetic lives here, apart from notifee and i18n, so it
 * can be tested to the minute.
 */
import { addDays, eventAt, startOfLocalDay } from '../utils/prayerTimes';
import type { TimingsMap } from '../types/prayer';

const MIN = 60_000;

/** What must still be left after a snooze for it to be offered. */
export const SNOOZE_KEEP_MIN = 15;

/** Minutes before the end the "last chance" alert comes back, in order of
 *  preference; the first one still ahead of the snooze press is used. */
export const LAST_CHANCE_LEAD_MIN = [15, 5] as const;

/** Stands for "last chance" where a snooze is carried as a number of
 *  minutes (the alarm screen's chips, its headless task). */
export const LAST_CHANCE_MINUTES = -1;

export type SnoozeMenu = {
  /** The snooze lengths that fit, ascending. */
  minutes: number[];
  /** When "Last chance" would fire; set only when no length fits. */
  lastChanceAt: number | null;
  /** The moment the menu was worked out for (when the alert will show). */
  drawnAt?: number;
};

/** Whole minutes from `nowMs` to `at`, never less than one. */
export function minutesUntil(at: number, nowMs: number): number {
  return Math.max(1, Math.round((at - nowMs) / MIN));
}

/**
 * The menu for an alert shown at `nowMs` whose prayer ends at `deadlineMs`.
 * No deadline means no limit: the whole menu, no last chance.
 */
export function snoozeMenu(
  nowMs: number,
  deadlineMs: number | null | undefined,
  presets: readonly number[],
): SnoozeMenu {
  if (deadlineMs == null || !Number.isFinite(deadlineMs)) {
    return { minutes: [...presets], lastChanceAt: null };
  }
  const fits = presets
    .filter(m => nowMs + m * MIN <= deadlineMs - SNOOZE_KEEP_MIN * MIN)
    .sort((a, b) => a - b);
  if (fits.length > 0) return { minutes: fits, lastChanceAt: null };
  for (const lead of LAST_CHANCE_LEAD_MIN) {
    const at = deadlineMs - lead * MIN;
    // At least a minute away, or pressing the button would just re-ring.
    if (at >= nowMs + MIN) return { minutes: [], lastChanceAt: at, drawnAt: nowMs };
  }
  return { minutes: [], lastChanceAt: null };
}

/** Is there any snooze at all in this menu? */
export function hasSnooze(menu: SnoozeMenu): boolean {
  return menu.minutes.length > 0 || menu.lastChanceAt != null;
}

/**
 * What a snooze PRESS turns into, judged at the moment of the press — the
 * button on the screen may be older than the clock (an alert left unread
 * for twenty minutes still shows the menu it was drawn with).
 *
 * `null` means no snooze is possible any more.
 */
export function resolveSnooze(
  nowMs: number,
  deadlineMs: number | null | undefined,
  requestedMinutes: number,
  lastChanceRequested: boolean,
  presets: readonly number[],
): { at: number; lastChance: boolean } | null {
  if (deadlineMs == null || !Number.isFinite(deadlineMs)) {
    if (lastChanceRequested) return { at: nowMs + 10 * MIN, lastChance: false };
    return { at: nowMs + requestedMinutes * MIN, lastChance: false };
  }
  if (
    !lastChanceRequested &&
    nowMs + requestedMinutes * MIN <= deadlineMs - SNOOZE_KEEP_MIN * MIN
  ) {
    return { at: nowMs + requestedMinutes * MIN, lastChance: false };
  }
  // The request no longer fits (or was already "last chance"): give it what
  // the clock still allows, rather than ignoring a button that was pressed.
  const menu = snoozeMenu(nowMs, deadlineMs, presets);
  if (menu.minutes.length > 0) {
    const largest = Math.max(
      ...menu.minutes.filter(m => m <= requestedMinutes),
      menu.minutes[0],
    );
    return { at: nowMs + largest * MIN, lastChance: false };
  }
  if (menu.lastChanceAt != null) return { at: menu.lastChanceAt, lastChance: true };
  return null;
}

/** The salāh and sunrise, in the order the day runs: what ends what. */
const EDGE_KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/**
 * Every window edge across the cached days, ascending. `maps[i]` is the
 * timings of the day `i` after `baseDay`.
 */
export function windowEdges(
  maps: readonly (TimingsMap | undefined)[],
  baseDay: Date,
): { name: string; at: number }[] {
  const dayStart = startOfLocalDay(baseDay);
  const out: { name: string; at: number }[] = [];
  maps.forEach((timings, i) => {
    if (!timings) return;
    const base = i === 0 ? dayStart : addDays(dayStart, i);
    for (const name of EDGE_KEYS) {
      if (!timings[name]) continue;
      try {
        out.push({ name, at: eventAt(name, timings, base).getTime() });
      } catch {
        /* an unreadable time is no edge */
      }
    }
  });
  return out.sort((a, b) => a.at - b.at);
}

/**
 * When the prayer that began at `atMs` ends: the next edge after it. Null
 * when the cached days do not reach one (Isha on the last cached day) —
 * which means "no limit", never a guess.
 */
export function prayerEndsAt(
  edges: readonly { name: string; at: number }[],
  atMs: number,
): number | null {
  for (const e of edges) {
    if (e.at > atMs) return e.at;
  }
  return null;
}
