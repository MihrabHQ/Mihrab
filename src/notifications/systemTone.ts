/**
 * ── A CHANNEL THAT NAMES NO SOUND IS SILENT (#134) ─────────────────────
 *
 * On Android a notification's sound is its channel's, and Notifee builds a
 * channel from what it is given: no `sound`, and it calls
 * `NotificationChannel.setSound(null, null)` — a silent channel, not one on
 * the phone's own tone. Every channel here that meant "the default
 * notification sound" left `sound` out, so on a fresh install the prayer
 * alerts on "Default notification", the reminder before a prayer, Sunrise
 * and every reminder (khatmah, hifz, surahs, dhikr, fasting, du'a, the
 * ayah of the day, the day's log) arrived without a sound until the user
 * set one by hand in Android's settings. Seen on Android 17 (LineageOS 24),
 * confirmed with `dumpsys notification`: `mSound=null`.
 *
 * `SYSTEM_TONE` is what Notifee reads as the phone's default sound.
 *
 * A channel's sound cannot change once it exists, and a channel deleted and
 * made again under the same id comes back with the settings it had — so
 * the fix is a new id for each of them, and the old, silent one retired
 * where its notifications are scheduled again (`retireSilentChannel`),
 * which is also the moment nothing is left pointing at it.
 */
import notifee from '@notifee/react-native';
import { Platform } from 'react-native';

/** Notifee's name for the phone's own notification sound. */
export const SYSTEM_TONE = 'default';

/** The ids these channels had while they were silent (before #134). */
export const SILENT_CHANNEL_IDS = {
  prayerDefault: 'prayer-times-default',
  ayahOfDay: 'prayer_app_ayah_of_day',
  dhikr: 'prayer_app_dhikr_reminders',
  dua: 'prayer_app_dua_reminders',
  endOfDayLog: 'prayer_app_end_of_day_log',
  fasting: 'prayer_app_fasting_reminders',
  hifz: 'prayer_app_hifz_reminder',
  khatmah: 'prayer_app_khatmah_reminder',
  surah: 'prayer_app_surah_reminders',
} as const;

/**
 * Delete a channel left from before #134. A no-op where it never existed
 * (a fresh install) and off Android.
 */
export async function retireSilentChannel(id: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.deleteChannel(id).catch(() => {});
}
