/**
 * WHICH adhan, apart from WHETHER (#129): the list of sounds is the adhans
 * alone, a prayer set to Adhan always has one to play, and nothing an
 * install already does changes by upgrading.
 */
import fs from 'fs';
import path from 'path';
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import {
  DEFAULT_ADHAN_SOUND,
  adhanVoiceInUse,
  adhanVoiceOf,
  chooseAdhanVoice,
  withoutAdhan,
} from '../src/settings/adhanVoice';
import { alertModeFor } from '../src/settings/alertModes';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import type { TimingsMap } from '../src/types/prayer';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('the adhan in force', () => {
  it('is the chosen one, or the default where none has been', () => {
    expect(DEFAULT_ADHAN_SOUND).toBe('adhan_makkah');
    expect(adhanVoiceOf('default')).toBe('adhan_makkah');
    expect(adhanVoiceOf('adhan_madina')).toBe('adhan_madina');
    expect(adhanVoiceOf('custom')).toBe('custom');
  });

  it('is built around only where a prayer plays one', () => {
    expect(adhanVoiceInUse('default', {})).toBe('default');
    expect(adhanVoiceInUse('default', { Fajr: 'notification', Isha: 'silent' })).toBe('default');
    expect(adhanVoiceInUse('default', { Fajr: 'adhan' })).toBe('adhan_makkah');
    // The Live Activity's button, for the one prayer coming.
    expect(adhanVoiceInUse('default', {}, true)).toBe('adhan_makkah');
    expect(adhanVoiceInUse('adhan_aqsa', {})).toBe('adhan_aqsa');
    // Sunrise is not a prayer: it cannot be what asks for the adhan.
    expect(adhanVoiceInUse('default', { Sunrise: 'adhan' as never })).toBe('default');
  });
});

describe('nothing changes for an install that upgrades', () => {
  it('keeps "no adhan chosen" as the default, and what a prayer nobody set falls back to', () => {
    expect(DEFAULT_SETTINGS.notificationSound).toBe('default');
    expect(alertModeFor('Fajr', {}, DEFAULT_SETTINGS.notificationSound !== 'default')).toBe('notification');
    expect(alertModeFor('Fajr', {}, true)).toBe('adhan');
  });
});

describe('choosing an adhan from the list', () => {
  it('turns the adhan on for the prayers nobody has set, as it always did', () => {
    expect(chooseAdhanVoice({ notificationSound: 'default', prayerAlertModes: {} }, 'adhan_makkah')).toEqual({
      notificationSound: 'adhan_makkah',
    });
    // Rows set, but none to Adhan: still the old way.
    expect(chooseAdhanVoice({ notificationSound: 'default', prayerAlertModes: { Fajr: 'silent' } }, 'adhan_egypt')).toEqual({
      notificationSound: 'adhan_egypt',
    });
  });

  it('changes the voice and nothing else for someone deciding prayer by prayer', () => {
    const next = chooseAdhanVoice(
      { notificationSound: 'default', prayerAlertModes: { Fajr: 'adhan', Isha: 'silent' } },
      'adhan_madina',
    );
    expect(next.notificationSound).toBe('adhan_madina');
    expect(next.prayerAlertModes).toEqual({
      Fajr: 'adhan',
      Dhuhr: 'notification',
      Asr: 'notification',
      Maghrib: 'notification',
      Isha: 'silent',
    });
    // So each prayer sounds after the choice as it did before it.
    for (const key of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      expect(alertModeFor(key, next.prayerAlertModes ?? {}, true)).toBe(
        alertModeFor(key, { Fajr: 'adhan', Isha: 'silent' }, false),
      );
    }
  });

  it('only changes the voice once one is chosen', () => {
    expect(chooseAdhanVoice({ notificationSound: 'adhan_makkah', prayerAlertModes: { Fajr: 'adhan' } }, 'adhan_aqsa')).toEqual({
      notificationSound: 'adhan_aqsa',
    });
  });
});

describe('"turn off the adhan" from the notification', () => {
  it('leaves no prayer asking for one', () => {
    expect(withoutAdhan({ Fajr: 'adhan', Asr: 'silent', Sunrise: 'notification' })).toEqual({
      notificationSound: 'default',
      prayerAlertModes: { Fajr: 'notification', Asr: 'silent', Sunrise: 'notification' },
    });
    const controls = read('src/notifications/adhanSafetyControls.ts');
    expect(controls).toContain('await saveSettings({ ...settings, ...withoutAdhan(settings.prayerAlertModes) });');
  });
});

describe('the list and its row', () => {
  const picker = read('src/screens/settings/SoundPickerModal.tsx');
  const card = read('src/screens/settings/NotificationsCard.tsx');
  const page = read('src/screens/settings/pages/NotificationSettingsScreen.tsx');

  it('lists the adhans alone: "Default notification" is not one', () => {
    expect(picker).toMatch(/NOTIFICATION_SOUND_OPTIONS\.filter\(\s*option => option\.id !== 'default' &&/);
  });

  it('is named for what it chooses, and shows the adhan in force', () => {
    expect(card).toContain("title={t('settings.alertModeAdhan', 'Adhan')}");
    expect(card).toContain('getNotificationSoundOption(adhanVoiceOf(settings.notificationSound))');
    expect(page).toContain('currentSound={adhanVoiceOf(settings.notificationSound)}');
    expect(page).toContain('onSelect={id => updateSettings(chooseAdhanVoice(settings, id))}');
  });
});

describe('through the scheduler', () => {
  const ORIGINAL_OS = Platform.OS;
  const NOW = new Date(2026, 5, 14, 10, 0, 0);
  const today: TimingsMap = { Fajr: '05:00', Sunrise: '06:30', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: '20:00' };
  const fired = (name: string) =>
    (notifee.createTriggerNotification as jest.Mock).mock.calls
      .map(c => c[0])
      .filter(n => !String(n.id).includes('pre-') && !String(n.id).includes('daruri-') && String(n.id).endsWith(`-${name}`))[0];
  const channelsMade = () => (notifee.createChannel as jest.Mock).mock.calls.map(c => c[0].id as string);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({ android: { alarm: 1 }, authorizationStatus: 1 });
    (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
  });
  afterEach(() => jest.useRealTimers());
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
  });
  const sync = (alertModes: Record<string, string>) =>
    syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default',
      alertModes: alertModes as never,
      today,
      tomorrow: today,
      baseDate: NOW,
    });

  it('a prayer set to Adhan under "Default notification" plays the adhan, on its own channel (#129)', async () => {
    await sync({ Maghrib: 'adhan' });
    const maghrib = fired('Maghrib');
    expect(maghrib.android.channelId).toBe('prayer-times-adhan-makkah');
    expect(channelsMade()).toContain('prayer-times-adhan-makkah');
    expect(maghrib.data.usesAdhan).toBe('1');
    expect(maghrib.data.adhanSound).toBe('adhan_makkah');
    expect(String(maghrib.ios?.sound)).toContain('adhan_makkah');
    // The prayers nobody set keep the plain alert.
    expect(fired('Dhuhr').android.channelId).toBe('prayer-times-default');
    expect(fired('Dhuhr').data.usesAdhan).toBe('0');
  });

  it('with no prayer set to Adhan, no adhan channel is made for nothing', async () => {
    await sync({});
    expect(channelsMade()).toEqual(['prayer-times-default']);
    for (const name of ['Dhuhr', 'Asr', 'Maghrib', 'Isha']) expect(fired(name).android.channelId).toBe('prayer-times-default');
  });
});
