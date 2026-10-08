/**
 * The cities the Algerian Ministry of Religious Affairs and Wakfs publishes
 * prayer times for, and the nearest of them to a point.
 *
 * `data/algeriaCities.json` is written by `tools/algeria-ministry/build.ts`
 * from the Ministry's own timetable (its official app's database), with
 * coordinates from `tools/algeria-ministry/cities.ts`.
 */
import cities from './data/algeriaCities.json';

/** AlAdhan's id for "Algeria" (18° / 17°). The app computes it itself; see `localAdhan.ts`. */
export const ALGERIA_METHOD_ID = 19;

export type AlgeriaCity = {
  id: number;
  /** As the Ministry writes it (Arabic). */
  name: string;
  nameEn: string;
  lat: number;
  lon: number;
};

export const ALGERIA_CITIES: readonly AlgeriaCity[] = cities as AlgeriaCity[];

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** The nearest listed city, or null if the list is empty. */
export function nearestAlgeriaCity(
  latitude: number,
  longitude: number,
): (AlgeriaCity & { distanceKm: number }) | null {
  let best: (AlgeriaCity & { distanceKm: number }) | null = null;
  for (const c of ALGERIA_CITIES) {
    const d = distanceKm(latitude, longitude, c.lat, c.lon);
    if (!best || d < best.distanceKm) best = { ...c, distanceKm: d };
  }
  return best;
}
