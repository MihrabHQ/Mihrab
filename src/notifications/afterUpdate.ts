/**
 * THE ALERTS AN UPDATE LEFT BEHIND.
 *
 * Prayer alerts are scheduled about four days ahead, and only from Today
 * (`HomeScreen`), which is where the week of times is held. An update
 * replaces the code but not the schedule: until Today is next drawn, the
 * alerts the previous version wrote keep firing — at the times it worked
 * out, with whatever it got wrong. And Today is not always drawn: a widget's
 * deep link opens the app on a lazy tab that never mounts it.
 *
 * So the first time a new version runs — at the app's root before any
 * screen, and on Android straight from the update broadcast, headless
 * (`MihrabRestartReceiver` → `AlertsResyncHeadlessService` → the
 * 'AlertsResync' task in index.js) — the alerts are written again from what
 * is on the phone, and the widget payload with them. Once per version: the
 * version it was done for is stored under its own key, apart from
 * `mihrab.lastSeenVersion`, which is the what's-new sheet's.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { AppVersionModule } from '../native/AppVersion';
import { injectDaruriTimes } from '../prayer/daruriTimes';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../settings/effectiveProvider';
import { applyOffsets } from '../settings/prayerOffsets';
import { loadSettings } from '../settings/storage';
import { resolveAppPalette } from '../theme/appPalette';
import { activeClock } from '../utils/activeClock';
import { filterOptionalTimes, injectNightTimes } from '../utils/nightTimes';
import {
  rawWindow,
  republishWidgetPayload,
} from '../widget/republishWidgetPayload';
import { syncPrayerNotifications } from './prayerNotifications';

/** The installed version the alerts were last written for. */
export const ALERTS_VERSION_KEY = 'mihrab.alertsWrittenForVersion';

/**
 * The installed build, as `versionName+buildNumber` — a rebuild under the
 * same version name (a beta, a hotfix) is a new build all the same. Null
 * when the native module cannot say, which is not a reason to rewrite.
 */
export function installedBuildStamp(): string | null {
  const name = AppVersionModule?.versionName?.trim();
  const build = AppVersionModule?.buildNumber?.trim();
  if (!name && !build) return null;
  return `${name ?? '?'}+${build ?? '?'}`;
}

/**
 * Write the prayer alerts from what the phone holds, as Today would: the
 * cached window (or the provider's answer computed on the phone), the
 * user's offsets, the night times, the rows they have on, and the Mālikī
 * second times when those alert. False when there is nothing to write
 * from — no location yet.
 */
export async function resyncPrayerAlertsFromStorage(
  now: Date = new Date(),
): Promise<boolean> {
  const settings = await loadSettings();
  const coords = resolveCoordsFromSettings(settings);
  if (
    coords == null ||
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude) ||
    (coords.latitude === 0 && coords.longitude === 0)
  ) {
    return false;
  }
  const raw = await rawWindow(
    {
      provider: getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coords,
        settings.calculationMethod,
      ),
      latitude: coords.latitude,
      longitude: coords.longitude,
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    },
    now,
  );
  if (raw.length === 0) return false;
  // Unfiltered: Fajr ends at sunrise whether or not its row is shown.
  const windowWeek = injectNightTimes(
    raw.map(day => applyOffsets(day, settings.prayerOffsets)),
    now,
  );
  const week = windowWeek.map(day =>
    filterOptionalTimes(day, {
      Sunrise: settings.sunriseEnabled,
      Midnight: settings.islamicMidnightEnabled,
      Lastthird: settings.lastThirdEnabled,
      Firstthird: settings.firstThirdEnabled,
    }),
  );
  const alertWeek = settings.malikiSecondTimesEnabled
    ? injectDaruriTimes(
        week,
        now,
        coords.latitude,
        coords.longitude,
        settings.school === 1 ? 2 : 1,
      )
    : week;
  let accentColor: string | undefined;
  try {
    const palette = resolveAppPalette({
      appearance: settings.appearance,
      useSystemDynamicTheme: settings.useSystemDynamicTheme,
      systemScheme: Appearance.getColorScheme(),
      pureBlackDark: settings.pureBlackDark,
      appAccentId: settings.appAccentId,
      appAccentCustomHex: settings.appAccentCustomHex,
      tintedSurfaces: settings.tintedSurfaces,
    });
    accentColor =
      typeof palette.accentSolid === 'string' ? palette.accentSolid : undefined;
  } catch {
    /* the notifications' own default; Today's next write puts the accent back */
  }
  await syncPrayerNotifications({
    enabled: settings.notificationsEnabled,
    prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
    notificationSound: settings.notificationSound,
    adhanUsesAlarmStream: settings.adhanUsesAlarmStream,
    prayerAlertFullScreen: settings.prayerAlertFullScreen,
    today: alertWeek[0],
    tomorrow: alertWeek[1],
    baseDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    week: alertWeek,
    windowWeek,
    daruriAlerts: settings.malikiSecondTimesEnabled
      ? settings.malikiSecondTimeAlerts
      : [],
    daruriAlertMinutes: settings.malikiSecondTimeAlertMinutes,
    daruriEndAlerts: settings.malikiSecondTimeEndAlerts,
    alertModes: settings.prayerAlertModes,
    journalLogActionEnabled: settings.journalNotificationActionsEnabled,
    // Set from the settings by the widget's republish, which runs first.
    hour12: activeClock().hour12,
    accentColor,
    tinted: settings.tintedSurfaces,
  });
  return true;
}

export type AfterUpdateResult =
  | 'rewritten'
  | 'same-version'
  | 'unknown-version'
  | 'failed';

let running: Promise<AfterUpdateResult> | null = null;

/**
 * Once per installed build: the widget payload, then the prayer alerts,
 * written again, and the build recorded. The widget first because its
 * republish puts the user's language and clock in place for a process
 * that has no settings provider (the headless task). Recorded only when
 * the alerts were written — or there was nothing to write them from — so
 * a run that failed is tried again on the next start.
 */
export function resyncAfterUpdate(
  now: Date = new Date(),
): Promise<AfterUpdateResult> {
  if (!running) running = run(now);
  return running;
}

async function run(now: Date): Promise<AfterUpdateResult> {
  const stamp = installedBuildStamp();
  if (!stamp) return 'unknown-version';
  try {
    if ((await AsyncStorage.getItem(ALERTS_VERSION_KEY)) === stamp)
      return 'same-version';
  } catch {
    return 'failed';
  }
  try {
    await republishWidgetPayload('launch', now);
    await resyncPrayerAlertsFromStorage(now);
    await AsyncStorage.setItem(ALERTS_VERSION_KEY, stamp);
    return 'rewritten';
  } catch (e) {
    console.warn('resyncAfterUpdate failed:', e);
    return 'failed';
  }
}

/**
 * The 'AlertsResync' headless task, started by the update broadcast on
 * Android. Never throws: an unhandled rejection here is a crash in a
 * process nobody opened.
 */
export async function alertsResyncTask(): Promise<void> {
  try {
    await resyncAfterUpdate();
  } catch {
    /* the app's own start tries again */
  }
}

/** Tests: a new process. */
export function _resetAfterUpdateForTests(): void {
  running = null;
}
