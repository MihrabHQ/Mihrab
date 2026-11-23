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
import { MOVE_KM, NAME_WAIT_MS, WISH_KEY, locationMovedTask } from '../../src/location/backgroundLocation';
import { onLiveRecheck } from '../../src/location/liveMove';
import { ANCHOR_KEY } from '../../src/prayer/locationFreshness';
import * as nominatim from '../../src/geocoding/nominatim';
import * as SystemClock from '../../src/native/SystemClock';
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

it('handed over again after a new time zone: done again, though the place is already there', async () => {
  await wish();
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime() }, NOW)).toBe('moved');
  mockRepublish.mockClear();
  mockResync.mockClear();
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime() }, NOW)).toBe('near');
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime(), again: true }, NOW)).toBe('moved');
  expect(mockResync).toHaveBeenCalledTimes(1);
  expect(mockRepublish).toHaveBeenCalledTimes(1);
});

it('done again, it does not stamp the place "found now": a newer position must still count', async () => {
  await wish();
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime() }, NOW)).toBe('moved');
  await AsyncStorage.removeItem(ANCHOR_KEY);
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime(), again: true }, NOW)).toBe('moved');
  expect(await AsyncStorage.getItem(ANCHOR_KEY)).toBeNull();
});

it('but not once the place has moved on since: that would put it back', async () => {
  await wish();
  // The place is Stockholm (the app found the phone there after the move).
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime(), again: true }, NOW)).toBe('superseded');
  expect((await place()).label).toBe('Stockholm');
});

it('a place of the reader’s own does not follow the phone', async () => {
  await wish();
  _resetSettingsStorageForTests();
  await changeSettings(await loadSettings(), { locationMode: 'manual', manualLatitude: 48.14, manualLongitude: 11.58 });
  expect(await locationMovedTask(BERLIN, NOW)).toBe('own-place');
});

it('open on screen, Today finds the place itself — and is asked to', async () => {
  await wish();
  appState = 'active';
  const asked = jest.fn();
  const stop = onLiveRecheck(asked);
  expect(await locationMovedTask(BERLIN, NOW)).toBe('open');
  expect(asked).toHaveBeenCalledTimes(1);
  expect((await place()).label).toBe('Stockholm');
  stop();
});

it('"active" with no Today to ask (an engine started again in the background): the task does the move itself', async () => {
  await wish();
  appState = 'active';
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime() }, NOW)).toBe('moved');
  expect((await place()).label).toBe('Berlin');
});

it('does not wait on a network that does not answer: the place moves, named from the app’s own list', async () => {
  await wish();
  (nominatim.reverseLocality as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
  const started = Date.now();
  expect(await locationMovedTask({ ...BERLIN, timestamp: NOW.getTime() }, NOW)).toBe('moved');
  expect(Date.now() - started).toBeLessThan(NAME_WAIT_MS + 8_000);
  const p = await place();
  expect(p.lat).toBeCloseTo(BERLIN.latitude, 2);
  expect(p.label).toBeTruthy();
  expect(mockResync).toHaveBeenCalledTimes(1);
});

describe('the phone’s LAST position, hours old (the three-hourly check)', () => {
  const hoursAgo = NOW.getTime() - 5 * 3_600_000;
  const lastFoundInSweden = () =>
    AsyncStorage.setItem(ANCHOR_KEY, JSON.stringify({ zone: 'Europe/Stockholm', offset: 60, country: 'SE' }));
  const anchor = async () => JSON.parse((await AsyncStorage.getItem(ANCHOR_KEY)) ?? 'null');

  it('in the country the phone is in now: the place follows, and it counts as found', async () => {
    await wish();
    await lastFoundInSweden();
    jest.spyOn(SystemClock, 'networkCountry').mockResolvedValue('DE');
    expect(await locationMovedTask({ ...BERLIN, timestamp: hoursAgo }, NOW)).toBe('moved');
    expect((await place()).label).toBe('Berlin');
    expect((await anchor()).country).toBe('DE');
  });

  it('in another country than the phone is in now: the place follows, but it is not written down as found', async () => {
    await wish();
    await lastFoundInSweden();
    jest.spyOn(SystemClock, 'networkCountry').mockResolvedValue('TR');
    expect(await locationMovedTask({ ...BERLIN, timestamp: hoursAgo }, NOW)).toBe('moved');
    expect((await place()).label).toBe('Berlin');
    // The app says "you seem to have travelled" when opened, and looks.
    expect((await anchor()).country).toBe('SE');
  });
});

it('a position that is none is refused, and nothing throws', async () => {
  await wish();
  expect(await locationMovedTask({ latitude: 0, longitude: 0 }, NOW)).toBe('bad-position');
  expect(await locationMovedTask({} as never, NOW)).toBe('bad-position');
});
