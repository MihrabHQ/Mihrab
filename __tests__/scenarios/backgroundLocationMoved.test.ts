/**
 * "MY LOCATION" KEPT UP WHILE THE APP IS CLOSED — the 'LocationMoved' task.
 *
 * Android's side notices a move of twenty kilometres or more without
 * polling (BackgroundLocation.kt) and starts this. What must hold: it does
 * nothing unless the reader turned the setting on, nothing for a place of
 * their own, nothing for a walk across town or while the app is open — and
 * for a real move, "My location" is the new town, its week is stored, and
 * the widgets and alerts are written from it.
 */
jest.unmock('adhan');

const mockRepublish = jest.fn(async () => undefined);
jest.mock('../../src/widget/republishWidgetPayload', () => ({
  republishWidgetPayload: (...a: unknown[]) => mockRepublish(...(a as [])),
}));
const mockResync = jest.fn(async () => true);
jest.mock('../../src/notifications/afterUpdate', () => ({
  resyncPrayerAlertsFromStorage: (...a: unknown[]) => mockResync(...(a as [])),
}));
jest.mock('../../src/geocoding/nominatim', () => ({
  reverseLocality: jest.fn(async (lat: number) =>
    lat < 55
      ? { city: 'Berlin', countryCode: 'de' }
      : { city: 'Stockholm', countryCode: 'se' },
  ),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { loadSettings, _resetSettingsStorageForTests } from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { _resetCalculationPreferencesForTests } from '../../src/prayer/calculationPreferences';
import { MOVE_KM, WISH_KEY, locationMovedTask } from '../../src/location/backgroundLocation';
import { aladhanServer, changeSettings, goOnline, readCacheBlob, setZone } from '../fixtures/scenarioHarness';
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.setTimeout(30_000);
const NOW = new Date('2026-11-20T10:00:00Z');
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const BERLIN = { latitude: 52.52, longitude: 13.405 };
let appState = 'background';

beforeEach(async () => {
  setZone('Europe/Stockholm');
  appState = 'background';
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
  mockRepublish.mockClear();
  mockResync.mockClear();
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  _resetSettingsStorageForTests();
  _resetTimezoneShiftForTests();
  _resetMethodCurrencyForTests();
  _resetCalculationPreferencesForTests();
  prayerStorage._resetCacheSweepForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const server = aladhanServer('Europe/Stockholm');
  goOnline(url => (url.includes('aladhan.com') ? server.handler(url) : undefined));
  await changeSettings(await loadSettings(), {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationMode: 'automatic',
    dataProviderAuto: false,
    dataProvider: 'aladhan',
    calculationMethod: 3,
    lastFetchedLatitude: STOCKHOLM.latitude,
    lastFetchedLongitude: STOCKHOLM.longitude,
    autoLocationLabel: 'Stockholm',
  });
});

afterEach(() => jest.restoreAllMocks());

const wish = () => AsyncStorage.setItem(WISH_KEY, '1');
const place = async () => {
  _resetSettingsStorageForTests();
  const s = await loadSettings();
  return { lat: s.lastFetchedLatitude, label: s.autoLocationLabel };
};

it('does nothing unless the reader turned it on', async () => {
  expect(await locationMovedTask(BERLIN, NOW)).toBe('off');
  expect((await place()).label).toBe('Stockholm');
  expect(mockResync).not.toHaveBeenCalled();
});

it('a real move: the place, its week, the widgets and the alerts follow', async () => {
  await wish();
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime() }, NOW)).toBe('moved');
  const p = await place();
  expect(p.lat).toBeCloseTo(BERLIN.latitude, 2);
  expect(p.label).toBe('Berlin');
  const blob = await readCacheBlob();
  const berlin = Object.values(blob?.caches ?? {}).filter(
    e => Math.abs((e as unknown as { latitude: number }).latitude - BERLIN.latitude) < 0.05,
  );
  const days = berlin.reduce((n, e) => n + Object.values(e.months).reduce((m, x) => m + Object.keys(x).length, 0), 0);
  expect(days).toBeGreaterThanOrEqual(7);
  expect(mockRepublish).toHaveBeenCalledTimes(1);
  expect(mockResync).toHaveBeenCalledTimes(1);
});

it('a walk across town is not a move', async () => {
  await wish();
  const nearby = { latitude: STOCKHOLM.latitude + 0.05, longitude: STOCKHOLM.longitude };
  expect(await locationMovedTask(nearby, NOW)).toBe('near');
  expect(MOVE_KM).toBe(20);
  expect(mockResync).not.toHaveBeenCalled();
});

it('a place of the reader’s own does not follow the phone', async () => {
  await wish();
  _resetSettingsStorageForTests();
  await changeSettings(await loadSettings(), { locationMode: 'manual', manualLatitude: 48.14, manualLongitude: 11.58 });
  expect(await locationMovedTask(BERLIN, NOW)).toBe('own-place');
});

it('open on screen, Today finds the place itself', async () => {
  await wish();
  appState = 'active';
  expect(await locationMovedTask(BERLIN, NOW)).toBe('open');
});

it('a position that is none is refused, and nothing throws', async () => {
  await wish();
  expect(await locationMovedTask({ latitude: 0, longitude: 0 }, NOW)).toBe('bad-position');
  expect(await locationMovedTask({} as never, NOW)).toBe('bad-position');
});
