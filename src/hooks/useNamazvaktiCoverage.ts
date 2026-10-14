/**
 * Does namazvakti.com have times where the user is?
 *
 * The other regional sources answer this synchronously from a country's
 * outline (regionalProviders.ts). This one covers whatever cities the site
 * lists, worldwide, so the answer is the city index itself — read from the
 * tiles on the phone, or fetched. `null` while it is being found out, and
 * whenever `enabled` is false (nobody is looking at a row that would say it).
 */
import { useEffect, useState } from 'react';
import { namazvaktiCoverage, type NamazvaktiCoverage } from '../providers/namazvakti';

export function useNamazvaktiCoverage(
  coords: { latitude: number; longitude: number } | null,
  enabled = true,
): NamazvaktiCoverage | null {
  const [coverage, setCoverage] = useState<NamazvaktiCoverage | null>(null);
  const lat = coords?.latitude;
  const lon = coords?.longitude;
  useEffect(() => {
    setCoverage(null);
    if (!enabled || lat == null || lon == null || (lat === 0 && lon === 0)) return;
    let live = true;
    namazvaktiCoverage(lat, lon)
      .then(c => {
        if (live) setCoverage(c);
      })
      .catch(() => {
        if (live) setCoverage('unknown');
      });
    return () => {
      live = false;
    };
  }, [enabled, lat, lon]);
  return coverage;
}
