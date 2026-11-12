/**
 * WHICH ADHAN, apart from WHETHER (#129).
 *
 * One setting used to answer both. "Alert sound" was a list with "Default
 * notification" at its head and the adhans under it: choosing an adhan
 * meant "the five prayers play this", choosing the default meant "no
 * adhan". Then each prayer got its own mode — Adhan, Alert, Silent
 * (settings/alertModes.ts) — and the two answers could disagree: a prayer
 * set to Adhan under an alert sound of "Default notification" had no adhan
 * to play. That is what the reporter set, twice over, and what he asked
 * for: the adhan's sound chosen apart from the alert's.
 *
 * So the list is the adhans alone now — WHICH — and the rows say WHETHER.
 * `notificationSound` keeps its old values on disk, `'default'` among them:
 * it still means "nobody has chosen an adhan, and a prayer nobody has set
 * plays the plain alert", so an install that upgrades sounds as it did and
 * an older build syncing with this one reads what it wrote. What changes is
 * what a row set to Adhan plays under it: an adhan, always.
 */
import type { NotificationSoundId } from '../notifications/notificationSounds';
import { SALAH_KEYS, type AlertModeMap } from './alertModes';

/** The adhan a prayer set to Adhan plays when none has been chosen. */
export const DEFAULT_ADHAN_SOUND: NotificationSoundId = 'adhan_makkah';

/** The adhan in force: the chosen one, or the default where none is. */
export function adhanVoiceOf(sound: NotificationSoundId): NotificationSoundId {
  return sound === 'default' ? DEFAULT_ADHAN_SOUND : sound;
}

/** Whether any of the five has been set to Adhan by hand. */
export function anyRowSetToAdhan(modes: AlertModeMap | undefined): boolean {
  return SALAH_KEYS.some(key => modes?.[key] === 'adhan');
}

/**
 * The adhan the alerts are built around — its channel made, its sound
 * addressed — or `'default'` where no prayer plays one: nobody has chosen an
 * adhan and no row asks for it (`once`: nor does the Live Activity's button,
 * for the one prayer coming). A channel nothing posts to is an entry in the
 * phone's notification settings for nothing.
 */
export function adhanVoiceInUse(
  sound: NotificationSoundId,
  modes: AlertModeMap | undefined,
  once = false,
): NotificationSoundId {
  if (sound !== 'default') return sound;
  return anyRowSetToAdhan(modes) || once ? DEFAULT_ADHAN_SOUND : 'default';
}

/**
 * Choosing an adhan from the list.
 *
 * It has always turned the adhan on for the prayers nobody had set — that
 * is how most people turn it on, and it still is. But someone who has set
 * a prayer to Adhan by hand is deciding prayer by prayer: for them the list
 * changes the voice and nothing else, so the prayers they have not set are
 * written down as what they are now — the plain alert — before the choice
 * would turn them into the adhan.
 */
export function chooseAdhanVoice(
  current: { notificationSound: NotificationSoundId; prayerAlertModes?: AlertModeMap },
  voice: NotificationSoundId,
): { notificationSound: NotificationSoundId; prayerAlertModes?: AlertModeMap } {
  const modes = current.prayerAlertModes ?? {};
  if (current.notificationSound !== 'default' || voice === 'default' || !anyRowSetToAdhan(modes)) {
    return { notificationSound: voice };
  }
  const kept: AlertModeMap = { ...modes };
  for (const key of SALAH_KEYS) {
    if (!kept[key]) kept[key] = 'notification';
  }
  return { notificationSound: voice, prayerAlertModes: kept };
}

/**
 * "Turn off the adhan", from the notification's own button: no adhan
 * chosen, and no prayer left asking for one — a row still set to Adhan
 * would go on playing it.
 */
export function withoutAdhan(modes: AlertModeMap | undefined): {
  notificationSound: NotificationSoundId;
  prayerAlertModes: AlertModeMap;
} {
  const next: AlertModeMap = { ...(modes ?? {}) };
  for (const key of SALAH_KEYS) {
    if (next[key] === 'adhan') next[key] = 'notification';
  }
  return { notificationSound: 'default', prayerAlertModes: next };
}
