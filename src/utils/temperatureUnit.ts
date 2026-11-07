/**
 * WHICH THERMOMETER?
 *
 * The weather on the Garmin watch face (garmin/README.md) reads in the unit
 * of the place the app is set to: Fahrenheit in the United States and its
 * territories, Liberia, the Bahamas, Belize, the Cayman Islands, Palau,
 * Micronesia and the Marshall Islands; Celsius everywhere else.
 *
 * Their outlines, with their neighbours' land near them so that Windsor
 * and Tijuana stay on their own side of the river, are Natural Earth's
 * (public domain), simplified to about a kilometre and a half
 * (`tools/regions/fahrenheit.py`, `data/fahrenheitShapes.json`). A point on
 * no land — offshore, or on a coast the simplification shaved — takes the
 * nearer of the two within reach.
 */
import shapes from './data/fahrenheitShapes.json';
import { edgeKm, inRing, memoByCoordinate, ring, type Ring } from './countryAt';

type Shapes = { scale: number; fahrenheit: number[][][]; others: number[][][] };
type Poly = { outer: Ring; holes: Ring[] };

const DATA = shapes as Shapes;
/** Offshore, or a coast the outline cut: the nearest land this close. */
export const REACH_KM = 25;

let built: { fahrenheit: Poly[]; others: Poly[] } | null = null;

function polys(source: number[][][]): Poly[] {
  return source.map(rings => ({
    outer: ring(rings[0], DATA.scale),
    holes: rings.slice(1).map(r => ring(r, DATA.scale)),
  }));
}

function load(): { fahrenheit: Poly[]; others: Poly[] } {
  return (built ??= {
    fahrenheit: polys(DATA.fahrenheit),
    others: polys(DATA.others),
  });
}

function holds(ps: Poly[], x: number, y: number): boolean {
  return ps.some(p => inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y)));
}

/** Distance (km) to the nearest outline whose box is within reach; Infinity if none. */
function nearestKm(ps: Poly[], x: number, y: number): number {
  const ry = REACH_KM / 110;
  const rx = REACH_KM / (111.32 * Math.max(0.05, Math.cos((y * Math.PI) / 180)));
  let best = Infinity;
  for (const p of ps) {
    const r = p.outer;
    if (x < r.minX - rx || x > r.maxX + rx || y < r.minY - ry || y > r.maxY + ry) continue;
    best = Math.min(best, edgeKm(r, x, y));
  }
  return best;
}

/** Whether the thermometer at a place reads in Fahrenheit. */
export const usesFahrenheitAt = memoByCoordinate(
  (latitude: number, longitude: number): boolean => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    const x = longitude;
    const y = latitude;
    const { fahrenheit, others } = load();
    if (holds(fahrenheit, x, y)) return true;
    if (holds(others, x, y)) return false;
    const f = nearestKm(fahrenheit, x, y);
    return f <= REACH_KM && f < nearestKm(others, x, y);
  },
);
