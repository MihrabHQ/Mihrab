/**
 * London — the London Unified Prayer Timetable's. One timetable for the
 * whole city, as its mosques use it: Greater London, taken as within
 * 30 km of Charing Cross (about the M25). Watford, Slough, Dartford and
 * Epsom are in; Luton, Reading and Southend are not.
 */
import { distanceKm } from './coords';

export const LONDON_CENTRE = { latitude: 51.5074, longitude: -0.1278 };
export const LONDON_REACH_KM = 30;

export function isCoordinateInLondon(latitude: number, longitude: number): boolean {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 51.2 || latitude > 51.8 || longitude < -0.6 || longitude > 0.35) return false;
  return distanceKm(latitude, longitude, LONDON_CENTRE.latitude, LONDON_CENTRE.longitude) <= LONDON_REACH_KM;
}
