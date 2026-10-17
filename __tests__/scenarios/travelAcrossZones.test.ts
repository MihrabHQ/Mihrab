/**
 * SCENARIO 5 — a traveller: Stockholm, then Casablanca, then New York.
 *
 * The phone's zone changes with each flight and GPS follows. "My location"
 * is pinned to AlAdhan, so its days live in the cache; two saved places
 * (Rabat and Berlin, also AlAdhan) have their own slots, written on their
 * own clocks. What must hold at each landing: Today shows the place the
 * phone is in, at real instants (read on the days' clock, which is what
 * the alert schedule reads); the clocks-changed notice is raised once; and
 * the saved places' slots — written on the places' clocks — are untouched.
 */
jest.unmock('adhan');

const mockFix = { lat: 59.3293, lng: 18.0686 };
jest.mock('../../src/utils/getPosition', () => ({
  getPositionStaged: (
    onFix: (f: { latitude: number; longitude: number }) => void,
  ) => {
    setTimeout(
      () => onFix({ latitude: mockFix.lat, longitude: mockFix.lng }),
      5,
    );
    return { cancel: () => {} };
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import {
  loadSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import {
  _resetTimezoneShiftForTests,
  pendingTimezoneShift,
} from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { _resetCalculationPreferencesForTests } from '../../src/prayer/calculationPreferences';
import { addDays, combineLocalDateAndTime } from '../../src/utils/prayerTimes';
import { computeLocalAdhanTimes } from '../../src/providers/localAdhan';
import type { PrayerAppSettings } from '../../src/settings/types';
import {
  aladhanServer,
  changeSettings,
  goOnline,
  mountPrayerDay,
  readCacheBlob,
  setZone,
  settle,
  until,
  type HookProbe,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.setTimeout(60_000);
const NOW = new Date('2026-10-17T10:00:00Z');

const STOCKHOLM = {
  latitude: 59.3293,
  longitude: 18.0686,
  zone: 'Europe/Stockholm',
};
const CASABLANCA = {
  latitude: 33.5731,
  longitude: -7.5898,
  zone: 'Africa/Casablanca',
};
const NEW_YORK = {
  latitude: 40.7128,
  longitude: -74.006,
  zone: 'America/New_York',
};
const RABAT = {
  id: 'p-rabat',
  name: 'Rabat',
  latitude: 34.0209,
  longitude: -6.8416,
};
const BERLIN = {
  id: 'p-berlin',
  name: 'Berlin',
  latitude: 52.52,
  longitude: 13.405,
};

/** AlAdhan answering on the clock of wherever it is asked about. */
function worldServer() {
  const byZone = new Map(
    [STOCKHOLM, CASABLANCA, NEW_YORK].map(c => [c.zone, aladhanServer(c.zone)]),
  );
  const zoneOf = (url: string) => {
    const lat = Number(new URL(url).searchParams.get('latitude'));
    if (lat > 50) return STOCKHOLM.zone;
    if (lat < 36) return CASABLANCA.zone;
    return NEW_YORK.zone;
  };
  return (url: string) =>
    url.includes('aladhan.com')
      ? byZone.get(zoneOf(url))!.handler(url)
      : undefined;
}

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
  setZone(STOCKHOLM.zone);
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  _resetSettingsStorageForTests();
  _resetTimezoneShiftForTests();
  _resetMethodCurrencyForTests();
  _resetCalculationPreferencesForTests();
  prayerStorage._resetCacheSweepForTests();
  (NetInfo.addEventListener as jest.Mock).mockImplementation(() => () => {});
  jest.spyOn(prayerStorage, 'refreshPrayerDataCache').mockResolvedValue();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  goOnline(worldServer());
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** A launch: a fresh process (nothing in memory), the stores as they were. */
async function launch(
  zone: string,
  fix: { latitude: number; longitude: number },
) {
  setZone(zone);
  mockFix.lat = fix.latitude;
  mockFix.lng = fix.longitude;
  _resetSettingsStorageForTests();
  _resetTimezoneShiftForTests();
  prayerStorage._resetCacheSweepForTests();
  const s = await loadSettings();
  const probe = await mountPrayerDay(s);
  return { s, probe };
}

async function settledAt(probe: HookProbe, at: { latitude: number }) {
  await until(
    () => {
      const c = probe.current();
      return (
        c.phase === 'ready' &&
        !c.provisional &&
        !c.backgroundRefreshing &&
        Math.abs(c.latitude - at.latitude) < 0.05
      );
    },
    `settled at ${at.latitude}`,
    20_000,
  );
  await settle(5);
  const c = probe.current();
  if (c.phase !== 'ready') throw new Error('not ready');
  return c;
}

/** HomeScreen's persist effect: the last fix becomes the launch's coordinates. */
async function persistFix(
  s: PrayerAppSettings,
  at: { latitude: number; longitude: number },
) {
  return changeSettings(s, {
    lastFetchedLatitude: at.latitude,
    lastFetchedLongitude: at.longitude,
  });
}

const slotKeysNear = async (p: { latitude: number; longitude: number }) => {
  const blob = await readCacheBlob();
  return Object.entries(blob?.caches ?? {})
    .filter(
      ([, e]) =>
        Math.abs((e as unknown as { latitude: number }).latitude - p.latitude) <
        0.05,
    )
    .map(([k, e]) => ({
      k,
      days: Object.values(e.months).reduce(
        (n, m) => n + Object.keys(m).length,
        0,
      ),
      clock: e.clock,
    }));
};

it('Stockholm → Casablanca → New York', async () => {
  // At home: automatic, pinned to AlAdhan, two saved places warmed.
  let s = await loadSettings();
  s = await changeSettings(s, {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationMode: 'automatic',
    dataProvider: 'aladhan',
    dataProviderAuto: false,
    calculationMethod: 3,
    locationPresets: [RABAT, BERLIN],
  });
  s = await persistFix(s, STOCKHOLM);
  for (const p of [RABAT, BERLIN]) {
    for (let i = 0; i < 7; i++) {
      await prayerStorage.getOrFetchPrayerDay({
        provider: 'aladhan',
        latitude: p.latitude,
        longitude: p.longitude,
        calculationMethod: 3,
        school: 0,
        date: new Date(NOW.getTime() + i * 86_400_000),
      });
    }
  }
  await settle(5);
  const savedBefore = [
    ...(await slotKeysNear(RABAT)),
    ...(await slotKeysNear(BERLIN)),
  ];
  expect(savedBefore.map(x => x.clock).sort()).toEqual([
    'Africa/Casablanca',
    'Europe/Stockholm',
  ]);

  let { probe } = await launch(STOCKHOLM.zone, STOCKHOLM);
  let st = await settledAt(probe, STOCKHOLM);
  expect(st.timezoneShift ?? null).toBeNull();
  probe.unmount();

  // ── Casablanca ──────────────────────────────────────────────────────
  ({ probe } = await launch(CASABLANCA.zone, CASABLANCA));
  st = await settledAt(probe, CASABLANCA);
  // The notice is raised (from Stockholm's +120 to this phone's Casablanca).
  expect(st.timezoneShift?.from).toBe(120);
  expect(st.timezoneShift?.to).toBe(-new Date().getTimezoneOffset());
  // Today is Casablanca's, at real instants: the server's 05:17 on
  // Casablanca's clock, read on the days' clock, is that instant.
  const fajr = combineLocalDateAndTime(st.baseDate, st.today.Fajr, st.clock);
  const expected = combineLocalDateAndTime(
    st.baseDate,
    '05:17',
    'Africa/Casablanca',
  );
  expect(fajr.getTime()).toBe(expected.getTime());
  s = await persistFix(await loadSettings(), CASABLANCA);
  probe.unmount();

  // The saved places, on their own clocks, kept every day they had.
  const savedAfterCasablanca = [
    ...(await slotKeysNear(RABAT)),
    ...(await slotKeysNear(BERLIN)),
  ];
  expect(savedAfterCasablanca).toEqual(savedBefore);

  // ── New York ────────────────────────────────────────────────────────
  ({ probe } = await launch(NEW_YORK.zone, NEW_YORK));
  st = await settledAt(probe, NEW_YORK);
  expect(pendingTimezoneShift()?.to).toBe(-240);
  const nyFajr = combineLocalDateAndTime(st.baseDate, st.today.Fajr, st.clock);
  expect(nyFajr.getTime()).toBe(
    combineLocalDateAndTime(st.baseDate, '05:17', 'America/New_York').getTime(),
  );
  probe.unmount();
  const savedAfterNY = [
    ...(await slotKeysNear(RABAT)),
    ...(await slotKeysNear(BERLIN)),
  ];
  expect(savedAfterNY).toEqual(savedBefore);
  void s;
});

it('a saved place computed on the phone keeps its instants after a flight', async () => {
  // New York saved and pinned to the on-device calculation, its week
  // stored while the phone was in Stockholm — in Stockholm's wall clock.
  const NYC = {
    id: 'p-nyc',
    name: 'New York',
    latitude: NEW_YORK.latitude,
    longitude: NEW_YORK.longitude,
  };
  let s = await loadSettings();
  s = await changeSettings(s, {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationPresets: [NYC],
    locationMode: 'manual',
    activeLocationPresetId: NYC.id,
    manualLatitude: NYC.latitude,
    manualLongitude: NYC.longitude,
  });
  s = await changeSettings(s, {
    dataProvider: 'local_adhan',
    dataProviderAuto: false,
    calculationMethod: 3,
  });
  let { probe } = await launch(STOCKHOLM.zone, STOCKHOLM);
  let st = await settledAt(probe, NEW_YORK);
  probe.unmount();
  expect((await slotKeysNear(NEW_YORK))[0]?.days).toBeGreaterThanOrEqual(7);

  // Back on "My location" for the flight; landed in Casablanca, the first
  // load is there (and spends the clocks-changed check on it). Then the
  // reader switches to New York: its days come from the cache, and must be
  // the same instants they always were.
  s = await changeSettings(await loadSettings(), { locationMode: 'automatic' });
  s = await persistFix(s, CASABLANCA);
  ({ probe } = await launch(CASABLANCA.zone, CASABLANCA));
  await settledAt(probe, CASABLANCA);
  expect(probe.current().phase === 'ready' && probe.current()).toMatchObject({
    timezoneShift: { from: 120 },
  });
  const since = probe.states.length;
  s = await changeSettings(await loadSettings(), {
    locationMode: 'manual',
    activeLocationPresetId: NYC.id,
    manualLatitude: NYC.latitude,
    manualLongitude: NYC.longitude,
  });
  expect(s.dataProvider).toBe('local_adhan');
  await probe.rerender(s);
  await until(
    () =>
      probe.states
        .slice(since)
        .some(
          x =>
            x.phase === 'ready' &&
            !x.provisional &&
            x.latitude === NYC.latitude,
        ),
    'New York settled',
  );
  st = probe.current() as typeof st;
  for (let i = 0; i < 3; i++) {
    const date = addDays(st.baseDate, i);
    const truth = computeLocalAdhanTimes({
      latitude: NYC.latitude,
      longitude: NYC.longitude,
      date,
      calculationMethod: 3,
      school: 0,
    });
    // The daytime prayers: New York's evening falls past midnight on the
    // Stockholm clock its days were written on, and which day such a time
    // belongs to is the reader's business (`eventAt`), not this one's.
    for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr'] as const) {
      expect(
        combineLocalDateAndTime(date, st.week[i][k], st.clock).getTime(),
      ).toBe(
        combineLocalDateAndTime(date, truth.timings[k], truth.clock).getTime(),
      );
    }
  }
  probe.unmount();
});
