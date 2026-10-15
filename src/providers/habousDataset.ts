/**
 * Morocco — the Ministry of Habous's times, computed on the phone.
 *
 * The ministry's own method (`moroccoMethod.ts`, from MihrabHQ/mihrab-methods)
 * at the nearest listed city's point and horizons, with the correction list
 * for the few times the ministry's program rounds the other way
 * (`moroccoCorrections.json`, applied in `localAdhan.ts`): its printed
 * minute, every time, over the days its tables were checked. Offline, for
 * any date; nothing is downloaded.
 *
 * Earlier versions served a mirror of the ministry's table and fell back to
 * this calculation for any day the mirror lacked, so they keep working on
 * the calculation alone.
 */
import { nearestMoroccoCity } from './moroccoNearest';
import { computeLocalAdhanTimes } from './localAdhan';
import moroccoPoints from './data/moroccoMethodPoints.json';
import { ProviderError } from './errors';
import type { PrayerTimesResult } from './types';

const PROVIDER = 'habous';
const DEFAULT_TZ = 'Africa/Casablanca';
const MOROCCO_METHOD = 21;
/** Each city's point and horizon dips (degrees, sunrise and Maghrib) as the ministry computes it, fitted to its tables. */
const METHOD_POINTS = moroccoPoints as Record<string, number[]>;

/**
 * Defence-in-depth distance cap. No rectangle follows Morocco's eastern
 * border, so `isCoordinateInMorocco` takes in a strip of western Algeria; a
 * user there is not handed Oujda's times as their own. 200 km is comfortably
 * more than any real Moroccan location is from a listed city.
 */
const MAX_DATASET_CITY_KM = 200;

/**
 * The ministry's times for the nearest listed city.
 *
 * @throws ProviderError('shape') when the coordinate is out of coverage —
 * the caller then falls through to the computed chain.
 */
export async function getHabousDatasetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
}): Promise<PrayerTimesResult> {
  const nearest = nearestMoroccoCity(params.latitude, params.longitude);
  if (!nearest) {
    throw new ProviderError(PROVIDER, 'shape', 'No Moroccan city list is bundled.');
  }
  if (nearest.distanceKm > MAX_DATASET_CITY_KM) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `Nearest listed city "${nearest.name}" is ${Math.round(nearest.distanceKm)} km ` +
        `away (> ${MAX_DATASET_CITY_KM} km) — outside the ministry's coverage.`,
    );
  }
  const point = METHOD_POINTS[String(nearest.id)];
  return {
    ...computeLocalAdhanTimes({
      latitude: point?.[0] ?? nearest.lat,
      longitude: point?.[1] ?? nearest.lng,
      horizonDipDeg: point?.[2],
      horizonDipMaghribDeg: point?.[3],
      heightM: point ? undefined : nearest.heightM,
      date: params.date,
      calculationMethod: MOROCCO_METHOD,
      school: 0,
    }),
    timezone: DEFAULT_TZ,
    source: 'local',
  };
}
