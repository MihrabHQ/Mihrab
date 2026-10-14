/**
 * Is this coordinate in Indonesia?
 *
 * The archipelago spans 46° of longitude and shares Borneo with Malaysia
 * and Brunei, Timor with Timor-Leste and New Guinea with Papua New Guinea,
 * so a box is only the first cut. Inside it: the neighbours' own boxes are
 * carved out, and the point must be within reach of one of the 517
 * regencies the ministry publishes for — and nearer to one of them than to
 * a Malaysian town, which is how Nunukan stays Indonesian and Tawau,
 * twenty kilometres away, Malaysian, and Johor Bahru is not claimed from
 * across the strait by Batam's regency.
 */
import { jakimTable, kemenagTable } from '../providers/nationalTables';
import { isCoordinateInSingapore } from './singaporeRegion';

const BOX = { minLat: -11.2, maxLat: 6.2, minLng: 94.9, maxLng: 141.05 };
const BRUNEI = { minLat: 4.0, maxLat: 5.08, minLng: 114.05, maxLng: 115.37 };
const TIMOR_LESTE = { minLat: -9.6, maxLat: -8.1, minLng: 124.0, maxLng: 127.4 };
/** Regencies are large in Papua and Kalimantan; the reach allows for it. */
const REACH_KM = 200;

function inside(b: { minLat: number; maxLat: number; minLng: number; maxLng: number }, lat: number, lng: number): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function isCoordinateInIndonesia(latitude: number, longitude: number): boolean {
  if (!inside(BOX, latitude, longitude)) return false;
  if (isCoordinateInSingapore(latitude, longitude)) return false;
  if (inside(BRUNEI, latitude, longitude) || inside(TIMOR_LESTE, latitude, longitude)) return false;
  const near = kemenagTable.nearest(latitude, longitude);
  if (!near || near.distanceKm > REACH_KM) return false;
  const malaysian = jakimTable.nearest(latitude, longitude);
  if (malaysian && malaysian.distanceKm < near.distanceKm) return false;
  return true;
}
