/**
 * Issue #69 — "End of first time prayers notification".
 *
 * A prayer logged as done still got its "first time is ending" alert.
 * The journal write cancels the pending alert, but a reschedule that was
 * already running had read the journal before the write and went on to
 * create the alert after the cancel. The reschedule now looks at the
 * journal once more when it has finished and cancels what has been
 * answered since it started.
 */
const mockGetIds = jest.fn();
const mockCancel = jest.fn();
const mockCreate = jest.fn();
const mockStored = jest.fn();

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    getTriggerNotificationIds: (...a: unknown[]) => mockGetIds(...a),
    cancelTriggerNotification: (...a: unknown[]) => mockCancel(...a),
    createTriggerNotification: (...a: unknown[]) => mockCreate(...a),
    cancelTriggerNotifications: jest.fn().mockResolvedValue(undefined),
    getDisplayedNotifications: jest.fn().mockResolvedValue([]),
    cancelDisplayedNotifications: jest.fn().mockResolvedValue(undefined),
    createChannel: jest.fn().mockResolvedValue('ch'),
    requestPermission: jest.fn().mockResolvedValue({ authorizationStatus: 1 }),
    getNotificationSettings: jest
      .fn()
      .mockResolvedValue({ authorizationStatus: 1, android: { alarm: 1 } }),
    setNotificationCategories: jest.fn().mockResolvedValue(undefined),
  },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidStyle: { BIGTEXT: 1 },
  TriggerType: { TIMESTAMP: 0 },
  AndroidCategory: {},
  AndroidVisibility: {},
  AuthorizationStatus: { AUTHORIZED: 1 },
  EventType: {},
  RepeatFrequency: {},
  AndroidLaunchActivityFlag: {},
}));

jest.mock('../src/journal/loggedPrayers', () => {
  const actual = jest.requireActual('../src/journal/loggedPrayers');
  return {
    ...actual,
    storedJournalEntries: (...a: unknown[]) => mockStored(...a),
  };
});

import { syncPrayerNotifications } from '../src/notifications/prayerNotifications';
import { localYmd } from '../src/prayer/daruriTimes';
import type { TimingsMap } from '../src/types/prayer';

const day = {
  Fajr: '04:30',
  Sunrise: '06:10',
  Dhuhr: '13:00',
  Asr: '16:30',
  Maghrib: '19:50',
  Isha: '21:30',
  FajrDaruri: '05:20',
  DhuhrDaruri: '16:30',
  AsrDaruri: '18:40',
  MaghribDaruri: '20:20',
  IshaDaruri: '23:40',
} as unknown as TimingsMap;

describe('a prayer logged while the schedule is being written', () => {
  it('has its boundary alert taken away at the end of the run', async () => {
    const base = new Date(2026, 8, 4, 0, 1);
    jest.useFakeTimers({ now: base });
    const today = localYmd(base);
    // First read (the top of the run): nothing logged. Second (the last
    // look): Dhuhr has been logged in the meantime.
    mockStored.mockResolvedValueOnce([]).mockResolvedValue([
      {
        date: today,
        prayer: 'Dhuhr',
        status: 'on-time',
        loggedAt: '2026-09-04T13:05:00.000Z',
      },
    ]);
    mockGetIds.mockResolvedValue([]);
    mockCancel.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue(undefined);
    const created: string[] = [];
    mockCreate.mockImplementation(async (n: { id: string }) => {
      created.push(n.id);
    });
    mockGetIds.mockImplementation(async () => created.slice());

    await syncPrayerNotifications({
      enabled: true,
      prePrayerReminderMinutes: 0,
      notificationSound: 'default' as never,
      today: day,
      tomorrow: day,
      baseDate: base,
      week: [day, day, day, day, day],
      daruriAlerts: ['DhuhrDaruri'],
      daruriAlertMinutes: 0,
      daruriEndAlerts: false,
    } as never).catch(() => undefined);

    const boundary = created.filter(id =>
      /^pt-daruri-\d+-DhuhrDaruri$/.test(id),
    );
    expect(boundary.length).toBeGreaterThan(0);
    const todays = boundary.filter(id => {
      const ms = Number(id.split('-')[2]);
      return localYmd(new Date(ms)) === today;
    });
    expect(todays.length).toBeGreaterThan(0);
    for (const id of todays) {
      expect(mockCancel).toHaveBeenCalledWith(id);
    }
  });

  afterEach(() => jest.useRealTimers());
});
