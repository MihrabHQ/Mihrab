/**
 * ── "MY LOCATION" KEPT UP WHILE THE APP IS CLOSED (optional) ──────────
 *
 * Opened, the app finds where the phone is and says so when it cannot
 * (`prayer/locationFreshness.ts`). Closed, it could not: a reader who
 * travelled got the alerts and the widgets of the city they had left until
 * the app was next opened. This is the setting for that — Settings →
 * Location, off until asked for, and the app is whole without it.
 *
 * WHAT THE READER IS TOLD BEFORE ANDROID ASKS (`BackgroundLocationCard`):
 * what it is for (alerts and widgets on the place you are in, without
 * opening the app), that it is optional, and that it is asked of Android as
 * location access "all the time". Then Android's own question. Declined,
 * the setting stays off and says where it can be allowed.
 *
 * WHAT IT COSTS is the native side's business, and almost nothing: it
 * never polls (BackgroundLocation.kt on Android; on the iPhone, a preview,
 * iOS's own significant-change service — BackgroundLocation.swift). This file is the part that runs
 * when the phone HAS moved twenty kilometres or more: `locationMovedTask`,
 * the same steps Today takes for a new city — name the town, move "My
 * location", fetch the week, write the widgets and the alerts.
 *
 * THE WISH is kept on this phone only (`WISH_KEY`), not in the settings
 * that sync: "all the time" is a permission of one phone, and a second
 * phone must be asked for itself.
 */
import AsyncStorage from '../storage/appStorage';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  backgroundLocationStatus,
  onBackgroundMove,
  probeBackgroundPosition,
  requestAlwaysLocation,
  setBackgroundLocationEnabled,
  setBackgroundPlace,
  type BackgroundLocationStatus,
} from '../native/BackgroundLocation';
import { reverseLocality, type ReverseLocality } from '../geocoding/nominatim';
import { recordLocationFix } from '../prayer/cityRegistry';
import {
  isFreshFix,
  recordFreshFix,
  staleFixSettlesJourney,
} from '../prayer/locationFreshness';
import { getOrFetchPrayerDay, purgeCachesNear } from '../prayer/prayerStorage';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { applyLocationProviders } from '../settings/locationProviders';
import { loadSettings, saveSettings } from '../settings/storage';
import type { PrayerAppSettings } from '../settings/types';
import { distanceKm } from '../utils/coords';
import { addDays } from '../utils/prayerTimes';
import { requestAndroidLocationPermission } from '../utils/locationPermission';
import { prayerSyncsAsked, prayerSyncsSettled } from '../notifications/prayerNotifications';
import { resyncPrayerAlertsFromStorage } from '../notifications/afterUpdate';
import { republishWidgetPayload } from '../widget/republishWidgetPayload';
import { quiet } from '../utils/quiet';
import { askLiveRecheck, tellLiveMove } from './liveMove';

export const WISH_KEY = 'mihrab.backgroundLocation.v1';
/** A move the app is started for (the native side's MOVE_METERS). */
export const MOVE_KM = 20;
/**
 * The task's waits on the network. It runs in time that is lent — half a
 * minute on the iPhone — and abroad the network is the part that may be
 * missing. Neither the town's name nor the provider's week is needed to
 * move the alerts: the place is named from the app's own list and the times
 * are computed on the phone until the network answers.
 */
export const NAME_WAIT_MS = 6_000;
export const WEEK_WAIT_MS = 12_000;
/** For Today's own write of the alerts to reach the system (see the task's end). */
export const ALERTS_WAIT_MS = 8_000;

/** `work`, or `late` once `ms` have passed (the work is left to finish). */
function within<T, L>(work: Promise<T>, ms: number, late: L): Promise<T | L> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<L>(resolve => {
      timer = setTimeout(() => resolve(late), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function backgroundLocationWished(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WISH_KEY)) === '1';
  } catch {
    return false;
  }
}

export type BackgroundLocationState = BackgroundLocationStatus & {
  /** The reader turned it on (whether or not Android still allows it). */
  wished: boolean;
};

export async function backgroundLocationState(): Promise<BackgroundLocationState> {
  const [status, wished] = await Promise.all([
    backgroundLocationStatus(),
    backgroundLocationWished(),
  ]);
  return { ...status, wished };
}

const BACKGROUND = 'android.permission.ACCESS_BACKGROUND_LOCATION';

/**
 * Turn it on: the ordinary location permission first (Android will not be
 * asked for "all the time" without it), then "all the time" itself — a
 * system sheet on Android 10, the app's page in Settings from Android 11.
 * The caller has ALREADY said what it is for. 'on', or why not.
 */
export async function turnOnBackgroundLocation(): Promise<
  'on' | 'declined' | 'unavailable'
> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios' && Platform.OS !== 'web') return 'unavailable';
  if (!(await backgroundLocationStatus()).offered) return 'unavailable';
  if (Platform.OS === 'web') {
    // The desktop: no question of the system's to ask. A computer that
    // gives no position (no location service, or apps not allowed it) is
    // told now, not after the journey.
    if (!(await probeBackgroundPosition())) return 'declined';
    await AsyncStorage.setItem(WISH_KEY, '1').catch(() => {});
    if (await setBackgroundLocationEnabled(true)) return 'on';
    await turnOffBackgroundLocation();
    return 'declined';
  }
  if (Platform.OS === 'ios') {
    // iOS asks once ("Change to Always Allow"); after that only the
    // Settings app changes the answer, and this reports what it is.
    await AsyncStorage.setItem(WISH_KEY, '1').catch(() => {});
    if ((await requestAlwaysLocation()) && (await setBackgroundLocationEnabled(true)))
      return 'on';
    await turnOffBackgroundLocation();
    return 'declined';
  }
  if ((await requestAndroidLocationPermission()) !== 'granted') return 'declined';
  // The wish is kept BEFORE Android is asked. From Android 11 the question
  // is a page of the system's settings, and Android may end this app's
  // process while the reader is there (seen on an Android 17 emulator,
  // going from "ask every time" to "all the time"): the answer would come
  // back to nobody, and a reader who had just allowed it would find the
  // setting still off. Declined, the wish is taken back below; allowed
  // with the process gone, the next start finds wish and permission both
  // (`syncBackgroundLocation`).
  await AsyncStorage.setItem(WISH_KEY, '1').catch(() => {});
  if (Number(Platform.Version) >= 29) {
    let allowed = false;
    try {
      allowed =
        (await PermissionsAndroid.check(BACKGROUND as never)) ||
        (await PermissionsAndroid.request(BACKGROUND as never)) ===
          PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      allowed = false;
    }
    if (!allowed) {
      await turnOffBackgroundLocation();
      return 'declined';
    }
  }
  if (await setBackgroundLocationEnabled(true)) return 'on';
  await turnOffBackgroundLocation();
  return 'declined';
}

export async function turnOffBackgroundLocation(): Promise<void> {
  await AsyncStorage.removeItem(WISH_KEY).catch(() => {});
  await setBackgroundLocationEnabled(false);
}

/**
 * Keep the native side in step with the app: listening only while the
 * reader wishes it AND "My location" is what the app is on (a place of
 * their own does not follow the phone), and told the place a later
 * position is measured against.
 */
export async function syncBackgroundLocation(
  s: Pick<
    PrayerAppSettings,
    'locationMode' | 'lastFetchedLatitude' | 'lastFetchedLongitude'
  >,
): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios' && Platform.OS !== 'web') return;
  const follows = s.locationMode !== 'manual';
  if (
    follows &&
    typeof s.lastFetchedLatitude === 'number' &&
    typeof s.lastFetchedLongitude === 'number'
  ) {
    setBackgroundPlace(s.lastFetchedLatitude, s.lastFetchedLongitude);
  }
  await setBackgroundLocationEnabled(follows && (await backgroundLocationWished()));
}

export type LocationMovedData = {
  latitude?: number;
  longitude?: number;
  timestamp?: number;
  /**
   * The same move handed over again after a change of time zone (Android,
   * `checkNow`): the first update may have run on the old clock or been
   * ended by the reload, so it is done again even where the place is
   * already there.
   */
  again?: boolean;
};

export type LocationMovedResult =
  | 'moved'
  | 'open'
  | 'off'
  | 'own-place'
  | 'near'
  | 'superseded'
  | 'bad-position'
  | 'failed';

/**
 * The 'LocationMoved' headless task: the phone is twenty kilometres or
 * more from "My location" and the app is closed. Never throws — this is a
 * process nobody opened.
 */
