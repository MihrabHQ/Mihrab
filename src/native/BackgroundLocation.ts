/**
 * The native side of "My location kept up while the app is closed":
 * Android's (android/…/BackgroundLocation.kt) and the iPhone's
 * (ios/PrayerApp/BackgroundLocation.swift, a preview), under one name and
 * the same calls. Absent on the Mac and the desktop, where every call
 * answers "not offered".
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

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
  confirmPlace?: () => void;
  // iOS only.
  requestAlways?: () => Promise<boolean>;
  takePending?: () => Promise<MovedPosition | null>;
  finish?: () => void;
};

export type MovedPosition = {
  latitude?: number;
  longitude?: number;
  timestamp?: number;
};

const native: Native | undefined =
  Platform.OS === 'android' || Platform.OS === 'ios'
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

/**
 * The place "My location" is on: what a later position is measured against.
 * Telling it the place it already has changes nothing — above all not WHEN
 * the place was found, which only a position can say (`confirmBackgroundPlace`).
 */
export function setBackgroundPlace(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  try {
    native?.setPlace?.(latitude, longitude);
  } catch {
    // Best effort: the next change of place tells it again.
  }
}

/**
 * A fresh position has just said the place is where the phone is: positions
 * older than now are not news, and the phone's surroundings now (network
 * country, time zone) are the place's.
 *
 * Kept apart from `setBackgroundPlace` because the app tells the native
 * side its place at every launch, found or not. When that also stamped the
 * place "as of now", a reader who opened the app indoors after a journey —
 * no position found, the old city still up — had the journey wiped from
 * the native side's memory: every position the phone already held was
 * "older than the place", and the new country was written down as the old
 * city's own.
 */
export function confirmBackgroundPlace(): void {
  try {
    native?.confirmPlace?.();
  } catch {
    // Best effort.
  }
}

/** iOS: ask for "Always". True when iOS allows it afterwards. */
export async function requestAlwaysLocation(): Promise<boolean> {
  try {
    return (await native?.requestAlways?.()) === true;
  } catch {
    return false;
  }
}

/**
 * iOS: the moves iOS wakes the app for. One that arrived before JavaScript
 * was listening (the app started for it) is handed over first. `done` gives
 * iOS back the background time it lent; call it when the update is written.
 */
export function onBackgroundMove(
  handle: (position: MovedPosition, done: () => void) => void,
): () => void {
  if (Platform.OS !== 'ios' || !native) return () => {};
  const done = () => {
    try {
      native.finish?.();
    } catch {
      // iOS takes the time back by itself.
    }
  };
  try {
    const emitter = new NativeEventEmitter(native as never);
    const sub = emitter.addListener('BackgroundLocationMoved', (e: unknown) =>
      handle((e as MovedPosition | null) ?? {}, done),
    );
    native
      .takePending?.()
      .then(p => {
        if (p) handle(p, done);
      })
      .catch(() => {});
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
