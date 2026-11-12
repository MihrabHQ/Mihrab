/**
 * The towns Wifaqul Ulama (Britain) prints a timetable for, and which of
 * them a reader is in (`data/wifaqTowns.json`, from MihrabHQ/mihrab-methods).
 * Kept apart from the timetable itself so that the routing can ask without
 * loading the calculation.
 */
import towns from '../providers/data/wifaqTowns.json';
import { memoByCoordinate } from './countryAt';

export type WifaqTown = { id: number; name: string; lat: number; lon: number; country: string };
export const WIFAQ_TOWNS: readonly WifaqTown[] = towns as WifaqTown[];

/**
 * How far from a town's point its timetable is taken as the reader's. The
 * timetables are a town each, and neighbours — Batley, Dewsbury, Leeds,
 * Bradford — have their own; beyond this the reader is in none of them.
 */
export const WIFAQ_TOWN_KM = 15;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** The listed town the reader is in: the nearest, within `WIFAQ_TOWN_KM`; or null. */
export function wifaqTownAt(latitude: number, longitude: number): (WifaqTown & { distanceKm: number }) | null {
  // The cheap box first: Jersey to Aberdeen, Longford to Gravesend.
  if (!(latitude > 48.9 && latitude < 57.5 && longitude > -8.2 && longitude < 0.9)) return null;
  let best: (WifaqTown & { distanceKm: number }) | null = null;
  for (const t of WIFAQ_TOWNS) {
    const d = distanceKm(latitude, longitude, t.lat, t.lon);
    if (!best || d < best.distanceKm) best = { ...t, distanceKm: d };
  }
  return best && best.distanceKm <= WIFAQ_TOWN_KM ? best : null;
}

/** Is the reader in a town Wifaqul Ulama prints a timetable for? Asked on every settings read, so kept. */
export const isCoordinateInWifaqTown = memoByCoordinate((latitude: number, longitude: number): boolean => wifaqTownAt(latitude, longitude) !== null);
