import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { garminAccentHex } from '../settings/garminWatch';
import { setGarminAccent } from './GarminWatch';

/**
 * The Garmin watch face wears the app's accent (garmin/README.md): handed
 * to the native side whenever it changes, which sends it to the watch.
 */
export function useSyncGarminAccent(): void {
  const { hydrated, settings } = usePrayerSettings();
  const hex = garminAccentHex(settings.appAccentId, settings.appAccentCustomHex);
  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android') return;
    void setGarminAccent(hex);
  }, [hydrated, hex]);
}
