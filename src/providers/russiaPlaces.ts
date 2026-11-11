/**
 * The places of Russia's two computed timetables — the Spiritual
 * Administration of Muslims of the Republic of Tatarstan's forty-four towns
 * and district seats, and the Central Spiritual Administration of Muslims
 * of Russia's eighteen cities — each at the point its authority computes it
 * (from MihrabHQ/mihrab-methods), and the nearest of them to a reader.
 */
import tatarstan from './data/tatarstanPlaces.json';
import cdum from './data/cdumCities.json';
import { memoByCoordinate } from '../utils/countryAt';

/** The phone's own ids for the two methods (`localAdhan.ts`); neither is AlAdhan's, and neither is offered in the method list. */
export const TATARSTAN_METHOD_ID = 31;
export const CDUM_METHOD_ID = 32;

export type TatarstanPlace = { id: number; name: string; ru: string; lat: number; lon: number; dip: number };
export type CdumCity = { id: number; name: string; ru: string; lat: number; lon: number; tz: string };
export const TATARSTAN_PLACES: readonly TatarstanPlace[] = tatarstan as TatarstanPlace[];
export const CDUM_CITIES: readonly CdumCity[] = cdum as CdumCity[];

/**
 * How far from one of the Central Muftiate's cities its timetable is taken
 * as the reader's: the city and its near suburbs. Thirty kilometres east or
 * west is about two minutes of the sun at these latitudes; further out the
 * city's page is not the place's.
 */
export const CDUM_CITY_KM = 30;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function nearest<T extends { lat: number; lon: number }>(list: readonly T[], latitude: number, longitude: number): (T & { distanceKm: number }) | null {
  let best: (T & { distanceKm: number }) | null = null;
  for (const p of list) {
    const d = distanceKm(latitude, longitude, p.lat, p.lon);
    if (!best || d < best.distanceKm) best = { ...p, distanceKm: d };
  }
  return best;
}

export const nearestTatarstanPlace = (latitude: number, longitude: number) => nearest(TATARSTAN_PLACES, latitude, longitude);
export const nearestCdumCity = (latitude: number, longitude: number) => nearest(CDUM_CITIES, latitude, longitude);

/** Is the reader in, or just outside, one of the Central Muftiate's cities? */
export const isNearCdumCity = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first (Rostov to Saint Petersburg, Saint Petersburg to Khabarovsk): asked on every settings read.
  if (latitude < 46 || latitude > 60.3 || longitude < 29.8 || longitude > 135.6) return false;
  const c = nearestCdumCity(latitude, longitude);
  return !!c && c.distanceKm <= CDUM_CITY_KM;
});

let dips: Map<string, number> | null = null;
/** The small horizon allowance Tatarstan's Administration computes a place with, by the place's own point. */
export function tatarstanDipAt(latitude: number, longitude: number): number {
  dips ??= new Map(TATARSTAN_PLACES.map(p => [`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, p.dip]));
  return dips.get(`${latitude.toFixed(4)},${longitude.toFixed(4)}`) ?? 0.0167;
}
