/**
 * Bashkortostan — its Spiritual Administration's. A republic of Russia, not
 * a country, so it has an outline of its own: Natural Earth's 1:10m admin-1
 * shape (public domain), simplified to about 400 m
 * (`data/bashkortostanShape.json`). Naberezhnye Chelny and Bugulma to the
 * west, Orenburg to the south, Magnitogorsk and Chelyabinsk to the east and
 * Izhevsk to the north are not in it.
 */
import shape from './data/bashkortostanShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInBashkortostan = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 51.5 || latitude > 56.6 || longitude < 53.1 || longitude > 60.0) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
