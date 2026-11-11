/**
 * Albania — the Muslim Community of Albania's. The country's own outline: Natural Earth's 1:10m admin-0
 * shape (public domain), simplified to about 400 m
 * (`data/albaniaShape.json`). Ulcinj, Prizren, Struga and Ioannina, across the borders, are not in it.
 */
import shape from './data/albaniaShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

/**
 * Listed towns at the water's edge. The outline's shore is simplified, and
 * a seafront or a river bank can fall a few hundred metres outside it;
 * within this reach of one of these a reader is in the town.
 */
const EDGE: readonly [number, number][] = [
  [41.3246, 19.4565], // Durrës
  [40.4667, 19.4897], // Vlorë
];
const EDGE_KM = 5;
const nearEdgeTown = (latitude: number, longitude: number): boolean =>
  EDGE.some(([lat, lon]) => Math.hypot((latitude - lat) * 111.2, (longitude - lon) * 111.2 * Math.cos((lat * Math.PI) / 180)) <= EDGE_KM);

export const isCoordinateInAlbania = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 39.6 || latitude > 42.7 || longitude < 19.2 || longitude > 21.1) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude)) || nearEdgeTown(latitude, longitude);
});
