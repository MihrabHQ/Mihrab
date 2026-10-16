/**
 * Full-screen prayer alerts — issue #63.
 *
 *   1. Off (the default), nothing about an alert changes.
 *   2. On, the five prayers carry the full-screen intent, the ALARM category
 *      (Do Not Disturb's default exception) and the words the native screen
 *      prints — and Sunrise does not.
 *   3. A snooze of a full-screen alert comes back full-screen; a plain one
 *      stays plain.
 *   4. The alarm screen's buttons reach the same JS as the notification's.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import { snoozePrayerNotification } from '../src/notifications/notificationActions';
import {
  PRAYER_ALARM_ACTIVITY,
  PRAYER_ALARM_COMPONENT,
  fullScreenAlarmData,
  isFullScreenAlarm,
} from '../src/notifications/fullScreenAlarm';

jest.mock('../src/notifications/prayerLogAction', () => {
  const actual = jest.requireActual('../src/notifications/prayerLogAction');
  return { ...actual, handlePrayerLogEvent: jest.fn(() => Promise.resolve(true)) };
});
import { handlePrayerLogEvent } from '../src/notifications/prayerLogAction';
import { prayerAlarmActionTask } from '../src/notifications/prayerAlarmTask';

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

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => ORIGINAL_OS,
  });
});

type Created = { id: string; data?: Record<string, string>; android: Record<string, unknown> };

function created(): Created[] {
  return (notifee.createTriggerNotification as jest.Mock).mock.calls.map(
    c => c[0] as Created,
  );
}

const byName = (name: string) =>
  created().find(n => n.id.startsWith('pt-') && n.id.endsWith(`-${name}`));

async function sync(prayerAlertFullScreen?: boolean) {
  await syncPrayerNotifications({
    enabled: true,
    prePrayerReminderMinutes: 0,
    notificationSound: 'default',
    sunriseEnabled: true,
    prayerAlertFullScreen,
    today,
  } as Parameters<typeof syncPrayerNotifications>[0]);
}

describe('scheduling', () => {
  test('off by default: no prayer alert is full-screen', async () => {
    await sync(undefined);
    expect(created().length).toBeGreaterThan(0);
    for (const n of created()) {
      expect(n.android.fullScreenAction).toBeUndefined();
      expect(isFullScreenAlarm(n.data)).toBe(false);
    }
  });

  test('on: the five prayers open the alarm screen, as alarms', async () => {
    await sync(true);
    for (const name of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      const n = byName(name);
      expect(n).toBeDefined();
      expect(n!.android.fullScreenAction).toEqual({
        id: 'default',
        launchActivity: PRAYER_ALARM_ACTIVITY,
        // Notifee hands the activity the notification only with this set.
        mainComponent: PRAYER_ALARM_COMPONENT,
      });
      // Even a plain-sound row: Do Not Disturb lets ALARM through.
      expect(n!.android.category).toBe('alarm');
      expect(n!.data).toEqual(
        expect.objectContaining({
          fullScreen: '1',
          fsStop: expect.any(String),
          fsSnooze: expect.any(String),
          fsSnoozeMinutes: '10',
          fsSnoozeAlt: expect.stringContaining('"m":5'),
          fsLog: expect.any(String),
          prayer: name,
        }),
      );
    }
  });

  test('on: Sunrise is not a prayer and never takes the screen', async () => {
    await sync(true);
    const sunrise = byName('Sunrise');
    if (!sunrise) return; // not scheduled in this configuration
    expect(sunrise.android.fullScreenAction).toBeUndefined();
    expect(isFullScreenAlarm(sunrise.data)).toBe(false);
  });

  test('every data value is a string, which is all Notifee accepts', () => {
    for (const v of Object.values(fullScreenAlarmData('Fajr'))) {
      expect(typeof v).toBe('string');
    }
    expect(fullScreenAlarmData('').fsLog).toBeUndefined();
  });
});

describe('snooze', () => {
  const base = {
    id: 'pt-1-Fajr',
    title: 'Fajr',
    subtitle: '05:00',
    body: 'It is time for Fajr',
    android: { channelId: 'prayer-times-default' },
  };

  test('a full-screen alert comes back full-screen, time and all', async () => {
    await snoozePrayerNotification(
      { ...base, data: { prayer: 'Fajr', ...fullScreenAlarmData('Fajr') } },
      10,
    );
    const [n] = created();
    expect(n.id).toMatch(/^adhan-snooze-/);
    expect(n.android.fullScreenAction).toBeDefined();
    expect((n as unknown as { subtitle: string }).subtitle).toBe('05:00');
  });

  test('rides the exact alarm when it is granted, like the prayer did', async () => {
    await snoozePrayerNotification({ ...base, data: { prayer: 'Fajr' } }, 10);
    const trigger = (notifee.createTriggerNotification as jest.Mock).mock
      .calls[0][1];
    expect(trigger.timestamp).toBe(Date.now() + 10 * 60_000);
    expect(trigger.alarmManager).toEqual({ type: 3 }); // SET_EXACT_AND_ALLOW_WHILE_IDLE
  });

  test('a plain alert stays plain', async () => {
    await snoozePrayerNotification({ ...base, data: { prayer: 'Fajr' } }, 10);
    const [n] = created();
    expect(n.android.fullScreenAction).toBeUndefined();
  });
});

describe('the alarm screen buttons', () => {
  const press = {
    id: 'pt-1-Dhuhr',
    title: 'Dhuhr',
    body: 'It is time for Dhuhr',
    channelId: 'prayer-times-default',
    data: { prayer: 'Dhuhr', targetDate: '2026-06-14', fullScreen: '1' },
  };

  test('Snooze re-fires the same alert after the minutes asked', async () => {
    await prayerAlarmActionTask({ ...press, action: 'snooze', minutes: 10 });
    const [n] = created();
    expect(n.id).toBe(`adhan-snooze-${Date.now() + 10 * 60_000}`);
    expect(n.data).toEqual(expect.objectContaining({ prayer: 'Dhuhr' }));
  });

  test('Log goes through the notification log handler, for that prayer', async () => {
    await prayerAlarmActionTask({ ...press, action: 'log' });
    expect(handlePrayerLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          pressAction: { id: 'journal-log-prayer:Dhuhr' },
          notification: expect.objectContaining({ id: 'pt-1-Dhuhr' }),
        }),
      }),
    );
  });

  test('an unknown action does nothing', async () => {
    await prayerAlarmActionTask({ ...press, action: 'launch-missiles' });
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
    expect(handlePrayerLogEvent).not.toHaveBeenCalled();
  });
});

describe('alarm screen sky', () => {
  const { fullScreenAlarmData } = require('../src/notifications/fullScreenAlarm');
  it.each(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'])('%s carries the hero sky', prayer => {
    const d = fullScreenAlarmData(prayer);
    expect(d.fsSkyTop).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(d.fsSkyBottom).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(['light', 'dark']).toContain(d.fsInk);
  });
  it('a non-prayer carries none', () => {
    expect(fullScreenAlarmData('').fsSkyTop).toBeUndefined();
  });

  it('under the Sky theme is the hour\'s mood — three stops, its ink, its accent — and the native screen reads them', () => {
    const { setFullScreenAlarmSkyTheme, fullScreenAlarmSkyTheme } = require('../src/notifications/fullScreenAlarm');
    const { skyMoodFor } = require('../src/theme/skyMoods');
    // Off to start from: a test above may have loaded settings, and a new
    // install's default is Sky (2.31).
    setFullScreenAlarmSkyTheme(false);
    expect(fullScreenAlarmSkyTheme()).toBe(false);
    expect(fullScreenAlarmData('Fajr').fsSkyMid).toBeUndefined();
    setFullScreenAlarmSkyTheme(true);
    try {
      const expected: Record<string, [string, number]> = {
        Fajr: ['dawn', 1],
        Dhuhr: ['day', 0.55],
        Asr: ['sunset', 0.45],
        Maghrib: ['dusk', 0],
        Isha: ['night', 0],
      };
      for (const [prayer, [passage, t]] of Object.entries(expected)) {
        const mood = skyMoodFor(passage, t);
        const d = fullScreenAlarmData(prayer);
        expect(d.fsSkyTop).toBe(mood.heroTop);
        expect(d.fsSkyMid).toBe(mood.heroMid);
        expect(d.fsSkyBottom).toBe(mood.heroFoot);
        expect(d.fsText).toBe(mood.text);
        expect(d.fsAccent).toBe(mood.accent);
        expect(d.fsOnAccent).toBe(mood.onAccent);
        expect(d.fsInk).toBe(mood.isDark ? 'light' : 'dark');
      }
      // Dhuhr rings into the light; Isha into the dark.
      expect(fullScreenAlarmData('Dhuhr').fsInk).toBe('dark');
      expect(fullScreenAlarmData('Isha').fsInk).toBe('light');
      // Five alerts, five skies: no two share a top colour, and Fajr is
      // not Isha's indigo nor Asr Dhuhr's blue.
      const tops = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(p => fullScreenAlarmData(p).fsSkyMid.toLowerCase());
      expect(new Set(tops).size).toBe(5);
      const { hexToOklch } = require('../src/theme/oklch');
      const hue = (p: string) => hexToOklch(fullScreenAlarmData(p).fsSkyMid).h;
      const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
      expect(apart(hue('Fajr'), hue('Isha'))).toBeGreaterThan(40);
      expect(apart(hue('Asr'), hue('Dhuhr'))).toBeGreaterThan(90);
    } finally {
      setFullScreenAlarmSkyTheme(false);
    }
    const fs = require('fs');
    const path = require('path');
    const kt = fs.readFileSync(
      path.join(__dirname, '..', 'android/app/src/main/java/com/prayer_times/PrayerAlarmActivity.kt'),
      'utf-8',
    );
    for (const key of ['fsSkyMid', 'fsText', 'fsAccent', 'fsOnAccent']) expect(kt).toContain(`"${key}"`);
    expect(kt).toMatch(/intArrayOf\(skyTop, skyMid, skyBottom\)/);
    expect(kt).toMatch(/if \(filled\) setColor\(buttonFill\)/);
    // Mirrored from the settings wherever the alert is built without React.
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
    // …with the Sky theme's colours (Vibrant or Realistic) beside it.
    for (const p of ['src/context/PrayerSettingsContext.tsx', 'src/notifications/adhanMute.ts', 'src/widget/republishWidgetPayload.ts']) {
      expect(read(p)).toMatch(/setFullScreenAlarmSkyTheme\(settings\.appearance === 'sky', settings\.skyVariant\)/);
    }
    expect(read('src/notifications/notificationActions.ts')).toMatch(/await loadSettings\(\)\s*\.then\(s => \(\{ on: s\.appearance === 'sky', variant: s\.skyVariant \}\)\)[\s\S]{0,120}setFullScreenAlarmSkyTheme\(theme\.on, theme\.variant\)/);
  });
});

describe('the notification beside a full-screen alert', () => {
  it('has one Snooze button, not a chip row and a button', () => {
    const { prayerAlertActions } = require('../src/notifications/prayerAlertActions');
    const plain = prayerAlertActions('Maghrib');
    expect(plain[0].input?.choices.length).toBeGreaterThan(0);
    const fs = prayerAlertActions('Maghrib', 10);
    expect(fs[0].input).toBeUndefined();
    expect(fs[0].title).toContain('10');
    expect(fs).toHaveLength(plain.length);
  });
});

describe('the next prayer on the alarm screen', () => {
  it('rides in the data when there is one, and is absent otherwise', () => {
    const { fullScreenAlarmData } = require('../src/notifications/fullScreenAlarm');
    expect(fullScreenAlarmData('Maghrib', 'Next: Isha at 20:18').fsNext).toBe(
      'Next: Isha at 20:18',
    );
    expect(fullScreenAlarmData('Maghrib').fsNext).toBeUndefined();
  });
});
