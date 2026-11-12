/**
 * Qatar — the Qatar Calendar House's. The country's own outline: Natural Earth's 1:10m admin-0
 * shape (public domain) with the shore let out two kilometres over water —
 * never over a neighbour's land — so that a seafront the simplified coast
 * would leave outside is in (`data/qatarShape.json`).
 */
import shape from './data/qatarShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInQatar = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 24.5 || latitude > 26.2 || longitude < 50.7 || longitude > 51.7) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
