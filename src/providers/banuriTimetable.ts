/**
 * Pakistan — Jamia Uloom-ul-Islamia, Banuri Town (Karachi), on the phone:
 * the prayer times its own page gives, by its own method
 * (`banuriMethod.ts`, from MihrabHQ/mihrab-methods).
 *
 * The Jamia's page lists a hundred cities of Pakistan and computes each at
 * one point. A reader in one of them gets that city's times — the printed
 * minute, with the correction list for the few times on the other side of
 * a minute (applied in `localAdhan.ts`). Elsewhere in Pakistan the same
 * method is computed for the reader's own spot, as the page does for any
 * place it is asked for. Offline, for any date; nothing is downloaded.
 *
 * The page prints the zenith (zawal), not a Dhuhr: Dhuhr here is the minute
 * after it. Its Asr is the Hanafi one unless asked otherwise, and the
 * reader's school decides here as everywhere: the Hanafi Asr at two shadow
 * lengths, the first at one, by the same method.
 */
import cities from './data/banuriCities.json';
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import { isCoordinateInPakistan } from '../utils/pakistanRegion';
import type { PrayerTimesResult } from './types';

/** The phone's own id for the method (`localAdhan.ts`); not AlAdhan's, and not offered in the method list. */
export const BANURI_METHOD_ID = 41;

export type BanuriCity = { id: number; name: string; lat: number; lon: number };
export const BANURI_CITIES: readonly BanuriCity[] = cities as BanuriCity[];

/** Pakistan keeps UTC+5 all year. */
export const PAKISTAN_CLOCK = { zone: 'Asia/Karachi' } as PlaceClock & { zone: string };

/**
 * How far from a listed city's point its times are taken as the reader's.
 * Karachi and Lahore are forty kilometres across; further out the method is
 * computed for the reader's own spot.
 */
export const BANURI_CITY_KM = 30;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function nearestBanuriCity(latitude: number, longitude: number): (BanuriCity & { distanceKm: number }) | null {
  let best: (BanuriCity & { distanceKm: number }) | null = null;
  for (const c of BANURI_CITIES) {
    const d = distanceKm(latitude, longitude, c.lat, c.lon);
    if (!best || d < best.distanceKm) best = { ...c, distanceKm: d };
  }
  return best;
}

/** The Jamia's times: a listed city's inside it, the reader's own spot elsewhere in Pakistan. @throws ProviderError('shape') outside Pakistan. */
export async function getBanuriTimes(params: { latitude: number; longitude: number; date: Date; school?: number }): Promise<PrayerTimesResult> {
  if (!isCoordinateInPakistan(params.latitude, params.longitude)) throw new ProviderError('banuri', 'shape', 'Outside Pakistan.');
  const city = nearestBanuriCity(params.latitude, params.longitude);
  const point = city && city.distanceKm <= BANURI_CITY_KM ? city : { lat: params.latitude, lon: params.longitude };
  return {
    ...computeLocalAdhanTimes({
      latitude: point.lat,
      longitude: point.lon,
      date: params.date,
      calculationMethod: BANURI_METHOD_ID,
      school: params.school ?? 0,
      placeClock: PAKISTAN_CLOCK,
    }),
    timezone: PAKISTAN_CLOCK.zone,
    source: 'local',
  };
}
