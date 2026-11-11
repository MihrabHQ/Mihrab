import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { garminAccentHex, garminOptionFlags } from '../settings/garminWatch';
import { setGarminAccent, setGarminOptions } from './GarminWatch';

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
  // And shows what Settings → Devices says it should: the same hand-over,
  // here so a restored backup or a synced setting reaches the watch as a
  // change made on the page does.
  const flags = garminOptionFlags(settings.garminWatch);
  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android') return;
    void setGarminOptions(flags);
  }, [hydrated, flags]);
}
