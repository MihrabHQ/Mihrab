/**
 * The Android side of "My location kept up while the app is closed"
 * (android/…/BackgroundLocation.kt). Absent on iOS and the desktop, where
 * every call answers "not offered".
 */
import { NativeModules, Platform } from 'react-native';

export type BackgroundLocationStatus = {
  /** This build may ask at all (the permission is declared per store flavor). */
  offered: boolean;
  /** The reader's wish, as the native side holds it. */
  enabled: boolean;
  /** Android allows it now ("Allow all the time"). */
  permitted: boolean;
};

type Native = {
  status?: () => Promise<BackgroundLocationStatus>;
  setEnabled?: (on: boolean) => Promise<boolean>;
  setPlace?: (latitude: number, longitude: number) => void;
};

const native: Native | undefined =
  Platform.OS === 'android'
    ? (NativeModules as Record<string, Native | undefined>).BackgroundLocation
    : undefined;

const NOT_OFFERED: BackgroundLocationStatus = {
  offered: false,
  enabled: false,
  permitted: false,
};

export async function backgroundLocationStatus(): Promise<BackgroundLocationStatus> {
  try {
    const s = await native?.status?.();
    return s
      ? { offered: !!s.offered, enabled: !!s.enabled, permitted: !!s.permitted }
      : NOT_OFFERED;
  } catch {
    return NOT_OFFERED;
  }
}

/** Start or stop listening. True when it is on AND Android allows it. */
export async function setBackgroundLocationEnabled(on: boolean): Promise<boolean> {
  try {
    return (await native?.setEnabled?.(on)) === true;
  } catch {
    return false;
  }
}

/** The place "My location" is on: what a later position is measured against. */
export function setBackgroundPlace(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  try {
    native?.setPlace?.(latitude, longitude);
  } catch {
    // Best effort: the next change of place tells it again.
  }
}
