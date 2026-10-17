/**
 * SCENARIO 1 — a fresh install, no network, in eleven cities.
 *
 * The phone has never run the app, onboarding has just written where it
 * is, and nothing answers on the network. What the reader must see is the
 * Today card with times on it at once — the on-device week first, then the
 * settled one — from the source Automatic picks there, with the day stored
 * so the next launch has it too. Real settings storage, real cache, real
 * hook, real astronomy (`adhan` unmocked); only fetch fails.
 *
 * Run with TZ set (the phone's zone is moved per city through the outer
 * process, see the harness).
 */
jest.unmock('adhan');

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { getEffectiveDataProvider } from '../../src/settings/effectiveProvider';
import {
  loadSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { addDays, combineLocalDateAndTime } from '../../src/utils/prayerTimes';
import { inPrayerOrder } from '../../src/providers/validateTimings';
import {
  expectDrawableDay,
  freshInstallAt,
  goOffline,
  mountPrayerDay,
  setZone,
  until,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

const NOW = new Date('2026-10-17T10:00:00Z');

type City = {
  name: string;
  zone: string;
  lat: number;
  lng: number;
  /** What Automatic should pick there. */
  source: string;
};

const CITIES: City[] = [
  {
    name: 'Stockholm',
    zone: 'Europe/Stockholm',
    lat: 59.3293,
    lng: 18.0686,
    source: 'islamiska_forbundet',
  },
  {
    name: 'Rabat',
    zone: 'Africa/Casablanca',
    lat: 34.0209,
    lng: -6.8416,
    source: 'habous',
  },
  {
    name: 'Algiers',
    zone: 'Africa/Algiers',
    lat: 36.7538,
    lng: 3.0588,
    source: 'marw',
  },
  {
    name: 'Jakarta',
    zone: 'Asia/Jakarta',
    lat: -6.2088,
    lng: 106.8456,
    source: 'kemenag',
  },
  {
    name: 'Kuala Lumpur',
    zone: 'Asia/Kuala_Lumpur',
    lat: 3.139,
    lng: 101.6869,
    source: 'jakim',
  },
  {
    name: 'Singapore',
    zone: 'Asia/Singapore',
    lat: 1.3521,
    lng: 103.8198,
    source: 'muis',
  },
  {
    name: 'Istanbul',
    zone: 'Europe/Istanbul',
    lat: 41.0082,
    lng: 28.9784,
    source: 'diyanet',
  },
  {
    name: 'Berlin',
    zone: 'Europe/Berlin',
    lat: 52.52,
    lng: 13.405,
    source: 'diyanet',
  },
  {
    name: 'Mecca',
    zone: 'Asia/Riyadh',
    lat: 21.4225,
    lng: 39.8262,
    source: 'aladhan',
  },
  {
    name: 'New York',
    zone: 'America/New_York',
    lat: 40.7128,
    lng: -74.006,
    source: 'diyanet',
  },
  {
    name: 'Tromsø',
    zone: 'Europe/Oslo',
    lat: 69.6492,
    lng: 18.9553,
    source: 'aladhan',
  },
];

jest.setTimeout(30_000);

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
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  _resetSettingsStorageForTests();
  _resetTimezoneShiftForTests();
  _resetMethodCurrencyForTests();
  prayerStorage._resetCacheSweepForTests();
  // The year-long background fill is its own scenario (the quota one); here
  // it is only asked for, so a suite of eleven cities does not spend a
  // minute in 100 ms sleeps between batches nobody is looking at.
  fillSpy = jest
    .spyOn(prayerStorage, 'refreshPrayerDataCache')
    .mockResolvedValue();
  goOffline();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe.each(CITIES)('fresh install offline in $name', city => {
  it('shows times at once, settles on them, and keeps them', async () => {
    setZone(city.zone);
    const settings = await freshInstallAt(city.lat, city.lng, city.name);
    // What the next launch reads back is what onboarding wrote.
    const reloaded = await loadSettings();
    expect(reloaded.locationMode).toBe('manual');
    expect(reloaded.manualLatitude).toBeCloseTo(city.lat);
    expect(reloaded.dataProviderAuto).toBe(true);

    const coords = { latitude: city.lat, longitude: city.lng };
    const provider = getEffectiveDataProvider(
      reloaded.dataProviderAuto,
      reloaded.dataProvider,
      coords,
      reloaded.calculationMethod,
    );
    expect(provider).toBe(city.source);

    const probe = await mountPrayerDay(reloaded);
    await until(
      () => probe.states.some(s => s.phase === 'ready' && !s.provisional),
      `${city.name}: a settled week`,
      // AlAdhan's retries run their course before the phone's answer
      // settles in (the provisional week is on screen meanwhile).
      20_000,
    );

    // The first thing on screen was a week, not a spinner or an error.
    const first = probe.states.find(s => s.phase !== 'idle');
    expect(first?.phase).toBe('ready');
    expect(probe.states.some(s => s.phase === 'api_error')).toBe(false);

    const settled = probe.current();
    if (settled.phase !== 'ready') throw new Error('not ready');
    expect(settled.provisional).toBeFalsy();
    expect(settled.week.length).toBeGreaterThanOrEqual(7);
    for (const day of settled.week) expectDrawableDay(day);
    // Today's prayers in order on the clock the card reads them on (a
    // polar-adjacent Isha may wrap past midnight; inPrayerOrder knows that).
    expect(inPrayerOrder(settled.today)).toBe(true);
    // Read on the days' own clock they are real instants of today.
    const fajr = combineLocalDateAndTime(
      settled.baseDate,
      settled.today.Fajr,
      settled.clock,
    );
    const maghrib = combineLocalDateAndTime(
      settled.baseDate,
      settled.today.Maghrib,
      settled.clock,
    );
    expect(maghrib.getTime()).toBeGreaterThan(fajr.getTime());
    expect(maghrib.getTime() - fajr.getTime()).toBeLessThan(20 * 3600_000);

    // Stored: what a cold start with no network will read next time.
    const params = {
      provider,
      latitude: city.lat,
      longitude: city.lng,
      calculationMethod: reloaded.calculationMethod,
      school: reloaded.school,
    };
    const stored = await prayerStorage.getStoredPrayerTimes({
      ...params,
      date: new Date(),
    });
    expectDrawableDay(stored ?? undefined);
    const tomorrow = await prayerStorage.getStoredPrayerTimes({
      ...params,
      date: addDays(new Date(), 1),
    });
    expectDrawableDay(tomorrow ?? undefined);

    // And the year's fill was asked for, for this place and source.
    expect(fillSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        latitude: city.lat,
        longitude: city.lng,
      }),
      12,
    );
    probe.unmount();
    expect(settings.locationProviders?.manual).toEqual({
      auto: true,
      provider: settings.dataProvider,
    });
  });
});
