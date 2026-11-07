/**
 * JS wrapper around the native `GarminWatch` module — garmin/README.md.
 *
 * The clockwork is native: the prayer times go to the watch whenever the
 * app writes its widget payload, with the app closed or open. JS only
 * sets the switch and the address, and asks for a send from Settings.
 * Every call degrades to a no-op where the module is absent.
 */
import { NativeModules, Platform } from 'react-native';

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
};

type GarminWatchNative = {
  configure(enabled: boolean, address: string): Promise<GarminSendResult>;
  sendNow(): Promise<GarminSendResult>;
  status(): Promise<GarminWatchStatus>;
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
