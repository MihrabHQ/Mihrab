/**
 * Widget payloads as the app really builds them, for the moments that
 * matter: midday, after ʿIshāʾ with and without tomorrow's times, before
 * dawn with the night marks on, a place where ʿIshāʾ does not occur, both
 * clocks. Each comes back as the v1 payload the app writes, the v2 payload
 * derived from it, and the wall-clock moment it was built at.
 *
 * Used twice: `widgetPayloadV2.test.ts` checks that turning v2 back into v1
 * gives the app's own v1, and `cases.ts` records that answer so the Swift
 * and Kotlin adapters are held to it.
 */
import i18n from '../src/i18n';
import {
  buildWidgetPayload,
  type WidgetPrayerPayload,
} from '../src/widget/buildWidgetPayload';
import type { WidgetExtras } from '../src/widget/widgetBlocks';
import type { WidgetContractPayload } from '../src/widget/contract.generated';
import {
  widgetPayloadV2FromV1,
  type WidgetNow,
} from '../src/widget/widgetPayloadV2';
import { contractClock, contractDateKey } from '../src/widget/wallClock';
import {
  _resetActiveClock,
  activeClock,
  setActiveClockFormat,
} from '../src/utils/activeClock';
import type { TimingsMap } from '../src/types/prayer';

export type WidgetScenario = {
  name: string;
  /** English only, so the recorded fixture does not move with ICU data. */
  fixture: boolean;
  v1: WidgetPrayerPayload;
  v2: WidgetContractPayload;
  now: WidgetNow;
};

const DAY: TimingsMap = {
  Fajr: '05:12',
  Sunrise: '07:05',
  Dhuhr: '12:32',
  Asr: '15:50',
  Maghrib: '18:35',
  Isha: '20:15',
};

const shift = (t: TimingsMap, minutes: number): TimingsMap =>
  Object.fromEntries(
    Object.entries(t).map(([k, v]) => {
      const [h, m] = v.split(':').map(Number);
      const total = (h * 60 + m + minutes + 1440) % 1440;
      return [
        k,
        `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
          total % 60,
        ).padStart(2, '0')}`,
      ];
    }),
  ) as TimingsMap;

const WEEK: TimingsMap[] = [DAY, shift(DAY, 2), shift(DAY, 4)];

const NIGHT: TimingsMap = {
  ...DAY,
  Midnight: '00:40',
  Lastthird: '02:55',
  // After the midnight that ends the day: the rule `eventAt` applies.
  Firstthird: '00:05',
};

const EXTRAS: WidgetExtras = {
  today: {
    dateKey: '2026-04-09',
    logged: 2,
    loggable: 5,
    owed: 1,
    prayers: [
      {
        key: 'Fajr',
        name: 'Fajr',
        time: '05:12',
        status: 'on-time',
        due: true,
      },
      {
        key: 'Dhuhr',
        name: 'Dhuhr',
        time: '12:32',
        status: 'missed',
        due: true,
      },
      { key: 'Asr', name: 'Asr', time: '15:50', status: null, due: false },
      {
        key: 'Maghrib',
        name: 'Maghrib',
        time: '18:35',
        status: null,
        due: false,
      },
      { key: 'Isha', name: 'Isha', time: '—', status: null, due: false },
    ],
  },
  practice: {
    streak: 3,
    bestStreak: 9,
    loggedToday: 2,
    owed: 4,
    sunnahRate: 0.5,
    fastsThisMonth: 2,
    days: [
      { d: '2026-04-07', k: 5, kw: 500, l: 5, s: 2 },
      { d: '2026-04-08', k: 0, l: 1, m: true },
      { d: '2026-04-09', k: 1, kw: 145, l: 2, m: true, f: true },
    ],
    since: '2025-11-02',
  },
  reading: {
    surah: 2,
    surahName: 'Al-Baqarah',
    ayah: 255,
    page: 42,
    juz: 3,
    pagesRead: 41,
    totalPages: 604,
    bookmarks: 1,
    lastReadAt: null,
    mode: 'translation',
    started: true,
    downloaded: false,
  },
  hijri: {
    day: 21,
    month: 10,
    year: 1447,
    monthName: 'Shawwal',
    label: '21 Shawwal 1447',
    nextMonthName: 'Dhu al-Qadah',
    nextMonthInDays: 9,
  },
  tasbih: {
    presetId: 'subhanallah',
    label: 'SubhanAllah',
    arabic: 'سبحان الله',
    count: 0,
    target: 33,
    unbounded: false,
    index: 0,
    total: 1,
    counts: [0],
    labels: ['SubhanAllah'],
    targets: [33],
    unboundedFlags: [false],
    todayTotal: 0,
    todayRounds: 0,
  },
};

