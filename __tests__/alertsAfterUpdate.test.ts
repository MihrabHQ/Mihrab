/**
 * The prayer alerts are written again on the first start of a new build.
 *
 * They were written only from Today, about four days ahead, so after an
 * update the previous version's alerts kept firing at the times it had
 * worked out until Today was drawn — and a widget's deep link into another
 * tab never drew it. The first start of a new build (or, on Android, the
 * update broadcast's headless task) now writes them again, and the widget
 * payload, before any screen; the same build again does nothing.
 */
const mockVersion: { versionName?: string; buildNumber?: string } = {};
jest.mock('../src/native/AppVersion', () => ({
  get AppVersionModule() {
    return mockVersion;
  },
}));
/** Writes of the schedule asked for by anyone else in the process (Today). */
const mockSyncsAsked = { n: 0 };
jest.mock('../src/notifications/prayerNotifications', () => ({
  syncPrayerNotifications: jest.fn(async () => ({ status: 'scheduled' })),
  prayerSyncsAsked: () => mockSyncsAsked.n,
}));
jest.mock('../src/widget/republishWidgetPayload', () => ({
  republishWidgetPayload: jest.fn(async () => true),
  rawWindowWithYesterday: jest.fn(async () => {
    const day = {
      Fajr: '05:10',
      Sunrise: '06:50',
      Dhuhr: '12:30',
      Asr: '15:20',
      Maghrib: '18:05',
      Isha: '19:40',
    };
    return { days: Array.from({ length: 7 }, () => ({ ...day })) };
  }),
}));
jest.mock('../src/settings/storage', () => ({ loadSettings: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ALERTS_VERSION_KEY,
  _resetAfterUpdateForTests,
  alertsResyncTask,
  resyncAfterUpdate,
} from '../src/notifications/afterUpdate';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import { republishWidgetPayload } from '../src/widget/republishWidgetPayload';
import { loadSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const sync = syncPrayerNotifications as jest.Mock;
const republish = republishWidgetPayload as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  _resetAfterUpdateForTests();
  mockVersion.versionName = '2.33.0';
  mockVersion.buildNumber = '233';
  mockSyncsAsked.n = 0;
  (loadSettings as jest.Mock).mockResolvedValue({
    ...DEFAULT_SETTINGS,
    locationMode: 'manual',
    manualLatitude: 59.33,
    manualLongitude: 18.07,
    notificationsEnabled: true,
  });
});

/** A new process: the same storage, nothing in memory. */
const restart = () => _resetAfterUpdateForTests();

test('a new build: the alerts and the widget are written once, and the build recorded', async () => {
  await AsyncStorage.setItem(ALERTS_VERSION_KEY, '2.32.0+232');
  expect(await resyncAfterUpdate()).toBe('rewritten');
  expect(sync).toHaveBeenCalledTimes(1);
  expect(republish).toHaveBeenCalledWith('launch', expect.any(Date));
  const params = sync.mock.calls[0][0];
  expect(params.enabled).toBe(true);
  expect(params.today.Fajr).toBe('05:10');
  expect(params.week).toHaveLength(7);
  expect(await AsyncStorage.getItem(ALERTS_VERSION_KEY)).toBe('2.33.0+233');

  // Asked again in the same process (root and headless task): once.
  expect(await resyncAfterUpdate()).toBe('rewritten');
  expect(sync).toHaveBeenCalledTimes(1);
});

test('the same build: nothing is written', async () => {
  await AsyncStorage.setItem(ALERTS_VERSION_KEY, '2.33.0+233');
  expect(await resyncAfterUpdate()).toBe('same-version');
  expect(sync).not.toHaveBeenCalled();
  expect(republish).not.toHaveBeenCalled();
});

test('after the update, the next start of the same build does nothing', async () => {
  await alertsResyncTask(); // the update broadcast's headless task
  expect(sync).toHaveBeenCalledTimes(1);
  restart();
  expect(await resyncAfterUpdate()).toBe('same-version');
  expect(sync).toHaveBeenCalledTimes(1);
});

test('a rebuild under the same version name is a new build', async () => {
  await AsyncStorage.setItem(ALERTS_VERSION_KEY, '2.33.0+232');
  expect(await resyncAfterUpdate()).toBe('rewritten');
  expect(sync).toHaveBeenCalledTimes(1);
});

test('the what’s-new sheet’s version is left alone', async () => {
  await AsyncStorage.setItem('mihrab.lastSeenVersion', '2.32.0');
  await resyncAfterUpdate();
  expect(await AsyncStorage.getItem('mihrab.lastSeenVersion')).toBe('2.32.0');
});

test('a write that failed is tried again on the next start', async () => {
  sync.mockRejectedValueOnce(new Error('notifee down'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await resyncAfterUpdate()).toBe('failed');
  warn.mockRestore();
  expect(await AsyncStorage.getItem(ALERTS_VERSION_KEY)).toBeNull();
  restart();
  expect(await resyncAfterUpdate()).toBe('rewritten');
  expect(sync).toHaveBeenCalledTimes(2);
});

test('no location yet: nothing to write, and the build is recorded', async () => {
  (loadSettings as jest.Mock).mockResolvedValue({
    ...DEFAULT_SETTINGS,
    locationMode: 'manual',
    manualLatitude: 0,
    manualLongitude: 0,
  });
  expect(await resyncAfterUpdate()).toBe('rewritten');
  expect(sync).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(ALERTS_VERSION_KEY)).toBe('2.33.0+233');
});

test('Today wrote the alerts while these were built: Today’s stand, and the build is recorded', async () => {
  // The widget's republish is where the time goes; Today, mounted beside
  // the root, writes its schedule from the live fix and the fetched days.
  republish.mockImplementationOnce(async () => {
    mockSyncsAsked.n += 1;
    return true;
  });
  expect(await resyncAfterUpdate()).toBe('rewritten');
  expect(sync).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(ALERTS_VERSION_KEY)).toBe('2.33.0+233');
});

