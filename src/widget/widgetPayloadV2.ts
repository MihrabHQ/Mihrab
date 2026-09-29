/**
 * Payload v2 — the widget contract (scripts/contract/widget-contract.js) —
 * built from the v1 payload the app already assembles.
 *
 * Derived rather than built beside it from the raw timings, on purpose:
 * while both are written (docs/rewrite-plan.md, step 1.4) the widgets read
 * v2 through a native adapter that turns it back into the v1 shape their
 * renderers draw from, and the contract tests hold that adapter to
 * reproducing this app's own v1 exactly. Two builders fed the same inputs
 * would be two chances to disagree; one derived from the other is none.
 *
 * What changes on the way:
 *   - times become minutes after local midnight of their day, and the text
 *     is written natively from them and the `clock` block;
 *   - each day records the UTC offset it was built under (#56);
 *   - the First Third, when it falls after midnight, keeps its day and
 *     counts past 1440, where v1 left the reader to work that out;
 *   - a day the app had no times for — after ʿIshāʾ with no tomorrow —
 *     travels as its own `estimated` day instead of as top-level rows;
 *   - the top-level "shown day" and "next" fields are gone: they are a
 *     function of the time the widget draws at, and the adapter computes
 *     them then, not when the app last ran;
 *   - `tomorrowEstimated` (read by nothing) and the practice grid's legacy
 *     `k` (superseded by `kw`) are not carried.
 */
import type {
  WidgetDay,
  WidgetPrayerPayload,
  WidgetPrayerRow,
} from './buildWidgetPayload';
import {
  WIDGET_CONTRACT_VERSION,
  type WidgetContractClock,
  type WidgetContractDay,
  type WidgetContractPayload,
  type WidgetContractPracticeDay,
  type WidgetContractRow,
  type WidgetContractToday,
} from './contract.generated';
import type { WidgetTodayPrayer } from './widgetBlocks';
import {
  contractDateKey,
  formatContractMinutes,
  minutesFromHHmm,
  NO_TIME,
  utcOffsetMinutesAtNoon,
} from './wallClock';

type WidgetTodayPrayerKey = WidgetTodayPrayer['key'];

/** The v1 row as v2 carries it. `maghrib` places a First Third after midnight. */
function rowV2(
  row: WidgetPrayerRow,
  maghrib: number | null,
): WidgetContractRow {
  let minutes = minutesFromHHmm(row.time);
  // The same rule as `eventAt` in utils/prayerTimes: a First Third that reads
  // earlier than Maghrib is the one after the midnight that ends the day.
  if (
    row.key === 'Firstthird' &&
    minutes != null &&
    maghrib != null &&
    minutes < maghrib
  ) {
    minutes += 1440;
  }
  return {
    key: row.key,
    name: row.name,
    abbr: row.abbr,
    ...(minutes == null ? {} : { minutes }),
  };
}

function dayV2(
  dateKey: string,
  label: string,
  rows: WidgetPrayerRow[],
  sunriseRow: WidgetPrayerRow | undefined,
  extraRows: WidgetPrayerRow[] | undefined,
  estimated: boolean,
): WidgetContractDay {
  const maghribRow = rows.find(r => r.key === 'Maghrib');
  const maghrib = maghribRow ? minutesFromHHmm(maghribRow.time) : null;
  const offset = utcOffsetMinutesAtNoon(dateKey);
  const extras = (extraRows ?? []).map(r => rowV2(r, maghrib));
  return {
    dateKey,
    ...(offset == null ? {} : { utcOffsetMinutes: offset }),
    label,
    prayers: rows.map(r => rowV2(r, maghrib)),
    ...(sunriseRow ? { sunrise: rowV2(sunriseRow, maghrib) } : {}),
    ...(extras.length > 0 ? { extras } : {}),
    ...(estimated ? { estimated: true } : {}),
  };
}

function nextDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(n => parseInt(n, 10));
  return contractDateKey(new Date(y, m - 1, d + 1, 12, 0, 0, 0));
}