export async function locationMovedTask(
  data: LocationMovedData,
  now: Date = new Date(),
): Promise<LocationMovedResult> {
  try {
    // Open on screen: Today finds the place itself, with a fresher position
    // — and is asked to, or an app left open on a journey would hear of
    // the move and keep the city it had. Only when Today is there to ask:
    // an engine started again in the background (a new time zone) reports
    // 'active' with no screen at all (Android 17 emulator), and the move
    // was dropped.
    if (AppState.currentState === 'active' && askLiveRecheck()) return 'open';
    if (!(await backgroundLocationWished())) return 'off';
    const { latitude, longitude } = data ?? {};
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      (latitude === 0 && longitude === 0)
    ) {
      return 'bad-position';
    }
    const settings = await loadSettings();
    if (settings.locationMode === 'manual') return 'own-place';
    const fromLat = settings.lastFetchedLatitude;
    const fromLng = settings.lastFetchedLongitude;
    // Handed over again after a new zone: only while the place is still
    // that move's. Since moved on (the app found the phone somewhere else
    // in the meantime), doing it again would put the place back.
    if (
      data.again === true &&
      typeof fromLat === 'number' &&
      typeof fromLng === 'number' &&
      distanceKm(fromLat, fromLng, latitude, longitude) >= MOVE_KM
    ) {
      return 'superseded';
    }
    if (
      data.again !== true &&
      typeof fromLat === 'number' &&
      typeof fromLng === 'number' &&
      distanceKm(fromLat, fromLng, latitude, longitude) < MOVE_KM
    ) {
      return 'near';
    }

    // Offline, or too slow: the registry names it as well as it can.
    const locality: ReverseLocality | null = await within(
      reverseLocality(latitude, longitude).then(
        l => l,
        () => null,
      ),
      NAME_WAIT_MS,
      null,
    );
    const summary = await recordLocationFix(latitude, longitude, locality, now);
    for (const a of summary.evictedAnchors) {
      // Never the place just moved to (two entries can share an anchor).
      if (a.latitude === summary.anchorLat && a.longitude === summary.anchorLng) continue;
      purgeCachesNear(a.latitude, a.longitude).catch(() => {});
    }

    const next = applyLocationProviders(settings, {
      lastFetchedLatitude: summary.anchorLat,
      lastFetchedLongitude: summary.anchorLng,
      autoLocationLabel: summary.displayName,
    });
    await saveSettings(next);
    // Alive in the background with Today mounted: its loader takes the
    // place too, or it would show the old one when opened (`liveMove.ts`).
    // The three-hourly check may hand over the phone's LAST position,
    // hours old: the place follows it, but it is not "found" — the app
    // looks again when opened, and says so until it has.
    const measuredAt =
      typeof data.timestamp === 'number' && data.timestamp > 0
        ? data.timestamp
        : null;
    const fresh = isFreshFix(measuredAt, now.getTime());
    setBackgroundPlace(summary.anchorLat, summary.anchorLng);
    const found =
      fresh || (await staleFixSettlesJourney(locality?.countryCode));
    // Not again for a move handed over again: its position is minutes old
    // by then, and "found now" would hide a newer one the phone has.
    if (found && data.again !== true) await recordFreshFix();
    // Alive in the background with Today mounted: its loader takes the
    // place too, or it would show the old one when opened (`liveMove.ts`).
    tellLiveMove({
      latitude: summary.anchorLat,
      longitude: summary.anchorLng,
      label: summary.displayName,
      cityId: summary.cityId,
      measuredAt,
      fresh: found,
    });

    // The new place's week, from its source — as Today fetches it. A day
    // that cannot be had now is computed on the phone by what follows.
    const params = {
      provider: getEffectiveDataProvider(
        next.dataProviderAuto,
        next.dataProvider,
        { latitude: summary.anchorLat, longitude: summary.anchorLng },
        next.calculationMethod,
      ),
      latitude: summary.anchorLat,
      longitude: summary.anchorLng,
      calculationMethod: next.calculationMethod,
      school: next.school,
    };
    const week = (async () => {
      for (let i = 0; i < 7; i++) {
        try {
          await getOrFetchPrayerDay({ ...params, date: addDays(now, i) });
        } catch (quietError) {
          quiet('location/backgroundLocation', quietError);
          break;
        }
      }
    })();
    await within(week, WEEK_WAIT_MS, undefined);

    const asked = prayerSyncsAsked();
    await republishWidgetPayload('launch', now);
    await resyncPrayerAlertsFromStorage(now, asked);
    // NOT DONE UNTIL THE ALERTS ARE WITH THE SYSTEM. With the app alive in
    // the background Today takes the new place too (`tellLiveMove`, above)
    // and writes the alerts itself; the write above then stands down for
    // it (`afterUpdate.ts`). But Today's write is only on its way, and
    // returning here gives the background time back: iOS suspended the app
    // with the widget on the new city and every alert still on the old one
    // — on an iPhone 13, a move handed over in the background, the new
    // place's next prayer passed in silence (Nov 2026). So wait for every
    // write asked for, within what the lent time allows.
    await within(prayerSyncsSettled(), ALERTS_WAIT_MS, undefined);
    return 'moved';
  } catch (quietError) {
    quiet('location/backgroundLocation', quietError);
    return 'failed';
  }
}

/**
 * iOS has no headless task: the app itself is woken (or started) for a
 * move, and this listens for it — from the app's entry, before any screen.
 * The same task runs; iOS is given its background time back when it ends.
 * The Mac (running, its window open or closed) and the desktop app (in the
 * tray) hand their moves over the same way.
 */
export function startBackgroundMoveListener(): () => void {
  return onBackgroundMove((position, done) => {
    locationMovedTask(position)
      .catch(() => 'failed' as const)
      .then(done);
  });
}
