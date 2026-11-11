/**
 * Tatarstan — its Spiritual Administration's. A republic of Russia, not a
 * country, so it has an outline of its own: Natural Earth's 1:10m admin-1
 * shape (public domain), simplified to about 400 m
 * (`data/tatarstanShape.json`). Ulyanovsk, Cheboksary, Yoshkar-Ola, Izhevsk
 * and Samara, each a city of the Central Muftiate's list, are not in it.
 */
import shape from './data/tatarstanShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInTatarstan = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 53.9 || latitude > 56.7 || longitude < 47.2 || longitude > 54.3) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
