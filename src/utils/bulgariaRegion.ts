/**
 * Bulgaria — the Grand Mufti's Office's. The country's own outline: Natural Earth's 1:10m admin-0
 * shape (public domain), simplified to about 400 m
 * (`data/bulgariaShape.json`). Edirne, Giurgiu, Niš and Xanthi, across the borders, are not in it.
 */
import shape from './data/bulgariaShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

/**
 * Listed towns at the water's edge. The outline's shore is simplified, and
 * a seafront or a river bank can fall a few hundred metres outside it;
 * within this reach of one of these a reader is in the town.
 */
const EDGE: readonly [number, number][] = [
  [44.117, 27.261], // Silistra, on the Danube
  [43.214, 27.915], // Varna
  [42.504, 27.463], // Burgas
  [43.427, 28.162], // Balchik
  [43.433, 28.339], // Kavarna
  [42.875, 27.888], // Byala
];
const EDGE_KM = 5;
const nearEdgeTown = (latitude: number, longitude: number): boolean =>
  EDGE.some(([lat, lon]) => Math.hypot((latitude - lat) * 111.2, (longitude - lon) * 111.2 * Math.cos((lat * Math.PI) / 180)) <= EDGE_KM);

export const isCoordinateInBulgaria = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 41.2 || latitude > 44.3 || longitude < 22.3 || longitude > 28.7) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude)) || nearEdgeTown(latitude, longitude);
});
