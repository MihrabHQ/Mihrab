/**
 * SCENARIO 2 — upgrading from 2.31 and 2.32 with their settings and cache.
 *
 * 2.31 keyed the cache `provider|lat|lng|method|school` and still offered
 * PrayTimes.dev; 2.32 added the preferences part, the method revisions and
 * the correction list in force, but no clocks and no stand-in marks. An
 * upgrade must not crash on either, must land each reader on the right
 * source, must sweep the slots nothing will read again, must put times on
 * Today online and offline, and once online must ask again for the days
 * the phone stood in for.
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { getEffectiveDataProvider } from '../../src/settings/effectiveProvider';
import {
  loadSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { _resetCalculationPreferencesForTests } from '../../src/prayer/calculationPreferences';
import { formatLocalDate } from '../../src/utils/date';
import { addDays } from '../../src/utils/prayerTimes';
import {
  aladhanServer,
  expectDrawableDay,
  goOffline,
  goOnline,
  mountPrayerDay,
  readCacheBlob,
  setZone,
  until,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.setTimeout(30_000);
const NOW = new Date('2026-10-17T10:00:00Z');
const SETTINGS_KEY = 'prayerapp.settings.v1';
const LOCATION_KEY = 'prayerapp.location.v1';
const CACHE_KEY = 'prayer_times_cache.v2';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const BERLIN = { latitude: 52.52, longitude: 13.405 };
const RABAT = { latitude: 34.0209, longitude: -6.8416 };

/** A month of plausible days, as an older build stored them. */
function monthOf(year: number, month: number, fajrMinute = 11) {
  const out: Record<string, Record<string, string>> = {};
  const dim = new Date(year, month, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(
      2,
      '0',
    )}`;
    out[key] = {
      Imsak: '05:01',
      Fajr: `05:${fajrMinute}`,
      Sunrise: '07:20',
      Dhuhr: '12:10',
      Asr: '14:40',
      Maghrib: '17:55',
      Isha: '19:40',
    };
  }
  return out;
}

function entry(
  provider: string,
  at: { latitude: number; longitude: number },
  calculationMethod: number | 'auto',
  school: number,
  extra: Record<string, unknown> = {},
) {
  return {
    provider,
    latitude: at.latitude,
    longitude: at.longitude,
    calculationMethod,
    school,
    months: { '2026-10': monthOf(2026, 10), '2026-11': monthOf(2026, 11) },
    lastAccessedAt: '2026-10-10T08:00:00.000Z',
    lastFetchedAt: '2026-10-10T08:00:00.000Z',
    utcOffsetMinutes: 120,
    ...extra,
  };
}
const key231 = (
  p: string,
  at: typeof STOCKHOLM,
  m: number | 'auto',
  s: number,
) =>
  [
    p,
    at.latitude.toFixed(2),
    at.longitude.toFixed(2),
    String(m),
    String(s),
  ].join('|');

let netListeners: Array<(s: unknown) => void>;
let fillSpy: jest.SpyInstance;

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
  setZone('Europe/Stockholm');
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  _resetSettingsStorageForTests();
  _resetTimezoneShiftForTests();
  _resetMethodCurrencyForTests();
  _resetCalculationPreferencesForTests();
  prayerStorage._resetCacheSweepForTests();
  prayerStorage.resetFullSyncCooldown();
  netListeners = [];
  (NetInfo.addEventListener as jest.Mock).mockImplementation(
    (l: (s: unknown) => void) => {
      netListeners.push(l);
      return () => {
        netListeners = netListeners.filter(x => x !== l);
      };
    },
  );
  fillSpy = jest
    .spyOn(prayerStorage, 'refreshPrayerDataCache')
    .mockResolvedValue();
  jest.spyOn(prayerStorage, 'maybeFullSyncOnWifi').mockResolvedValue(false);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // The utcOffset this phone last stored under, so the upgrade is not
  // mistaken for the clocks changing.
  await AsyncStorage.setItem(
    'mihrab.prayer.utcOffset.v1',
    JSON.stringify({ minutes: 120, at: '2026-10-10T08:00:00.000Z' }),
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function seed(
  settings: Record<string, unknown>,
  location: Record<string, unknown>,
  caches: Record<string, unknown>,
) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  await EncryptedStorageMock.default.setItem(
    LOCATION_KEY,
    JSON.stringify(location),
  );
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ caches }));
}

const BASE_231 = {
  onboardingComplete: true,
  locationOnboardingComplete: true,
  language: 'sv',
  languagePicked: true,
  quranModeMushafDefault: true,
  appearance: 'dark',
};

describe('from 2.31', () => {
  it.each([
    ['offline', false],
    ['online', true],
  ])(
    'a PrayTimes.dev reader in Stockholm keeps their method and Asr (%s)',
    async (_label, online) => {
      const server = aladhanServer('Europe/Stockholm');
      const fetchMock = online ? goOnline(server.handler) : goOffline();
      await seed(
        {
          ...BASE_231,
          dataProvider: 'prayertimes_dev',
          dataProviderAuto: false,
          calculationMethod: 3,
          school: 1,
          locationMode: 'manual',
        },
        {
          manualLatitude: STOCKHOLM.latitude,
          manualLongitude: STOCKHOLM.longitude,
          manualLocationLabel: 'Stockholm',
        },
        {
          [key231('prayertimes_dev', STOCKHOLM, 3, 1)]: entry(
            'prayertimes_dev',
            STOCKHOLM,
            3,
            1,
          ),
          [key231('aladhan', STOCKHOLM, 'auto', 0)]: entry(
            'aladhan',
            STOCKHOLM,
            'auto',
            0,
          ),
        },
      );

      const s = await loadSettings();
      expect(s.dataProvider).toBe('local_adhan');
      expect(s.dataProviderAuto).toBe(false);
      expect(s.school).toBe(1);
      expect(s.calculationMethod).toBe(3);
      expect(s.language).toBe('sv');
      expect(s.locationProviders?.manual).toEqual({
        auto: false,
        provider: 'local_adhan',
      });
      const provider = getEffectiveDataProvider(
        s.dataProviderAuto,
        s.dataProvider,
        STOCKHOLM,
        s.calculationMethod,
      );
      expect(provider).toBe('local_adhan');

      const probe = await mountPrayerDay(s);
      await until(
        () => probe.states.some(x => x.phase === 'ready' && !x.provisional),
        'a settled week',
      );
      const ready = probe.current();
      if (ready.phase !== 'ready') throw new Error('not ready');
      expectDrawableDay(ready.today);
      expect(ready.usingLocalFallback).toBeFalsy();
      // On-device source: nothing asked of any server for the week.
      expect(
        fetchMock.mock.calls.filter(c => String(c[0]).includes('aladhan')),
      ).toHaveLength(0);

      // Swept: both 2.31 slots are under keys nothing builds any more.
      const blob = await readCacheBlob();
      const keys = Object.keys(blob!.caches);
      expect(keys.some(k => k.startsWith('prayertimes_dev|'))).toBe(false);
      expect(keys).not.toContain(key231('aladhan', STOCKHOLM, 'auto', 0));
      // What is there now is the on-device week, under today's key.
      expect(keys.some(k => k.startsWith('local_adhan|59.33|18.07|3|1|'))).toBe(
        true,
      );
      probe.unmount();
    },
  );

  it('an Automatic reader in Rabat lands on the ministry, offline, and the old AlAdhan slot goes', async () => {
    setZone('Africa/Casablanca');
    goOffline();
    await seed(
      {
        ...BASE_231,
        dataProvider: 'aladhan',
        dataProviderAuto: true,
        calculationMethod: 'auto',
        school: 0,
        locationMode: 'manual',
      },
      {
        manualLatitude: RABAT.latitude,
        manualLongitude: RABAT.longitude,
        manualLocationLabel: 'Rabat',
      },
      {
        [key231('aladhan', RABAT, 'auto', 0)]: entry(
          'aladhan',
          RABAT,
          'auto',
          0,
        ),
      },
    );
    await AsyncStorage.setItem(
      'mihrab.prayer.utcOffset.v1',
      JSON.stringify({ minutes: 60, at: '2026-10-10T08:00:00.000Z' }),
    );
    const s = await loadSettings();
    expect(
      getEffectiveDataProvider(
        s.dataProviderAuto,
        s.dataProvider,
        RABAT,
        s.calculationMethod,
      ),
    ).toBe('habous');
    const probe = await mountPrayerDay(s);
    await until(
      () => probe.states.some(x => x.phase === 'ready' && !x.provisional),
      'a settled week',
    );
    const ready = probe.current();
    if (ready.phase !== 'ready') throw new Error('not ready');
    expectDrawableDay(ready.today);
    // The ministry's method, computed: not the 2.31 AlAdhan rows (Fajr 05:11).
    expect(ready.today.Fajr).not.toBe('05:11');
    const blob = await readCacheBlob();
    expect(Object.keys(blob?.caches ?? {})).not.toContain(
      key231('aladhan', RABAT, 'auto', 0),
    );
    probe.unmount();
  });
});

describe('from 2.32', () => {
  async function seed232() {
    // Berlin saved place pinned to AlAdhan with MWL; its 2.32 slot is under
    // a key this build still builds (no correction list for method 3).
    await seed(
      {
        ...BASE_231,
        dataProvider: 'aladhan',
        dataProviderAuto: false,
        calculationMethod: 3,
        school: 0,
        locationMode: 'manual',
        activeLocationPresetId: 'p-berlin',
        highLatitudeRule: 'angle_based',
        locationProviders: {
          my: { auto: true, provider: 'aladhan' },
          manual: { auto: true, provider: 'aladhan' },
          'p-berlin': { auto: false, provider: 'aladhan' },
        },
      },
      {
        manualLatitude: BERLIN.latitude,
        manualLongitude: BERLIN.longitude,
        manualLocationLabel: 'Berlin',
        locationPresets: [
          {
            id: 'p-berlin',
            name: 'Berlin',
            latitude: BERLIN.latitude,
            longitude: BERLIN.longitude,
          },
        ],
      },
      {
        [`${key231('aladhan', BERLIN, 3, 0)}|`]: entry('aladhan', BERLIN, 3, 0),
        // A Stockholm slot under 2.32's Sweden key with the bundled list,
        // i.e. current.
        [`${key231(
          'islamiska_forbundet',
          STOCKHOLM,
          'auto',
          0,
        )}||cl=2027-12-31#270`]: entry(
          'islamiska_forbundet',
          STOCKHOLM,
          'auto',
          0,
        ),
        // A 2.32 slot under a correction list that has since been replaced.
        [`${key231(
          'islamiska_forbundet',
          BERLIN,
          'auto',
          0,
        )}||cl=2026-12-31#200`]: entry(
          'islamiska_forbundet',
          BERLIN,
          'auto',
          0,
        ),
      },
    );
  }

  it.each([
    ['offline', false],
    ['online', true],
  ])(
    'the pinned AlAdhan place reads its stored days (%s)',
    async (_l, online) => {
      const server = aladhanServer('Europe/Berlin');
      const fetchMock = online ? goOnline(server.handler) : goOffline();
      await seed232();
      const s = await loadSettings();
      expect(s.activeLocationPresetId).toBe('p-berlin');
      const provider = getEffectiveDataProvider(
        s.dataProviderAuto,
        s.dataProvider,
        BERLIN,
        s.calculationMethod,
      );
      expect(provider).toBe('aladhan');

      const probe = await mountPrayerDay(s);
      await until(
        () => probe.states.some(x => x.phase === 'ready' && !x.provisional),
        'a settled week',
      );
      const ready = probe.current();
      if (ready.phase !== 'ready') throw new Error('not ready');
      // The stored 2.32 rows, as they were: nothing fetched for them.
      expect(ready.today.Fajr).toBe('05:11');
      expect(ready.usingLocalFallback).toBeFalsy();
      expect(
        fetchMock.mock.calls.filter(c => String(c[0]).includes('/timings/')),
      ).toHaveLength(0);

      const blob = await readCacheBlob();
      const keys = Object.keys(blob!.caches);
      expect(keys).toContain(`${key231('aladhan', BERLIN, 3, 0)}|`);
      expect(keys.some(k => k.includes('cl=2027-12-31#270'))).toBe(true);
      expect(keys.some(k => k.includes('cl=2026-12-31#200'))).toBe(false);
      probe.unmount();
    },
  );

  it('days the phone stood in for are asked again once the network is back', async () => {
    // First launch after the update: offline. The 2.32 slot has October and
    // November; the week reaches into neither gap, so plant one: drop the
    // days from tomorrow on, so the load computes them on the phone.
    await seed232();
    const blob = await readCacheBlob();
    const k = `${key231('aladhan', BERLIN, 3, 0)}|`;
    const oct = blob!.caches[k].months['2026-10'] as Record<string, unknown>;
    for (let d = 18; d <= 31; d++) delete oct[`2026-10-${d}`];
    delete blob!.caches[k].months['2026-11'];
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(blob));

    goOffline();
    const s = await loadSettings();
    const probe = await mountPrayerDay(s);
    await until(
      () => probe.states.some(x => x.phase === 'ready' && !x.provisional),
      'a settled week',
      20_000,
    );
    // Wait for the stand-in days to be written.
    let marked: string[] = [];
    await until(
      () => {
        void readCacheBlob().then(b => {
          marked = b?.caches[k]?.fallbackDays ?? [];
        });
        return marked.length >= 6;
      },
      'six stand-in days marked',
      20_000,
    );
    const tomorrow = formatLocalDate(addDays(new Date(), 1));
    expect(marked).toContain(tomorrow);
    expect(marked).not.toContain(formatLocalDate(new Date()));

    // The network comes back.
    const server = aladhanServer('Europe/Berlin');
    goOnline(server.handler);
    expect(netListeners.length).toBeGreaterThan(0);
    netListeners.forEach(l => l({ isConnected: true, type: 'cellular' }));
    await until(
      () => {
        void readCacheBlob().then(b => {
          marked = b?.caches[k]?.fallbackDays ?? [];
        });
        return marked.length === 0;
      },
      'every stand-in day replaced',
      20_000,
    );
    const after = await readCacheBlob();
    const row = after!.caches[k].months['2026-10'][tomorrow] as Record<
      string,
      string
    >;
    // The server's answer for the 18th: Fajr 05:18, Isha by method 3.
    expect(row.Fajr).toBe('05:18');
    expect(row.Isha).toBe('19:13');
    expect(server.seen.every(u => u.searchParams.get('method') === '3')).toBe(
      true,
    );
    expect(fillSpy).toHaveBeenCalled();
    probe.unmount();
  });
});
