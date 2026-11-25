/**
 * Typed wrapper for the AppVersion native module.
 *
 * Provides the installed version string and build number without relying
 * on implicit `any` from NativeModules.
 */
import NativeAppVersion from './specs/NativeAppVersion';
import { nativeConstants } from './nativeModule';

export interface AppVersionInterface {
  /** Human-readable version string, e.g. "1.5.49". */
  versionName?: string;
  /** Numeric build number, e.g. "72". */
  buildNumber?: string;
}

export const AppVersionModule =
  nativeConstants(NativeAppVersion, 'AppVersion') as AppVersionInterface | undefined;
