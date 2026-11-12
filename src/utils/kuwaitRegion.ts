/**
 * Kuwait — the Ministry of Awqaf and Islamic Affairs'. The country's own outline: Natural Earth's 1:10m admin-0
 * shape (public domain) with the shore let out two kilometres over water —
 * never over a neighbour's land — so that a seafront the simplified coast
 * would leave outside is in (`data/kuwaitShape.json`).
 */
import shape from './data/kuwaitShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInKuwait = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 28.5 || latitude > 30.2 || longitude < 46.5 || longitude > 48.5) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