function todayV2(
  today: NonNullable<WidgetPrayerPayload['today']>,
): WidgetContractToday {
  return {
    dateKey: today.dateKey,
    logged: today.logged,
    loggable: today.loggable,
    owed: today.owed,
    prayers: today.prayers.map(p => {
      const minutes = minutesFromHHmm(p.time);
      return {
        key: p.key,
        name: p.name,
        ...(minutes == null ? {} : { minutes }),
        ...(p.status ? { status: p.status } : {}),
        due: p.due,
      };
    }),
  };
}

function practiceDayV2(
  d: NonNullable<WidgetPrayerPayload['practice']>['days'][number],
): WidgetContractPracticeDay {
  return {
    d: d.d,
    // A payload from before `kw` existed scored with `k`; carry the same
    // number the renderers would have fallen back to.
    kw: d.kw ?? Math.min(Math.max(d.k, 0), 5) * 100,
    ...(d.l ? { l: d.l } : {}),
    ...(d.m ? { m: true } : {}),
    ...(d.f ? { f: true } : {}),
    ...(d.s ? { s: d.s } : {}),
  };
}

export type WidgetPayloadV2Options = {
  /** The clock block — `contractClock(hour12, language)`. */
  clock: WidgetContractClock;
  /** When the v1 payload was built; dates the estimated day. */
  now: Date;
};

/** Payload v2 from the v1 payload, for the same moment. */
export function widgetPayloadV2FromV1(
  v1: WidgetPrayerPayload,
  { clock, now }: WidgetPayloadV2Options,
): WidgetContractPayload {
  const v1Days: WidgetDay[] = v1.days ?? [];
  const days = v1Days.map(d =>
    dayV2(d.dateKey, d.dayLabel, d.rows, d.sunriseRow, d.extraRows, false),
  );

  // After ʿIshāʾ with no times for tomorrow, v1 shows today's times under
  // tomorrow's date at the top level and nowhere in `days`. v2 says so.
  const todayKey = contractDateKey(now);
  const tomorrowKey = nextDateKey(todayKey);
  if (v1.tomorrowEstimated && !v1Days.some(d => d.dateKey === tomorrowKey)) {
    days.push(
      dayV2(
        tomorrowKey,
        v1.dayLabel,
        v1.rows,
        v1.sunriseRow,
        v1.extraRows,
        true,
      ),
    );
  }
  if (days.length === 0) {
    // A v1 payload without `days` (only ever built by old callers and
    // tests) still describes one day: the one at the top level.
    days.push(
      dayV2(todayKey, v1.dayLabel, v1.rows, v1.sunriseRow, v1.extraRows, false),
    );
  }

  const out: WidgetContractPayload = {
    schemaVersion: WIDGET_CONTRACT_VERSION,
    ...(v1.language ? { language: v1.language } : {}),
    clock,
    ...(v1.locationName ? { locationName: v1.locationName } : {}),
    days,
  };
  if (v1.seasonal) {
    out.seasonal = {
      jumuah: v1.seasonal.jumuah,
      ramadan: v1.seasonal.ramadan,
      ...(v1.seasonal.eid ? { eid: v1.seasonal.eid } : {}),
    };
  }
  if (v1.today) out.today = todayV2(v1.today);
  if (v1.practice) {
    const { days: practiceDays, sunnahRate, since, ...rest } = v1.practice;
    out.practice = {
      ...rest,
      ...(sunnahRate == null ? {} : { sunnahRate }),
      days: practiceDays.map(practiceDayV2),
      ...(since ? { since } : {}),
    };
  }
  if (v1.reading) {
    const { lastReadAt, khatmah, ...rest } = v1.reading;
    out.reading = {
      ...rest,
      ...(lastReadAt == null ? {} : { lastReadAt }),
      ...(khatmah ? { khatmah: { ...khatmah } } : {}),
    };
  }
  if (v1.hijri) out.hijri = { ...v1.hijri };
  if (v1.hijriDays?.length) out.hijriDays = v1.hijriDays.map(h => ({ ...h }));
  if (v1.tasbih) out.tasbih = { ...v1.tasbih };
  return out;
}

