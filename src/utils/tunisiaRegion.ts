/**
 * The places Tunisia's Institut National de la Météorologie's method is
 * held to, and which of them a reader is in (`data/tunisiaPlaces.json`,
 * from MihrabHQ/mihrab-methods). Kept apart from the timetable itself so
 * that the routing can ask without loading the calculation.
 */
import places from '../providers/data/tunisiaPlaces.json';
import { memoByCoordinate } from './countryAt';

export type TunisiaPlace = { id: number; name: string; lat: number; lon: number; dip: number; dipSunset: number };
export const TUNISIA_PLACES: readonly TunisiaPlace[] = places as TunisiaPlace[];

/**
 * How far from a place's point its times are taken as the reader's. The
 * Institute answers a delegation at a time, each with the horizon of its
 * own height; the ones read are the governorates' seats and two more, and
 * a reader further out than this is in a delegation that was not read —
 * whose horizon, and so whose Fajr, Maghrib and Isha, may be minutes away.
 */
export const TUNISIA_PLACE_KM = 12;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** The listed place the reader is in: the nearest, within `TUNISIA_PLACE_KM`; or null. */
export function tunisiaPlaceAt(latitude: number, longitude: number): (TunisiaPlace & { distanceKm: number }) | null {
  // The cheap box first: Borj el Khadra to Bizerte, the Algerian border to the Kerkennah islands.
  if (!(latitude > 30.0 && latitude < 37.7 && longitude > 7.3 && longitude < 11.8)) return null;
  let best: (TunisiaPlace & { distanceKm: number }) | null = null;
  for (const p of TUNISIA_PLACES) {
    const d = distanceKm(latitude, longitude, p.lat, p.lon);
    if (!best || d < best.distanceKm) best = { ...p, distanceKm: d };
  }
  return best && best.distanceKm <= TUNISIA_PLACE_KM ? best : null;
}

/** Is the reader in a place the Institute's method is held to? Asked on every settings read, so kept. */
export const isCoordinateInTunisiaPlace = memoByCoordinate((latitude: number, longitude: number): boolean => tunisiaPlaceAt(latitude, longitude) !== null);
