/**
 * Sweden — Islamiska Förbundet's cities, calculated on the phone.
 *
 * The times are the International Prayer Times Congress method as Diyanet
 * computes the Swedish timetables Islamiska Förbundet publishes (method 24,
 * `congressMethod.ts`), at the point each listed city is computed at, with
 * the correction list (`swedenCorrections.ts`) for the few times Diyanet's
 * own arithmetic rounds the other way. On the printed minute for every time
 * of those timetables over 2024–2027; the method alone, 99.98 %, every time
 * within the minute. Nothing is fetched: the source is the open
 * MihrabHQ/mihrab-methods (src/methods/sweden.ts).
 */
import { getNearestIslamiskaForbundetCityWithDistance, islamiskaForbundetCityCoords } from './islamiskaForbundetNearest';
import { computeLocalAdhanTimes } from './localAdhan';
import { SWEDEN_METHOD_ID } from './swedenMethodId';
import { ProviderError } from './errors';
import type { PrayerTimesResult } from './types';

const PROVIDER = 'islamiska_forbundet';
const DEFAULT_TZ = 'Europe/Stockholm';

/**
 * Defence-in-depth distance cap. The provider is already region-guarded to
 * Sweden before this module is consulted, but the coarse Sweden bounding box
 * can catch a few non-Swedish slivers (e.g. Åland, border areas). If the
 * nearest listed city is absurdly far, the coordinate isn't really "in" any
 * of them, so we miss and let the caller fall through to AlAdhan / the
 * on-device chain (which computes for the exact coordinate) rather than
 * serving a Swedish city's times to somewhere hundreds of km away. 250 km is
 * generous — real Swedish locations are always well within it.
 */
const MAX_CITY_KM = 250;

/** Sweden is served by the calculation (kept for callers that ask). */
export function swedenServesCalculation(): boolean {
  return true;
}

/**
 * The prayer times of the listed city nearest a coordinate, for a date.
 *
 * @throws ProviderError('shape') when no listed city is within 250 km.
 */
export async function getIslamiskaForbundetDatasetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
}): Promise<PrayerTimesResult> {
  const { city, distanceKm } = getNearestIslamiskaForbundetCityWithDistance(params.latitude, params.longitude);
  if (distanceKm > MAX_CITY_KM) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `Nearest listed city "${city}" is ${Math.round(distanceKm)} km away ` +
        `(> ${MAX_CITY_KM} km) — coordinate is outside Sweden's coverage.`,
    );
  }
  const at = islamiskaForbundetCityCoords(city);
  return {
    ...computeLocalAdhanTimes({
      latitude: at?.lat ?? params.latitude,
      longitude: at?.lng ?? params.longitude,
      date: params.date,
      calculationMethod: SWEDEN_METHOD_ID,
      school: 0,
    }),
    timezone: DEFAULT_TZ,
    source: 'local',
  };
}

/**
 * Throw stored times away and fetch them again — issue #56. Sweden's times
 * are calculated, so there is nothing to fetch; kept so the clock-change
 * refresh can treat every source alike.
 */
export async function refetchIslamiskaForbundetDatasetNow(_latitude: number, _longitude: number): Promise<void> {
  return;
}
