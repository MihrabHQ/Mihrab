/**
 * Indonesia — Kemenag's regencies. Timor-Leste, Papua New Guinea, Malaysia's half of Borneo and Sebatik, and Singapore are not.
 *
 * By the country's outline (`countryAt.ts`), so a border town, a strait or a
 * split island is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInIndonesia(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'ID';
}
