/**
 * Tajikistan — the Islamic Centre's. Termez, Samarkand, Batken and Osh,
 * across the borders, are not.
 *
 * By the country's outline (`countryAt.ts`), so a border town in the Fergana
 * or Zarafshon valley is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInTajikistan(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'TJ';
}
