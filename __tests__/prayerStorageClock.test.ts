/**
 * The cache keeps the clock a day is written on.
 *
 * A saved Rabat from AlAdhan is written on Rabat's clock (`meta.timezone`);
 * stored as bare "HH:mm" and read back on the phone's, its alerts came at
 * the same digits in Stockholm. The slot now records the clock beside the
 * months — the TimingsMap every reader takes is untouched, and so is the
 * cache key — and a slot written before this reads as the phone's, as it
 * always did.
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

let mockOnline = true;
const mockRabat = {
  Fajr: '05:12',
  Sunrise: '06:38',
  Dhuhr: '12:20',
  Asr: '15:40',
  Maghrib: '18:01',
  Isha: '19:20',
};
const mockLocal = {
  Fajr: '07:10',
  Sunrise: '08:37',
  Dhuhr: '14:19',
  Asr: '17:39',
  Maghrib: '20:02',
  Isha: '21:21',
};
jest.mock('../src/providers/fetchPrayerTimes', () => ({
  fetchPrayerTimesUnified: jest.fn(async (p: { offline?: boolean }) => {
    if (p.offline)
      return { timings: { ...mockLocal }, source: 'local', clock: 'device' };
    if (!mockOnline) throw new Error('offline');
    return {
      timings: { ...mockRabat },
      timezone: 'Africa/Casablanca',
      source: 'aladhan',
      clock: 'Africa/Casablanca',
    };
  }),
}));

import {
  getCachedPrayerDaysMany,
  getCachedPrayerTimesMany,
  getOrFetchPrayerDay,
  getOrFetchPrayerTimes,
  refetchFallbackDays,
} from '../src/prayer/prayerStorage';
import { formatLocalDate } from '../src/utils/date';
import { addDays, eventAt } from '../src/utils/prayerTimes';

const RABAT = {
  provider: 'aladhan' as const,
  latitude: 34.02,
  longitude: -6.84,
  calculationMethod: 3,
  school: 0,
};

const slot = () => {
  const caches = JSON.parse(mockStore['prayer_times_cache.v2']).caches;
  return caches[Object.keys(caches)[0]];
};
/** Let the queued cache write land. */
const settle = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockOnline = true;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('a day round-trips through the cache with its clock, and the readers’ TimingsMap is unchanged', async () => {
  const day = new Date(2026, 9, 16);
  const fetched = await getOrFetchPrayerDay({ ...RABAT, date: day });
  expect(fetched).toEqual({ timings: mockRabat, clock: 'Africa/Casablanca' });
  await settle();

  const keysBefore = Object.keys(
    JSON.parse(mockStore['prayer_times_cache.v2']).caches,
  );
  expect(slot().clock).toBe('Africa/Casablanca');
  expect(slot().dayClocks).toBeUndefined();
  // The day as stored is the bare map: the widget reads it as it is.
  expect(slot().months['2026-10']['2026-10-16']).toEqual(mockRabat);

  const [cached] = await getCachedPrayerDaysMany(RABAT, [day]);
  expect(cached).toEqual({ timings: mockRabat, clock: 'Africa/Casablanca' });
  const [plain] = await getCachedPrayerTimesMany(RABAT, [day]);
  expect(plain).toEqual(mockRabat);
  // Answered from the cache, still with its clock.
  expect(await getOrFetchPrayerDay({ ...RABAT, date: day })).toEqual(cached);
  // The cache key is the one it always was.
  expect(
    Object.keys(JSON.parse(mockStore['prayer_times_cache.v2']).caches),
  ).toEqual(keysBefore);
});

test('a day the phone stood in for is kept on its own clock beside a slot on the place’s', async () => {
  const day = new Date(2026, 9, 16);
  await getOrFetchPrayerDay({ ...RABAT, date: day });
  await settle();
  mockOnline = false;
  const other = addDays(day, 1);
  const standIn = await getOrFetchPrayerDay({ ...RABAT, date: other });
  expect(standIn.clock).toBe('device');
  await settle();
  const key = formatLocalDate(other);
  expect(slot().clock).toBe('Africa/Casablanca');
  // Kept on the zone the phone was in, not on "the phone's clock": read
  // after a flight, the stand-in still names the clock it was written on.
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  expect(slot().dayClocks).toEqual({ [key]: here });
  const [a, b] = await getCachedPrayerDaysMany(RABAT, [day, other]);
  expect(a?.clock).toBe('Africa/Casablanca');
  expect(b?.clock).toBe(here);

  // Online again, the provider replaces the stand-in, and its clock goes
  // back to the slot's.
  mockOnline = true;
  await refetchFallbackDays(RABAT);
  await settle();
  expect(slot().dayClocks).toBeUndefined();
  const [, again] = await getCachedPrayerDaysMany(RABAT, [day, other]);
  expect(again).toEqual({ timings: mockRabat, clock: 'Africa/Casablanca' });
});

test('a slot written before clocks were kept reads as the phone’s, as before', async () => {
  const day = new Date(2026, 9, 16);
  // Seed the cache through the API, then strip the clock to look like an
  // entry from an older version.
  await getOrFetchPrayerTimes({ ...RABAT, date: day });
  await settle();
  const v2 = JSON.parse(mockStore['prayer_times_cache.v2']);
  for (const k of Object.keys(v2.caches)) {
    delete v2.caches[k].clock;
    delete v2.caches[k].dayClocks;
  }
  mockStore['prayer_times_cache.v2'] = JSON.stringify(v2);
  // A fresh module, so nothing is remembered of the write above.
  jest.resetModules();
  const fresh = require('../src/prayer/prayerStorage');

  const [old] = await fresh.getCachedPrayerDaysMany(RABAT, [day]);
  expect(old).toEqual({ timings: mockRabat, clock: 'device' });
  // Read on the phone's clock: exactly the instant it always was.
  expect(eventAt('Fajr', old.timings, day, old.clock).getTime()).toBe(
    new Date(2026, 9, 16, 5, 12).getTime(),
  );

  // A day added to it now: the old days stay the phone's, and the new one
  // keeps its own clock beside them.
  const next = addDays(day, 1);
  await fresh.getOrFetchPrayerDay({ ...RABAT, date: next });
  await settle();
  const entry = slot();
  expect(entry.clock).toBeUndefined();
  expect(entry.dayClocks).toEqual({
    [formatLocalDate(next)]: 'Africa/Casablanca',
  });
  const [a, b] = await fresh.getCachedPrayerDaysMany(RABAT, [day, next]);
  expect(a.clock).toBe('device');
  expect(b.clock).toBe('Africa/Casablanca');
});
