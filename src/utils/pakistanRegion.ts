/**
 * Pakistan — where Jamia Banuri Town's method answers. The country's own
 * outline: Natural Earth's 1:10m admin-0 shape (public domain) with the
 * shore let out two kilometres over water — never over a neighbour's land —
 * so that a seafront the simplified coast would leave outside is in
 * (`data/pakistanShape.json`).
 */
import shape from './data/pakistanShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInPakistan = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 23.6 || latitude > 37.1 || longitude < 60.8 || longitude > 77.1) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
