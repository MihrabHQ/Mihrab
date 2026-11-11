/**
 * Dagestan — the Muftiate's. A republic of Russia, not a country, so it has
 * an outline of its own: Natural Earth's 1:10m admin-1 shape (public
 * domain), simplified to about 400 m (`data/dagestanShape.json`). Grozny and
 * Gudermes to the west, Astrakhan's steppe to the north and Quba across
 * the Samur are not in it.
 */
import shape from './data/dagestanShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

/**
 * The towns on the Caspian. The outline's coast is drawn at 1:10m and
 * simplified, and their seafronts — the centre of Makhachkala among them —
 * fall a few hundred metres outside it; within this reach of one of them a
 * reader is in the town, and nothing but the sea and Dagestan is that near.
 */
const COAST: readonly [number, number][] = [
  [42.983, 47.504], // Makhachkala
  [42.881, 47.638], // Kaspiysk
  [42.565, 47.864], // Izberbash
  [42.115, 48.194], // Dagestanskiye Ogni
  [42.058, 48.289], // Derbent
];
const COAST_KM = 8;
const nearCoastTown = (latitude: number, longitude: number): boolean =>
  COAST.some(([lat, lon]) => Math.hypot((latitude - lat) * 111.2, (longitude - lon) * 111.2 * Math.cos((lat * Math.PI) / 180)) <= COAST_KM);

export const isCoordinateInDagestan = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 41.1 || latitude > 45.1 || longitude < 45.0 || longitude > 48.7) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude)) || nearCoastTown(latitude, longitude);
});
