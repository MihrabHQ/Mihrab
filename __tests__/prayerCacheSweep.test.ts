/**
 * The cache's launch sweep and its size cap.
 *
 * A slot is found by the key built from its parameters, and the key has
 * grown over versions (2.32 added the preferences part; the method
 * revisions and the correction list in force followed). A slot under a key
 * no longer built is never read again but was carried in every read and
 * write of the blob for ever. Once per launch those are dropped, with the
 * retired datasets' city files; and a write never leaves the blob over the
 * cap — the locations touched longest ago go first.
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
  getAllKeys: jest.fn(async () => Object.keys(mockStore)),
  multiRemove: jest.fn(async (ks: string[]) => {
    for (const k of ks) delete mockStore[k];
  }),
}));
jest.mock('../src/providers/fetchPrayerTimes', () => ({
  fetchPrayerTimesUnified: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import {
  CACHE_MAX_CHARS,
  CACHE_SCHEMA_VERSION,
  _resetCacheSweepForTests,
  getCachedPrayerTimes,
  getOrFetchPrayerTimes,
  refreshPrayerDataCache,
} from '../src/prayer/prayerStorage';
import { _resetMethodCurrencyForTests } from '../src/providers/methodCurrency';
import {
  correctionsKey,
  _resetCorrectionsForTests,
} from '../src/providers/swedenCorrections';
import {
  _resetCalculationPreferencesForTests,
  setCalculationPreferences,
} from '../src/prayer/calculationPreferences';

const V2 = 'prayer_times_cache.v2';
const T = {
  Fajr: '04:10',
  Sunrise: '06:00',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '19:30',
};
const DAY = new Date(2026, 9, 17);
const LONDON = {
  provider: 'aladhan' as const,
  latitude: 51.5,
  longitude: -0.12,
  calculationMethod: 3,
  school: 0,
};
const ISTANBUL = {
  provider: 'diyanet' as const,
  latitude: 41.01,
  longitude: 28.98,
  calculationMethod: 'auto' as const,
  school: 0,
};

function slot(
  p: object,
  lastAccessedAt = '2026-10-17T00:00:00.000Z',
  days = 31,
) {
  const month: Record<string, typeof T> = {};
  for (let d = 1; d <= days; d++)
    month[`2026-10-${String(d).padStart(2, '0')}`] = T;
  return { ...p, months: { '2026-10': month }, lastAccessedAt };
}

const caches = () =>
  JSON.parse(mockStore[V2]).caches as Record<string, unknown>;

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  _resetCacheSweepForTests();
  _resetMethodCurrencyForTests();
  _resetCorrectionsForTests();
  _resetCalculationPreferencesForTests();
  jest.clearAllMocks();
  (fetchPrayerTimesUnified as jest.Mock).mockReset();
});

describe('the launch sweep', () => {
  it('keeps only the slots under keys the app still builds, and drops the retired datasets', async () => {
    const current31 = 'aladhan|51.50|-0.12|3|0'; // 2.31: no preferences part
    const current = 'aladhan|51.50|-0.12|3|0|'; // 2.32 on: empty at the defaults
    const otherRule = 'aladhan|51.50|-0.12|3|0|hl=middle_of_night'; // a choice, kept
    const diyanetNow = `diyanet|41.01|28.98|auto|0||cm=3|cl=${correctionsKey(
      'diyanet',
    )}`;
    const diyanetOldList = 'diyanet|41.01|28.98|auto|0||cm=3|cl=2026-01-01#3';
    const diyanetOldRevision = `diyanet|41.01|28.98|auto|0||cm=2|cl=${correctionsKey(
      'diyanet',
    )}`;
    mockStore[V2] = JSON.stringify({
      caches: {
        [current31]: slot(LONDON),
        [current]: slot(LONDON),
        [otherRule]: slot(LONDON),
        [diyanetNow]: slot(ISTANBUL),
        [diyanetOldList]: slot(ISTANBUL),
        [diyanetOldRevision]: slot(ISTANBUL),
        'broken|1': { nothing: true },
      },
    });
    mockStore['ifis.dataset.v1.city.12'] = '{}';
    mockStore['habous.dataset.v1.city.3'] = '{}';
    mockStore['marw.dataset.v1.city.7'] = '{}';
    mockStore['muis.dataset.v1.city.1'] = '{"kept":true}';

    expect(await getCachedPrayerTimes({ ...LONDON, date: DAY })).toEqual(T);

    expect(Object.keys(caches()).sort()).toEqual(
      [current, otherRule, diyanetNow].sort(),
    );
    expect(mockStore['ifis.dataset.v1.city.12']).toBeUndefined();
    expect(mockStore['habous.dataset.v1.city.3']).toBeUndefined();
    expect(mockStore['marw.dataset.v1.city.7']).toBeUndefined();
    expect(mockStore['muis.dataset.v1.city.1']).toBe('{"kept":true}');
    expect(mockStore['prayer_times_cache.schema']).toBe(
      String(CACHE_SCHEMA_VERSION),
    );
  });

  it('a slot for another high-latitude rule is kept while that rule is not the one in use', async () => {
    setCalculationPreferences({ highLatitudeRule: 'seventh_of_night' });
    const theirs = 'aladhan|51.50|-0.12|3|0|';
    mockStore[V2] = JSON.stringify({ caches: { [theirs]: slot(LONDON) } });
    await getCachedPrayerTimes({ ...LONDON, date: DAY });
    expect(Object.keys(caches())).toEqual([theirs]);
  });

  it('runs once a launch, and the datasets once a schema', async () => {
    mockStore[V2] = JSON.stringify({
      caches: { 'aladhan|51.50|-0.12|3|0|': slot(LONDON) },
    });
    mockStore['prayer_times_cache.schema'] = String(CACHE_SCHEMA_VERSION);
    mockStore['ifis.dataset.v1.city.12'] = '{}';
    await getCachedPrayerTimes({ ...LONDON, date: DAY });
    // Already at this schema: the datasets were swept by an earlier launch.
    expect(mockStore['ifis.dataset.v1.city.12']).toBe('{}');
    expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled();

    // A stale slot appearing later in the same launch is the next launch's.
    const stale = JSON.parse(mockStore[V2]);
    stale.caches['aladhan|51.50|-0.12|3|0'] = slot(LONDON);
    mockStore[V2] = JSON.stringify(stale);
    await getCachedPrayerTimes({ ...LONDON, date: DAY });
    expect(Object.keys(caches())).toContain('aladhan|51.50|-0.12|3|0');
    _resetCacheSweepForTests();
    await getCachedPrayerTimes({ ...LONDON, date: DAY });
    expect(Object.keys(caches())).not.toContain('aladhan|51.50|-0.12|3|0');
  });
});

describe('the size cap', () => {
  it('a write that would pass the cap sheds the location accessed longest ago', async () => {
    // Enough locations, each a month, to pass the cap with one more.
    const perSlot = JSON.stringify(slot(LONDON)).length;
    const seeded: Record<string, unknown> = {};
    let n = 0;
    let size = '{"caches":{}}'.length;
    // Fill to within one location of the cap: the next one passes it.
    while (size < CACHE_MAX_CHARS - perSlot / 2) {
      const p = { ...LONDON, latitude: 10 + n / 10 };
      // n = 0 accessed longest ago, n = 1 next, …
      const at = new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
      const key = `aladhan|${p.latitude.toFixed(2)}|-0.12|3|0|`;
      seeded[key] = slot(p, at);
      size +=
        JSON.stringify(key).length + JSON.stringify(seeded[key]).length + 2;
      n += 1;
    }
    mockStore[V2] = JSON.stringify({ caches: seeded });
    expect(mockStore[V2].length).toBeLessThanOrEqual(CACHE_MAX_CHARS);

    (fetchPrayerTimesUnified as jest.Mock).mockResolvedValue({
      timings: T,
      source: 'aladhan',
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // A new location: a slot of its own, written.
    const PARIS = { ...LONDON, latitude: 48.86, longitude: 2.35 };
    // A month there passes the cap.
    await refreshPrayerDataCache(PARIS, 1);
    warn.mockRestore();

    expect(mockStore[V2].length).toBeLessThanOrEqual(CACHE_MAX_CHARS);
    const keys = Object.keys(caches());
    expect(keys).toContain('aladhan|48.86|2.35|3|0|');
    // The oldest-accessed went; the most recent ones stayed.
    expect(keys).not.toContain('aladhan|10.00|-0.12|3|0|');
    expect(keys).toContain(
      `aladhan|${(10 + (n - 1) / 10).toFixed(2)}|-0.12|3|0|`,
    );
  });

  it('a blob under the cap is written as it is', async () => {
    mockStore[V2] = JSON.stringify({
      caches: {
        'aladhan|10.00|-0.12|3|0|': slot(
          { ...LONDON, latitude: 10 },
          '2020-01-01T00:00:00.000Z',
        ),
      },
    });
    (fetchPrayerTimesUnified as jest.Mock).mockResolvedValue({
      timings: T,
      source: 'aladhan',
    });
    await getOrFetchPrayerTimes({ ...LONDON, date: DAY });
    await getCachedPrayerTimes({ ...LONDON, date: DAY });
    expect(Object.keys(caches()).sort()).toEqual(
      ['aladhan|10.00|-0.12|3|0|', 'aladhan|51.50|-0.12|3|0|'].sort(),
    );
  });
});
