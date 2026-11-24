/**
 * The device's location, asked for once.
 *
 * The native halves are in the app's own tree now
 * (android/…/geolocation/, ios/PrayerApp/MihrabGeolocation.mm): the code of
 * @react-native-community/geolocation 3.4.0 with the app's patch applied,
 * moved in when the library stopped being maintained. This is the part of
 * the library's JavaScript the app used — two calls — with the same
 * arguments and the same defaults, so what reaches native is what always
 * did. On Windows, Linux and the web the build swaps this file for
 * desktop/web/shims/geolocation.js (the browser's own geolocation).
 */
import { NativeModules } from 'react-native';

export type GeolocationOptions = {
  timeout?: number;
  maximumAge?: number;
  enableHighAccuracy?: boolean;
  distanceFilter?: number;
  useSignificantChanges?: boolean;
  interval?: number;
  fastestInterval?: number;
};

export type GeolocationConfiguration = {
  skipPermissionRequests: boolean;
  authorizationLevel?: 'always' | 'whenInUse' | 'auto';
  locationProvider?: 'playServices' | 'android' | 'auto';
  enableBackgroundLocationUpdates?: boolean;
};

export type GeolocationResponse = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
};

export type GeolocationError = {
  code: number;
  message: string;
  PERMISSION_DENIED: number;
  POSITION_UNAVAILABLE: number;
  TIMEOUT: number;
};

type Native = {
  setConfiguration(config: Record<string, unknown>): void;
  getCurrentPosition(
    options: GeolocationOptions,
    success: (position: GeolocationResponse) => void,
    error: (error: GeolocationError) => void,
  ): void;
};

function native(): Native {
  const m = NativeModules.MihrabGeolocation as Native | undefined;
  if (!m) throw new Error('MihrabGeolocation is not linked into this build');
  return m;
}

const Geolocation = {
  /** Options for every later request. `'auto'` is sent as nothing, as the library sent it. */
  setRNConfiguration(config: GeolocationConfiguration): void {
    native().setConfiguration({
      ...config,
      enableBackgroundLocationUpdates: config.enableBackgroundLocationUpdates ?? true,
      authorizationLevel: config.authorizationLevel === 'auto' ? undefined : config.authorizationLevel,
      locationProvider: config.locationProvider === 'auto' ? undefined : config.locationProvider,
    });
  },

  /** One position: `success` once, or `error` once. Permission is native's to check. */
  getCurrentPosition(
    success: (position: GeolocationResponse) => void,
    error: (error: GeolocationError) => void = e => console.warn('Geolocation', e),
    options: GeolocationOptions = {},
  ): void {
    native().getCurrentPosition(options, success, error);
  },
};

export default Geolocation;
