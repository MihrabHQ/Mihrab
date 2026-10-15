/**
 * Morocco, with Western Sahara, whose cities the Ministry of Habous lists.
 * Gibraltar, the Canaries, Mauritania and Algeria are not.
 *
 * By the country's outline (`countryAt.ts`), so a border town or a strait is
 * answered by the side it is on — and by the ministry's own list where the
 * outline and the list disagree: it publishes Ceuta and Melilla, so they are
 * covered, and a listed town the 1:10m border runs through (Ahfir, Lagouira)
 * is its own.
 */
import { countryAt } from './countryAt';
import { nearestMoroccoCity } from '../providers/moroccoNearest';

/** Ceuta and Melilla, which the ministry publishes, are covered to their edges. */
const EXCLAVE_KM = 8;
/** A listed town the outline's border runs through. */
const LISTED_TOWN_KM = 5;

export function isCoordinateInMorocco(latitude: number, longitude: number): boolean {
  const code = countryAt(latitude, longitude);
  if (code === 'MA') return true;
  if (code !== 'ES' && code !== 'DZ' && code !== 'MR') return false;
  const near = nearestMoroccoCity(latitude, longitude);
  if (!near) return false;
  return near.distanceKm <= (code === 'ES' ? EXCLAVE_KM : LISTED_TOWN_KM) &&
    // Spain's cities the ministry lists are its two on the African coast.
    (code !== 'ES' || latitude < 35.95);
}
