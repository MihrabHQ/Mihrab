/**
 * The towns of the two Balkan timetables the phone computes — the Muslim
 * Community of Albania's calendar (Tirana and ten towns of Albania) and the
 * Grand Mufti's Office of Bulgaria's (Sofia and forty-seven towns) — and the
 * nearest of them to a reader.
 *
 * Each timetable is one town's table plus a town's whole minutes
 * (`townTableMethod.ts`). A town here has two points: where it is, which is
 * what a reader is matched by, and the point the method is computed at
 * (`pointLat`, `pointLon`, from MihrabHQ/mihrab-methods), which carries the
 * town's minutes in its longitude and is what the correction list is keyed
 * by. The Community's calendar also gives towns of Kosovo, North Macedonia,
 * Montenegro and the Preševo valley; those are not served here.
 */
import albania from './data/albaniaTowns.json';
import bulgaria from './data/bulgariaTowns.json';

/** The phone's own ids for the two methods (`localAdhan.ts`); neither is AlAdhan's, and neither is offered in the method list. */
export const ALBANIA_METHOD_ID = 33;
export const BULGARIA_METHOD_ID = 34;

export type BalkanTown = { id: number; name: string; nameEn?: string; lat: number; lon: number; pointLat: number; pointLon: number };
export const ALBANIA_TOWNS: readonly BalkanTown[] = albania as BalkanTown[];
export const BULGARIA_TOWNS: readonly BalkanTown[] = bulgaria as BalkanTown[];

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function nearest(list: readonly BalkanTown[], latitude: number, longitude: number): (BalkanTown & { distanceKm: number }) | null {
  let best: (BalkanTown & { distanceKm: number }) | null = null;
  for (const p of list) {
    const d = distanceKm(latitude, longitude, p.lat, p.lon);
    if (!best || d < best.distanceKm) best = { ...p, distanceKm: d };
  }
  return best;
}

export const nearestAlbaniaTown = (latitude: number, longitude: number) => nearest(ALBANIA_TOWNS, latitude, longitude);
export const nearestBulgariaTown = (latitude: number, longitude: number) => nearest(BULGARIA_TOWNS, latitude, longitude);
