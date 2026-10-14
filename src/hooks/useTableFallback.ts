/**
 * Is today's answer the published table, or the phone standing in for it?
 *
 * A source that serves an authority's table can still have no row for the
 * day — JAKIM past 31 December, a regency before its first download, any
 * date past a published window, namazvakti.com with no city near — and
 * then the app computes the authority's method itself. That was silent on
 * every screen but the hidden statistics panel; the provider row and the
 * month table say it now.
 *
 * Returns true when the table has no entry for today, false when it has
 * (or the source is not a table), null while it is being asked.
 */
import { useEffect, useState } from 'react';
import { getDatasetPrayerTimesOrNull, isTableProvider } from '../prayer/prayerStorage';
import type { PrayerDataProviderId } from '../settings/types';

export function useTableFallback(
  provider: PrayerDataProviderId,
  coords: { latitude: number; longitude: number } | null,
  calculationMethod: number | 'auto',
  school: number,
): boolean | null {
  const [fallback, setFallback] = useState<boolean | null>(null);
  const lat = coords?.latitude;
  const lon = coords?.longitude;
  useEffect(() => {
    if (!isTableProvider(provider) || lat == null || lon == null || (lat === 0 && lon === 0)) {
      setFallback(false);
      return;
    }
    let live = true;
    setFallback(null);
    getDatasetPrayerTimesOrNull({
      provider,
      latitude: lat,
      longitude: lon,
      calculationMethod,
      school,
      date: new Date(),
    })
      .then(t => {
        if (live) setFallback(t == null);
      })
      .catch(() => {
        if (live) setFallback(true);
      });
    return () => {
      live = false;
    };
  }, [provider, lat, lon, calculationMethod, school]);
  return fallback;
}
