/**
 * One alert per instant, in the polar night.
 *
 * Diyanet's method (and Sweden's, the same) prints Asr at Dhuhr's time when
 * Asr never forms — the published rule, kept as the tables print it. At
 * Tromsø on 21 December that is Dhuhr and Asr both at 11:47, and the
 * scheduler used to register two alerts, two adhans, at the same instant.
 */
jest.unmock('adhan');

import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import { computeDiyanetTimes } from '../src/providers/diyanetMethod';
import { oneEventPerInstant } from '../src/utils/prayerTimes';

const ORIGINAL_OS = Platform.OS;
const TROMSO = { latitude: 69.6492, longitude: 18.9553 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 11, 21, 6, 0, 0));
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => 'android',
  });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
    android: { alarm: 1 },
    authorizationStatus: 1,
  });
  (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => ORIGINAL_OS,
  });
});

const scheduledIds = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls.map(
    c => c[0].id as string,
  );
const instantsOf = (ids: string[]) =>
  ids.map(id => /-(\d+)-[A-Za-z]+$/.exec(id)?.[1]);

describe('Tromsø, 21 December', () => {
  const timings = computeDiyanetTimes({
    ...TROMSO,
    date: new Date(2026, 11, 21),
    school: 0,
  }).timings;

  it('has Asr printed at Dhuhr’s time, as Diyanet’s table does', () => {
    expect(timings.Asr).toBe(timings.Dhuhr);
  });

  it('rings once at that minute — the Dhuhr', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 10,
      notificationSound: 'adhan_makkah',
      today: timings,
      tomorrow: timings,
      baseDate: new Date(2026, 11, 21),
    });
    const ids = scheduledIds();
    const atPrayer = ids.filter(id => !id.includes('pre-'));
    expect(atPrayer.some(id => id.endsWith('-Dhuhr'))).toBe(true);
    expect(atPrayer.some(id => id.endsWith('-Asr'))).toBe(false);
    // No two alerts (nor two reminders) at one instant.
    const at = instantsOf(atPrayer);
    expect(new Set(at).size).toBe(at.length);
    const pre = instantsOf(ids.filter(id => id.includes('pre-')));
    expect(new Set(pre).size).toBe(pre.length);
  });

  it('rings the Asr at that minute when the Dhuhr is silenced', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'adhan_makkah',
      today: timings,
      tomorrow: timings,
      baseDate: new Date(2026, 11, 21),
      alertModes: { Dhuhr: 'silent' },
    });
    const ids = scheduledIds();
    expect(ids.some(id => id.endsWith('-Dhuhr'))).toBe(false);
    expect(ids.some(id => id.endsWith('-Asr'))).toBe(true);
  });
});

describe('oneEventPerInstant', () => {
  const at = (h: number, m = 0) => new Date(2026, 11, 21, h, m);
  it('keeps the first of two events at one instant, and a prayer over a non-prayer', () => {
    expect(
      oneEventPerInstant([
        { name: 'Fajr', at: at(6) },
        { name: 'Sunrise', at: at(11, 47) },
        { name: 'Dhuhr', at: at(11, 47) },
        { name: 'Asr', at: at(11, 47) },
        { name: 'Maghrib', at: at(12, 30) },
      ]).map(e => e.name),
    ).toEqual(['Fajr', 'Dhuhr', 'Maghrib']);
  });

  it('leaves distinct instants alone', () => {
    const list = [
      { name: 'Dhuhr', at: at(12) },
      { name: 'Asr', at: at(15) },
    ];
    expect(oneEventPerInstant(list)).toEqual(list);
  });
});
