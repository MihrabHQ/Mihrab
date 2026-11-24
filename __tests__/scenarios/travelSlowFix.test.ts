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

type Fix = { latitude: number; longitude: number; timestamp?: number | null; stage?: 'coarse' | 'fine' };
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
import { AppState } from 'react-native';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { loadSettings, _resetSettingsStorageForTests } from '../../src/settings/storage';
import { _resetTimezoneShiftForTests } from '../../src/prayer/timezoneShift';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import { _resetCalculationPreferencesForTests } from '../../src/prayer/calculationPreferences';
import { askLiveRecheck, tellLiveMove } from '../../src/location/liveMove';
import { _setLocationRetryDelaysForTests } from '../../src/hooks/usePrayerDay';
import * as nominatim from '../../src/geocoding/nominatim';
import * as SystemClock from '../../src/native/SystemClock';
import {
  ANCHOR_KEY,
  _resetLocationFreshnessForTests,
  getLocationFreshness,
  showsTravelNotice,
} from '../../src/prayer/locationFreshness';
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
const EncryptedStorageMock = require('../../src/native/SecureStore');

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
  _resetLocationFreshnessForTests();
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

describe('and the screen says what it knows', () => {
  /** The phone's surroundings at its last fresh position were another country's. */
  const anchoredElsewhere = () =>
    AsyncStorage.setItem(
      ANCHOR_KEY,
      JSON.stringify({ zone: 'Pacific/Kiritimati', offset: -new Date().getTimezoneOffset() + 300, country: null }),
    );
  const hoursOld = () => Date.now() - 5 * 3_600_000;

  it('a fresh position: found, nothing to say', async () => {
    const { probe } = await atHome();
    mockLocator.fire[0]({ ...STOCKHOLM, timestamp: Date.now(), stage: 'coarse' });
    await settle(10);
    expect(getLocationFreshness()).toEqual({ status: 'ok', moved: false });
    probe.unmount();
  });

  it('the phone’s old position after the precise wait ran out: "Not updated", in the same city', async () => {
    const { probe } = await atHome();
    mockLocator.fire[0]({ ...STOCKHOLM, timestamp: hoursOld(), stage: 'coarse' });
    await settle(10);
    expect(getLocationFreshness().status).toBe('searching');
    mockLocator.fire[0]({ ...STOCKHOLM, timestamp: hoursOld(), stage: 'fine' });
    await settle(10);
    expect(getLocationFreshness()).toEqual({ status: 'notUpdated', moved: false });
    expect(showsTravelNotice(getLocationFreshness())).toBe(false);
    probe.unmount();
  });

  it('travelled and not found: Today’s notice, until a fresh position ends it', async () => {
    await anchoredElsewhere();
    const { probe } = await atHome();
    await until(() => getLocationFreshness().moved, 'the journey noticed');
    // Still searching: no notice yet, a position usually lands in a second.
    expect(showsTravelNotice(getLocationFreshness())).toBe(false);
    mockLocator.fire[0]({ ...STOCKHOLM, timestamp: hoursOld(), stage: 'fine' });
    await settle(10);
    expect(getLocationFreshness()).toEqual({ status: 'notUpdated', moved: true });
    expect(showsTravelNotice(getLocationFreshness())).toBe(true);
    mockLocator.fire[0]({ ...BERLIN, timestamp: Date.now(), stage: 'fine' });
    await until(near(probe, BERLIN), 'Berlin on screen', 20_000);
    expect(getLocationFreshness()).toEqual({ status: 'ok', moved: false });
    probe.unmount();
  });

  /** Last found in Sweden; the phone is on a German network now. */
  const fromSwedenToGermany = async () => {
    await AsyncStorage.setItem(
      ANCHOR_KEY,
      JSON.stringify({ zone: 'Europe/Stockholm', offset: -new Date().getTimezoneOffset(), country: 'SE' }),
    );
    jest.spyOn(SystemClock, 'networkCountry').mockResolvedValue('DE');
  };
  const anchor = async () => JSON.parse((await AsyncStorage.getItem(ANCHOR_KEY)) ?? 'null');

  it('travelled, and the phone’s last position is in the country it is in now: the place follows it, no notice', async () => {
    await fromSwedenToGermany();
    jest.spyOn(nominatim, 'reverseLocality').mockResolvedValue({ city: 'Berlin', countryCode: 'de' });
    const { probe } = await atHome();
    await until(() => getLocationFreshness().moved, 'the journey noticed');
    mockLocator.fire[0]({ ...BERLIN, timestamp: hoursOld(), stage: 'fine' });
    await until(near(probe, BERLIN), 'Berlin on screen', 20_000);
    await until(() => !getLocationFreshness().moved, 'the journey answered');
    expect(getLocationFreshness()).toEqual({ status: 'notUpdated', moved: false });
    expect((await anchor()).country).toBe('DE');
    probe.unmount();
  });

  it('but a last position in a third country is a stop on the way: the place follows it and the notice stays', async () => {
    await fromSwedenToGermany();
    // The phone's last position: the airport changed at, in France.
    const PARIS = { latitude: 49.0097, longitude: 2.5479 };
    jest.spyOn(nominatim, 'reverseLocality').mockResolvedValue({ city: 'Roissy-en-France', countryCode: 'fr' });
    const { probe } = await atHome();
    await until(() => getLocationFreshness().moved, 'the journey noticed');
    mockLocator.fire[0]({ ...PARIS, timestamp: hoursOld(), stage: 'fine' });
    await until(near(probe, PARIS), 'the last position on screen', 20_000);
    await settle(10);
    expect(getLocationFreshness()).toEqual({ status: 'notUpdated', moved: true });
    expect(showsTravelNotice(getLocationFreshness())).toBe(true);
    // Not written down as found: the next launch says so again.
    expect((await anchor()).country).toBe('SE');
    probe.unmount();
  });

  it('nor can a new time zone alone be checked against an old position', async () => {
    await anchoredElsewhere();
    const { probe } = await atHome();
    await until(() => getLocationFreshness().moved, 'the journey noticed');
    mockLocator.fire[0]({ ...BERLIN, timestamp: hoursOld(), stage: 'fine' });
    await until(near(probe, BERLIN), 'Berlin on screen', 20_000);
    await settle(10);
    expect(getLocationFreshness()).toEqual({ status: 'notUpdated', moved: true });
    probe.unmount();
  });

  it('a place of the reader’s own is never stale', async () => {
    await anchoredElsewhere();
    const { s, probe } = await atHome();
    await until(() => getLocationFreshness().moved, 'the journey noticed');
    const manual = await changeSettings(s, { locationMode: 'manual', manualLatitude: 48.1372, manualLongitude: 11.5756 });
    await probe.rerender(manual);
    await until(() => getLocationFreshness().status === 'ok', 'the chosen place taken');
    expect(getLocationFreshness()).toEqual({ status: 'ok', moved: false });
    probe.unmount();
  });
});