// ── Back to v1, the way the widgets will ─────────────────────────────────

/** Local midnight → 'HH:mm', canonical 24-hour, as v1 carried every time. */
export function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(
    m % 60,
  ).padStart(2, '0')}`;
}

/** `time` and, when it reads differently, `display` — the v1 pair. */
export function timePair(
  minutes: number | null | undefined,
  clock: WidgetContractClock,
): { time: string; display?: string } {
  if (minutes == null) return { time: NO_TIME };
  const time = hhmm(minutes);
  const display = formatContractMinutes(minutes, clock);
  return display === time ? { time } : { time, display };
}

function rowV1(
  row: WidgetContractRow,
  clock: WidgetContractClock,
): WidgetPrayerRow {
  return {
    key: row.key,
    ...timePair(row.minutes, clock),
    // The number the renderers place a time by (step 1.7) — no native code
    // parses `time` back any more.
    ...(row.minutes != null ? { minutes: row.minutes } : {}),
    abbr: row.abbr ?? '',
    name: row.name ?? '',
  };
}

type Event = { row: WidgetContractRow; at: number };

/** Every time on a day, placed `offset` minutes from today's midnight. */
function eventsOf(day: WidgetContractDay, offset: number): Event[] {
  const rows = [
    ...day.prayers,
    ...(day.sunrise ? [day.sunrise] : []),
    ...(day.extras ?? []),
  ];
  return rows
    .filter(r => r.minutes != null)
    .map(r => ({ row: r, at: offset + (r.minutes as number) }));
}

function earliest(events: Event[]): Event | null {
  let best: Event | null = null;
  for (const e of events) if (!best || e.at < best.at) best = e;
  return best;
}

export type WidgetNow = {
  /** The device's local date, YYYY-MM-DD. */
  todayKey: string;
  /** Minutes since the device's local midnight. */
  nowMinutes: number;
};

/**
 * The v1 payload a v2 payload stands for, at the moment `now` — or null
 * when it has no days at all, and the caller should read v1 instead.
 *
 * The reference for the native adapters (WidgetPayloadV1.swift,
 * WidgetPayloadV1.kt), which hand the widgets' existing renderers the shape
 * they already draw. Wall clock throughout, so the answer is the same in
 * every time zone. The rules are `buildWidgetPayload`'s:
 *
 *   - "today" is the day whose date is the device's; the day shown is today
 *     while any of its times is still ahead, else the day after;
 *   - "next" is the earliest of today's times still ahead and all of the
 *     next day's — or, when the next day is an estimate, its Fajr.
 */
/**
 * WHERE THE DAYS STAND AT A MOMENT — the one rule every reader of `days`
 * uses, the widgets' adapter and the Live Activity's alike:
 *
 *   - "today" is the day whose date is the device's; written before today
 *     (the app has not run since) or after it (a clock set back), the
 *     first day not yet past, and if it is a later day everything on it is
 *     still ahead (`now` is then -1);
 *   - the day shown is today while any of its times is still ahead, else
 *     the day after;
 *   - "next" is the earliest of today's times still ahead and all of the
 *     next day's — or, when the next day is an estimate, its Fajr. Its `at`
 *     counts minutes from today's midnight, past 1440 for tomorrow.
 *
 * Null when there are no days at all.
 */
export type WidgetMoment = {
  today: WidgetContractDay;
  todayIndex: number;
  tomorrow?: WidgetContractDay;
  shown: WidgetContractDay;
  /** Minutes since today's midnight; -1 when today is a later day. */
  now: number;
  next: { row: WidgetContractRow; at: number } | null;
};

export function widgetMoment(
  days: WidgetContractDay[],
  { todayKey, nowMinutes }: WidgetNow,
): WidgetMoment | null {
  if (days.length === 0) return null;
  let todayIndex = days.findIndex(d => d.dateKey === todayKey);
  let now = nowMinutes;
  if (todayIndex < 0) {
    todayIndex = days.findIndex(d => d.dateKey > todayKey);
    if (todayIndex < 0) todayIndex = days.length - 1;
    else now = -1;
  }
  const today = days[todayIndex];
  const tomorrow: WidgetContractDay | undefined = days[todayIndex + 1];

  const ahead = eventsOf(today, 0).filter(e => e.at > now);
  const shown = ahead.length > 0 || !tomorrow ? today : tomorrow;

  let next: Event | null;
  if (tomorrow?.estimated) {
    next =
      earliest(ahead) ??
      earliest(eventsOf(tomorrow, 1440).filter(e => e.row.key === 'Fajr'));
  } else {
    next = earliest([...ahead, ...(tomorrow ? eventsOf(tomorrow, 1440) : [])]);
  }
  return { today, todayIndex, tomorrow, shown, now, next };
}

/**
 * The event most recently passed at `now` — the start of the Live
 * Activity's progress bar. Today's times, and a time that reads as still
 * ahead taken as yesterday's (`at` - 1440), the rule both Live Activities
 * used on the app's own timings: just after midnight the last thing that
 * happened was last night's ʿIshāʾ. Null before anything has.
 */
export function widgetPrevious(
  moment: WidgetMoment,
): { row: WidgetContractRow; at: number } | null {
  let best: Event | null = null;
  for (const e of eventsOf(moment.today, 0)) {
    const at = e.at > moment.now ? e.at - 1440 : e.at;
    if (at <= moment.now && (!best || at > best.at)) best = { row: e.row, at };
  }
  return best;
}

export function widgetPayloadV1FromV2(
  v2: WidgetContractPayload,
  now: WidgetNow,
): WidgetPrayerPayload | null {
  const clock: WidgetContractClock = v2.clock ?? { hour12: false };
  const days = v2.days;
  // No days, nothing to draw a prayer card from: the caller reads v1.
  const moment = widgetMoment(days, now);
  if (!moment) return null;
  const { shown, next } = moment;

  const shownRows = rowsOf(shown, clock);
  const out: WidgetPrayerPayload = {
    dayLabel: shown.label ?? '',
    rows: shownRows.rows,
    ...(shownRows.sunriseRow ? { sunriseRow: shownRows.sunriseRow } : {}),
    ...(shownRows.extraRows ? { extraRows: shownRows.extraRows } : {}),
    nextKey: next ? next.row.key : null,
    ...(next
      ? {
          nextPrayerName: next.row.name ?? '',
          ...(() => {
            const pair = timePair(next.at, clock);
            return {
              nextPrayerTime: pair.time,
              ...(pair.display ? { nextPrayerDisplay: pair.display } : {}),
            };
          })(),
        }
      : {}),
    ...(v2.locationName ? { locationName: v2.locationName } : {}),
    ...(v2.language ? { language: v2.language } : {}),
    ...(v2.seasonal
      ? {
          seasonal: {
            jumuah: v2.seasonal.jumuah ?? false,
            ramadan: v2.seasonal.ramadan ?? false,
            eid: v2.seasonal.eid ?? null,
          },
        }
      : {}),
    days: days
      .filter(d => !d.estimated)
      .map(d => {
        const r = rowsOf(d, clock);
        return {
          dateKey: d.dateKey,
          dayLabel: d.label ?? '',
          rows: r.rows,
          ...(r.sunriseRow ? { sunriseRow: r.sunriseRow } : {}),
          ...(r.extraRows ? { extraRows: r.extraRows } : {}),
        };
      }),
  };
  if (v2.today) {
    out.today = {
      dateKey: v2.today.dateKey,
      logged: v2.today.logged ?? 0,
      loggable: v2.today.loggable ?? 0,
      owed: v2.today.owed ?? 0,
      prayers: (v2.today.prayers ?? []).map(p => ({
        key: p.key as WidgetTodayPrayerKey,
        name: p.name ?? '',
        ...timePair(p.minutes, clock),
        ...(p.minutes != null ? { minutes: p.minutes } : {}),
        status: p.status ?? null,
        due: p.due ?? false,
      })),
    };
  }
  if (v2.practice) {
    const p = v2.practice;
    out.practice = {
      streak: p.streak ?? 0,
      bestStreak: p.bestStreak ?? 0,
      loggedToday: p.loggedToday ?? 0,
      owed: p.owed ?? 0,
      sunnahRate: p.sunnahRate ?? null,
      fastsThisMonth: p.fastsThisMonth ?? 0,
      days: (p.days ?? []).map(d => ({
        d: d.d,
        // Written only because the iOS decoder requires it. Every renderer
        // reads `kw` first, and `kw` is absent only when the score is 0.
        k: 0,
        ...(d.kw ? { kw: d.kw } : {}),
        ...(d.l ? { l: d.l } : {}),
        ...(d.m ? { m: true as const } : {}),
        ...(d.f ? { f: true as const } : {}),
        ...(d.s ? { s: d.s } : {}),
      })),
      ...(p.since ? { since: p.since } : {}),
    };
  }
  if (v2.reading) {
    const r = v2.reading;
    out.reading = {
      surah: r.surah ?? 1,
      surahName: r.surahName ?? '',
      ayah: r.ayah ?? 1,
      page: r.page ?? 1,
      juz: r.juz ?? 1,
      pagesRead: r.pagesRead ?? 0,
      totalPages: r.totalPages ?? 604,
      bookmarks: r.bookmarks ?? 0,
      lastReadAt: r.lastReadAt ?? null,
      mode: r.mode ?? 'translation',
      ...(r.khatmah
        ? {
            khatmah: {
              day: r.khatmah.day ?? 1,
              targetDays: r.khatmah.targetDays ?? 0,
              pagesToday: r.khatmah.pagesToday ?? 0,
              doneToday: r.khatmah.doneToday ?? 0,
              behindBy: r.khatmah.behindBy ?? 0,
              daysLeft: r.khatmah.daysLeft ?? 0,
              ...(r.khatmah.skipped ? { skipped: r.khatmah.skipped } : {}),
            },
          }
        : {}),
      started: r.started ?? false,
      downloaded: r.downloaded ?? false,
    };
  }
  // The day being drawn's own date — the widget may have rolled past
  // midnight since the app built it. The single `hijri` only for a payload
  // from an app that wrote no list; past the list's week, no date rather
  // than a wrong one.
  const h = v2.hijriDays?.length
    ? v2.hijriDays.find(d => d.dateKey === now.todayKey)
    : v2.hijri;
  if (h) {
    out.hijri = {
      day: h.day,
      month: h.month,
      year: h.year,
      monthName: h.monthName ?? '',
      label: h.label ?? '',
      nextMonthName: h.nextMonthName ?? '',
      nextMonthInDays: h.nextMonthInDays ?? 0,
    };
  }
  if (v2.tasbih) {
    const t = v2.tasbih;
    out.tasbih = {
      presetId: t.presetId ?? '',
      label: t.label ?? '',
      arabic: t.arabic ?? '',
      count: t.count ?? 0,
      target: t.target ?? 0,
      unbounded: t.unbounded ?? false,
      index: t.index ?? 0,
      total: t.total ?? 0,
      counts: t.counts ?? [],
      labels: t.labels ?? [],
      targets: t.targets ?? [],
      unboundedFlags: t.unboundedFlags ?? [],
      todayTotal: t.todayTotal ?? 0,
      todayRounds: t.todayRounds ?? 0,
    };
  }
  return out;
}

function rowsOf(
  day: WidgetContractDay,
  clock: WidgetContractClock,
): {
  rows: WidgetPrayerRow[];
  sunriseRow?: WidgetPrayerRow;
  extraRows?: WidgetPrayerRow[];
} {
  const extras = (day.extras ?? []).map(r => rowV1(r, clock));
  return {
    rows: day.prayers.map(r => rowV1(r, clock)),
    ...(day.sunrise ? { sunriseRow: rowV1(day.sunrise, clock) } : {}),
    ...(extras.length > 0 ? { extraRows: extras } : {}),
  };
}
