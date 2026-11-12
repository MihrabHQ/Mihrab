/**
 * Iran — the Institute of Geophysics of the University of Tehran, on the
 * phone: the prayer times its Calendar Center's yearly sheets give, by its
 * own method (`tehranMethod.ts`, from MihrabHQ/mihrab-methods).
 *
 * The Institute prints a sheet for each of the thirty-one province
 * capitals and computes each at one point. A reader in one of them gets
 * that capital's times — the printed minute, with the correction list for
 * the few times on the other side of a minute (applied in
 * `localAdhan.ts`). Elsewhere in Iran the same method is computed for the
 * reader's own spot. Offline, for any date; nothing is downloaded.
 *
 * The sheets print Fajr, sunrise, Dhuhr, sunset, Maghrib and midnight.
 * Asr and Isha are the method's — one shadow length (two for a Hanafi
 * reader), and the sun 14° below the horizon — with no sheet to hold them
 * to.
 */
import cities from './data/tehranCities.json';
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import { isCoordinateInIran } from '../utils/iranRegion';
import type { PrayerTimesResult } from './types';

/** The phone's own id for the method (`localAdhan.ts`); not AlAdhan's, and not offered in the method list. */
export const TEHRAN_INSTITUTE_METHOD_ID = 43;

export type TehranCity = { id: number; name: string; lat: number; lon: number };
export const TEHRAN_CITIES: readonly TehranCity[] = cities as TehranCity[];

/** Iran keeps UTC+3:30 all year, since 2022. */
export const IRAN_CLOCK = { zone: 'Asia/Tehran' } as PlaceClock & { zone: string };

/**
 * How far from a capital's point its times are taken as the reader's.
 * Tehran is fifty kilometres across; further out the method is computed
 * for the reader's own spot.
 */
export const TEHRAN_CITY_KM = 30;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function nearestTehranCity(latitude: number, longitude: number): (TehranCity & { distanceKm: number }) | null {
  let best: (TehranCity & { distanceKm: number }) | null = null;
  for (const c of TEHRAN_CITIES) {
    const d = distanceKm(latitude, longitude, c.lat, c.lon);
    if (!best || d < best.distanceKm) best = { ...c, distanceKm: d };
  }
  return best;
}

/** The Institute's times: a capital's inside it, the reader's own spot elsewhere in Iran. @throws ProviderError('shape') outside Iran. */
export async function getTehranTimes(params: { latitude: number; longitude: number; date: Date; school?: number }): Promise<PrayerTimesResult> {
  if (!isCoordinateInIran(params.latitude, params.longitude)) throw new ProviderError('tehran', 'shape', 'Outside Iran.');
  const city = nearestTehranCity(params.latitude, params.longitude);
  const point = city && city.distanceKm <= TEHRAN_CITY_KM ? city : { lat: params.latitude, lon: params.longitude };
  return {
    ...computeLocalAdhanTimes({
      latitude: point.lat,
      longitude: point.lon,
      date: params.date,
      calculationMethod: TEHRAN_INSTITUTE_METHOD_ID,
      school: params.school ?? 0,
      placeClock: IRAN_CLOCK,
    }),
    timezone: IRAN_CLOCK.zone,
    source: 'local',
  };
}
