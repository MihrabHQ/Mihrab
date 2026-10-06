/**
 * The snooze deadline, as the scheduler stamps it (issue: snooze follows the
 * prayer's remaining time). End to end through `syncPrayerNotifications`.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';

const full = { Fajr: '05:00', Sunrise: '06:30', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: '20:00' };
// The home screen drops Sunrise from what it draws when that row is off.
const { Sunrise: _hidden, ...withoutSunrise } = full;

const ORIGINAL_OS = Platform.OS;
beforeEach(() => {
  jest.useFakeTimers();
  // 04:00 on the 14th, so every prayer of the day is still ahead.
  jest.setSystemTime(new Date(2026, 5, 14, 4, 0, 0));
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
    android: { alarm: 1 },
    authorizationStatus: 1,
  });
  (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
});

const posted = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls.map(c => c[0]);
const forPrayer = (name: string) =>
  posted().find(n => n.data?.kind === 'prayer_time' && n.data?.prayer === name);

describe('the deadline stamped on each prayer alert', () => {
  it('Fajr ends at sunrise, the day prayers at the next one', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today: full,
      tomorrow: full,
    });
    const at = (h: number, m: number, d = 14) => String(new Date(2026, 5, d, h, m).getTime());
    expect(forPrayer('Fajr').data.deadline).toBe(at(6, 30));
    expect(forPrayer('Dhuhr').data.deadline).toBe(at(15, 0));
    expect(forPrayer('Asr').data.deadline).toBe(at(18, 0));
    expect(forPrayer('Maghrib').data.deadline).toBe(at(20, 0));
    // Isha ends at tomorrow's Fajr.
    expect(forPrayer('Isha').data.deadline).toBe(at(5, 0, 15));
  });

  it('still ends Fajr at sunrise when the Sunrise row is hidden', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today: withoutSunrise,
      tomorrow: withoutSunrise,
      windowWeek: [full, full],
    });
    expect(forPrayer('Fajr').data.deadline).toBe(String(new Date(2026, 5, 14, 6, 30).getTime()));
  });

  it('Sunrise itself carries no deadline and no snooze', async () => {
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today: full,
      tomorrow: full,
    });
    const sunrise = posted().find(n => n.title === 'Sunrise');
    expect(sunrise.data?.deadline).toBeUndefined();
    expect(sunrise.android.actions).toEqual([]);
  });

  it('the buttons on a short prayer already follow the time left', async () => {
    // Fajr 05:00 → sunrise 05:40: 40 minutes. A snooze must leave 15, so up to 25 fit: 5, 10, 15.
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      today: { ...full, Sunrise: '05:40' },
      tomorrow: full,
    });
    const snooze = forPrayer('Fajr').android.actions.find(
      (a: { pressAction: { id: string } }) => a.pressAction.id === 'adhan_snooze',
    );
    expect(snooze.input.choices).toEqual(['Snooze 5 min', 'Snooze 10 min', 'Snooze 15 min']);
  });
});
