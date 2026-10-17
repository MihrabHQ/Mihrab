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
import {
  countryAt,
  memoByCoordinate,
  nationalMethodCountryAt,
} from '../utils/countryAt';
import { nearestDiyanetPlace } from '../providers/diyanetMethod';
import type { PrayerDataProviderId } from './types';

export type RegionalProviderRegion = {
  id: PrayerDataProviderId;
  /** Does this coordinate fall inside the country this source publishes for? */
  covers: (latitude: number, longitude: number) => boolean;
  /**
   * Automatic passes this source over when the reader has chosen a
   * calculation method by hand: its own fixed method would set theirs aside
   * without a word, so AlAdhan (or the phone) computes their method instead.
   */
  yieldsToChosenMethod?: boolean;
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
  // These three, like Diyanet in Türkiye, give way to a method chosen by
  // hand (`yieldsToChosenMethod`).
  { id: 'muis', covers: isCoordinateInSingapore, yieldsToChosenMethod: true },
  { id: 'jakim', covers: isCoordinateInMalaysia, yieldsToChosenMethod: true },
  {
    id: 'kemenag',
    covers: isCoordinateInIndonesia,
    yieldsToChosenMethod: true,
  },
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
  { id: 'diyanet', covers: isCoordinateInTurkey, yieldsToChosenMethod: true },
];

/**
 * Elsewhere, Automatic takes Diyanet wherever it lists a place near the
 * reader — some 8,000 worldwide, each on the printed minute of Diyanet's own
 * table (`diyanetMethod.ts`) — and the worldwide default only further from
 * any. A country's own published source still comes first, and so does a
 * country's own calculation method: in Saudi Arabia, the Gulf, Iran, Iraq,
 * Jordan, Egypt, Pakistan, India, Bangladesh, Russia, Tunisia and Portugal
 * (`nationalMethodCountryAt`) AlAdhan's Automatic computes the national
 * method, and a Diyanet place nearby — Mecca, Tehran, Cairo, Moscow — does
 * not trade it for Diyanet's.
 *
 * Nor does the Republic of Cyprus (`NOT_NEAR_DIYANET`): Diyanet lists
 * Northern Cyprus's districts, and Nicosia south of the line, Larnaca and
 * Limassol are within reach of them — but the Republic's mosques do not pray
 * by Diyanet's tables, and its Automatic is AlAdhan's.
 */
const NOT_NEAR_DIYANET: ReadonlySet<string> = new Set(['CY']);

export const NEAR_LISTED_PLACE_REGIONS: readonly RegionalProviderRegion[] = [
  {
    id: 'diyanet',
    // The country first: it is the cheaper question, and in the countries
    // with a method of their own it saves the walk through 8,000 places.
    covers: (latitude, longitude) =>
      nationalMethodCountryAt(latitude, longitude) === null &&
      !NOT_NEAR_DIYANET.has(countryAt(latitude, longitude) ?? '') &&
      nearestDiyanetPlace(latitude, longitude) !== null,
    yieldsToChosenMethod: true,
  },
];

const ALL_REGIONS: readonly RegionalProviderRegion[] = [
  ...REGIONAL_PROVIDER_REGIONS,
  ...HOME_PROVIDER_REGIONS,
  ...NEAR_LISTED_PLACE_REGIONS,
];

/** The first region covering these coordinates — asked on every settings read, so kept. */
const firstRegionAt = memoByCoordinate(
  (latitude: number, longitude: number): RegionalProviderRegion | null =>
    ALL_REGIONS.find(region => region.covers(latitude, longitude)) ?? null,
);

/**
 * The source Automatic picks for these coordinates, or null for the worldwide
 * default. `methodIsAutomatic`: false when the reader has chosen a
 * calculation method of their own; then the sources with a fixed method of
 * their own (`yieldsToChosenMethod`: Diyanet, near a listed place or in
 * Türkiye, and MUIS, JAKIM and Kemenag) are passed over, since they would set
 * the chosen method aside without a word.
 */
export function regionalProviderForCoords(
  coords: { latitude: number; longitude: number } | null,
  methodIsAutomatic = true,
): PrayerDataProviderId | null {
  if (!coords) return null;
  const region = firstRegionAt(coords.latitude, coords.longitude);
  if (!region) return null;
  // In a country whose source gives way, the reader's method is computed
  // there (AlAdhan) — not the next region down, which would be Diyanet
  // near a listed place.
  return !methodIsAutomatic && region.yieldsToChosenMethod ? null : region.id;
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
