export type TimingsMap = Record<string, string>;

/**
 * Visual + chronological order of every row that can appear in a day card.
 *
 * The four non-salāh entries — `Midnight` (Islamic midnight), `Lastthird`
 * (start of the last third of the night / Qiyām), `Firstthird` (the end of
 * the first third) and `Sunrise` — are derived, optional, and individually
 * gated by user toggles (see `nightTimes.ts` + `filterOptionalTimes`). When
 * their toggle is off they are simply absent from the `TimingsMap` and every
 * consumer (table, notifications, widget, Live Activity) skips them
 * automatically.
 *
 * `Midnight` and `Lastthird` are pre-dawn events (e.g. 00:47, 02:48) so they
 * sort BEFORE Fajr in clock order. `Firstthird` is the other end of the same
 * arithmetic and belongs to the night that BEGINS on this card — it falls a
 * couple of hours after Isha, so it sorts last.
 */
export const DISPLAY_ORDER = [
  'Midnight',
  'Lastthird',
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
  'Firstthird',
] as const;

export type DisplayPrayerKey = (typeof DISPLAY_ORDER)[number];

const NIGHT_MARKS_IN_ORDER = ['Firstthird', 'Midnight', 'Lastthird'] as const;

function clockMinutes(raw: string | undefined): number | null {
  const m = raw ? /(\d{1,2}):(\d{2})/.exec(raw) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * The rows of ONE day's card, in the order the day itself runs.
 *
 * `DISPLAY_ORDER` puts Midnight and the Last Third above Fajr, which is
 * where they fall when they are after 00:00. They are not always: each is
 * written as the mark that falls on the card's own date (`nightTimes.ts`),
 * and in a Stockholm November the night is long enough that Islamic
 * Midnight is at 22:23 — tonight, five hours after Isha. Listed first it
 * read as the earliest thing in the day, over a Last Third of 00:46.
 *
 * So a mark later on the clock than Fajr is an evening one (no mark falls
 * between Fajr and Maghrib) and goes under Isha, with the First Third, in
 * the order the night reaches them. A fixed table (the month's columns)
 * keeps `DISPLAY_ORDER`: a column cannot move from one row to the next.
 */
export function displayRowsFor(timings: TimingsMap): DisplayPrayerKey[] {
  const present = DISPLAY_ORDER.filter(key => timings[key]);
  const fajr = clockMinutes(timings.Fajr);
  if (fajr == null) return present;
  const evening = new Set<string>(
    (['Midnight', 'Lastthird'] as const).filter(key => {
      const at = clockMinutes(timings[key]);
      return at != null && at > fajr;
    }),
  );
  if (evening.size === 0) return present;
  if (timings.Firstthird) evening.add('Firstthird');
  return [
    ...present.filter(key => !evening.has(key)),
    ...NIGHT_MARKS_IN_ORDER.filter(key => evening.has(key)),
  ];
}

export const NEXT_SALAH_ORDER = [
  'Midnight',
  'Lastthird',
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
  'Firstthird',
] as const;

export type NextSalahName = (typeof NEXT_SALAH_ORDER)[number];

/**
 * The non-prayer "events" the app can surface alongside the five daily salāh.
 * All of them use the default notification sound (never the adhan) and are
 * each gated by an individual settings toggle. Sunrise defaults ON; the three
 * night times default OFF.
 */
export const OPTIONAL_TIME_KEYS = [
  'Sunrise',
  'Midnight',
  'Lastthird',
  'Firstthird',
] as const;
export type OptionalTimeKey = (typeof OPTIONAL_TIME_KEYS)[number];

const NON_PRAYER_EVENTS: ReadonlySet<string> = new Set(OPTIONAL_TIME_KEYS);

/**
 * Sunrise and the three night marks are times, not prayers.
 *
 * They must never carry the adhan, a log action, or anything else that
 * treats them as salāh. This lives here, next to the list, because it was
 * asked in two places and only one of them answered correctly: the
 * scheduler had its own copy of this set, and the "Mute next adhan"
 * headless task — which re-creates a scheduled alert on the adhan channel
 * — had no check at all, so an unmute aimed at Sunrise handed it the call
 * to prayer.
 */
export function isNonPrayerEvent(name: string): boolean {
  return NON_PRAYER_EVENTS.has(name);
}

/** One line of a day's card: a prayer's row, or a strip of the times that are not prayers. */
export type DayRowGroup =
  | { kind: 'row'; key: DisplayPrayerKey }
  | { kind: 'strip'; keys: DisplayPrayerKey[] };

/**
 * A day's rows as the card draws them: each prayer on a row of its own,
 * and each RUN of optional times (Sunrise, Islamic Midnight, the thirds
 * of the night) together on one thin strip where the run falls.
 *
 * They were a full row each — four of the nine rows on a card with all of
 * them on, for times that are not prayed, not logged and carry no second
 * time. Any of the four can be off, and a night mark can fall before Fajr
 * or after Isha (`displayRowsFor`), so nothing here names a combination:
 * whatever stands next to each other in the day's order shares a strip.
 * Sunrise alone sits under Fajr; the First Third and an evening Midnight
 * share the line under Isha; with every toggle off there are no strips.
 */
export function groupDayRows(rows: readonly DisplayPrayerKey[]): DayRowGroup[] {
  const out: DayRowGroup[] = [];
  for (const key of rows) {
    if (!NON_PRAYER_EVENTS.has(key)) {
      out.push({ kind: 'row', key });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === 'strip') last.keys.push(key);
    else out.push({ kind: 'strip', keys: [key] });
  }
  return out;
}
