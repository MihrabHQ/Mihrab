/**
 * The United States and Canada — where Automatic is the 15° / 15° of the
 * Islamic Society of North America and the Fiqh Council of North America
 * (`autoMethod.ts`). One outline for both: the convention is the same on
 * either side, so the line between them is not drawn. Natural Earth's 1:10m
 * admin-0 shapes (public domain), the fifty states and Canada's provinces
 * and territories, let out four kilometres and drawn coarsely
 * (`data/northAmericaShape.json`) — a border town or a seafront is in; the
 * strip it takes of Mexico's side is narrower than a town.
 */
import shape from './data/northAmericaShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInUsOrCanada = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read. (The Aleutians cross the date line.)
  if (latitude < 18.8 || latitude > 83.2 || (longitude > -52 && longitude < 172)) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
