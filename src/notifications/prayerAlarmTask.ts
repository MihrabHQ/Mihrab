/**
 * HeadlessJS task behind the full-screen prayer alert's buttons — issue #63.
 *
 * `PrayerAlarmActivity` is native and shown over the lock screen; its Snooze
 * and Log buttons land here through `PrayerAlarmHeadlessService`, with the app
 * possibly closed. Each one is answered by the SAME code as the notification's
 * own button, so the two can never disagree about what snoozing or logging a
 * prayer does. The activity has already cancelled the notification (that is
 * what stops the sound) by the time this runs.
 */
import { EventType, type Notification } from '@notifee/react-native';
import { snoozePrayerNotification } from './notificationActions';
import { SNOOZE_DEFAULT_MIN, SNOOZE_MAX_MIN } from './prayerAlertActions';
import { JOURNAL_LOG_ACTION_ID, handlePrayerLogEvent } from './prayerLogAction';

export type PrayerAlarmTaskData = {
  action?: string;
  minutes?: number;
  id?: string;
  title?: string;
  body?: string;
  subtitle?: string;
  channelId?: string;
  data?: Record<string, string>;
};

/** The notification as the shared handlers expect it, rebuilt from the press. */
export function notificationFromTask(raw: PrayerAlarmTaskData): Notification {
  return {
    id: raw.id,
    title: raw.title,
    body: raw.body,
    subtitle: raw.subtitle,
    data: raw.data ?? {},
    android: raw.channelId ? { channelId: raw.channelId } : {},
  };
}

export async function prayerAlarmActionTask(
  raw: PrayerAlarmTaskData,
): Promise<void> {
  try {
    const notification = notificationFromTask(raw);
    if (raw.action === 'snooze') {
      const asked = Number(raw.minutes);
      const minutes =
        Number.isFinite(asked) && asked > 0
          ? Math.min(asked, SNOOZE_MAX_MIN)
          : SNOOZE_DEFAULT_MIN;
      await snoozePrayerNotification(notification, minutes);
      return;
    }
    if (raw.action === 'log') {
      const prayer = raw.data?.prayer;
      if (!prayer) return;
      await handlePrayerLogEvent({
        type: EventType.ACTION_PRESS,
        detail: {
          notification,
          pressAction: { id: `${JOURNAL_LOG_ACTION_ID}:${prayer}` },
        },
      });
    }
  } catch (e) {
    console.warn('[prayerAlarm] action failed', e);
  }
}
