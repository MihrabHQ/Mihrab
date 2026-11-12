/**
 * #129, through the scheduler that runs: "Default notification" as the alert
 * sound, the adhan on the alarm stream, a prayer set to Adhan.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import { ensureAlarmAdhanChannel } from '../src/native/CustomAdhan';
import { registerAlarmTwin } from '../src/notifications/notificationSounds';
import type { TimingsMap } from '../src/types/prayer';

jest.mock('../src/native/CustomAdhan', () => ({
  ...jest.requireActual('../src/native/CustomAdhan'),
  ensureAlarmAdhanChannel: jest.fn(),
}));

const ORIGINAL_OS = Platform.OS;
const NOW = new Date(2026, 5, 14, 10, 0, 0);
const today: TimingsMap = { Fajr: '05:00', Sunrise: '06:30', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: '20:00' };
const made = ensureAlarmAdhanChannel as jest.Mock;

const channelOf = (name: string) =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls
    .map(c => c[0])
    .filter(n => !String(n.id).includes('pre-') && !String(n.id).includes('daruri-') && String(n.id).endsWith(`-${name}`))[0]
    ?.android.channelId as string | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  registerAlarmTwin(undefined);
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({ android: { alarm: 1 }, authorizationStatus: 1 });
  (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
  registerAlarmTwin(undefined);
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
});

const sync = () =>
  syncPrayerNotifications({
    enabled: true,
    prePrayerReminderMinutes: 0,
    notificationSound: 'default',
    adhanUsesAlarmStream: true,
    alertModes: { Maghrib: 'adhan' },
    today,
    tomorrow: today,
    baseDate: NOW,
  });

describe('"Default notification", the alarm stream, a prayer set to Adhan', () => {
  it('plays an adhan — the default one — on the alarm stream, on a channel that was made', async () => {
    made.mockImplementation((id: string) => Promise.resolve(id));
    await sync();
    // WHICH adhan is apart from whether (settings/adhanVoice.ts): the row asked for one.
    expect(made).toHaveBeenCalledWith('prayer-times-adhan-makkah-alarm', expect.any(String), 'adhan_makkah');
    expect(channelOf('Maghrib')).toBe('prayer-times-adhan-makkah-alarm');
    // A prayer left on the plain alert is not on the alarm stream.
    expect(channelOf('Dhuhr')).toBe('prayer-times-default');
  });

  it('still arrives when the twin could not be made: the ordinary channel, never a missing one', async () => {
    made.mockResolvedValue(null);
    await sync();
    expect(channelOf('Maghrib')).toBe('prayer-times-adhan-makkah');
  });

  it('with no prayer set to Adhan, the twin is the system tone\'s — made, and addressed by nothing', async () => {
    made.mockImplementation((id: string) => Promise.resolve(id));
    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      adhanUsesAlarmStream: true,
      today,
      tomorrow: today,
      baseDate: NOW,
    });
    expect(made).toHaveBeenCalledWith('prayer-times-default-alarm', expect.any(String), '@default');
    for (const name of ['Dhuhr', 'Asr', 'Maghrib', 'Isha']) expect(channelOf(name)).toBe('prayer-times-default');
  });
});
