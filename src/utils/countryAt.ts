/**
 * WHICH COUNTRY IS THIS?
 *
 * Automatic gives a country its own prayer-time source, so it has to know
 * the country — at Haparanda and Tornio, two kilometres apart across a
 * river; at Ceuta, Spain on Morocco's coast; on Sebatik, an island split
 * between Indonesia and Malaysia; in Northern Cyprus, which Diyanet serves,
 * and the Republic, which it does not. Rectangles could not tell these
 * apart.
 *
 * The outlines are Natural Earth's (public domain), for the countries with
 * a source of their own and their neighbours near them, simplified to a few
 * hundred metres (`tools/regions/build.py`, `data/countryShapes.json`). A
 * point on no land — offshore, or on a coast the simplification shaved — is
 * given to the nearest country within reach.
 */
import shapes from './data/countryShapes.json';

type Shapes = { scale: number; targets: string[]; countries: Record<string, number[][][]> };
const DATA = shapes as Shapes;
/** Offshore, or a coast the outline cut: the nearest country this close. */
export const COASTAL_REACH_KM = 25;

type Ring = { xs: Float64Array; ys: Float64Array; minX: number; minY: number; maxX: number; maxY: number };
type Poly = { outer: Ring; holes: Ring[] };
type Country = { code: string; polys: Poly[]; minX: number; minY: number; maxX: number; maxY: number };

let countries: Country[] | null = null;

function ring(flat: number[], scale: number): Ring {
  const n = flat.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = flat[2 * i] / scale;
    const y = flat[2 * i + 1] / scale;
    xs[i] = x;
    ys[i] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { xs, ys, minX, minY, maxX, maxY };
}

function load(): Country[] {
  if (countries) return countries;
  countries = Object.entries(DATA.countries).map(([code, polys]) => {
    const ps = polys.map(rings => ({ outer: ring(rings[0], DATA.scale), holes: rings.slice(1).map(r => ring(r, DATA.scale)) }));
    return {
      code,
      polys: ps,
      minX: Math.min(...ps.map(p => p.outer.minX)),
      minY: Math.min(...ps.map(p => p.outer.minY)),
      maxX: Math.max(...ps.map(p => p.outer.maxX)),
      maxY: Math.max(...ps.map(p => p.outer.maxY)),
    };
  });
  return countries;
}

function inRing(r: Ring, x: number, y: number): boolean {
  if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) return false;
  let hit = false;
  const { xs, ys } = r;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if (ys[i] > y !== ys[j] > y && x < ((xs[j] - xs[i]) * (y - ys[i])) / (ys[j] - ys[i]) + xs[i]) hit = !hit;
  }
  return hit;
}

/** Distance (km) from a point to a ring's edge, on a local flat projection. */
function edgeKm(r: Ring, x: number, y: number): number {
  const kx = 111.32 * Math.cos((y * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  const { xs, ys } = r;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    const ax = (xs[j] - x) * kx, ay = (ys[j] - y) * ky;
    const bx = (xs[i] - x) * kx, by = (ys[i] - y) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const px = ax + t * dx, py = ay + t * dy;
    const d = px * px + py * py;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Where the 1:10m outline itself is wrong by more than a town: [lat, lon,
 * radius km, country]. Its Torne runs half a kilometre east of the real one,
 * so Tornio was Swedish; its fell border puts Riksgränsen, the Swedish
 * station, in Norway; and it has no Kastellorizo, two kilometres off Kaş.
 */
const FIXES: readonly (readonly [number, number, number, string])[] = [
  [65.85, 24.17, 1.3, 'FI'], // Tornio's centre (Haparanda is across the river, 2 km west)
  [68.4256, 18.1265, 1.5, 'SE'], // Riksgränsen
  [36.1497, 29.5947, 3, 'GR'], // Kastellorizo
];

function fixAt(latitude: number, longitude: number): string | null {
  for (const [lat, lon, km, code] of FIXES) {
    const dy = (latitude - lat) * 110.57;
    const dx = (longitude - lon) * 111.32 * Math.cos((lat * Math.PI) / 180);
    if (dx * dx + dy * dy <= km * km) return code;
  }
  return null;
}

let last: { lat: number; lon: number; code: string | null } | null = null;

/**
 * The country (ISO 3166 alpha-2; Western Sahara answers MA and Northern
 * Cyprus TR, with the sources that serve them) at a point, among those the
 * app routes on and their neighbours; null elsewhere.
 */
export function countryAt(latitude: number, longitude: number): string | null {
  if (last && last.lat === latitude && last.lon === longitude) return last.code;
  const x = longitude;
  const y = latitude;
  const all = load();
  let code: string | null = fixAt(latitude, longitude);
  for (const c of code ? [] : all) {
    if (x < c.minX || x > c.maxX || y < c.minY || y > c.maxY) continue;
    if (c.polys.some(p => inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y)))) {
      code = c.code;
      break;
    }
  }
  if (!code) {
    // On no land: the nearest country within reach (a ferry, a beach the outline missed).
    const reachDeg = COASTAL_REACH_KM / 80;
    let best = COASTAL_REACH_KM;
    for (const c of all) {
      if (x < c.minX - reachDeg || x > c.maxX + reachDeg || y < c.minY - reachDeg || y > c.maxY + reachDeg) continue;
      for (const p of c.polys) {
        const r = p.outer;
        if (x < r.minX - reachDeg || x > r.maxX + reachDeg || y < r.minY - reachDeg || y > r.maxY + reachDeg) continue;
        const d = edgeKm(r, x, y);
        if (d < best) {
          best = d;
          code = c.code;
        }
      }
    }
  }
  last = { lat: latitude, lon: longitude, code };
  return code;
}

/** Is the point in this country (by `countryAt`)? */
export const isInCountry = (code: string) => (latitude: number, longitude: number): boolean =>
  countryAt(latitude, longitude) === code;
