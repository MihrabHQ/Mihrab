/**
 * Which country-specific source covers which coordinates.
 *
 * This was an `if (isCoordinateInSweden(...))` inside
 * `getEffectiveDataProvider`, which was honest while Sweden was the only
 * regional source and became a liability the moment Morocco arrived: the
 * automatic branch and the manual-pin guard each hardcoded the same country
 * and would have needed editing in step for every new one.
 *
 * A table instead. Adding a country is now: a region predicate, an entry
 * here, a provider case, and its dataset — and nothing in the resolution
 * logic changes at all.
 *
 * ORDER MATTERS only where two regions overlap: the first match wins, and
 * the more specific region is listed first. Algeria and Morocco overlap;
 * see below.
 */
import { isCoordinateInAlgeria } from '../utils/algeriaRegion';
import { isCoordinateInIndonesia } from '../utils/indonesiaRegion';
import { isCoordinateInMalaysia } from '../utils/malaysiaRegion';
import { isCoordinateInSingapore } from '../utils/singaporeRegion';
import { isCoordinateInMorocco } from '../utils/moroccoRegion';
import { isCoordinateInSweden } from '../utils/swedenRegion';
import { isCoordinateInTurkey } from '../utils/turkeyRegion';
import { nearestDiyanetPlace } from '../providers/diyanetMethod';
import type { PrayerDataProviderId } from './types';

export type RegionalProviderRegion = {
  id: PrayerDataProviderId;
  /** Does this coordinate fall inside the country this source publishes for? */
  covers: (latitude: number, longitude: number) => boolean;
};

export const REGIONAL_PROVIDER_REGIONS: readonly RegionalProviderRegion[] = [
  { id: 'islamiska_forbundet', covers: isCoordinateInSweden },
  // Before Morocco, and the one overlap there is: Morocco's rectangle takes
  // in a strip of western Algeria (Tlemcen, Maghnia, Tindouf), while
  // `isCoordinateInAlgeria` already gives anything nearer a Moroccan
  // ministry city back to Morocco.
  { id: 'marw', covers: isCoordinateInAlgeria },
  { id: 'habous', covers: isCoordinateInMorocco },
  // Singapore before Malaysia: the island sits inside the peninsula's box.
  { id: 'muis', covers: isCoordinateInSingapore },
  { id: 'jakim', covers: isCoordinateInMalaysia },
  { id: 'kemenag', covers: isCoordinateInIndonesia },
];

/**
 * Worldwide sources that are also the authority's own throughout a country,
 * and what Automatic picks there, near a listed place or not: Diyanet in
 * Türkiye and Northern Cyprus. Add a country here where its mosques pray by
 * Diyanet's tables as a whole. Unlike the national sources above these
 * answer everywhere, so they are never "out of region" and a pinned one is
 * never redirected — this list only decides where Automatic (and "Fits
 * where you are") lands on them.
 */
export const HOME_PROVIDER_REGIONS: readonly RegionalProviderRegion[] = [
  { id: 'diyanet', covers: isCoordinateInTurkey },
];

/**
 * Everywhere else, Automatic takes Diyanet wherever it lists a place near
 * the reader — some 8,000 worldwide, each on the printed minute of
 * Diyanet's own table (`diyanetMethod.ts`) — and the worldwide default only
 * further from any. A country's own published source still comes first.
 */
export const NEAR_LISTED_PLACE_REGIONS: readonly RegionalProviderRegion[] = [
  { id: 'diyanet', covers: (latitude, longitude) => nearestDiyanetPlace(latitude, longitude) !== null },
];

/**
 * The source Automatic picks for these coordinates, or null for the worldwide
 * default. `nearListed`: whether Diyanet's tables near a listed place are in
 * the running — not when the reader has chosen a calculation method of their
 * own, which Diyanet's fixed method would silently set aside.
 */
export function regionalProviderForCoords(
  coords: { latitude: number; longitude: number } | null,
  nearListed = true,
): PrayerDataProviderId | null {
  if (!coords) return null;
  const regions = nearListed
    ? [...REGIONAL_PROVIDER_REGIONS, ...HOME_PROVIDER_REGIONS, ...NEAR_LISTED_PLACE_REGIONS]
    : [...REGIONAL_PROVIDER_REGIONS, ...HOME_PROVIDER_REGIONS];
  for (const region of regions) {
    if (region.covers(coords.latitude, coords.longitude)) return region.id;
  }
  return null;
}

/** Is this a country-specific source, i.e. one that only has data for its own region? */
export function isRegionalProvider(id: PrayerDataProviderId): boolean {
  return REGIONAL_PROVIDER_REGIONS.some(r => r.id === id);
}

/** Does this regional source cover these coordinates? True for non-regional ones. */
export function regionalProviderCovers(
  id: PrayerDataProviderId,
  coords: { latitude: number; longitude: number } | null,
): boolean {
  const region = REGIONAL_PROVIDER_REGIONS.find(r => r.id === id);
  if (!region) return true;
  if (!coords) return true; // unknown location: leave the user's pick alone
  return region.covers(coords.latitude, coords.longitude);
}
