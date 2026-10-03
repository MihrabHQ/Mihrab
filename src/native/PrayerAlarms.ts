/**
 * JS wrapper around the native `PrayerAlarms` module — issue #63, iPhone half.
 *
 * iOS 26's AlarmKit lets an app ring like the Clock app's alarms: over the
 * lock screen, through the silent switch and Focus, with Stop and Snooze.
 * (Android's equivalent is `FullScreenAlarm`.) Every call degrades to a
 * no-op off iOS, on iOS before 26, on Mac Catalyst and in a build without
 * the module, so callers can simply call.
 */
import { NativeModules, Platform } from 'react-native';

export type AlarmAccess =
  | 'authorized'
  | 'denied'
  | 'notDetermined'
  | 'unavailable';

/** One prayer alarm, as the native side takes it. */
export type PrayerAlarm = {
  /** Epoch ms. */
  at: number;
  /** What the alert says: the prayer's name, in the app's language. */
  title: string;
  /** Canonical English key (Fajr…). */
  prayer: string;
  /** A bundled ".caf" file name (extension included), or '' for the
   *  system alarm tone. */
  sound: string;
  /** The Stop button's word — iOS 26.0 makes the app say it. */
  stopLabel: string;
  snoozeLabel: string;
  snoozeMinutes: number;
  /** "#rrggbb". */
  tint: string;
};

type PrayerAlarmsNative = {
  isAvailable(): Promise<boolean>;
  authorizationState(): Promise<AlarmAccess>;
  requestAccess(): Promise<AlarmAccess>;
  schedule(alarms: PrayerAlarm[]): Promise<number>;
  clear(): Promise<void>;
};

const native: PrayerAlarmsNative | undefined =
  Platform.OS === 'ios'
    ? (NativeModules as Record<string, PrayerAlarmsNative | undefined>)
        .PrayerAlarms
    : undefined;

/** Whether this build could offer prayer alarms at all (iOS only). */
export const prayerAlarmsModulePresent = native != null;

/** Whether this device can: iOS 26 or later, not a Mac. */
export async function prayerAlarmsAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isAvailable();
  } catch {
    return false;
  }
}

export async function prayerAlarmAccess(): Promise<AlarmAccess> {
  if (!native) return 'unavailable';
  try {
    return await native.authorizationState();
  } catch {
    return 'unavailable';
  }
}

/** Show the system prompt the first time; report the answer after that. */
export async function requestPrayerAlarmAccess(): Promise<AlarmAccess> {
  if (!native) return 'unavailable';
  try {
    return await native.requestAccess();
  } catch {
    return 'denied';
  }
}

/**
 * Make the registered alarms exactly `alarms`. Alarms that are ringing or
 * counting down a snooze are never touched (see `PrayerAlarms.swift`).
 * Never throws: a failure here must not stop the notifications beside it.
 */
export async function schedulePrayerAlarms(
  alarms: PrayerAlarm[],
): Promise<number> {
  if (!native) return 0;
  try {
    return await native.schedule(alarms);
  } catch (e) {
    console.warn('PrayerAlarms.schedule:', e);
    return 0;
  }
}

export async function clearPrayerAlarms(): Promise<void> {
  if (!native) return;
  try {
    await native.clear();
  } catch (e) {
    console.warn('PrayerAlarms.clear:', e);
  }
}
