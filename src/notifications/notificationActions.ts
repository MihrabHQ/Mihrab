/**
 * Snooze rescheduling for the adhan / prayer alerts.
 *
 * A prayer notification carries a "Snooze" action (Android RemoteInput with
 * quick choices + free-form typing; iOS text-input category action). When the
 * user snoozes, the press is caught in `adhanSafetyControls` and routed here to
 * re-fire the SAME prayer alert after the chosen number of minutes.
 *
 * Self-contained on purpose (its own AlarmManager trigger + action rebuild) so
 * it never imports `prayerNotifications` / `adhanSafetyControls` — that keeps
 * the module graph acyclic (see `adhanActionIds.ts`).
 */
import notifee, { AndroidStyle, type Notification } from '@notifee/react-native';
import i18n from '../i18n';
import { ADHAN_CONTROLS_CATEGORY_ID } from './adhanActionIds';
import { prayerAlertActions } from './prayerAlertActions';
import { buildTimestampTrigger, canUseExactAlarms } from './scheduling';
import {
  FULL_SCREEN_SNOOZE_MIN,
  fullScreenAlarmAndroid,
  isFullScreenAlarm,
} from './fullScreenAlarm';

/** Ids of snoozed re-fires — deliberately NOT the `pt-` prefix used by the
 *  scheduled day, so a full resync (which cancels obsolete `pt-` triggers)
 *  never wipes a pending snooze. */
const SNOOZE_ID_PREFIX = 'adhan-snooze-';

// The presets, the chip labels and the parser all live in
// `prayerAlertActions` now, beside the buttons they describe. Re-exported
// here because `adhanSafetyControls` has imported the parser from this
// module since before that file existed.
export {
  SNOOZE_PRESETS,
  parseSnoozeMinutes,
  snoozeChoiceLabel,
} from './prayerAlertActions';


/**
 * Re-fire a prayer alert `minutes` from now, reusing the original's title,
 * body, channel/sound and data.
 *
 * The re-fire carries the SAME buttons as the alert it replaces. It used to
 * build its own shorter set and lose the log actions, so snoozing a prayer
 * quietly cost you the ability to log it from the notification — the one
 * thing a person who has just asked to be reminded is most likely to want
 * when the reminder arrives.
 */
export async function snoozePrayerNotification(
  notification: Notification | undefined,
  minutes: number,
): Promise<void> {
  if (!notification) return;
  const at = Date.now() + minutes * 60_000;
  const title = notification.title ?? '';
  const body = notification.body ?? i18n.t('alertCopy.atPrayer', 'Prayer time');
  const data = (notification.data ?? {}) as Record<string, string>;
  const channelId = notification.android?.channelId ?? 'prayer-times-default';
  const iosSound = notification.ios?.sound;
  // The prayer name travels in the payload; without it there is nothing to
  // log, so the re-fire falls back to a snooze-only button.
  const prayer = typeof data.prayer === 'string' ? data.prayer : '';
  const actions = prayerAlertActions(
    prayer,
    isFullScreenAlarm(data) ? FULL_SCREEN_SNOOZE_MIN : undefined,
  );

  await notifee.createTriggerNotification(
    {
      id: `${SNOOZE_ID_PREFIX}${at}`,
      title,
      // The prayer's own clock time, which the alarm screen prints.
      ...(notification.subtitle ? { subtitle: notification.subtitle } : {}),
      body,
      data,
      ios: {
        ...(iosSound ? { sound: iosSound } : {}),
        // Real prayers carry the Stop + Snooze category; harmless on plain ones.
        categoryId: ADHAN_CONTROLS_CATEGORY_ID,
      },
      android: {
        channelId,
        smallIcon: 'ic_stat_prayer',
        pressAction: { id: 'default' },
        style: { type: AndroidStyle.BIGTEXT, text: body },
        actions,
        // A snoozed alert shouldn't linger for hours if the user ignores it.
        timeoutAfter: 60 * 60_000,
        // Snoozed from the alarm screen (or from a full-screen alert's own
        // button), it comes back the way it came: full-screen, as an alarm
        // clock's snooze does. The flag travels in `data`, copied above.
        ...(isFullScreenAlarm(data) ? fullScreenAlarmAndroid() : {}),
      },
    },
    // The same trigger the prayer itself rode: exact when the permission is
    // there. This had its own inexact allow-while-idle trigger, which
    // Android may deliver up to several minutes late — seen on the
    // emulator as a 7½-minute window on a ten-minute snooze (2026-10-03),
    // which an alarm screen's Snooze cannot afford.
    buildTimestampTrigger(at, await canUseExactAlarms()),
  );
}
