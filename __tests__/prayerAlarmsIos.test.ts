/**
 * Prayer alarms on iPhone (AlarmKit, iOS 26) — issue #63.
 *
 *   1. Switch on + permission: the five prayers go to the native module,
 *      with the bundled adhan clip (extension included) as the sound.
 *   2. The notification beside each alarm stays, but is silent and does not
 *      ask the app to play the adhan a second time.
 *   3. Without the switch, or without the permission, nothing changes: the
 *      notification keeps its sound and no alarm is registered.
 *   4. Sunrise is never an alarm.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';

jest.mock('../src/native/PrayerAlarms', () => ({
  prayerAlarmAccess: jest.fn(),
  schedulePrayerAlarms: jest.fn(() => Promise.resolve(5)),
  clearPrayerAlarms: jest.fn(() => Promise.resolve()),
}));
import {
  clearPrayerAlarms,
  prayerAlarmAccess,
  schedulePrayerAlarms,
} from '../src/native/PrayerAlarms';

const today = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

const ORIGINAL_OS = Platform.OS;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 5, 14, 4, 0, 0));
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
    android: { alarm: 1 },
    authorizationStatus: 1,
  });
  (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
  (prayerAlarmAccess as jest.Mock).mockResolvedValue('authorized');
});

afterEach(() => jest.useRealTimers());

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
});

type Created = {
  id: string;
  data?: Record<string, string>;
  ios?: { sound?: string };
};
const created = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls.map(
    c => c[0] as Created,
  );
const prayerNotif = (name: string) =>
  created().find(n => n.id.startsWith('pt-') && n.id.endsWith(`-${name}`));

async function sync(over: Record<string, unknown> = {}) {
  await syncPrayerNotifications({
    enabled: true,
    prePrayerReminderMinutes: 0,
    notificationSound: 'adhan_makkah',
    sunriseEnabled: true,
    prayerAlertFullScreen: true,
    accentColor: '#1f5f4a',
    today,
    ...over,
  } as Parameters<typeof syncPrayerNotifications>[0]);
}

test('on + authorized: the five prayers become alarms with the bundled adhan', async () => {
  await sync();
  expect(schedulePrayerAlarms).toHaveBeenCalledTimes(1);
  const alarms = (schedulePrayerAlarms as jest.Mock).mock.calls[0][0];
  expect(alarms.map((a: { prayer: string }) => a.prayer)).toEqual([
    'Fajr',
    'Dhuhr',
    'Asr',
    'Maghrib',
    'Isha',
  ]);
  for (const a of alarms) {
    expect(a.sound).toBe('adhan_makkah.caf');
    expect(a.snoozeMinutes).toBe(10);
    expect(a.tint).toBe('#1f5f4a');
    expect(a.at).toBeGreaterThan(Date.now());
    expect(typeof a.stopLabel).toBe('string');
    expect(typeof a.pauseLabel).toBe('string');
    expect(typeof a.resumeLabel).toBe('string');
  }
  expect(clearPrayerAlarms).not.toHaveBeenCalled();
});

test('the notification beside an alarm is silent and does not replay the adhan', async () => {
  await sync();
  const fajr = prayerNotif('Fajr');
  expect(fajr).toBeDefined();
  expect(fajr!.ios?.sound).toBeUndefined();
  expect(fajr!.data?.usesAdhan).toBe('0');
  // Sunrise is no prayer: not an alarm, and it keeps its own plain sound.
  const sunrise = prayerNotif('Sunrise');
  expect(sunrise?.ios?.sound).toBe('default');
});

test('a plain-sound row rings the system alarm tone', async () => {
  await sync({ notificationSound: 'default' });
  const alarms = (schedulePrayerAlarms as jest.Mock).mock.calls[0][0];
  expect(alarms.length).toBe(5);
  for (const a of alarms) expect(a.sound).toBe('');
});

test('a silenced row has no alarm, like it has no notification', async () => {
  await sync({ alertModes: { Fajr: 'silent' } });
  const alarms = (schedulePrayerAlarms as jest.Mock).mock.calls[0][0];
  expect(alarms.map((a: { prayer: string }) => a.prayer)).not.toContain('Fajr');
});

test('switch off: no alarms, and the notification keeps its adhan', async () => {
  await sync({ prayerAlertFullScreen: false });
  expect(schedulePrayerAlarms).not.toHaveBeenCalled();
  expect(clearPrayerAlarms).toHaveBeenCalled();
  expect(prayerNotif('Fajr')!.ios?.sound).toBe('adhan_makkah.caf');
  expect(prayerNotif('Fajr')!.data?.usesAdhan).toBe('1');
});

test('permission refused: the notification stays exactly as it was', async () => {
  (prayerAlarmAccess as jest.Mock).mockResolvedValue('denied');
  await sync();
  expect(schedulePrayerAlarms).not.toHaveBeenCalled();
  expect(clearPrayerAlarms).toHaveBeenCalled();
  expect(prayerNotif('Fajr')!.ios?.sound).toBe('adhan_makkah.caf');
});

test('notifications turned off take the alarms down too', async () => {
  await sync({ enabled: false });
  expect(clearPrayerAlarms).toHaveBeenCalled();
  expect(schedulePrayerAlarms).not.toHaveBeenCalled();
});
