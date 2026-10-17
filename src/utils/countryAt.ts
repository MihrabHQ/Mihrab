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

type Shapes = {
  scale: number;
  targets: string[];
  countries: Record<string, number[][][]>;
  national: Record<string, number[][][]>;
  foreign: number[][][];
};
const DATA = shapes as Shapes;
/** Offshore, or a coast the outline cut: the nearest country this close. */
export const COASTAL_REACH_KM = 25;

type Ring = {
  xs: Float64Array;
  ys: Float64Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
type Poly = { outer: Ring; holes: Ring[] };
type Country = {
  code: string;
  polys: Poly[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

let countries: Country[] | null = null;

function ring(flat: number[], scale: number): Ring {
  const n = flat.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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

function build(source: Record<string, number[][][]>): Country[] {
  return Object.entries(source).map(([code, polys]) => {
    const ps = polys.map(rings => ({
      outer: ring(rings[0], DATA.scale),
      holes: rings.slice(1).map(r => ring(r, DATA.scale)),
    }));
    return {
      code,
      polys: ps,
      minX: Math.min(...ps.map(p => p.outer.minX)),
      minY: Math.min(...ps.map(p => p.outer.minY)),
      maxX: Math.max(...ps.map(p => p.outer.maxX)),
      maxY: Math.max(...ps.map(p => p.outer.maxY)),
    };
  });
}

function load(): Country[] {
  if (!countries) countries = build(DATA.countries);
  return countries;
}

function inRing(r: Ring, x: number, y: number): boolean {
  if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) return false;
  let hit = false;
  const { xs, ys } = r;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if (
      ys[i] > y !== ys[j] > y &&
      x < ((xs[j] - xs[i]) * (y - ys[i])) / (ys[j] - ys[i]) + xs[i]
    )
      hit = !hit;
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
    const ax = (xs[j] - x) * kx,
      ay = (ys[j] - y) * ky;
    const bx = (xs[i] - x) * kx,
      by = (ys[i] - y) * ky;
    const dx = bx - ax,
      dy = by - ay;
    const len = dx * dx + dy * dy;
    const t =
      len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const px = ax + t * dx,
      py = ay + t * dy;
    const d = px * px + py * py;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Where the 1:10m outline itself is wrong by more than a town, or a town is
 * closer to a border than the outlines can tell: [lat, lon, radius km,
 * country]. Its Torne runs half a kilometre east of the real one,
 * so Tornio was Swedish; its fell border puts Riksgränsen, the Swedish
 * station, in Norway; and it has no Kastellorizo, two kilometres off Kaş.
 */
const FIXES: readonly (readonly [number, number, number, string])[] = [
  [65.85, 24.17, 1.3, 'FI'], // Tornio's centre (Haparanda is across the river, 2 km west)
  [68.4256, 18.1265, 1.5, 'SE'], // Riksgränsen
  [36.1497, 29.5947, 3, 'GR'], // Kastellorizo
  // Towns on a border with a country that has a method of its own, too
  // close to it for the rough outlines (`foreign` stops short of the border
  // by a few hundred metres): their own country, not the neighbour's method.
  [59.3797, 28.1791, 1, 'EE'], // Narva (Ivangorod, Russia, across the river)
  [38.4562, 48.875, 1.2, 'AZ'], // Astara (Astara, Iran, across the river)
  [29.5577, 34.9519, 2, 'IL'], // Eilat (Aqaba 5 km east, Taba 7 km south)
];

function fixAt(latitude: number, longitude: number): string | null {
  for (const [lat, lon, km, code] of FIXES) {
    const dy = (latitude - lat) * 110.57;
    const dx = (longitude - lon) * 111.32 * Math.cos((lat * Math.PI) / 180);
    if (dx * dx + dy * dy <= km * km) return code;
  }
  return null;
}

/**
 * Answers already given, by coordinate. Every settings read resolves the
 * source (`effectiveProvider.ts`), each saved location's line in Settings
 * asks for its own, and each answer is a walk through hundreds of
 * kilometres of outline: a few coordinates asked again and again.
 */
const MEMO_SIZE = 256;
export function memoByCoordinate<T>(
  fn: (latitude: number, longitude: number) => T,
): (latitude: number, longitude: number) => T {
  const memo = new Map<string, T>();
  return (latitude, longitude) => {
    const key = `${latitude},${longitude}`;
    if (memo.has(key)) {
      const hit = memo.get(key) as T;
      // Most recently asked last: the first key is the one to forget.
      memo.delete(key);
      memo.set(key, hit);
      return hit;
    }
    const value = fn(latitude, longitude);
    if (memo.size >= MEMO_SIZE) memo.delete(memo.keys().next().value as string);
    memo.set(key, value);
    return value;
  };
}

type Located = { code: string | null; onLand: boolean };

/** The country whose outline holds the point (`onLand`), or the nearest within reach. */
const locate = memoByCoordinate(
  (latitude: number, longitude: number): Located => {
    // Not a place: NaN would slip through every comparison below.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { code: null, onLand: false };
    }
    const fixed = fixAt(latitude, longitude);
    if (fixed) return { code: fixed, onLand: true };
    const x = longitude;
    const y = latitude;
    const all = load();
    for (const c of all) {
      if (x < c.minX || x > c.maxX || y < c.minY || y > c.maxY) continue;
      if (
        c.polys.some(
          p => inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y)),
        )
      ) {
        return { code: c.code, onLand: true };
      }
    }
    return { code: nearestWithin(all, x, y, COASTAL_REACH_KM), onLand: false };
  },
);

/**
 * The country (ISO 3166 alpha-2; Western Sahara answers MA and Northern
 * Cyprus TR, with the sources that serve them) at a point, among those the
 * app routes on and their neighbours; null elsewhere.
 */
export function countryAt(latitude: number, longitude: number): string | null {
  return locate(latitude, longitude).code;
}

/** On no land: the nearest country within reach (a ferry, a beach the outline missed). */
function nearestWithin(
  all: Country[],
  x: number,
  y: number,
  reachKm: number,
): string | null {
  // A box around each outline to skip it cheaply: degrees of latitude are
  // all much the same, degrees of longitude shrink toward the poles (at
  // Kiruna 25 km is two thirds of one).
  const reachY = reachKm / 110;
  const reachX =
    reachKm / (111.32 * Math.max(0.05, Math.cos((y * Math.PI) / 180)));
  let best = reachKm;
  let code: string | null = null;
  for (const c of all) {
    if (
      x < c.minX - reachX ||
      x > c.maxX + reachX ||
      y < c.minY - reachY ||
      y > c.maxY + reachY
    )
      continue;
    for (const p of c.polys) {
      const r = p.outer;
      if (
        x < r.minX - reachX ||
        x > r.maxX + reachX ||
        y < r.minY - reachY ||
        y > r.maxY + reachY
      )
        continue;
      const d = edgeKm(r, x, y);
      if (d < best) {
        best = d;
        code = c.code;
      }
    }
  }
  return code;
}

/**
 * COUNTRIES WITH A CALCULATION METHOD OF THEIR OWN.
 *
 * Saudi Arabia, the Gulf states, Iran, Iraq, Jordan, Egypt, Pakistan,
 * India, Bangladesh, Russia, Tunisia and Portugal: where AlAdhan's Automatic
 * picks the country's own method (Umm al-Qura, Egypt, Karachi, Tehran, Gulf,
 * Kuwait, Qatar, Dubai, Russia, Tunisia, Portugal, Jordan), which Automatic
 * must not trade for Diyanet's table only because Diyanet lists a place
 * nearby. Their outlines (`national` in the shapes file) are rough — a few
 * kilometres, Russia's ten — since nothing finer is needed: where the precise
 * outlines above reach, they answer; elsewhere a point within
 * `NATIONAL_REACH_KM` of a rough outline counts as inside, so an error on a
 * coast leaves the reader on the country's own method, which is what
 * Automatic gave there before Diyanet. Not on another country's land along
 * the border, though (`foreign` in the shapes file): the rough outline and
 * its reach took in Badajoz, Narva, Imatra, Jericho, Rafah, Eilat and
 * Astara, ten kilometres and more over the border, and gave them the
 * neighbour's method.
 */
export const NATIONAL_METHOD_COUNTRIES: readonly string[] = Object.keys(
  DATA.national,
).sort();
const NATIONAL_SET = new Set(NATIONAL_METHOD_COUNTRIES);
export const NATIONAL_REACH_KM = 10;

let national: Country[] | null = null;
let foreign: Country | null = null;

function inCountry(c: Country, x: number, y: number): boolean {
  if (x < c.minX || x > c.maxX || y < c.minY || y > c.maxY) return false;
  return c.polys.some(
    p => inRing(p.outer, x, y) && !p.holes.some(h => inRing(h, x, y)),
  );
}

/**
 * Another country's land along a national one's border (`foreign` in the
 * shapes file): Badajoz, Narva, Jericho, Astara, Eilat, a few kilometres
 * from a rough outline and inside its reach, are not on its method.
 */
function onForeignLand(latitude: number, longitude: number): boolean {
  if (!foreign) [foreign] = build({ foreign: DATA.foreign ?? [] });
  return inCountry(foreign, longitude, latitude);
}

/** The country with a method of its own at this point (ISO alpha-2), or null. */
export const nationalMethodCountryAt = memoByCoordinate(
  (latitude: number, longitude: number): string | null => {
    const precise = locate(latitude, longitude);
    // Inside a precise outline: that country, whatever the rough ones say.
    if (precise.onLand) {
      return precise.code && NATIONAL_SET.has(precise.code)
        ? precise.code
        : null;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (onForeignLand(latitude, longitude)) return null;
    if (!national) national = build(DATA.national);
    for (const c of national) {
      if (inCountry(c, longitude, latitude)) return c.code;
    }
    // Off the precise outlines' land, but within their reach of one: a
    // national one answers; a neighbour's reach does not outvote the
    // national outline's below (Dagestan, a few kilometres from Georgia's).
    if (precise.code && NATIONAL_SET.has(precise.code)) return precise.code;
    return nearestWithin(national, longitude, latitude, NATIONAL_REACH_KM);
  },
);

/** Is the point in this country (by `countryAt`)? */
export const isInCountry =
  (code: string) =>
  (latitude: number, longitude: number): boolean =>
    countryAt(latitude, longitude) === code;