type Spec = {
  name: string;
  language: string;
  clock: '12' | '24';
  at: [number, number];
  week?: TimingsMap[];
  today?: TimingsMap;
  tomorrow?: TimingsMap | null;
  extras?: WidgetExtras;
  seasonal?: WidgetPrayerPayload['seasonal'];
  location?: string;
};

const SPECS: Spec[] = [
  {
    name: 'midday, 24-hour',
    language: 'en',
    clock: '24',
    at: [13, 0],
    week: WEEK,
  },
  {
    name: 'midday, 12-hour, every block',
    language: 'en',
    clock: '12',
    at: [13, 0],
    week: WEEK,
    extras: EXTRAS,
    seasonal: { jumuah: true, ramadan: false, eid: null },
    location: 'Malmö',
  },
  {
    name: 'on the minute of a prayer',
    language: 'en',
    clock: '24',
    at: [12, 32],
    week: WEEK,
  },
  {
    name: 'after ʿIshāʾ, tomorrow known',
    language: 'en',
    clock: '24',
    at: [22, 0],
    week: WEEK,
  },
  {
    name: 'after ʿIshāʾ, tomorrow unknown',
    language: 'en',
    clock: '12',
    at: [22, 0],
    today: DAY,
    tomorrow: null,
  },
  {
    name: 'before dawn, night marks on',
    language: 'en',
    clock: '12',
    at: [1, 0],
    week: [NIGHT, shift(NIGHT, 2), shift(NIGHT, 4)],
  },
  {
    name: 'late evening, the First Third after midnight is next',
    language: 'en',
    clock: '24',
    at: [23, 50],
    week: [NIGHT, shift(NIGHT, 2)],
  },
  {
    name: 'ʿIshāʾ does not occur here',
    language: 'en',
    clock: '24',
    at: [21, 0],
    week: [
      { ...DAY, Isha: undefined as unknown as string },
      { ...shift(DAY, 2), Isha: undefined as unknown as string },
    ].map(
      d =>
        Object.fromEntries(
          Object.entries(d).filter(([, v]) => v),
        ) as TimingsMap,
    ),
  },
  {
    name: 'Arabic, 12-hour, every block',
    language: 'ar',
    clock: '12',
    at: [9, 30],
    week: WEEK,
    extras: EXTRAS,
    seasonal: { jumuah: false, ramadan: true, eid: 'fitr' },
    location: 'الرباط',
  },
  {
    name: 'Swedish, 24-hour',
    language: 'sv',
    clock: '24',
    at: [16, 0],
    week: WEEK,
  },
];

/**
 * The Log Today block carries `display` beside `time` the way
 * `buildTodayBlock` writes it, for whichever clock is active.
 */
function withClock(extras: WidgetExtras | undefined): WidgetExtras | undefined {
  if (!extras?.today) return extras;
  const clock = activeClock();
  return {
    ...extras,
    today: {
      ...extras.today,
      prayers: extras.today.prayers.map(p => {
        if (p.time === '—') return p;
        const display = clock(p.time);
        return display === p.time ? p : { ...p, display };
      }),
    },
  };
}

/** Build every scenario. Leaves i18n and the clock as it found them. */
export async function widgetScenarios(): Promise<WidgetScenario[]> {
  const languageBefore = i18n.language;
  const out: WidgetScenario[] = [];
  try {
    for (const s of SPECS) {
      await i18n.changeLanguage(s.language);
      setActiveClockFormat(s.clock);
      const now = new Date(2026, 3, 9, s.at[0], s.at[1], 0, 0);
      const today = s.today ?? (s.week as TimingsMap[])[0];
      const tomorrow =
        s.tomorrow === null
          ? undefined
          : s.tomorrow ?? (s.week as TimingsMap[])[1];
      const v1 = buildWidgetPayload(
        today,
        tomorrow,
        now,
        s.location,
        undefined,
        s.seasonal,
        s.week,
        withClock(s.extras),
      );
      const clock = contractClock(activeClock().hour12, i18n.language);
      const v2 = widgetPayloadV2FromV1(v1, { clock, now });
      out.push({
        name: s.name,
        fixture: s.language === 'en',
        v1,
        v2,
        now: {
          todayKey: contractDateKey(now),
          nowMinutes: s.at[0] * 60 + s.at[1],
        },
      });
    }
  } finally {
    _resetActiveClock();
    await i18n.changeLanguage(languageBefore);
  }
  return out;
}
