/**
 * The Hadith tab's two notifications (`notifications/hadithReminders.ts`):
 * the hadith of the day, and the reading plan's reminder. Both off until
 * asked for; neither on the adhan's sound; neither for a day there is
 * nothing to show or nothing left to read.
 *
 * Not heard on a device by anyone: the schedule is held here, the sound
 * and the tap are not.
 */
const mockItems: Record<string, { title: string } | null> = {};
let mockRows: Array<{ id: string; title: string }> = [];
let mockRecord: import('../src/hadith/hadithRecord').HadithRecord;
jest.mock('../src/hadith/library', () => ({
  loadItem: jest.fn(async (id: string) => mockItems[id] ?? null),
  listRows: jest.fn(async () => mockRows),
}));
jest.mock('../src/hadith/hadithStore', () => ({
  hydrateHadithRecord: jest.fn(async () => undefined),
  getHadithRecord: () => mockRecord,
}));

import notifee from '../src/native/Alerts';
import { dailyHadithId } from '../src/hadith/daily';
import { EMPTY_HADITH_RECORD, setPlan, setRead } from '../src/hadith/hadithRecord';
import {
  _resetHadithRemindersForTests,
  fireTimes,
  refreshHadithPlanReminder,
  rescheduleHadithOfDay,
  rescheduleHadithPlanReminder,
} from '../src/notifications/hadithReminders';
import { ROUTE_HADITH, ROUTE_HADITH_PLAN, notificationRoute } from '../src/notifications/notificationRoute';

const NOW = new Date(2026, 10, 26, 8, 0, 0);
const created = () => (notifee.createTriggerNotification as jest.Mock).mock.calls.map(c => c[0]);
const at = (i: number) => new Date((notifee.createTriggerNotification as jest.Mock).mock.calls[i][1].timestamp);

beforeEach(() => {
  jest.clearAllMocks();
  (notifee.getTriggerNotificationIds as jest.Mock).mockResolvedValue([]);
  for (const k of Object.keys(mockItems)) delete mockItems[k];
  mockRows = [];
  mockRecord = EMPTY_HADITH_RECORD;
  _resetHadithRemindersForTests();
});

describe('the hadith of the day', () => {
  const opts = { enabled: true, hour: 9, minute: 0, language: 'en', now: NOW };

  it('is the day’s own hadith, by its heading and where it is from — a fortnight ahead, opened by a tap', async () => {
    for (const t of fireTimes(NOW, 9, 0, 14)) mockItems[dailyHadithId(t)!] = { title: `Heading of ${dailyHadithId(t)}` };
    await rescheduleHadithOfDay(opts);
    const made = created();
    expect(made).toHaveLength(14);
    const first = made[0];
    expect(first.id).toBe('hadith-day-2026-11-26');
    expect(at(0).getHours()).toBe(9);
    const id = dailyHadithId(NOW)!;
    expect(first.body).toContain(`Heading of ${id}`);
    expect(first.data).toEqual({ route: ROUTE_HADITH, hadith: id, list: 'agreed' });
    // Each day its own.
    expect(new Set(made.map(n => n.data.hadith)).size).toBe(14);
    expect(await notificationRoute(first as never)).toBe(`mihrab://hadith/read/${encodeURIComponent(id)}`);
    expect(await notificationRoute({ data: { route: ROUTE_HADITH, hadith: 'not an id' } } as never)).toBe('mihrab://hadith');
  });

  it('is not sent for a day whose hadith is not on the device, nor at all when off', async () => {
    mockItems[dailyHadithId(NOW)!] = { title: 'Only today' };
    await rescheduleHadithOfDay(opts);
    expect(created()).toHaveLength(1);
    jest.clearAllMocks();
    (notifee.getTriggerNotificationIds as jest.Mock).mockResolvedValue(['hadith-day-2026-11-26', 'pt-fajr-1']);
    await rescheduleHadithOfDay({ ...opts, enabled: false });
    expect(created()).toHaveLength(0);
    // Its own are cancelled, and nobody else's.
    expect((notifee.cancelTriggerNotification as jest.Mock).mock.calls.map(c => c[0])).toEqual(['hadith-day-2026-11-26']);
  });

  it('leaves out a time already past today', () => {
    expect(fireTimes(new Date(2026, 10, 26, 10, 0, 0), 9, 0, 3).map(d => d.getDate())).toEqual([27, 28]);
  });
});