it('a move found in the background reaches Today when the app is alive', async () => {
  // Nobody mounted: the stored place is all there is to change.
  expect(tellLiveMove({ ...BERLIN, label: 'Berlin', cityId: 'DE:berlin' })).toBe(false);
  const { probe } = await atHome();
  expect(tellLiveMove({ ...BERLIN, label: 'Berlin', cityId: 'DE:berlin' })).toBe(true);
  await until(near(probe, BERLIN), 'Berlin on screen', 20_000);
  const c = probe.current();
  expect(c.phase === 'ready' && c.cityName).toBe('Berlin');
  expect(getLocationFreshness()).toEqual({ status: 'ok', moved: false });
  probe.unmount();
  expect(tellLiveMove({ ...BERLIN, label: 'Berlin', cityId: 'DE:berlin' })).toBe(false);
});

it('the place does not wait for its name: a lookup that hangs is overtaken, and the name follows', async () => {
  let answer: (l: { city: string; countryCode: string }) => void = () => {};
  jest.spyOn(nominatim, 'reverseLocality').mockImplementation(
    () => new Promise(resolve => (answer = resolve)),
  );
  const { probe } = await atHome();
  const started = Date.now();
  mockLocator.fire[0]({ ...BERLIN, timestamp: Date.now(), stage: 'coarse' });
  await until(near(probe, BERLIN), 'Berlin on screen without its name', 20_000);
  // Not the lookup's four tries of seven seconds.
  expect(Date.now() - started).toBeLessThan(15_000);
  expect(getLocationFreshness()).toEqual({ status: 'ok', moved: false });
  answer({ city: 'Berlin', countryCode: 'de' });
  await until(() => {
    const c = probe.current();
    return c.phase === 'ready' && c.cityName === 'Berlin';
  }, 'the name, when it came');
  expect(near(probe, BERLIN)()).toBe(true);
  probe.unmount();
});

