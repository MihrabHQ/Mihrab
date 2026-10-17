/**
 * SCENARIO 10 — the phone's storage is full, or will not answer.
 *
 * Today must still show times when the cache cannot be written; the cache
 * must make room for the place on screen at the expense of the places
 * touched longest ago, and never grow past its cap; a settings save that
 * fails must not wedge the saves after it; and a settings read that fails
 * at launch must not hand out the defaults to be saved over everything the
 * reader had — their preferences, their coordinates, their saved places.
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { isQuotaError, CACHE_MAX_CHARS } from '../../src/prayer/prayerStorage';
import {
  loadSettings,
  saveSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import {
  changeSettings,
  expectDrawableDay,
  goOffline,
  mountPrayerDay,
  readCacheBlob,
  setZone,
  settle,
  until,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.setTimeout(30_000);
const NOW = new Date('2026-10-17T10:00:00Z');
const CACHE_KEY = 'prayer_times_cache.v2';
const SETTINGS_KEY = 'prayerapp.settings.v1';

type Store = {
  setItem: typeof AsyncStorage.setItem;
  getItem: typeof AsyncStorage.getItem;
};
const store = AsyncStorage as unknown as Store;
const realSet = store.setItem;
const realGet = store.getItem;

/** setItem refuses `key` (all keys when omitted) with `error`, while `when()` holds. */
function refuseWrites(
  error: Error,
  key?: string,
  when: (value: string) => boolean = () => true,
) {
  const calls: string[] = [];
  store.setItem = jest.fn(async (k: string, v: string) => {
    if ((!key || k === key) && when(v)) {
      calls.push(k);
      throw error;
    }
    return realSet(k, v);
  }) as unknown as Store['setItem'];
  return calls;
}

const quota = () =>
  Object.assign(new Error('QuotaExceededError: The quota has been exceeded.'), {
    name: 'QuotaExceededError',
  });

