/**
 * Singapore — MUIS's. Johor Bahru and Batam, across the water, are not.
 *
 * By the country's outline (`countryAt.ts`), so a border town, a strait or a
 * split island is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInSingapore(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'SG';
}
