/**
 * The places of six national timetables the phone computes by the
 * authority's own method (from MihrabHQ/mihrab-methods): Egypt's 77 cities,
 * Jordan's 16 zones, Kazakhstan's 84 cities, Qatar's one table, and the
 * areas of Kuwait and the districts of Brunei — and which of them answers
 * for a reader.
 *
 * Egypt's, Jordan's and Kazakhstan's places are points: the nearest answers.
 * Kuwait's and Brunei's tables are one town's, with each other area a whole
 * number of minutes on it; an area's point carries those minutes in its
 * longitude and is not where the area is, so a reader is given the area
 * whose minutes are nearest the sun's own for their longitude — which is
 * how the minutes were set.
 */
import egypt from './data/egyptCities.json';
import jordan from './data/jordanZones.json';
import kazakhstan from './data/kazakhstanCities.json';
import kuwait from './data/kuwaitAreas.json';
import brunei from './data/bruneiDistricts.json';
import qatar from './data/qatarCities.json';
import { KUWAIT_POINT, kuwaitAreaMinutes } from './kuwaitMethod';
import { BRUNEI_POINT, bruneiDistrictMinutes } from './bruneiMethod';

/** The phone's own ids for the six methods (`localAdhan.ts`); none is AlAdhan's, and none is offered in the method list. */
export const EGYPT_METHOD_ID = 35;
export const KUWAIT_METHOD_ID = 36;
export const QATAR_METHOD_ID = 37;
export const JORDAN_METHOD_ID = 38;
export const KAZAKHSTAN_METHOD_ID = 39;
export const BRUNEI_METHOD_ID = 40;

export type MinistryPlace = { id: number; name: string; lat: number; lon: number };
export type JordanZone = MinistryPlace & { dipEast: number; dipWest: number; fajrMinutes: number };
export const EGYPT_CITIES: readonly MinistryPlace[] = egypt as MinistryPlace[];
export const JORDAN_ZONES: readonly JordanZone[] = jordan as JordanZone[];
export const KAZAKHSTAN_CITIES: readonly MinistryPlace[] = kazakhstan as MinistryPlace[];
export const KUWAIT_AREAS: readonly MinistryPlace[] = kuwait as MinistryPlace[];
export const BRUNEI_DISTRICTS: readonly MinistryPlace[] = brunei as MinistryPlace[];
/** Doha: the Calendar House's one table, which the country keeps. */
export const QATAR_PLACE: MinistryPlace = (qatar as MinistryPlace[])[0];

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function nearest<T extends MinistryPlace>(list: readonly T[], latitude: number, longitude: number): (T & { distanceKm: number }) | null {
  let best: (T & { distanceKm: number }) | null = null;
  for (const p of list) {
    const d = distanceKm(latitude, longitude, p.lat, p.lon);
    if (!best || d < best.distanceKm) best = { ...p, distanceKm: d };
  }
  return best;
}

export const nearestEgyptCity = (latitude: number, longitude: number) => nearest(EGYPT_CITIES, latitude, longitude);
export const nearestJordanZone = (latitude: number, longitude: number) => nearest(JORDAN_ZONES, latitude, longitude);
export const nearestKazakhstanCity = (latitude: number, longitude: number) => nearest(KAZAKHSTAN_CITIES, latitude, longitude);

/** The area whose whole minutes are nearest the sun's for this longitude (four minutes of time to the degree, west later). */
function byMinutes(list: readonly MinistryPlace[], baseLon: number, minutesOf: (lon: number) => number, longitude: number): MinistryPlace {
  const want = (baseLon - longitude) * 4;
  let best = list[0];
  let gap = Infinity;
  for (const p of list) {
    const g = Math.abs(minutesOf(p.lon) - want);
    if (g < gap) {
      best = p;
      gap = g;
    }
  }
  return best;
}
export const kuwaitAreaFor = (longitude: number) => byMinutes(KUWAIT_AREAS, KUWAIT_POINT.lon, kuwaitAreaMinutes, longitude);
export const bruneiDistrictFor = (longitude: number) => byMinutes(BRUNEI_DISTRICTS, BRUNEI_POINT.lon, bruneiDistrictMinutes, longitude);

let zones: Map<string, JordanZone> | null = null;
/** The zone a point of Jordan's table is, for the horizons and the Fajr margin the Ministry computes it with. */
export function jordanZoneAt(latitude: number, longitude: number): JordanZone | undefined {
  zones ??= new Map(JORDAN_ZONES.map(z => [`${z.lat.toFixed(4)},${z.lon.toFixed(4)}`, z]));
  return zones.get(`${latitude.toFixed(4)},${longitude.toFixed(4)}`);
}
