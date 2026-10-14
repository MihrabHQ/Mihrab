/**
 * Is this coordinate in Malaysia?
 *
 * Two rectangles — the peninsula and the Bornean states — with the
 * neighbours that fall inside them carved out: Singapore, Brunei, and the
 * Indonesian and Thai borders, which no rectangle follows, by the same
 * distance test `algeriaRegion.ts` uses — within reach of one of JAKIM's
 * own towns, and on Borneo nearer to one than to an Indonesian regency.
 * Tawau and Nunukan are twenty kilometres apart across that border; a
 * reader between them who gets the wrong table can pick the other by hand.
 */
import { jakimTable, kemenagTable } from '../providers/nationalTables';
import { isCoordinateInSingapore } from './singaporeRegion';

/** Peninsular Malaysia, from Perlis to Johor. */
const PENINSULA = { minLat: 1.2, maxLat: 6.75, minLng: 99.6, maxLng: 104.6 };
/** Sabah, Sarawak and Labuan. */
const BORNEO = { minLat: 0.85, maxLat: 7.4, minLng: 109.5, maxLng: 119.3 };
/** Brunei, inside the Bornean box. */
const BRUNEI = { minLat: 4.0, maxLat: 5.08, minLng: 114.05, maxLng: 115.37 };
/** Within this distance of a JAKIM town; the interior is sparse. */
const REACH_KM = 120;

function inside(b: { minLat: number; maxLat: number; minLng: number; maxLng: number }, lat: number, lng: number): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function isCoordinateInMalaysia(latitude: number, longitude: number): boolean {
  if (!inside(PENINSULA, latitude, longitude) && !inside(BORNEO, latitude, longitude)) return false;
  if (isCoordinateInSingapore(latitude, longitude)) return false;
  if (inside(BRUNEI, latitude, longitude)) return false;
  const near = jakimTable.nearest(latitude, longitude);
  if (!near || near.distanceKm > REACH_KM) return false;
  if (inside(BORNEO, latitude, longitude)) {
    const indonesian = kemenagTable.nearest(latitude, longitude);
    if (indonesian && indonesian.distanceKm < near.distanceKm) return false;
  }
  return true;
}
