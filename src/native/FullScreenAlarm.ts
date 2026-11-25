/**
 * JS wrapper around the native `FullScreenAlarm` module — issue #63.
 *
 * Whether Android will let a prayer alert take the whole screen, and the way
 * to the system page that grants it. No-ops on iOS and on a build without the
 * module, so callers can simply call.
 */
import { Platform } from 'react-native';
import NativeFullScreenAlarm from './specs/NativeFullScreenAlarm';
import { nativeModule } from './nativeModule';

type FullScreenAlarmNative = {
  canUse(): Promise<boolean>;
  openSettings(): Promise<void>;
};

const native: FullScreenAlarmNative | undefined =
  Platform.OS === 'android'
    ? (nativeModule(NativeFullScreenAlarm, 'FullScreenAlarm') as FullScreenAlarmNative | undefined)
    : undefined;

/** Whether this build can show a full-screen prayer alert at all. */
export const fullScreenAlarmAvailable = native != null;

/** Whether USE_FULL_SCREEN_INTENT is currently granted. */
export async function canUseFullScreenAlarm(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.canUse();
  } catch {
    return false;
  }
}

/** Open the system page where full-screen alerts are allowed. */
export async function openFullScreenAlarmSettings(): Promise<void> {
  if (!native) return;
  try {
    await native.openSettings();
  } catch (e) {
    console.warn('FullScreenAlarm.openSettings:', e);
  }
}
