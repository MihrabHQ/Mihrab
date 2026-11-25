/**
 * Today writes the prayer alerts once for the same answer.
 *
 * On an iPhone 13 (Nov 2026) every open of the app registered the whole
 * schedule three to six times in a second or two: Today's effect ran for
 * every step of a load with the same times, and the focus callback wrote
 * beside it. `screens/home/writeTodayAlerts.ts` is what both ask now.
 */
jest.mock('../src/notifications/prayerNotifications', () => ({
  syncPrayerNotifications: jest.fn(),
}));

import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import {
  forgetTodayAlertsInFlight,
  todayAlertsJob,
  writeTodayAlerts,
  type TodayAlertsInput,
} from '../src/screens/home/writeTodayAlerts';
import { forgetResyncGates, RESYNC_MIN_GAP_MS } from '../src/utils/resyncGate';

const sync = syncPrayerNotifications as jest.Mock;
const day = (fajr: string) => ({
  Fajr: fajr, Sunrise: '07:57', Dhuhr: '11:40', Asr: '12:54', Maghrib: '15:12', Isha: '17:21',
});
const input = (over: Partial<TodayAlertsInput> = {}): TodayAlertsInput => ({
  settings: {
    notificationsEnabled: true,
    prePrayerReminderMinutes: 10,
    notificationSound: 'default' as never,
    adhanUsesAlarmStream: false,
    prayerAlertFullScreen: false,
    malikiSecondTimesEnabled: false,
    malikiSecondTimeAlerts: [],
    malikiSecondTimeAlertMinutes: 15,
    malikiSecondTimeEndAlerts: false,
    prayerAlertModes: {} as never,
    journalNotificationActionsEnabled: true,
    tintedSurfaces: false,
  },
  today: day('05:32'),
  tomorrow: day('05:34'),
  alertWeek: [day('05:32'), day('05:34')],
  windowWeek: [day('05:32'), day('05:34')],
  baseDate: new Date(2026, 10, 25),
  hour12: false,
  accentColor: '#123456',
  alertOverridePrint: '',
  ...over,
});
const NOW = new Date(2026, 10, 25, 21, 0, 0);
const T0 = Date.now();
const flush = () => new Promise<void>(r => setImmediate(r));

beforeEach(() => {
  sync.mockReset();
  forgetResyncGates();
  forgetTodayAlertsInFlight();
});

test('the same answer asked for while it is being written is not written again', async () => {
  let done!: () => void;
  sync.mockReturnValue(new Promise<void>(r => (done = r)));
  // New objects every time, as Today's state is; the same times in them.
  expect(writeTodayAlerts(todayAlertsJob(input(), NOW), 'effect', T0)).toBe(true);
  expect(writeTodayAlerts(todayAlertsJob(input(), NOW), 'focus', T0)).toBe(false);
  expect(writeTodayAlerts(todayAlertsJob(input(), NOW), 'effect', T0 + 500)).toBe(false);
  expect(sync).toHaveBeenCalledTimes(1);
  done();
  await flush();
  // Written: not again within the gap, again after it.
  expect(writeTodayAlerts(todayAlertsJob(input(), NOW), 'effect', T0 + 5_000)).toBe(false);
  expect(
    writeTodayAlerts(todayAlertsJob(input(), NOW), 'focus', T0 + RESYNC_MIN_GAP_MS + 5_000),
  ).toBe(true);
  expect(sync).toHaveBeenCalledTimes(2);
});

test('a different answer is always written: a time, a setting, the override', async () => {
  sync.mockResolvedValue(undefined);
  const t = T0;
  expect(writeTodayAlerts(todayAlertsJob(input(), NOW), 'effect', t)).toBe(true);
  // One minute of one prayer on one later day.
  expect(
    writeTodayAlerts(
      todayAlertsJob(input({ alertWeek: [day('05:32'), day('05:35')] }), NOW),
      'effect',
      t + 10,
    ),
  ).toBe(true);
  expect(writeTodayAlerts(todayAlertsJob(input({ today: day('05:31') }), NOW), 'effect', t + 20)).toBe(true);
  expect(
    writeTodayAlerts(
      todayAlertsJob(input({ settings: { ...input().settings, prePrayerReminderMinutes: 15 } }), NOW),
      'effect',
      t + 30,
    ),
  ).toBe(true);
  expect(
    writeTodayAlerts(todayAlertsJob(input({ alertOverridePrint: 'Fajr:mute' }), NOW), 'effect', t + 40),
  ).toBe(true);
  expect(sync).toHaveBeenCalledTimes(5);
  // And what is handed on is what Today held.
  expect(sync.mock.calls[0][0]).toMatchObject({
    enabled: true,
    today: day('05:32'),
    week: [day('05:32'), day('05:34')],
    journalLogActionEnabled: true,
  });
});

test('a write that failed is not counted: the next ask writes', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  sync.mockRejectedValueOnce(new Error('no'));
  sync.mockResolvedValue(undefined);
  const t = T0;
  expect(writeTodayAlerts(todayAlertsJob(input(), NOW), 'effect', t)).toBe(true);
  await flush();
  expect(writeTodayAlerts(todayAlertsJob(input(), NOW), 'effect', t + 100)).toBe(true);
  expect(sync).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test('a new day or a new zone is a different answer', () => {
  const a = todayAlertsJob(input(), NOW).print;
  expect(todayAlertsJob(input(), new Date(2026, 10, 26, 0, 1)).print).not.toBe(a);
});
