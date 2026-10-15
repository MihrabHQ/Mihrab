/**
 * Türkiye, with Northern Cyprus, whose districts Diyanet lists. The Greek islands off the coast and the Republic of Cyprus are not.
 *
 * By the country's outline (`countryAt.ts`), so a border town, a strait or a
 * split island is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInTurkey(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'TR';
}
