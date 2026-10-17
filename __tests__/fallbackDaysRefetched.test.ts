/**
 * A day stored from the phone's own calculation because the provider
 * missed it is not kept for good.
 *
 * `fetchWithLocalLastResort` falls to the on-device answer when the
 * provider cannot be reached, and the day is stored like any other — after
 * which nothing asked for it again: the fill skips days it has, and the
 * Today card reads the cache first. Such days are now marked beside the
 * months (the TimingsMap readers see is untouched), asked again once the
 * phone is online, replaced by the provider's answer and unmarked.
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

let mockOnline = false;
const mockProvider = {
  Fajr: '05:55',
  Sunrise: '07:30',
  Dhuhr: '12:45',
  Asr: '15:20',
  Maghrib: '17:58',
  Isha: '19:40',
};
const mockLocal = {
  Fajr: '05:50',
  Sunrise: '07:31',
  Dhuhr: '12:44',
  Asr: '15:19',
  Maghrib: '17:59',
  Isha: '19:45',
};
jest.mock('../src/providers/fetchPrayerTimes', () => ({
  fetchPrayerTimesUnified: jest.fn(async (p: { offline?: boolean }) => {
    if (p.offline) return { timings: { ...mockLocal }, source: 'local' };
    if (!mockOnline) throw new Error('offline');
    return { timings: { ...mockProvider }, source: 'aladhan' };
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import {
  getCachedPrayerTimes,
  getOrFetchPrayerTimes,
  refetchFallbackDays,
  refreshPrayerDataCache,
} from '../src/prayer/prayerStorage';
import { formatLocalDate } from '../src/utils/date';

const LONDON = {
  provider: 'aladhan' as const,
  latitude: 51.5,
  longitude: -0.12,
  calculationMethod: 3,
  school: 0,
};

const entry = () => {
  const caches = JSON.parse(mockStore['prayer_times_cache.v2']).caches;
  return caches[Object.keys(caches)[0]];
};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockOnline = false;
  (fetchPrayerTimesUnified as jest.Mock).mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('an offline fill is marked; online, the marked days are replaced by the provider and unmarked', async () => {
  const today = new Date();
  await refreshPrayerDataCache(LONDON, 1);
  const marked: string[] = entry().fallbackDays;
  expect(marked).toContain(formatLocalDate(today));
  // The days readers see are plain TimingsMaps.
  const stored = await getCachedPrayerTimes({ ...LONDON, date: today });
  expect(stored).toEqual(mockLocal);
  expect(Object.keys(stored!)).not.toContain('_fallback');

  // Still offline: nothing replaced, nothing unmarked.
  expect(await refetchFallbackDays(LONDON)).toBe(0);
  expect(entry().fallbackDays).toEqual(marked);

  mockOnline = true;
  const replaced = await refetchFallbackDays(LONDON);
  expect(replaced).toBe(marked.length);
  expect(await getCachedPrayerTimes({ ...LONDON, date: today })).toEqual(
    mockProvider,
  );
  expect(entry().fallbackDays).toBeUndefined();
});

test('a few at a time: a bounded run leaves the rest marked for the next', async () => {
  await refreshPrayerDataCache(LONDON, 1);
  const before: string[] = entry().fallbackDays;
  mockOnline = true;
  expect(await refetchFallbackDays(LONDON, 4)).toBe(4);
  const after: string[] = entry().fallbackDays;
  expect(after).toHaveLength(before.length - 4);
  // Today onwards went first.
  const today = formatLocalDate(new Date());
  expect(after).not.toContain(today);
});

test('a single day the provider missed is marked, and one it answered later is not', async () => {
  const day = new Date(2026, 9, 20);
  expect(await getOrFetchPrayerTimes({ ...LONDON, date: day })).toEqual(
    mockLocal,
  );
  await getCachedPrayerTimes({ ...LONDON, date: day }); // the write has landed
  expect(entry().fallbackDays).toEqual(['2026-10-20']);

  mockOnline = true;
  const other = new Date(2026, 9, 21);
  await getOrFetchPrayerTimes({ ...LONDON, date: other });
  await getCachedPrayerTimes({ ...LONDON, date: other });
  expect(entry().fallbackDays).toEqual(['2026-10-20']);

  await refetchFallbackDays(LONDON);
  expect(await getCachedPrayerTimes({ ...LONDON, date: day })).toEqual(
    mockProvider,
  );
  expect(entry().fallbackDays).toBeUndefined();
});
