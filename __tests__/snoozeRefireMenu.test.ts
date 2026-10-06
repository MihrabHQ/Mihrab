/**
 * A snoozed alert is redrawn with TODAY's menu, even when the alert it
 * replaces was scheduled by an older build (no deadline, no hour chip).
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';
import { snoozePrayerNotification } from '../src/notifications/notificationActions';

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({
    android: { alarm: 1 },
    authorizationStatus: 1,
  });
});

const posted = () =>
  (notifee.createTriggerNotification as jest.Mock).mock.calls[0][0];

describe('re-firing an alert from an older build', () => {
  const oldAlert = {
    id: 'pt-1',
    title: 'Dhuhr',
    body: 'It is time for Dhuhr',
    data: {
      kind: 'prayer_time',
      prayer: 'Dhuhr',
      fullScreen: '1',
      fsSnooze: 'Snooze 10 min',
      fsSnoozeMinutes: '10',
      // What the previous build wrote: no hour, long labels.
      fsSnoozeAlt: JSON.stringify([
        { m: 5, l: 'Snooze 5 min' },
        { m: 15, l: 'Snooze 15 min' },
        { m: 30, l: 'Snooze 30 min' },
      ]),
    },
    android: { channelId: 'prayer-times-default' },
  };

  it('puts the hour on the alarm screen', async () => {
    expect(await snoozePrayerNotification(oldAlert as never, 10)).toBe(true);
    const chips = JSON.parse(posted().data.fsSnoozeAlt);
    expect(chips.map((c: { m: number }) => c.m)).toEqual([5, 15, 30, 60]);
    expect(chips[3].l).toBe('1 hour');
  });

  it('offers the hour on a plain (non full-screen) alert too', async () => {
    const plain = { ...oldAlert, data: { kind: 'prayer_time', prayer: 'Dhuhr' } };
    await snoozePrayerNotification(plain as never, 10);
    const snooze = posted().android.actions.find(
      (a: { pressAction: { id: string } }) => a.pressAction.id === 'adhan_snooze',
    );
    expect(snooze.input.choices).toContain('Snooze 1 hour');
  });
});
