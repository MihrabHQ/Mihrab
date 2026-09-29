/**
 * Live Activity — pinned prayer-countdown notification (Android).
 * (iOS uses ActivityKit via the PrayerLiveActivity native module —
 * see `src/native/PrayerLiveActivity.ts` and `src/liveActivity/`.)
 *
 * Design notes (v2.1.0-beta.2):
 *  - **InboxStyle** for the expanded view. Each prayer renders as its own
 *    visible row. The previous BigText approach was rendering as a wall
 *    of wrapped paragraph text on MIUI/OxygenOS/ColorOS — those shells
 *    auto-flow the bigText paragraph and visibly collapse embedded
 *    newlines. InboxStyle's `lines: string[]` is the platform-native way
 *    to render a list and behaves identically across vendors.
 *  - **Chronometer** stays. notifee maps it to the system metadata row
 *    next to the app name, so the live countdown ticks without us
 *    re-posting; the small icon stays in the status bar.
 *  - **Accent color** drives the small-icon tint and the chronometer
 *    text colour on Android 12+ Material You shells.
 *  - **Friendly countdown text** ("in 3h 47m") in the body line so even
 *    shells that don't render the chronometer prominently still
 *    communicate the duration at a glance.
 *  - **Short location** — the geocoded label can be a full address
 *    ("Stockholm, Stockholm Municipality, Stockholm County, 111 29,
 *    Sweden"). We render the first comma-separated component, which is
 *    virtually always the locality.
 *
 * Lifecycle:
 *  - `startOrUpdateLiveActivity()` is idempotent — call it whenever the
 *    prayer-day payload, settings, or locale change. notifee replaces
 *    in place when the id matches.
 *  - `stopLiveActivity()` cancels the pinned notification.
 *  - The OS clears ongoing notifications on reboot; index.js re-arms
 *    via `syncLiveActivity()` on next foreground.
 */
// tokens-ok: colour handed to the native notification

import { Platform } from 'react-native';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';
import i18n from '../i18n';
import { getMihrabLiveActivityModule } from '../native/MihrabLiveActivity';
import type {
  WidgetContractAlertModeKind,
  WidgetContractLiveActivity,
  WidgetContractLiveActivityAndroid,
  WidgetContractLiveActivityWords,
} from '../widget/contract.generated';
import type { WidgetNow } from '../widget/widgetPayloadV2';
import {
  deviceEpochOf,
  liveActivityAndroidPayload,
} from '../liveActivity/liveActivityV2';
import { loadSettings } from '../settings/storage';
import {
  getNotificationSoundOption,
  resolveSoundTargets,
} from './notificationSounds';
import { shownAlertMode } from '../settings/alertModes';
import { formatHijriLabel } from '../hijri/formatHijriLabel';

/** Hijri label for a "yyyy-MM-dd" day key (parsed in local time). */
export function hijriLabelForDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return '';
  return formatHijriLabel(new Date(y, m - 1, d));
}

/** Stable notifee id — fixed so updates replace in place, not stack. */
export const LIVE_ACTIVITY_NOTIFICATION_ID =
  'mihrab.live_activity.prayer_countdown';

/** Dedicated channel for the Live Activity.
 *   v1 — IMPORTANCE_LOW → Silent section.
 *   v2 — IMPORTANCE_DEFAULT → main section but no chip on Android 16.
 *   v3 — IMPORTANCE_HIGH (sound + vibration explicitly off) — required
 *        for the Android 16 status-bar "Live Update" chip on most
 *        shells. NotificationChannel importance is immutable after
 *        first create, so the bump needed a new id. */
const CHANNEL_ID = 'mihrab_live_activity_v3';
const CHANNEL_ID_LEGACY_V1 = 'mihrab_live_activity_v1';
const CHANNEL_ID_LEGACY_V2 = 'mihrab_live_activity_v2';

/** ── Channel ─────────────────────────────────────────────────────── */

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Clean up legacy channels so upgraders don't see stale entries in
  // their app notification settings.
  for (const old of [CHANNEL_ID_LEGACY_V1, CHANNEL_ID_LEGACY_V2]) {
    try {
      await notifee.deleteChannel(old);
    } catch {
      // Non-fatal.
    }
  }
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: i18n.t('liveActivity.channelName', 'Prayer countdown'),
      description: i18n.t(
        'liveActivity.channelDesc',
        'Pinned ongoing notification with the next-prayer countdown.',
      ),
      // HIGH importance because Android 16's status-bar Live Update
      // chip eligibility requires the channel be HIGH+. We disable
      // sound + vibration explicitly so the notification stays
      // passive — no chime on first post, no buzz, no popup.
      importance: AndroidImportance.HIGH,
      sound: undefined,
      vibration: false,
      badge: false,
    });
  } catch {
    // Non-fatal.
  }
}

/** ── Helpers ─────────────────────────────────────────────────────── */

/** The settings the Live Activity payload carries for Android. */
export type LiveActivityOptions = {
  modeOf: (key: string) => WidgetContractAlertModeKind;
  android: WidgetContractLiveActivityAndroid;
  words: WidgetContractLiveActivityWords;
  /** "Tinted surfaces", from settings — Android reads it here. */
  tinted: boolean;
};

