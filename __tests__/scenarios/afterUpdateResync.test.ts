/**
 * SCENARIO 9 — the first start of a new build rewrites the prayer alerts.
 *
 * Once per build: from the real stored settings and the real prayer cache,
 * the alerts are written again (what the scheduler is handed is checked
 * here; the scheduler itself is the notifications' own business) — with the
 * user's offsets and the active place's source — and never again for the
 * same build. On a phone with nothing stored, or a store that throws, it
 * does not crash and does not schedule anything from nothing.
 */
jest.unmock('adhan');

const mockVersion = { versionName: '2.33.0', buildNumber: '400' };
jest.mock('../../src/native/AppVersion', () => ({
  get AppVersionModule() {
    return mockVersion;
  },
}));
jest.mock('../../src/notifications/prayerNotifications', () => ({
  syncPrayerNotifications: jest.fn(async () => ({ status: 'scheduled' })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as prayerStorage from '../../src/prayer/prayerStorage';
import { syncPrayerNotifications } from '../../src/notifications/prayerNotifications';
import {
  ALERTS_VERSION_KEY,
  alertsResyncTask,
  resyncAfterUpdate,
  _resetAfterUpdateForTests,
} from '../../src/notifications/afterUpdate';
import {
  loadSettings,
  _resetSettingsStorageForTests,
} from '../../src/settings/storage';
import { _resetMethodCurrencyForTests } from '../../src/providers/methodCurrency';
import {
  changeSettings,
  goOffline,
  setZone,
  settle,
  toMin,
} from '../fixtures/scenarioHarness';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');

const sync = syncPrayerNotifications as jest.Mock;
const NOW = new Date('2026-10-17T10:00:00Z');
const BERLIN = { latitude: 52.52, longitude: 13.405 };

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
  await AsyncStorage.clear();
  EncryptedStorageMock.__reset();
  _resetSettingsStorageForTests();
  _resetMethodCurrencyForTests();
  _resetAfterUpdateForTests();
  prayerStorage._resetCacheSweepForTests();
  sync.mockClear();
  mockVersion.versionName = '2.33.0';
  mockVersion.buildNumber = '400';
  goOffline();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function berlinReaderWithAWeek() {
  let s = await loadSettings();
  s = await changeSettings(s, {
    onboardingComplete: true,
    locationOnboardingComplete: true,
    locationMode: 'manual',
    manualLatitude: BERLIN.latitude,
    manualLongitude: BERLIN.longitude,
    dataProvider: 'local_adhan',
    dataProviderAuto: false,
    calculationMethod: 3,
    notificationsEnabled: true,
    prayerOffsets: { Maghrib: 4 },
  });
  const raw = [];
  for (let i = 0; i < 7; i++) {
    raw.push(
      await prayerStorage.getOrFetchPrayerDay({
        provider: 'local_adhan',
        ...BERLIN,
        calculationMethod: 3,
        school: 0,
        date: new Date(NOW.getTime() + i * 86_400_000),
      }),
    );
  }
  await settle(5);
  return { s, raw };
}

it('a new build rewrites the alerts once, from what is stored, with the offsets', async () => {
  const { raw } = await berlinReaderWithAWeek();
  await AsyncStorage.setItem(ALERTS_VERSION_KEY, '2.32.0+390');

  expect(await resyncAfterUpdate(NOW)).toBe('rewritten');
  expect(sync).toHaveBeenCalledTimes(1);
  const arg = sync.mock.calls[0][0];
  expect(arg.enabled).toBe(true);
  expect(arg.baseDate).toEqual(new Date(2026, 9, 17));
  expect(arg.today.Fajr).toBe(raw[0].timings.Fajr);
  expect(toMin(arg.today.Maghrib)).toBe(toMin(raw[0].timings.Maghrib) + 4);
  expect(arg.week.length).toBeGreaterThanOrEqual(7);
  expect(await AsyncStorage.getItem(ALERTS_VERSION_KEY)).toBe('2.33.0+400');

  // The same build, a new process: nothing to do.
  _resetAfterUpdateForTests();
  expect(await resyncAfterUpdate(NOW)).toBe('same-version');
  expect(sync).toHaveBeenCalledTimes(1);

  // A rebuild under the same version name is a new build.
  mockVersion.buildNumber = '401';
  _resetAfterUpdateForTests();
  expect(await resyncAfterUpdate(NOW)).toBe('rewritten');
  expect(sync).toHaveBeenCalledTimes(2);
});

it('with nothing stored at all, it neither crashes nor schedules from nothing', async () => {
  expect(await resyncAfterUpdate(NOW)).toBe('rewritten');
  expect(sync).not.toHaveBeenCalled();
  // Done for this build: the next start does not try again for nothing.
  expect(await AsyncStorage.getItem(ALERTS_VERSION_KEY)).toBe('2.33.0+400');
});

it('a store that throws is a failed run, tried again next start — never a crash', async () => {
  await berlinReaderWithAWeek();
  // Replaced, not spied on: the mock's own getItem is a jest.fn, and a spy
  // on it would take its implementation with it when restored.
  const store = AsyncStorage as unknown as {
    getItem: typeof AsyncStorage.getItem;
  };
  const getItem = store.getItem;
  store.getItem = jest.fn(async () => {
    throw new Error('SQLITE_IOERR');
  });
  expect(await resyncAfterUpdate(NOW)).toBe('failed');
  await expect(alertsResyncTask()).resolves.toBeUndefined();
  store.getItem = getItem;
  _resetAfterUpdateForTests();
  expect(await resyncAfterUpdate(NOW)).toBe('rewritten');
  expect(sync).toHaveBeenCalledTimes(1);
});

it('with no version from the native side, nothing is rewritten and nothing recorded', async () => {
  mockVersion.versionName = '';
  mockVersion.buildNumber = '';
  expect(await resyncAfterUpdate(NOW)).toBe('unknown-version');
  expect(await AsyncStorage.getItem(ALERTS_VERSION_KEY)).toBeNull();
});
