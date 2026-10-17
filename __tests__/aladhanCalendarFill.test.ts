/**
 * AlAdhan's calendar for the year's fill.
 *
 * A year of AlAdhan times was ~365 requests, one a day, four at a time.
 * AlAdhan answers a whole month in one (`/v1/calendar/{year}/{month}`), so
 * the fill asks a month at once — with exactly the query a single day's
 * request sends — and checks every day as a single day's answer is
 * checked. A bad day in the month is not stored; it is asked on its own.
 */
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStore[k];
  }),
}));

const mockFetch = jest.fn();
jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: (...a: unknown[]) => mockFetch(...a),
}));

import { fetchAladhanCalendar } from '../src/providers/aladhan';
import {
  getCachedPrayerTimes,
  refreshPrayerDataCache,
} from '../src/prayer/prayerStorage';
import {
  _resetCalculationPreferencesForTests,
  setCalculationPreferences,
} from '../src/prayer/calculationPreferences';

const LONDON = {
  provider: 'aladhan' as const,
  latitude: 51.5,
  longitude: -0.12,
  calculationMethod: 3,
  school: 0,
};
const DAY = {
  Fajr: '05:12',
  Sunrise: '07:01',
  Dhuhr: '12:50',
  Asr: '15:40',
  Sunset: '18:38',
  Maghrib: '18:38',
  Isha: '20:20',
  Imsak: '05:02',
  Midnight: '00:50',
};
const SINGLE = { ...DAY, Fajr: '05:13' };

/** The month after the current one, and a day in it AlAdhan's calendar gets wrong. */
const now = new Date();
const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const BAD = `${String(10).padStart(2, '0')}-${String(
  next.getMonth() + 1,
).padStart(2, '0')}-${next.getFullYear()}`;

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

function calendar(year: number, month: number) {
  const dim = new Date(year, month, 0).getDate();
  const data = [];
  for (let d = 1; d <= dim; d++) {
    const date = `${String(d).padStart(2, '0')}-${String(month).padStart(
      2,
      '0',
    )}-${year}`;
    // The calendar writes each time with its zone after it.
    const timings: Record<string, string> = {};
    for (const [k, v] of Object.entries(DAY)) timings[k] = `${v} (BST)`;
    if (date === BAD) timings.Maghrib = '15:00 (BST)'; // before Asr
    data.push({
      timings,
      date: { gregorian: { date } },
      meta: { timezone: 'Europe/London' },
    });
  }
  return { code: 200, status: 'OK', data };
}

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  _resetCalculationPreferencesForTests();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    const cal = /\/v1\/calendar\/(\d{4})\/(\d{1,2})\?/.exec(url);
    if (cal) return ok(calendar(Number(cal[1]), Number(cal[2])));
    if (/\/v1\/timings\//.test(url)) {
      return ok({ code: 200, status: 'OK', data: { timings: SINGLE } });
    }
    throw new TypeError('Network request failed');
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const urls = () => mockFetch.mock.calls.map(c => String(c[0]));

test('a year for one place is twelve requests, and a bad day is asked on its own', async () => {
  await refreshPrayerDataCache(LONDON, 12);
  const calendars = urls().filter(u => u.includes('/v1/calendar/'));
  const singles = urls().filter(u => u.includes('/v1/timings/'));
  expect(calendars).toHaveLength(12);
  // The one day the calendar had wrong, and nothing else.
  expect(singles).toEqual([expect.stringContaining(`/v1/timings/${BAD}?`)]);

  // The same query a single day sends.
  for (const u of [calendars[0], singles[0]]) {
    const q = new URL(u).searchParams;
    expect(q.get('method')).toBe('3');
    expect(q.get('school')).toBe('0');
    expect(q.get('latitudeAdjustmentMethod')).toBe('3');
    expect(q.get('latitude')).toBe('51.5');
  }

  // Stored without the zone suffix, as the single-day endpoint writes them.
  const first = await getCachedPrayerTimes({ ...LONDON, date: now });
  expect(first).toEqual(DAY);
  // The bad day was not stored from the calendar.
  const bad = await getCachedPrayerTimes({
    ...LONDON,
    date: new Date(next.getFullYear(), next.getMonth(), 10),
  });
  expect(bad).toEqual(SINGLE);
});

test('a month that does not come leaves the rest to the day-by-day fill', async () => {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/v1/calendar/'))
      return { ok: false, status: 429, json: async () => ({}) };
    if (/\/v1\/timings\//.test(url))
      return ok({ code: 200, status: 'OK', data: { timings: SINGLE } });
    throw new TypeError('Network request failed');
  });
  await refreshPrayerDataCache(LONDON, 1);
  // One calendar asked, then day by day.
  expect(urls().filter(u => u.includes('/v1/calendar/'))).toHaveLength(1);
  expect(await getCachedPrayerTimes({ ...LONDON, date: now })).toEqual(SINGLE);
});

test('the calendar sends what the single day sends for Custom angles', async () => {
  setCalculationPreferences({ customFajrAngle: 16, customIshaAngle: 14 });
  await fetchAladhanCalendar({
    latitude: 1,
    longitude: 2,
    year: 2026,
    month: 10,
    method: 99,
    school: 1,
  });
  const q = new URL(urls()[0]).searchParams;
  expect(urls()[0]).toContain('/v1/calendar/2026/10?');
  expect(q.get('method')).toBe('99');
  expect(q.get('methodSettings')).toBe('16,null,14');
  expect(q.get('school')).toBe('1');
});

test('a method AlAdhan has no id for is asked as its nearest, as a single day is', async () => {
  await fetchAladhanCalendar({
    latitude: 59.33,
    longitude: 18.07,
    year: 2026,
    month: 10,
    method: 24,
    school: 0,
  });
  expect(new URL(urls()[0]).searchParams.get('method')).toBe('3');
});

test('a source computed on the phone is not asked of the calendar', async () => {
  await refreshPrayerDataCache(
    { ...LONDON, provider: 'diyanet', calculationMethod: 'auto' },
    1,
  );
  expect(urls().filter(u => u.includes('/v1/calendar/'))).toHaveLength(0);
});
