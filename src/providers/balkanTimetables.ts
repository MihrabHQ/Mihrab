/**
 * Albania's and Bulgaria's timetables, on the phone.
 *
 * The Muslim Community of Albania's calendar (`albaniaMethod.ts`) and the
 * Grand Mufti's Office of Bulgaria's timetable (`bulgariaMethod.ts`), each
 * computed for the listed town nearest the reader at the point its
 * authority's table gives that town, with its correction list for the few
 * times the printed table is on the other side of a minute
 * (`albaniaCorrections.json`, `bulgariaCorrections.json`, applied in
 * `localAdhan.ts`): the printed minute, every time, over the year checked.
 * Offline, for any date; nothing is downloaded.
 *
 * Both print the first Asr; a reader who keeps the Hanafi Asr gets it from
 * the same method at two shadow lengths.
 */
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import { ALBANIA_METHOD_ID, BULGARIA_METHOD_ID, nearestAlbaniaTown, nearestBulgariaTown } from './balkanTowns';
import type { PrayerTimesResult } from './types';

export const ALBANIA_CLOCK: PlaceClock = { zone: 'Europe/Tirane' };
export const BULGARIA_CLOCK: PlaceClock = { zone: 'Europe/Sofia' };
/**
 * Defence in depth: the country's outline already keeps each to its
 * country, where the listed towns are never this far from a reader.
 */
const MAX_TOWN_KM = 120;

type Query = { latitude: number; longitude: number; date: Date; school?: number };

function timesAt(
  provider: 'kmsh' | 'grandmufti',
  town: { pointLat: number; pointLon: number; distanceKm: number } | null,
  method: number,
  clock: PlaceClock & { zone: string },
  params: Query,
): PrayerTimesResult {
  if (!town || town.distanceKm > MAX_TOWN_KM) {
    throw new ProviderError(provider, 'shape', 'Outside the towns of the timetable.');
  }
  return {
    ...computeLocalAdhanTimes({
      latitude: town.pointLat,
      longitude: town.pointLon,
      date: params.date,
      calculationMethod: method,
      school: params.school ?? 0,
      placeClock: clock,
    }),
    timezone: clock.zone,
    source: 'local',
  };
}

/** The Community's times for the nearest listed town of Albania. @throws ProviderError('shape') out of coverage. */
export async function getAlbaniaTimes(params: Query): Promise<PrayerTimesResult> {
  return timesAt('kmsh', nearestAlbaniaTown(params.latitude, params.longitude), ALBANIA_METHOD_ID, ALBANIA_CLOCK as PlaceClock & { zone: string }, params);
}

/** The Office's times for the nearest listed town of Bulgaria. @throws ProviderError('shape') out of coverage. */
export async function getBulgariaTimes(params: Query): Promise<PrayerTimesResult> {
  return timesAt('grandmufti', nearestBulgariaTown(params.latitude, params.longitude), BULGARIA_METHOD_ID, BULGARIA_CLOCK as PlaceClock & { zone: string }, params);
}