describe('the reading plan’s reminder', () => {
  const opts = { enabled: true, hour: 20, minute: 0, language: 'en', now: NOW };
  const plan = { list: 'set:nawawi40', days: 30, from: '2026-11-26' };
  beforeEach(() => {
    mockRows = Array.from({ length: 60 }, (_, i) => ({ id: `h:${i + 1}`, title: `t${i + 1}` }));
  });

  it('is nothing without a plan, and a week of days with one', async () => {
    await rescheduleHadithPlanReminder(opts);
    expect(created()).toHaveLength(0);
    mockRecord = setPlan(EMPTY_HADITH_RECORD, plan, 1);
    await rescheduleHadithPlanReminder(opts);
    const made = created();
    expect(made).toHaveLength(7);
    expect(made[0].id).toBe('hadith-plan-2026-11-26');
    expect(made[0].data).toEqual({ route: ROUTE_HADITH_PLAN });
    expect(await notificationRoute(made[0] as never)).toBe('mihrab://hadith');
  });

  it('says nothing today once today’s share is read, and nothing at all once the list is', async () => {
    let rec = setPlan(EMPTY_HADITH_RECORD, plan, 1);
    // 60 over 30 days: two a day. Both read this morning.
    rec = setRead(setRead(rec, 'h:1', true, NOW.getTime()), 'h:2', true, NOW.getTime());
    mockRecord = rec;
    await rescheduleHadithPlanReminder(opts);
    expect(created().map(n => n.id)).not.toContain('hadith-plan-2026-11-26');
    expect(created()).toHaveLength(6);
    jest.clearAllMocks();
    (notifee.getTriggerNotificationIds as jest.Mock).mockResolvedValue([]);
    for (const r of mockRows) rec = setRead(rec, r.id, true, NOW.getTime());
    mockRecord = rec;
    await rescheduleHadithPlanReminder(opts);
    expect(created()).toHaveLength(0);
  });

  it('is written again when the plan or its progress changes — with the settings it had, and only while on', async () => {
    refreshHadithPlanReminder();
    await Promise.resolve();
    expect(notifee.getTriggerNotificationIds).not.toHaveBeenCalled();
    await rescheduleHadithPlanReminder({ ...opts, enabled: false });
    jest.clearAllMocks();
    refreshHadithPlanReminder();
    expect(notifee.getTriggerNotificationIds).not.toHaveBeenCalled();
    mockRecord = setPlan(EMPTY_HADITH_RECORD, plan, 1);
    await rescheduleHadithPlanReminder(opts);
    jest.clearAllMocks();
    (notifee.getTriggerNotificationIds as jest.Mock).mockResolvedValue([]);
    refreshHadithPlanReminder();
    await new Promise(r => setImmediate(r));
    expect(notifee.getTriggerNotificationIds).toHaveBeenCalled();
  });
});

describe('both', () => {
  it('ring on the system’s own tone, never the adhan, and are off until asked for', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/notifications/hadithReminders.ts'), 'utf8');
    expect(src).toContain('sound: SYSTEM_TONE');
    expect(src).not.toMatch(/adhan\w*\.(mp3|wav|caf)/i);
    const { DEFAULT_SETTINGS } = require('../src/settings/types') as { DEFAULT_SETTINGS?: Record<string, unknown> };
    if (DEFAULT_SETTINGS) {
      expect(DEFAULT_SETTINGS.hadithOfDayEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.hadithPlanReminderEnabled).toBe(false);
    }
    const types = fs.readFileSync(path.join(__dirname, '..', 'src/settings/types.ts'), 'utf8');
    expect(types).toMatch(/hadithOfDayEnabled: false,/);
    expect(types).toMatch(/hadithPlanReminderEnabled: false,/);
  });
});
