/**
 * A TRAVELLER WHOSE FIRST FIX IS SLOW — Sweden to Germany, on Android.
 *
 * Reported in November 2026 and reproduced on an Android 17 emulator: with
 * "My location" on, Stockholm stayed on screen in Germany through every
 * launch and every pull to refresh. The satellites needed longer than the
 * twenty seconds the app waited (thirty, in the reproduction), and when the
 * wait ran out the app kept its own place though the phone had a newer one.
 *
 * Two halves. The native one — a request whose wait runs out answers with
 * the newest position the phone has — is in the patch to
 * @react-native-community/geolocation and held here by its text. The other
 * is here: with a place already on screen the precise request waits a
 * minute, a fix that lands late is still taken, and one that lands after
 * the reader went to a place of their own is not.
 */
jest.unmock('adhan');

type Fix = { latitude: number; longitude: number };
const mockLocator: { opts: unknown[]; fire: ((f: Fix) => void)[] } = { opts: [], fire: [] };
jest.mock('../../src/utils/getPosition', () => ({
  getPositionStaged: (onFix: (f: Fix) => void, _onError: unknown, opts: unknown) => {
    mockLocator.opts.push(opts);
    mockLocator.fire.push(onFix);
    return { cancel: () => {} };
  },
}));

import { readFileSync } from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { loadSettings, _resetSettingsStorageForTests } from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { _resetCalculationPreferencesForTests } from '../../src/prayer/calculationPreferences';
import {
  aladhanServer,
  changeSettings,
  goOnline,
  mountPrayerDay,
  setZone,
  settle,
  until,
  type HookProbe,
} from '../fixtures/scenarioHarness';
const EncryptedStorageMock = require('react-native-encrypted-storage');

jest.setTimeout(60_000);
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const BERLIN = { latitude: 52.52, longitude: 13.405 };

beforeEach(async () => {
  jest.useFakeTimers({
    now: new Date('2026-11-20T10:00:00Z'),
    doNotFake: ['performance', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'queueMicrotask'],
  });
  setZone('Europe/Stockholm');
  mockLocator.opts = [];
  mockLocator.fire = [];
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
  const server = aladhanServer('Europe/Stockholm');
  goOnline(url => (url.includes('aladhan.com') ? server.handler(url) : undefined));
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const near = (probe: HookProbe, at: Fix) => () => {
  const c = probe.current();
  return c.phase === 'ready' && !c.provisional && Math.abs(c.latitude - at.latitude) < 0.2;
};

/** A phone that was last in Stockholm, on "My location". */
async function atHome() {
  const s = await changeSettings(await loadSettings(), {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationMode: 'automatic',
    dataProviderAuto: true,
    lastFetchedLatitude: STOCKHOLM.latitude,
    lastFetchedLongitude: STOCKHOLM.longitude,
    autoLocationLabel: 'Stockholm',
  });
  const probe = await mountPrayerDay(s);
  await until(() => mockLocator.fire.length > 0, 'the position asked for');
  await until(near(probe, STOCKHOLM), 'the last place on screen');
  return { s, probe };
}

it('with a place on screen, the precise request waits a minute', async () => {
  const { probe } = await atHome();
  expect(mockLocator.opts[0]).toEqual({ fineTimeoutMs: 60_000 });
  probe.unmount();
});

it('a fix that lands late moves "My location" to Germany', async () => {
  const { probe } = await atHome();
  await settle(10);
  expect(near(probe, STOCKHOLM)()).toBe(true);
  mockLocator.fire[0](BERLIN);
  await until(near(probe, BERLIN), 'Berlin on screen', 20_000);
  probe.unmount();
});

it('but not once the reader has gone to a place of their own', async () => {
  const { s, probe } = await atHome();
  const manual = await changeSettings(s, {
    locationMode: 'manual',
    manualLatitude: 48.1372,
    manualLongitude: 11.5756,
    manualLocationLabel: 'München',
  });
  await probe.rerender(manual);
  const munich = { latitude: 48.1372, longitude: 11.5756 };
  await until(near(probe, munich), 'the chosen place on screen', 20_000);
  mockLocator.fire[0](BERLIN);
  await settle(20);
  expect(near(probe, munich)()).toBe(true);
  probe.unmount();
});

it('Android: a request whose wait runs out answers with the newest position the phone has', () => {
  const root = path.join(__dirname, '..', '..');
  const patch = readFileSync(path.join(root, 'patches/@react-native-community+geolocation+3.4.0.patch'), 'utf8');
  expect(patch).toMatch(/\+\s+private static Location newestLastKnown\(LocationManager locationManager\)/);
  // The single request, and the "Approximate" one at its time limit and on an empty answer.
  expect(patch.match(/\+\s+Location last = newestLastKnown\(/g)).toHaveLength(2);
  expect(patch).toMatch(/\+\s+Location answer = location != null \? location : newestLastKnown\(locationManager\);/);
  const java = readFileSync(
    path.join(root, 'node_modules/@react-native-community/geolocation/android/src/main/java/com/reactnativecommunity/geolocation/AndroidLocationManager.java'),
    'utf8',
  );
  expect(java).toContain('private static Location newestLastKnown(LocationManager locationManager)');
});
