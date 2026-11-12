/**
 * The United Arab Emirates — where the Authority's timetable answers. The
 * country's own outline: Natural Earth's 1:10m admin-0 shape (public
 * domain) with the shore let out two kilometres over water — never over a
 * neighbour's land — so that a seafront the simplified coast would leave
 * outside is in (`data/uaeShape.json`). Oman's enclave of Madha, inside
 * the outline, is out; and three islands the outline does not draw, each a
 * zone of the timetable, are in: Das, Zirku and Sir Bu Nair.
 */
import shape from './data/uaeShape.json';
import { inRing, memoByCoordinate, ring, type Ring } from './countryAt';

const DATA = shape as { scale: number; rings: number[][]; holes: number[][] };
let rings: Ring[] | null = null;
let holes: Ring[] | null = null;
/** Islands of the timetable the outline leaves out: [latitude, longitude]. */
const ISLANDS: readonly [number, number][] = [
  [25.156, 52.87],
  [24.878, 53.063],
  [25.234, 54.215],
];
const ISLAND_KM = 6;

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export const isCoordinateInUae = memoByCoordinate((latitude: number, longitude: number): boolean => {
  // The cheap box first: this is asked on every settings read.
  if (latitude < 22.6 || latitude > 26.1 || longitude < 51.5 || longitude > 56.45) return false;
  rings ??= DATA.rings.map(r => ring(r, DATA.scale));
  holes ??= DATA.holes.map(r => ring(r, DATA.scale));
  if (rings.some(r => inRing(r, longitude, latitude))) return !holes.some(r => inRing(r, longitude, latitude));
  return ISLANDS.some(([la, lo]) => km(latitude, longitude, la, lo) <= ISLAND_KM);
});
