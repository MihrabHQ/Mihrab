/**
 * Malaysia — JAKIM's zones. Brunei, southern Thailand, Singapore and Indonesian Borneo are not.
 *
 * By the country's outline (`countryAt.ts`), so a border town, a strait or a
 * split island is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInMalaysia(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'MY';
}
