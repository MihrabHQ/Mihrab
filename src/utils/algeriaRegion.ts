/**
 * Is this coordinate in Algeria?
 *
 * The same question `moroccoRegion.ts` and `swedenRegion.ts` answer, and
 * harder, for two reasons: Algeria's borders are long and ragged, and its
 * western neighbour's rectangle (`moroccoRegion.ts`) deliberately takes in a
 * strip of Algeria — Tlemcen and Maghnia are inside it, and Tindouf too.
 * A rectangle for Algeria would in turn take in Tunisia, Libya and Mali, so
 * this is a rectangle PLUS a distance test against the Ministry's own place
 * list:
 *
 *   1. inside a generous bounding box, and
 *   2. within reach of one of the cities the Ministry publishes — close in
 *      the dense north, far in the Sahara where places are hundreds of
 *      kilometres apart, and
 *   3. nearer to that place than to any Moroccan ministry city, so that
 *      Oujda stays Moroccan while Maghnia, thirty kilometres away, is not.
 *
 * It errs by a few kilometres at the borders. Someone standing on a border
 * can pick the Algeria method by hand.
 */
import { nearestAlgeriaCity } from '../providers/algeriaCities';
import { nearestMoroccoCity } from '../providers/moroccoNearest';

const DZ_MIN_LAT = 18.9;
const DZ_MAX_LAT = 37.3;
const DZ_MIN_LNG = -8.8;
const DZ_MAX_LNG = 12.0;

/** How far a point may be from a listed place and still be "Algeria". */
const NORTH_REACH_KM = 120;
const SAHARA_REACH_KM = 260;
/** North of this the places are close together (the Tell and the Highlands). */
const SAHARA_LATITUDE = 31.5;

export function isCoordinateInAlgeria(
  latitude: number,
  longitude: number,
): boolean {
  if (
    latitude < DZ_MIN_LAT ||
    latitude > DZ_MAX_LAT ||
    longitude < DZ_MIN_LNG ||
    longitude > DZ_MAX_LNG
  ) {
    return false;
  }
  const near = nearestAlgeriaCity(latitude, longitude);
  if (!near) return false;
  const reach = latitude >= SAHARA_LATITUDE ? NORTH_REACH_KM : SAHARA_REACH_KM;
  if (near.distanceKm > reach) return false;
  const moroccan = nearestMoroccoCity(latitude, longitude);
  if (moroccan && moroccan.distanceKm <= near.distanceKm) return false;
  return true;
}
