/**
 * Turkmenistan — where Diyanet's method is what Automatic picks throughout
 * (`regionalProviders.ts`). The country's own outline: Natural Earth's
 * 1:10m admin-0 shape (public domain) with the Caspian shore let out two
 * kilometres over water — never over a neighbour's land — so that a
 * seafront the simplified coast would leave outside is in
 * (`data/turkmenistanShape.json`).
 */
import shape from './data/turkmenistanShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInTurkmenistan = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 35.1 || latitude > 42.8 || longitude < 52.4 || longitude > 66.7) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
