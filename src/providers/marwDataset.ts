/**
 * Algeria — the Ministry of Religious Affairs and Wakfs's times, computed on
 * the phone (issue #70).
 *
 * The Ministry's own method (`algeriaMethod.ts`, from MihrabHQ/mihrab-methods)
 * at the point it computes the nearest of its 68 listed cities, with the
 * correction list for the few times its program rounds the other way
 * (`algeriaCorrections.json`, applied in `localAdhan.ts`): its printed
 * minute, every time, over the year its table was checked. Offline, for any
 * date; nothing is downloaded. The user is matched to the nearest listed
 * city, as the Ministry's own app and the mosques do.
 *
 * Earlier versions served a mirror of the Ministry's table and computed this
 * for any day past it, so they keep working on the calculation alone.
 */
import { nearestAlgeriaCity, ALGERIA_METHOD_ID } from './algeriaCities';
import { computeLocalAdhanTimes } from './localAdhan';
import methodPoints from './data/algeriaMethodPoints.json';
import { ProviderError } from './errors';
import { ALGERIA_CLOCK } from './locationClock';
import type { PrayerTimesResult } from './types';

const PROVIDER = 'marw';
const DEFAULT_TZ = 'Africa/Algiers';
/** The point the Ministry computes each city at, fitted to its table. */
const METHOD_POINTS = methodPoints as Record<string, number[]>;

/**
 * Defence-in-depth distance cap. The region check (`algeriaRegion.ts`)
 * already keeps this to Algeria; in the Sahara the listed cities are
 * hundreds of kilometres apart and the Ministry still assigns every place
 * to one of them, so the cap only refuses a coordinate that is plainly not
 * near any of them.
 */
const MAX_DATASET_CITY_KM = 500;

/**
 * The Ministry's times for the nearest listed Algerian city.
 *
 * @throws ProviderError('shape') out of coverage — the caller then computes
 * the Algeria method for the spot.
 */
export async function getMarwDatasetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  /** Hanafi (1) Asr for a reader who keeps it; the ministry publishes the standard (0). */
  school?: number;
}): Promise<PrayerTimesResult> {
  const nearest = nearestAlgeriaCity(params.latitude, params.longitude);
  if (!nearest) {
    throw new ProviderError(PROVIDER, 'shape', 'No Algerian city list is bundled.');
  }
  if (nearest.distanceKm > MAX_DATASET_CITY_KM) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `Nearest listed city "${nearest.nameEn}" is ${Math.round(nearest.distanceKm)} km ` +
        `away (> ${MAX_DATASET_CITY_KM} km) — outside the Ministry's coverage.`,
    );
  }
  const [lat, lon] = METHOD_POINTS[String(nearest.id)] ?? [nearest.lat, nearest.lon];
  return {
    ...computeLocalAdhanTimes({
      latitude: lat,
      longitude: lon,
      date: params.date,
      calculationMethod: ALGERIA_METHOD_ID,
      school: params.school ?? 0,
      // on Algeria's clock, as the Ministry's table prints it
      placeClock: ALGERIA_CLOCK,
    }),
    timezone: DEFAULT_TZ,
    source: 'local',
  };
}
