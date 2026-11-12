/**
 * KwaZulu-Natal — the one South African province whose council of scholars,
 * the Jamiatul Ulama KwaZulu-Natal, prints Isha at 18° rather than the
 * Muslim World League's 17° the rest of the country goes by
 * (`autoMethod.ts`). The province's own outline: Natural Earth's 1:10m
 * admin-1 shape (public domain) with the coast let out two kilometres over
 * water — never over a neighbouring province's land, Lesotho's, Eswatini's
 * or Mozambique's — so that a seafront the simplified coast would leave
 * outside is in (`data/kwazuluNatalShape.json`).
 */
import shape from './data/kwazuluNatalShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][] };
let rings: Ring[] | null = null;

export const isCoordinateInKwaZuluNatal = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < -31.1 || latitude > -26.8 || longitude < 28.85 || longitude > 32.95) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  return rings.some(r => inRing(r, longitude, latitude));
});
