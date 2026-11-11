/**
 * Kyrgyzstan — the Spiritual Administration's. Andijan, Khujand, Almaty and
 * Kashgar, across the borders, are not, nor the Uzbek and Tajik enclaves
 * inside Batken.
 *
 * By the country's outline (`countryAt.ts`), so a border town in the Fergana
 * valley is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInKyrgyzstan(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'KG';
}
