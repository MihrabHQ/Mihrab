/**
 * South Africa — where Automatic is the Muslim World League's angles asked
 * for by number (`autoMethod.ts`). The country's own outline: Natural
 * Earth's 1:10m admin-0 shape (public domain), the mainland, with the coast
 * let out two kilometres over water — never over a neighbour's land — so
 * that a seafront the simplified coast would leave outside is in
 * (`data/southAfricaShape.json`). Lesotho, inside the outline, is out.
 */
import shape from './data/southAfricaShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][]; holes: number[][] };
let rings: Ring[] | null = null;
let holes: Ring[] | null = null;

export const isCoordinateInSouthAfrica = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < -34.9 || latitude > -22.1 || longitude < 16.4 || longitude > 32.95) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  holes ??= DATA.holes.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude)) && !holes.some(r => inRing(r, longitude, latitude));
});
