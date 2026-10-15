/**
 * Algeria — the Ministry of Religious Affairs' country. Tunisia, Libya, Morocco, Mali and Niger are not.
 *
 * By the country's outline (`countryAt.ts`), so a border town, a strait or a
 * split island is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInAlgeria(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'DZ';
}