/**
 * Everything the Live Activity needs from settings and the locale: each
 * prayer's alert mode (what the lock-screen button cycles), the channels
 * an alert it re-posts goes to, and the words the notification draws.
 * Settings that cannot be read leave the defaults, as they always did.
 */
export async function loadLiveActivityOptions(): Promise<LiveActivityOptions> {
  const out: LiveActivityOptions = {
    modeOf: () => 'notification',
    android: {
      alertActionEnabled: false,
      aodActionEnabled: true,
      adhanChannelId: 'prayer-times-default',
      adhanSoundId: 'default',
      defaultChannelId: 'prayer-times-default',
    },
    words: {
      fgsText: i18n.t('liveActivity.fgsText', 'Prayer countdown active'),
      alertLabelAdhan: i18n.t('settings.alertModeAdhan', 'Adhan'),
      alertLabelNotification: i18n.t('settings.alertModeNotification', 'Alert'),
      alertLabelSilent: i18n.t('settings.alertModeSilent', 'Silent'),
      alertOnceWord: i18n.t('liveActivity.justThisOne', 'once'),
      aodHideLabel: i18n.t('liveActivity.hideOnLock', 'Hide on lock screen'),
      aodShowLabel: i18n.t('liveActivity.showOnLock', 'Show on lock screen'),
      nowWord: i18n.t('liveActivity.now', 'Now'),
      inWord: i18n.t('liveActivity.inWord', 'In'),
      atWord: i18n.t('liveActivity.atWord', 'At'),
      atPrayerBody: i18n.t('alertCopy.atPrayer', 'Prayer time'),
    },
    tinted: false,
  };
  try {
    const s = await loadSettings();
    const soundOpt = getNotificationSoundOption(s.notificationSound);
    const adhanChosen = soundOpt.id !== 'default';
    const alertModes = s.prayerAlertModes ?? {};
    out.modeOf = key =>
      shownAlertMode(key, alertModes, adhanChosen, s.notificationsEnabled);
    out.android = {
      alertActionEnabled: s.notificationsEnabled,
      aodActionEnabled: s.liveActivityLockButton !== false,
      adhanChannelId: resolveSoundTargets(
        soundOpt.id,
        s.adhanUsesAlarmStream === true,
      ).androidChannelId,
      adhanSoundId: soundOpt.id,
      defaultChannelId: resolveSoundTargets('default').androidChannelId,
    };
    out.tinted = s.tintedSurfaces === true;
  } catch {
    // Settings unreadable — the defaults above stand.
  }
  return out;
}

/** Compact human duration: "3h 47m" / "47m" / "30s". */
function formatRemaining(ms: number): string {
  if (ms <= 0) return i18n.t('liveActivity.now', 'Now');
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return `${Math.floor(ms / 1000)}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Post the Live Activity on Android from the one payload both platforms
 * share. The native module adapts it to the minute it draws at
 * (LiveActivityV1.kt) and keeps it, so a roll-forward reads the same
 * days. Without the native module — or with nothing ahead to count down
 * to — the plain notifee notification, as before.
 */
export async function postLiveActivity(
  la: WidgetContractLiveActivity,
  now: WidgetNow,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await ensureChannel();
  const at = liveActivityAndroidPayload(la, now, deviceEpochOf);
  const native = getMihrabLiveActivityModule();
  if (native && at) {
    try {
      if (native.displayV2) await native.displayV2(JSON.stringify(la));
      else await native.display(JSON.stringify(at));
      return;
    } catch (e) {
      console.warn('[liveActivity] native module display failed', e);
    }
  }
  const remaining = at
    ? formatRemaining(at.nextEpochMs - Date.now())
    : i18n.t('liveActivity.soon', 'Starting soon');
  const title = at
    ? at.title
    : i18n.t('liveActivity.soon', 'Starting soon');
  const body = i18n.t('liveActivity.in', 'in {{remaining}}', { remaining });
  try {
    await notifee.displayNotification({
      id: LIVE_ACTIVITY_NOTIFICATION_ID,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_prayer',
        color: la.appearance?.accentHex || undefined,
        colorized: la.appearance?.tinted === true,
        ongoing: true,
        autoCancel: false,
        localOnly: true,
        showChronometer: at != null,
        chronometerDirection: 'down',
        timestamp: at?.nextEpochMs,
        showTimestamp: at != null,
        category: AndroidCategory.STATUS,
        visibility: AndroidVisibility.PUBLIC,
        importance: AndroidImportance.LOW,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch (e) {
    console.warn('[liveActivity] post failed', e);
  }
}

export async function stopLiveActivity(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // The two paths post their notifications to different ids
  // (NotificationManager int vs notifee string), so cancel both so we
  // don't leave a stray pinned banner around when the user flips off.
  const native = getMihrabLiveActivityModule();
  if (native) {
    try {
      await native.cancel();
    } catch {
      // Non-fatal.
    }
  }
  try {
    await notifee.cancelNotification(LIVE_ACTIVITY_NOTIFICATION_ID);
  } catch {
    // Non-fatal.
  }
}