test('a build that cannot say its version does nothing', async () => {
  mockVersion.versionName = undefined;
  mockVersion.buildNumber = undefined;
  expect(await resyncAfterUpdate()).toBe('unknown-version');
  expect(sync).not.toHaveBeenCalled();
});

test('the Android side starts the task on an update, and index.js registers it', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const receiver = fs.readFileSync(
    path.join(
      root,
      'android/app/src/main/java/com/prayer_times/MihrabRestartReceiver.kt',
    ),
    'utf8',
  );
  expect(receiver).toMatch(
    /ACTION_MY_PACKAGE_REPLACED\) \{[\s\S]*AlertsResyncHeadlessService/,
  );
  // The wake lock has no timeout and only the service's onDestroy releases
  // it: taken before a start that is refused, it would be held until the
  // process died. Taken once the start is accepted, as React Native's own
  // docs and the app's other receivers do.
  const start = receiver.indexOf(
    'startService(Intent(context, AlertsResyncHeadlessService::class.java))',
  );
  const lock = receiver.indexOf(
    'HeadlessJsTaskService.acquireWakeLockNow(context)',
  );
  expect(start).toBeGreaterThan(-1);
  expect(lock).toBeGreaterThan(start);
  const service = fs.readFileSync(
    path.join(
      root,
      'android/app/src/main/java/com/prayer_times/AlertsResyncHeadlessService.kt',
    ),
    'utf8',
  );
  expect(service).toMatch(/"AlertsResync"/);
  const manifest = fs.readFileSync(
    path.join(root, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  expect(manifest).toMatch(/android:name="\.AlertsResyncHeadlessService"/);
  // Started with startService and never promoted: a foreground service
  // type it never uses is a claim Play's review asks to justify.
  expect(manifest).toMatch(
    /android:name="\.AlertsResyncHeadlessService"\s*\n\s*android:exported="false" \/>/,
  );
  expect(receiver).not.toMatch(/startForegroundService\(\s*Intent\(context, AlertsResyncHeadlessService/);
  expect(service).not.toMatch(/startForeground\(/);
  const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  expect(index).toMatch(
    /registerHeadlessTask\('AlertsResync', \(\) => alertsResyncTask\)/,
  );
});
