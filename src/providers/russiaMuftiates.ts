/**
 * Russia's two computed timetables, on the phone.
 *
 * Tatarstan — the Spiritual Administration of Muslims of the Republic of
 * Tatarstan's method (`tatarstanMethod.ts`) at the point it computes the
 * nearest of its 44 listed places; and the Central Spiritual Administration
 * of Muslims of Russia's (`cdumMethod.ts`) at the point it computes the
 * nearest of its 18 cities. Each with its correction list for the few times
 * its program rounds the other way (`tatarstanCorrections.json`,
 * `cdumCorrections.json`, applied in `localAdhan.ts`): its printed minute,
 * every time, over the year its timetable was checked. Offline, for any
 * date; nothing is downloaded.
 *
 * Both print one Asr, the Hanafi one. Tatarstan's Fajr here is the dawn —
 * the end of sahur — and its Dhuhr the sun's zenith; the mosques' own
 * morning time and fixed-clock Dhuhr, which its timetable also prints, are
 * not times of the sun and are not computed.
 */
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import { CDUM_CITY_KM, CDUM_METHOD_ID, TATARSTAN_METHOD_ID, nearestCdumCity, nearestTatarstanPlace } from './russiaPlaces';
import type { PrayerTimesResult } from './types';

/** Tatarstan's clock: Moscow time, no summer time. */
export const TATARSTAN_CLOCK: PlaceClock = { zone: 'Europe/Moscow' };
/**
 * Defence in depth: the republic's outline (`tatarstanRegion.ts`) already
 * keeps this to Tatarstan, where no spot is this far from a listed place.
 */
const MAX_TATARSTAN_PLACE_KM = 120;

type Query = { latitude: number; longitude: number; date: Date };

/**
 * The Administration's times for the nearest listed place of Tatarstan.
 *
 * @throws ProviderError('shape') out of coverage — the caller then asks the general source.
 */
export async function getTatarstanTimes(params: Query): Promise<PrayerTimesResult> {
  const place = nearestTatarstanPlace(params.latitude, params.longitude);
  if (!place || place.distanceKm > MAX_TATARSTAN_PLACE_KM) {
    throw new ProviderError('dumrt', 'shape', 'Outside the places of Tatarstan’s timetable.');
  }
  return {
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      date: params.date,
      calculationMethod: TATARSTAN_METHOD_ID,
      // the one Asr the timetable prints, the Hanafi one
      school: 1,
      placeClock: TATARSTAN_CLOCK,
    }),
    timezone: TATARSTAN_CLOCK.zone,
    source: 'local',
  };
}

/**
 * The Central Muftiate's times for the listed city the reader is in.
 *
 * @throws ProviderError('shape') further than `CDUM_CITY_KM` from every listed city.
 */
export async function getCdumTimes(params: Query): Promise<PrayerTimesResult> {
  const city = nearestCdumCity(params.latitude, params.longitude);
  if (!city || city.distanceKm > CDUM_CITY_KM) {
    throw new ProviderError('cdum', 'shape', 'Not in one of the Central Muftiate’s cities.');
  }
  return {
    ...computeLocalAdhanTimes({
      latitude: city.lat,
      longitude: city.lon,
      date: params.date,
      calculationMethod: CDUM_METHOD_ID,
      // the one Asr the timetable prints, the Hanafi one
      school: 1,
      // each city's page is on the city's own clock
      placeClock: { zone: city.tz },
    }),
    timezone: city.tz,
    source: 'local',
  };
}