beforeEach(async () => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'performance',
      'setImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'nextTick',
      'queueMicrotask',
    ],
  });
  setZone('Europe/Berlin');
  store.setItem = realSet;
  store.getItem = realGet;
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  _resetSettingsStorageForTests();
  _resetTimezoneShiftForTests();
  _resetMethodCurrencyForTests();
  prayerStorage._resetCacheSweepForTests();
  (NetInfo.addEventListener as jest.Mock).mockImplementation(() => () => {});
  jest.spyOn(prayerStorage, 'refreshPrayerDataCache').mockResolvedValue();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  goOffline();
});
afterEach(() => {
  store.setItem = realSet;
  store.getItem = realGet;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('what counts as "full"', () => {
  it.each([
    ['web', quota()],
    [
      'iOS',
      new Error(
        'Error Domain=NSCocoaErrorDomain Code=640 "No space left on device"',
      ),
    ],
    ['Android', new Error('database or disk is full (code 13 SQLITE_FULL)')],
    [
      'Android, by class',
      Object.assign(new Error('x'), { name: 'SQLiteFullException' }),
    ],
  ])('%s', (_l, e) => expect(isQuotaError(e)).toBe(true));
  it('and what does not', () => {
    expect(isQuotaError(new Error('Network request failed'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

it('a full disk: Today still shows the week, and nothing throws', async () => {
  let s = await loadSettings();
  s = await changeSettings(s, {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationMode: 'manual',
    manualLatitude: 52.52,
    manualLongitude: 13.405,
    dataProvider: 'local_adhan',
    dataProviderAuto: false,
    calculationMethod: 3,
  });
  const refused = refuseWrites(quota(), CACHE_KEY);
  const probe = await mountPrayerDay(s);
  await until(
    () => probe.states.some(x => x.phase === 'ready' && !x.provisional),
    'a settled week',
  );
  await settle(10);
  const st = probe.current();
  if (st.phase !== 'ready') throw new Error('not ready');
  expect(st.week.length).toBeGreaterThanOrEqual(7);
  st.week.forEach(expectDrawableDay);
  expect(refused.length).toBeGreaterThan(0);
  expect(await realGet(CACHE_KEY)).toBeNull();
  probe.unmount();
});

describe('making room', () => {
  const at = (lat: number) => ({
    provider: 'local_adhan' as const,
    latitude: lat,
    longitude: 13.4,
    calculationMethod: 3,
    school: 0,
  });
  /** A year for a place, as the cache holds it. */
  function year(lat: number, accessed: string) {
    const months: Record<string, Record<string, Record<string, string>>> = {};
    for (let m = 1; m <= 12; m++) {
      const mk = `2027-${String(m).padStart(2, '0')}`;
      months[mk] = {};
      for (let d = 1; d <= 28; d++) {
        months[mk][`${mk}-${String(d).padStart(2, '0')}`] = {
          Imsak: '05:00',
          Fajr: '05:10',
          Sunrise: '07:00',
          Dhuhr: '12:30',
          Asr: '15:00',
          Maghrib: '18:00',
          Isha: '19:30',
          Midnight: '00:15',
        };
      }
    }
    return { ...at(lat), months, lastAccessedAt: accessed };
  }
  const keyOf = (lat: number) => `local_adhan|${lat.toFixed(2)}|13.40|3|0|`;

  it('over the cap, the places touched longest ago go first; the one on screen stays', async () => {
    const caches: Record<string, unknown> = {};
    // Thirty places, oldest access first.
    for (let i = 0; i < 30; i++)
      caches[keyOf(40 + i)] = year(
        40 + i,
        new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      );
    const big = JSON.stringify({ caches });
    expect(big.length).toBeGreaterThan(CACHE_MAX_CHARS);
    await realSet(CACHE_KEY, big);

    // A read and a write for the OLDEST place: it is the one on screen.
    const day = await prayerStorage.getOrFetchPrayerDay({
      ...at(40),
      date: new Date(2026, 9, 17, 12),
    });
    expectDrawableDay(day.timings);
    await settle(10);
    const raw = (await realGet(CACHE_KEY)) as string;
    expect(raw.length).toBeLessThanOrEqual(CACHE_MAX_CHARS);
    const keys = Object.keys(JSON.parse(raw).caches);
    expect(keys).toContain(keyOf(40));
    // The survivors are the most recently touched.
    const dropped = Object.keys(caches).filter(k => !keys.includes(k));
    expect(dropped.length).toBeGreaterThan(0);
    for (const k of dropped) {
      for (const kept of keys.filter(x => x !== keyOf(40))) {
        expect(
          (caches[k] as { lastAccessedAt: string }).lastAccessedAt <=
            (caches[kept] as { lastAccessedAt: string }).lastAccessedAt,
        ).toBe(true);
      }
    }
  });

  it('a quota refusal: room is made from the months furthest from today, never today', async () => {
    // The place on screen holds this month (all but today) and the eleven
    // after it; another place was touched long ago.
    const mine = year(40, '2026-10-01T00:00:00.000Z');
    const now: Record<string, Record<string, string>> = {};
    for (let d = 1; d <= 31; d++) {
      if (d === 17) continue;
      now[`2026-10-${String(d).padStart(2, '0')}`] =
        mine.months['2027-01']['2027-01-01'];
    }
    mine.months = { '2026-10': now, ...mine.months };
    delete (mine.months as Record<string, unknown>)['2027-10'];
    delete (mine.months as Record<string, unknown>)['2027-11'];
    delete (mine.months as Record<string, unknown>)['2027-12'];
    const caches: Record<string, unknown> = { [keyOf(40)]: mine };
    await realSet(CACHE_KEY, JSON.stringify({ caches }));
    // Full: every write that does not shrink the blob is refused.
    const limit = JSON.stringify({ caches }).length;
    refuseWrites(quota(), CACHE_KEY, v => v.length >= limit);

    const day = await prayerStorage.getOrFetchPrayerDay({
      ...at(40),
      date: new Date(2026, 9, 17, 12),
    });
    expectDrawableDay(day.timings);
    await settle(10);
    const slot = (await readCacheBlob())!.caches[keyOf(40)];
    // Today and the rest of this month stay — they are what the phone
    // needs offline tomorrow; the month furthest ahead made the room.
    expect(slot.months['2026-10']?.['2026-10-17']).toBeDefined();
    expect(Object.keys(slot.months['2026-10'])).toHaveLength(31);
    expect(slot.months['2027-09']).toBeUndefined();
    expect(slot.months['2027-01']).toBeDefined();
  });

  it('over the cap with one place, the same: its furthest months go, not this one', async () => {
    const mine = year(40, '2026-10-01T00:00:00.000Z');
    // A month this size, many times over: one place alone past the cap.
    const fat = Object.fromEntries(
      Object.entries(mine.months['2027-01']).map(([k, v]) => [
        k,
        { ...v, Note: 'x'.repeat(4000) },
      ]),
    );
    const months: Record<string, unknown> = { '2026-10': {} };
    for (let m = 1; m <= 12; m++)
      months[`2027-${String(m).padStart(2, '0')}`] = fat;
    await realSet(
      CACHE_KEY,
      JSON.stringify({ caches: { [keyOf(40)]: { ...mine, months } } }),
    );
    await prayerStorage.getOrFetchPrayerDay({
      ...at(40),
      date: new Date(2026, 9, 17, 12),
    });
    await settle(10);
    const raw = (await realGet(CACHE_KEY)) as string;
    expect(raw.length).toBeLessThanOrEqual(CACHE_MAX_CHARS);
    const slot = JSON.parse(raw).caches[keyOf(40)];
    expect(slot.months['2026-10']['2026-10-17']).toBeDefined();
    expect(slot.months['2027-01']).toBeDefined();
    expect(slot.months['2027-12']).toBeUndefined();
  });
});

describe('settings', () => {
  it('a save refused for space does not wedge the next one', async () => {
    let s = await loadSettings();
    s = { ...s, onboardingComplete: true, appearance: 'dark' };
    refuseWrites(quota(), SETTINGS_KEY);
    await expect(saveSettings(s)).rejects.toThrow(/quota/i);
    store.setItem = realSet;
    await saveSettings({ ...s, appearance: 'light' });
    _resetSettingsStorageForTests();
    expect((await loadSettings()).appearance).toBe('light');
  });

  it('a read that fails at launch does not get the defaults saved over everything', async () => {
    let s = await loadSettings();
    s = await changeSettings(s, {
      onboardingComplete: true,
      locationOnboardingComplete: true,
      appearance: 'dark',
      school: 1,
      locationMode: 'manual',
      manualLatitude: 59.33,
      manualLongitude: 18.07,
      locationPresets: [
        { id: 'home', name: 'Home', latitude: 59.33, longitude: 18.07 },
      ],
      activeLocationPresetId: 'home',
    });

    // Launch: the settings blob will not read.
    _resetSettingsStorageForTests();
    store.getItem = jest.fn(async (k: string) => {
      if (k === SETTINGS_KEY)
        throw new Error('Row too big to fit into CursorWindow');
      return realGet(k);
    }) as unknown as Store['getItem'];
    const handedOut = await loadSettings();
    // Not a first run: no welcome flow, and the places it could read are there.
    expect(handedOut.onboardingComplete).toBe(true);
    expect(handedOut.locationPresets).toHaveLength(1);
    expect(handedOut.manualLatitude).toBe(59.33);

    // A save from that session (a language picked) while the blob still
    // cannot be read writes nothing over it…
    await saveSettings({ ...handedOut, language: 'ar', languagePicked: true });
    // …and once it can, only that change lands on what is there.
    store.getItem = realGet;
    await saveSettings({
      ...handedOut,
      language: 'ar',
      languagePicked: true,
      clockFormat: '12',
    });

    _resetSettingsStorageForTests();
    const after = await loadSettings();
    expect(after.appearance).toBe('dark');
    expect(after.school).toBe(1);
    expect(after.locationMode).toBe('manual');
    expect(after.activeLocationPresetId).toBe('home');
    expect(after.locationPresets).toHaveLength(1);
    expect(after.manualLatitude).toBe(59.33);
    expect(after.language).toBe('ar');
    expect(after.clockFormat).toBe('12');
  });
});

it('"Show onboarding again" leaves no coordinates behind in the prayer cache or the city registry', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resetAppData } = require('../../src/settings/storage');
  await prayerStorage.getOrFetchPrayerDay({
    provider: 'local_adhan',
    latitude: 59.33,
    longitude: 18.07,
    calculationMethod: 3,
    school: 0,
    date: new Date(2026, 9, 17, 12),
  });
  await settle(5);
  await realSet(
    'mihrab.cityRegistry.v1',
    JSON.stringify({ cities: [{ anchorLat: 59.33, anchorLng: 18.07 }] }),
  );
  expect(await realGet(CACHE_KEY)).toContain('59.33');
  await resetAppData();
  expect(await realGet(CACHE_KEY)).toBeNull();
  expect(await realGet('mihrab.cityRegistry.v1')).toBeNull();
});
