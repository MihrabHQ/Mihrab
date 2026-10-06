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
import { SNOOZE_PRESETS, prayerAlertActions } from './prayerAlertActions';
import { resolveSnooze, snoozeMenu, type SnoozeMenu } from './snoozeWindow';
import { buildTimestampTrigger, canUseExactAlarms } from './scheduling';
import {
  FULL_SCREEN_SNOOZE_MIN,
  fullScreenAlarmAndroid,
  fullScreenAlarmData,
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
 * The wording of the "last chance" re-fire: the prayer, and how long is left.
 * Falls back to the original text when the payload names no prayer.
 */
export function lastChanceCopy(
  prayer: string,
  atMs: number,
  deadlineMs: number | null,
  original: { title: string; body: string },
): { title: string; body: string } {
  if (!prayer) return original;
  const name = i18n.t(`prayer.${prayer}`, { defaultValue: prayer });
  const left =
    deadlineMs != null ? Math.max(1, Math.round((deadlineMs - atMs) / 60_000)) : 0;
  return {
    title: i18n.t('alertCopy.lastChanceTitle', {
      defaultValue: '{{prayer}} — last chance',
      prayer: name,
    }),
    body:
      left > 0
        ? i18n.t('alertCopy.lastChanceBody', {
            defaultValue: 'Last chance to pray {{prayer}} — {{count}} min left',
            prayer: name,
            count: left,
          })
        : i18n.t('alertCopy.lastChanceChoice', {
            defaultValue: 'Last chance to pray {{prayer}}',
            prayer: name,
          }),
  };
}

/**
 * What a snoozed prayer alert SAYS when it comes back.
 *
 * It used to be word for word the alert that was snoozed, so ten minutes
 * later a second notification arrived saying exactly what the first had —
 * indistinguishable from the prayer being announced again, which on a
 * phone that has just been put down reads as a duplicate, and which gives
 * no hint that it is the reminder you asked for. A re-fire now says so:
 * "Fajr reminder" / "You snoozed this alert — it is time for Fajr".
 *
 * Only the call itself (`prayer_time`) is reworded. The pre-prayer and
 * quiet-window notices are statements about a moment ("starts in 5 min")
 * and keep what they said. The prayer name comes from the payload so it is
 * rendered in the language the app is in NOW, not the one the original was
 * scheduled in; without it there is nothing to reword and the original
 * text is kept.
 */
export function snoozedCopy(
  title: string,
  body: string,
  data: Record<string, string>,
): { title: string; body: string } {
  if (data.kind !== 'prayer_time' || typeof data.prayer !== 'string' || !data.prayer) {
    return { title, body };
  }
  const prayer = i18n.t(`prayer.${data.prayer}`, { defaultValue: data.prayer });
  return {
    title: i18n.t('alertCopy.snoozedTitle', {
      defaultValue: '{{prayer}} reminder',
      prayer,
    }),
    body: i18n.t('alertCopy.snoozedBody', {
      defaultValue: 'You snoozed this alert — it is time for {{prayer}}',
      prayer,
    }),
  };
}

/**
 * Re-fire a prayer alert `minutes` from now, reusing the original's channel,
 * sound and data and rewording its text (`snoozedCopy`).
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
  options: {
    /** The "Last chance to pray" button was pressed, not a length. */
    lastChance?: boolean;
  } = {},
): Promise<boolean> {
  if (!notification) return false;
  const data = (notification.data ?? {}) as Record<string, string>;
  // When the prayer ends, stamped on the alert when it was scheduled. Absent
  // on anything older (or on a notice that is not a prayer): no limit.
  const deadlineRaw = Number(data.deadline);
  const deadline =
    data.deadline != null && Number.isFinite(deadlineRaw) ? deadlineRaw : null;
  // Judged HERE, at the press, not by the menu the alert was drawn with: an
  // alert left unread still offers what fitted when it rang.
  const target = resolveSnooze(
    Date.now(),
    deadline,
    minutes,
    options.lastChance === true,
    SNOOZE_PRESETS,
  );
  // Too close to the end for any reminder to be of use. Reported, so the
  // caller keeps the alert on screen instead of dismissing it for nothing.
  if (!target) return false;
  const at = target.at;
  const prayer = typeof data.prayer === 'string' ? data.prayer : '';
  const original = {
    title: notification.title ?? '',
    body: notification.body ?? i18n.t('alertCopy.atPrayer', 'Prayer time'),
  };
  const { title, body } = target.lastChance
    ? lastChanceCopy(prayer, at, deadline, original)
    : snoozedCopy(original.title, original.body, data);
  // What THIS re-fire offers in turn, worked out for when it appears: every
  // snooze shortens the menu, and the last-chance alert offers none.
  const menu: SnoozeMenu | undefined =
    deadline == null
      ? undefined
      : target.lastChance
        ? { minutes: [], lastChanceAt: null }
        : snoozeMenu(at, deadline, SNOOZE_PRESETS);
  const channelId = notification.android?.channelId ?? 'prayer-times-default';
  const iosSound = notification.ios?.sound;
  const fullScreen = isFullScreenAlarm(data);
  // The prayer name travels in the payload; without it there is nothing to
  // log, so the re-fire falls back to a snooze-only button.
  const actions = prayerAlertActions(
    prayer,
    fullScreen ? FULL_SCREEN_SNOOZE_MIN : undefined,
    menu,
  );
  const refireData: Record<string, string> = {
    ...data,
    // Redrawn for the new moment, or the alarm screen would offer the menu
    // it had when it first rang.
    // Always rebuilt, with or without a deadline: an alert scheduled by an
    // older build carries the menu IT was drawn with (no hour, labels from
    // before), and copying that forward would keep the old buttons alive for
    // as long as the person goes on snoozing it.
    ...(fullScreen ? fullScreenAlarmData(prayer, data.fsNext ?? '', menu, deadline) : {}),
    ...(data.kind === 'prayer_time' ? { snoozed: '1' } : {}),
    ...(target.lastChance ? { lastChance: '1' } : {}),
  };

  await notifee.createTriggerNotification(
    {
      id: `${SNOOZE_ID_PREFIX}${at}`,
      title,
      // The prayer's own clock time, which the alarm screen prints.
      ...(notification.subtitle ? { subtitle: notification.subtitle } : {}),
      body,
      data: refireData,
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
        timeoutAfter:
          deadline != null
            ? Math.max(60_000, Math.min(60 * 60_000, deadline - at))
            : 60 * 60_000,
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
  return true;
}
