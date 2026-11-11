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

export const isCoordinateInDagestan = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 41.1 || latitude > 45.1 || longitude < 45.0 || longitude > 48.7) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
