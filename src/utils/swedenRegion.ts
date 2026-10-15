/**
 * Sweden — Islamiska Förbundet's country. Norway, Finland, Åland, Denmark and the Baltic coast are not (a rectangle took in Riga, Turku and Narvik).
 *
 * By the country's outline (`countryAt.ts`), so a border town, a strait or a
 * split island is answered by the side it is on.
 */
import { countryAt } from './countryAt';

export function isCoordinateInSweden(latitude: number, longitude: number): boolean {
  return countryAt(latitude, longitude) === 'SE';
}
