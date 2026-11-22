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
 * never polls (BackgroundLocation.kt). This file is the part that runs
 * when the phone HAS moved twenty kilometres or more: `locationMovedTask`,
 * the same steps Today takes for a new city — name the town, move "My
 * location", fetch the week, write the widgets and the alerts.
 *
 * THE WISH is kept on this phone only (`WISH_KEY`), not in the settings
 * that sync: "all the time" is a permission of one phone, and a second
 * phone must be asked for itself.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  backgroundLocationStatus,
  setBackgroundLocationEnabled,
  setBackgroundPlace,
  type BackgroundLocationStatus,
} from '../native/BackgroundLocation';
import { reverseLocality, type ReverseLocality } from '../geocoding/nominatim';
import { recordLocationFix } from '../prayer/cityRegistry';
import { recordFreshFix } from '../prayer/locationFreshness';
import { getOrFetchPrayerDay, purgeCachesNear } from '../prayer/prayerStorage';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { applyLocationProviders } from '../settings/locationProviders';
import { loadSettings, saveSettings } from '../settings/storage';
import type { PrayerAppSettings } from '../settings/types';
import { distanceKm } from '../utils/coords';
import { addDays } from '../utils/prayerTimes';
import { requestAndroidLocationPermission } from '../utils/locationPermission';
import { prayerSyncsAsked } from '../notifications/prayerNotifications';
import { resyncPrayerAlertsFromStorage } from '../notifications/afterUpdate';
import { republishWidgetPayload } from '../widget/republishWidgetPayload';
import { quiet } from '../utils/quiet';
import { tellLiveMove } from './liveMove';

export const WISH_KEY = 'mihrab.backgroundLocation.v1';
/** A move the app is started for (the native side's MOVE_METERS). */
export const MOVE_KM = 20;

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
  if (Platform.OS !== 'android') return 'unavailable';
  if (!(await backgroundLocationStatus()).offered) return 'unavailable';
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
  if (Platform.OS !== 'android') return;
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
};

export type LocationMovedResult =
  | 'moved'
  | 'open'
  | 'off'
  | 'own-place'
  | 'near'
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
    // Open on screen: Today finds the place itself, with a fresher position.
    if (AppState.currentState === 'active') return 'open';
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
    if (
      typeof fromLat === 'number' &&
      typeof fromLng === 'number' &&
      distanceKm(fromLat, fromLng, latitude, longitude) < MOVE_KM
    ) {
      return 'near';
    }

    let locality: ReverseLocality | null = null;
    try {
      locality = await reverseLocality(latitude, longitude);
    } catch {
      locality = null; // offline: the registry names it as well as it can
    }
    const summary = await recordLocationFix(latitude, longitude, locality, now);
    for (const a of summary.evictedAnchors) {
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
    tellLiveMove({
      latitude: summary.anchorLat,
      longitude: summary.anchorLng,
      label: summary.displayName,
      cityId: summary.cityId,
    });
    setBackgroundPlace(summary.anchorLat, summary.anchorLng);
    await recordFreshFix();

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
    for (let i = 0; i < 7; i++) {
      try {
        await getOrFetchPrayerDay({ ...params, date: addDays(now, i) });
      } catch (quietError) {
        quiet('location/backgroundLocation', quietError);
        break;
      }
    }

    const asked = prayerSyncsAsked();
    await republishWidgetPayload('launch', now);
    await resyncPrayerAlertsFromStorage(now, asked);
    return 'moved';
  } catch (quietError) {
    quiet('location/backgroundLocation', quietError);
    return 'failed';
  }
}