it('an earlier request’s older answer does not put the place back', async () => {
  const { probe } = await atHome();
  // Asked again while the launch's precise request is still listening.
  askLiveRecheck();
  await until(() => mockLocator.fire.length > 1, 'the second request');
  mockLocator.fire[1]({ ...BERLIN, timestamp: Date.now(), stage: 'coarse' });
  await until(near(probe, BERLIN), 'Berlin on screen', 20_000);
  // The first request's wait runs out: the phone's last position, from before.
  mockLocator.fire[0]({ latitude: 57.7089, longitude: 11.9746, timestamp: Date.now() - 3 * 3_600_000, stage: 'fine' });
  await settle(20);
  expect(near(probe, BERLIN)()).toBe(true);
  expect(getLocationFreshness()).toEqual({ status: 'ok', moved: false });
  probe.unmount();
});

it('a move noticed while the app is on screen asks for the position again', async () => {
  expect(askLiveRecheck()).toBe(false);
  const { probe } = await atHome();
  const before = mockLocator.fire.length;
  expect(askLiveRecheck()).toBe(true);
  await until(() => mockLocator.fire.length > before, 'the position asked for again');
  probe.unmount();
  expect(askLiveRecheck()).toBe(false);
});

it('"Not updated" with the app open: it looks again by itself, a few times and no more', async () => {
  _setLocationRetryDelaysForTests([60, 60]);
  const was = Object.getOwnPropertyDescriptor(AppState, 'currentState');
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => 'active' });
  try {
    const { probe } = await atHome();
    const old = () => ({ ...STOCKHOLM, timestamp: Date.now() - 5 * 3_600_000, stage: 'fine' as const });
    mockLocator.fire[0](old());
    await until(() => mockLocator.fire.length === 2, 'the first try of its own');
    mockLocator.fire[1](old());
    await until(() => mockLocator.fire.length === 3, 'the second');
    mockLocator.fire[2](old());
    await settle(30);
    // Then it is left to the reader.
    expect(mockLocator.fire.length).toBe(3);
    expect(getLocationFreshness().status).toBe('notUpdated');
    // Found: the count starts again for a later journey.
    mockLocator.fire[2]({ ...STOCKHOLM, timestamp: Date.now(), stage: 'fine' });
    await settle(10);
    expect(getLocationFreshness()).toEqual({ status: 'ok', moved: false });
    probe.unmount();
  } finally {
    if (was) Object.defineProperty(AppState, 'currentState', was);
    _setLocationRetryDelaysForTests([120_000, 300_000, 600_000]);
  }
});

it('Android: a request whose wait runs out answers with the newest position the phone has', () => {
  const root = path.join(__dirname, '..', '..');
  const patch = readFileSync(path.join(root, 'patches/@react-native-community+geolocation+3.4.0.patch'), 'utf8');
  expect(patch).toMatch(/\+\s+private static Location newestLastKnown\(LocationManager locationManager\)/);
  // The single request, and the "Approximate" one at its time limit and on an empty answer.
  expect(patch.match(/\+\s+Location last = newestLastKnown\(/g)).toHaveLength(2);
  // Android 12+: the quick request asks the OS's fused provider, for every reader.
  expect(patch).toMatch(/\+\s+&& \(approximateOnly\(\) \|\| !locationOptions\.highAccuracy\)\) \{/);
  expect(patch).toMatch(/\+\s+Location answer = location != null \? location : newestLastKnown\(locationManager\);/);
  const java = readFileSync(
    path.join(root, 'node_modules/@react-native-community/geolocation/android/src/main/java/com/reactnativecommunity/geolocation/AndroidLocationManager.java'),
    'utf8',
  );
  expect(java).toContain('private static Location newestLastKnown(LocationManager locationManager)');
});
