import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { garminAccentHex, garminFaceBits } from '../settings/garminWatch';
import { setGarminAccent, setGarminFaceOptions } from './GarminWatch';

/**
 * The Garmin watch face wears the app's accent and the options chosen in
 * Settings → Devices (garmin/README.md): each handed to the native side
 * whenever it changes, which sends it to the watch.
 */
export function useSyncGarminAccent(): void {
  const { hydrated, settings } = usePrayerSettings();
  const hex = garminAccentHex(settings.appAccentId, settings.appAccentCustomHex);
  const faceBits = garminFaceBits(settings.garminWatch.face);
  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android') return;
    void setGarminAccent(hex);
  }, [hydrated, hex]);
  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android') return;
    void setGarminFaceOptions(faceBits);
  }, [hydrated, faceBits]);
}
