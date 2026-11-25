/**
 * TODAY'S WRITE OF THE PRAYER ALERTS — ONCE FOR THE SAME ANSWER.
 *
 * Today asks for the alerts to be written from two places: an effect, when
 * anything the schedule is made of changes, and a focus callback, when the
 * tab is come back to. Each write cancels what the app owns and registers
 * the next days again — some twenty alarms and as many notifications.
 *
 * The effect was not gated at all, and it depends on Today's state, which
 * is a new object for every step of a load (the place named, the week
 * arrived, a refresh ended) with the same times in it. And the focus
 * callback wrote beside it under a fingerprint of its own. Measured on an
 * iPhone 13 (Nov 2026): every open of the app wrote the whole schedule
 * three to six times within a second or two.
 *
 * So both ask here, with what the schedule is made of as one fingerprint —
 * the settings, the one-occurrence override AND the times themselves:
 *
 *  - the same answer being written right now is not asked for again;
 *  - the same answer written less than a minute ago is not written again
 *    (`resyncGate.ts`); after that it is, since the days it covers move on;
 *  - a different answer is always written;
 *  - a write that failed is not counted, and the next ask writes.
 */
import {
  syncPrayerNotifications,
} from '../../notifications/prayerNotifications';
import type { PrayerAppSettings } from '../../settings/types';
import type { TimingsMap } from '../../types/prayer';
import {
  dayTzFingerprint,
  markResynced,
  shouldResync,
  weekTimesKey,
} from '../../utils/resyncGate';

/** Gate key — see src/utils/resyncGate.ts. */
export const NOTIF_RESYNC_KEY = 'home.prayerNotifications';

type SyncParams = Parameters<typeof syncPrayerNotifications>[0];

/** The settings the schedule is written from, and no others. */
export type TodayAlertsSettings = Pick<
  PrayerAppSettings,
  | 'notificationsEnabled'
  | 'prePrayerReminderMinutes'
  | 'notificationSound'
  | 'adhanUsesAlarmStream'
  | 'prayerAlertFullScreen'
  | 'malikiSecondTimesEnabled'
  | 'malikiSecondTimeAlerts'
  | 'malikiSecondTimeAlertMinutes'
  | 'malikiSecondTimeEndAlerts'
  | 'prayerAlertModes'
  | 'journalNotificationActionsEnabled'
  | 'tintedSurfaces'
>;

export type TodayAlertsInput = {
  settings: TodayAlertsSettings;
  /** The days on the phone's clock (`phoneView`). */
  today: TimingsMap;
  tomorrow?: TimingsMap;
  yesterday?: TimingsMap;
  alertWeek?: TimingsMap[];
  windowWeek?: TimingsMap[];
  baseDate: Date;
  hour12: boolean;
  accentColor: string;
  /** The Live Activity's one-occurrence override, as Today reads it. */
  alertOverridePrint: string;
};

export type TodayAlertsJob = { print: string; params: SyncParams };

/** What to write, and the fingerprint of everything it is written from. */
export function todayAlertsJob(
  i: TodayAlertsInput,
  now: Date = new Date(),
): TodayAlertsJob {
  const s = i.settings;
  const daruriAlerts = s.malikiSecondTimesEnabled ? s.malikiSecondTimeAlerts : [];
  const params: SyncParams = {
    enabled: s.notificationsEnabled,
    prePrayerReminderMinutes: s.prePrayerReminderMinutes,
    notificationSound: s.notificationSound,
    adhanUsesAlarmStream: s.adhanUsesAlarmStream,
    prayerAlertFullScreen: s.prayerAlertFullScreen,
    // On the phone's clock: the schedule reads every time on it.
    today: i.today,
    tomorrow: i.tomorrow,
    // Last night's ʿIshāʾ past midnight is still ahead in the small hours.
    yesterday: i.yesterday,
    // Anchor the schedule to the day the maps were FETCHED for — if this
    // sync fires with stale state just after midnight, yesterday's map
    // must not be pinned onto today's date (early-adhan bug, v2.7.38).
    baseDate: i.baseDate,
    // Extra cached days extend coverage past tomorrow so alerts keep
    // firing when the app isn't opened for a couple of days (v2.7.40).
    // The alert week, not the drawn one — with the rows off they differ
    // by exactly the boundaries this schedule is for.
    week: i.alertWeek,
    // Unfiltered, so Fajr ends at sunrise even with the Sunrise row hidden.
    windowWeek: i.windowWeek,
    // Only when the times themselves are on: an alert about a boundary
    // the card is not showing would be the app announcing something the
    // reader cannot go and look at.
    daruriAlerts,
    daruriAlertMinutes: s.malikiSecondTimeAlertMinutes,
    daruriEndAlerts: s.malikiSecondTimeEndAlerts,
    alertModes: s.prayerAlertModes,
    journalLogActionEnabled: s.journalNotificationActionsEnabled,
    hour12: i.hour12,
    // The shade's tint follows the app's accent, Material You included.
    accentColor: i.accentColor,
    // Tinted surfaces: colourise the whole notification with the accent.
    tinted: s.tintedSurfaces,
  };
  const print = dayTzFingerprint(
    now,
    String(s.notificationsEnabled),
    s.prePrayerReminderMinutes,
    s.notificationSound,
    // It changes which CHANNEL every prayer is scheduled against.
    String(s.adhanUsesAlarmStream),
    // The full-screen intent is part of each alert.
    String(s.prayerAlertFullScreen),
    // Sunrise and the night marks print a clock time in their copy. The
    // resolved answer, so 'auto' following the device counts as a change.
    String(i.hour12),
    // The tint is written into every card.
    i.accentColor,
    String(s.tintedSurfaces),
    daruriAlerts.join(','),
    String(s.malikiSecondTimeAlertMinutes),
    String(s.malikiSecondTimeEndAlerts),
    // Which prayers speak, and how.
    JSON.stringify(s.prayerAlertModes),
    String(s.journalNotificationActionsEnabled),
    // Not a setting, and not from this process: the card's button writes
    // it. It changes which channel ONE prayer is scheduled against.
    i.alertOverridePrint,
    i.baseDate.getTime(),
    // The times themselves: a saved place switched to, or a provider's
    // week arriving over the computed one, is the same day and settings.
    weekTimesKey([i.today]),
    weekTimesKey(i.tomorrow ? [i.tomorrow] : undefined),
    weekTimesKey(i.yesterday ? [i.yesterday] : undefined),
    weekTimesKey(i.alertWeek),
    weekTimesKey(i.windowWeek),
  );
  return { print, params };
}

/** The answer being written now, if one is. */
let inFlight: string | null = null;

/**
 * Write the alerts unless this very answer is being written, or was
 * written within the gap. True when a write was asked for.
 */
export function writeTodayAlerts(
  job: TodayAlertsJob,
  from: 'effect' | 'focus',
  now: number = Date.now(),
): boolean {
  if (inFlight === job.print) return false;
  if (!shouldResync(NOTIF_RESYNC_KEY, job.print, now)) return false;
  inFlight = job.print;
  syncPrayerNotifications(job.params)
    // Marked on success only: a rewrite that threw must not suppress
    // the next attempt, or one bad round leaves the alarms as they are
    // for a whole minute of retries that never run.
    .then(() => markResynced(NOTIF_RESYNC_KEY, job.print))
    .catch(e => console.warn(`syncPrayerNotifications (${from}):`, e))
    .finally(() => {
      if (inFlight === job.print) inFlight = null;
    });
  return true;
}

/** Tests. */
export function forgetTodayAlertsInFlight(): void {
  inFlight = null;
}
