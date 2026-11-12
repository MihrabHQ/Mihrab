/**
 * Kazakhstan — the Spiritual Administration of Muslims of Kazakhstan's. The country's own outline: Natural Earth's 1:10m admin-0
 * shape (public domain) with the shore let out two kilometres over water —
 * never over a neighbour's land — so that a seafront the simplified coast
 * would leave outside is in (`data/kazakhstanShape.json`).
 */
import shape from './data/kazakhstanShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInKazakhstan = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 40.5 || latitude > 55.5 || longitude < 46.4 || longitude > 87.4) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
