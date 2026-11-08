/**
 * JS wrapper around the native `GarminWatch` module — garmin/README.md.
 *
 * The clockwork is native: the prayer times go to the watch whenever the
 * app writes its widget payload, with the app closed or open. JS only
 * sets the switch and the address, and asks for a send from Settings.
 * Every call degrades to a no-op where the module is absent.
 */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/** What a send did — the native outcome words. */
export type GarminSendResult =
  | 'sent'
  | 'unchanged'
  | 'disabled'
  | 'no-address'
  | 'no-gadgetbridge'
  | 'no-times';

export type GarminWatchStatus = {
  enabled: boolean;
  address: string;
  /** The installed Gadgetbridge build's package name, or null. */
  gadgetbridge: string | null;
  /** Whether this build carries a watch face to install (absent on older builds). */
  bundledFace?: boolean;
};

/** What handing the watch face to Gadgetbridge did. */
export type GarminInstallResult = 'opened' | 'no-face' | 'no-gadgetbridge' | 'failed';

/** A device paired with the phone; `garmin` when its name says so. */
export type PairedDevice = { name: string; address: string; garmin: boolean };

type GarminWatchNative = {
  configure(enabled: boolean, address: string): Promise<GarminSendResult>;
  sendNow(): Promise<GarminSendResult>;
  status(): Promise<GarminWatchStatus>;
  pairedDevices(): Promise<PairedDevice[] | null>;
  setFahrenheit?(fahrenheit: boolean): Promise<void>;
  setAccent?(hex: string): Promise<void>;
  installFace?(): Promise<GarminInstallResult>;
};

const native: GarminWatchNative | undefined =
  Platform.OS === 'android'
    ? (NativeModules as Record<string, GarminWatchNative | undefined>)
        .GarminWatch
    : undefined;

/** Whether this build can talk to Gadgetbridge at all. */
export const garminWatchAvailable = native != null;

export async function configureGarminWatch(
  enabled: boolean,
  address: string,
): Promise<GarminSendResult> {
  if (!native) return 'disabled';
  try {
    return await native.configure(enabled, address);
  } catch {
    return 'disabled';
  }
}

/**
 * Whether the watch's weather reads in Fahrenheit — the place's own
 * thermometer (`temperatureUnit.ts`). Kept natively; the next send carries it.
 */
export async function setGarminFahrenheit(fahrenheit: boolean): Promise<void> {
  if (!native?.setFahrenheit) return;
  try {
    await native.setFahrenheit(fahrenheit);
  } catch {
    /* best-effort */
  }
}

/**
 * The watch face's accent, the app's (`garminAccentHex`). Kept natively,
 * and sent at once when it changes.
 */
export async function setGarminAccent(hex: string): Promise<void> {
  if (!native?.setAccent) return;
  try {
    await native.setAccent(hex);
  } catch {
    /* best-effort */
  }
}

/**
 * Opens Gadgetbridge's installer on the watch face this build carries
 * (android/app/build.gradle, copyGarminFace); Gadgetbridge asks before
 * it installs.
 */
export async function installGarminFace(): Promise<GarminInstallResult> {
  if (!native?.installFace) return 'no-face';
  try {
    return await native.installFace();
  } catch {
    return 'failed';
  }
}

export async function sendToGarminWatch(): Promise<GarminSendResult> {
  if (!native) return 'disabled';
  try {
    return await native.sendNow();
  } catch {
    return 'disabled';
  }
}

export async function garminWatchStatus(): Promise<GarminWatchStatus | null> {
  if (!native) return null;
  try {
    return await native.status();
  } catch {
    return null;
  }
}

/**
 * The phone's paired devices, Garmin watches first — asking for the
 * Bluetooth permission (Android 12+) on the way. Null when it was refused.
 */
export async function pairedWatches(): Promise<PairedDevice[] | null> {
  if (!native) return null;
  try {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return null;
    }
    return await native.pairedDevices();
  } catch {
    return null;
  }
}
