/**
 * A prayer alert is shown without starting the app, and the alerts do not
 * run out (android/.../AlertEventGate.kt, src/notifications/alertCoverage.ts).
 *
 * The engine told JavaScript of every notification shown or swiped away,
 * and with the app closed that started all of React Native, for an event
 * JavaScript does nothing with. Now it is started for such an event only
 * when there is work: a widget's taps to write, or a schedule with under
 * two days left — which is then extended, where before a phone whose app
 * was not opened for four days stopped alerting.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

jest.mock('../src/native/Alerts', () => ({
  __esModule: true,
  default: {},
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
}));
const mockResync = jest.fn(async (_now?: Date) => true);
const mockRepublish = jest.fn(async (_reason?: string, _now?: Date) => true);
jest.mock('../src/notifications/afterUpdate', () => ({
  resyncPrayerAlertsFromStorage: (now: Date) => mockResync(now),
}));
jest.mock('../src/widget/republishWidgetPayload', () => ({
  republishWidgetPayload: (reason: string, now: Date) => mockRepublish(reason, now),
}));

import {
  COVERED_UNTIL_KEY,
  TOP_UP_BELOW_MS,
  _resetAlertCoverageForTests,
  coverageRunsLow,
  coveredUntilOf,
  topUpAlertsIfLow,
} from '../src/notifications/alertCoverage';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const shown = (until: number | undefined, type = 3) =>
  ({
    type,
    detail: { notification: { id: 'x', data: until == null ? {} : { [COVERED_UNTIL_KEY]: String(until) } } },
  }) as never;

beforeEach(() => {
  mockResync.mockClear();
  mockRepublish.mockClear();
  _resetAlertCoverageForTests();
});

describe('what an alert carries', () => {
  it('is the time of the last alert of its schedule, whatever the order', () => {
    const at = (h: number) => ({ at: new Date(NOW + h * 3600_000) });
    expect(coveredUntilOf([at(5), at(90), at(20)])).toBe(String(NOW + 90 * 3600_000));
    expect(coveredUntilOf([])).toBeUndefined();
  });

  it('is written into every prayer alert by the scheduler', () => {
    const scheduler = read('src/notifications/prayerNotifications.ts');
    expect(scheduler).toContain('const coveredUntil = coveredUntilOf(audibleEvents);');
    expect(scheduler).toContain('...(coveredUntil ? { [COVERED_UNTIL_KEY]: coveredUntil } : {}),');
  });
});

describe('when the next days are written', () => {
  it('with under two days of schedule left, and not before', () => {
    expect(coverageRunsLow({ [COVERED_UNTIL_KEY]: String(NOW + 2 * DAY - 1) }, NOW)).toBe(true);
    expect(coverageRunsLow({ [COVERED_UNTIL_KEY]: String(NOW + 2 * DAY) }, NOW)).toBe(false);
    expect(coverageRunsLow({ [COVERED_UNTIL_KEY]: String(NOW + 4 * DAY) }, NOW)).toBe(false);
    // The last alert of a schedule, shown at its own minute.
    expect(coverageRunsLow({ [COVERED_UNTIL_KEY]: String(NOW) }, NOW)).toBe(true);
  });

  it('an alert that does not say asks for nothing', () => {
    expect(coverageRunsLow({}, NOW)).toBe(false);
    expect(coverageRunsLow(undefined, NOW)).toBe(false);
    expect(coverageRunsLow({ [COVERED_UNTIL_KEY]: 'soon' }, NOW)).toBe(false);
    expect(coverageRunsLow({ [COVERED_UNTIL_KEY]: '0' }, NOW)).toBe(false);
  });

  it('a shown alert near the end writes them: the widget first, then the alerts', async () => {
    const order: string[] = [];
    mockRepublish.mockImplementationOnce(async () => (order.push('widget'), true));
    mockResync.mockImplementationOnce(async () => (order.push('alerts'), true));
    await expect(topUpAlertsIfLow(shown(NOW + DAY), NOW)).resolves.toBe(true);
    expect(order).toEqual(['widget', 'alerts']);
    expect(mockResync.mock.calls[0][0]).toEqual(new Date(NOW));
  });

  it('one with days left does not, nor a press, nor a swipe', async () => {
    await expect(topUpAlertsIfLow(shown(NOW + 3 * DAY), NOW)).resolves.toBe(false);
    await expect(topUpAlertsIfLow(shown(NOW + DAY, 0), NOW)).resolves.toBe(false);
    await expect(topUpAlertsIfLow(shown(NOW + DAY, 1), NOW)).resolves.toBe(false);
    await expect(topUpAlertsIfLow(shown(NOW + DAY, 2), NOW)).resolves.toBe(false);
    expect(mockResync).not.toHaveBeenCalled();
  });

  it('two alerts shown in the same minute are one write', async () => {
    const both = [topUpAlertsIfLow(shown(NOW + DAY), NOW), topUpAlertsIfLow(shown(NOW + DAY), NOW)];
    await Promise.all(both);
    expect(mockResync).toHaveBeenCalledTimes(1);
    // …and the next one, later, writes again.
    await topUpAlertsIfLow(shown(NOW + DAY), NOW + 60_000);
    expect(mockResync).toHaveBeenCalledTimes(2);
  });

  it('never throws: it runs in a process nobody opened', async () => {
    mockResync.mockRejectedValueOnce(new Error('no storage'));
    await expect(topUpAlertsIfLow(shown(NOW + DAY), NOW)).resolves.toBe(false);
  });

  it('is asked last by the background handler, and waited for', () => {
    const handler = read('src/notifications/adhanSafetyControls.ts');
    const body = handler.slice(handler.indexOf('notifee.onBackgroundEvent(async event => {'));
    expect(body.indexOf('await handleAdhanAction(event, false);')).toBeGreaterThan(-1);
    expect(body.indexOf('await topUpAlertsIfLow(event);')).toBeGreaterThan(
      body.indexOf('await handleAdhanAction(event, false);'),
    );
  });
});

describe('Android: whether JavaScript is started for an event', () => {
  const gate = read('android/app/src/main/java/com/prayer_times/AlertEventGate.kt');
  const subscriber = read('android/alerts/src/main/java/io/invertase/notifee/NotifeeEventSubscriber.java');
  const app = read('android/app/src/main/java/com/prayer_times/MainApplication.kt');

  it('reads the same key and the same two days as the JavaScript', () => {
    expect(gate).toContain(`const val COVERED_UNTIL_KEY = "${COVERED_UNTIL_KEY}"`);
    expect(gate).toContain('const val TOP_UP_BELOW_MS = 2L * 24 * 60 * 60 * 1000');
    expect(TOP_UP_BELOW_MS).toBe(2 * 24 * 60 * 60 * 1000);
    expect(gate).toMatch(/until != null && until > 0 && until - now < TOP_UP_BELOW_MS/);
  });

  it('a press and a button always reach it; shown, dismissed and written are the ones weighed', () => {
    const passive = /fun isPassive\(eventType: Int\): Boolean =([\s\S]*?)\n\n/.exec(gate)![1];
    expect(passive.match(/TYPE_\w+/g)!.sort()).toEqual(
      ['TYPE_DELIVERED', 'TYPE_DISMISSED', 'TYPE_FG_ALREADY_EXIST', 'TYPE_TRIGGER_NOTIFICATION_CREATED'].sort(),
    );
    // The numbers are the engine's own.
    const types = read('android/alerts/src/main/java/app/notifee/core/event/NotificationEvent.java');
    for (const [name, value] of [
      ['TYPE_DISMISSED', 0],
      ['TYPE_DELIVERED', 3],
      ['TYPE_TRIGGER_NOTIFICATION_CREATED', 7],
      ['TYPE_FG_ALREADY_EXIST', 8],
    ] as const) {
      expect(types).toContain(`public static final int ${name} = ${value};`);
      expect(gate).toContain(`private const val ${name} = ${value}`);
    }
    expect(gate).toMatch(/if \(!isPassive\(eventType\)\) return true/);
  });

  it('a running app is told everything, and is asked about without being started', () => {
    expect(gate).toMatch(/\(context as\? MainApplication\)\?\.reactIsRunning\(\) != false\) return true/);
    expect(app).toMatch(/fun reactIsRunning\(\): Boolean =\s+reactHostHolder\.isInitialized\(\) && reactHostHolder\.value\.currentReactContext != null/);
  });

  it('waiting widget taps are work, in both queues', () => {
    expect(gate).toContain('WidgetLogQueue.read(context).isNotEmpty()');
    expect(gate).toContain('WidgetTasbihQueue.read(context).isNotEmpty()');
  });

  it('what it cannot read is answered yes', () => {
    expect(gate).toMatch(/val context = appContext \?: return true/);
    expect(gate).toContain('return "queues unreadable"');
    const events = read('android/alerts/src/main/java/io/invertase/notifee/BackgroundEvents.java');
    expect(events).toMatch(/if \(g == null\) return true;/);
    expect(events).toMatch(/catch \(Throwable t\) \{\s+return true;/);
  });

  it('is in place before any receiver can post an event, and asked only out of the foreground', () => {
    const onCreate = app.slice(app.indexOf('override fun onCreate()'));
    expect(onCreate.indexOf('AlertEventGate.install(this)')).toBeGreaterThan(-1);
    expect(onCreate.indexOf('AlertEventGate.install(this)')).toBeLessThan(onCreate.indexOf('loadReactNative'));
    expect(subscriber).toMatch(
      /if \(!isAppInForeground\(\)\s+&& !BackgroundEvents\.wantsJavaScript\(notificationEvent\.getType\(\), notificationBundle\)\) \{\s+return;/,
    );
  });
});
