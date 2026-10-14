/**
 * The authorities whose published tables the app's own methods are checked
 * against — one entry per table the builders fetch (tools/*-dataset,
 * tools/national-tables), with the method the phone computes for it and
 * how close the two are expected to be.
 *
 * The idea (October 2026): what Mihrab distributes should be its own
 * calculation, fitted to each authority; the fetched tables are kept to
 * prove the calculation right, day by day, and to raise an issue the
 * moment they disagree. See tools/verify-methods/README.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const ROOT = path.join(__dirname, '../..');
const DATA = path.join(ROOT, 'data/prayer-times');

export type Place = {
  /** The city file under data/prayer-times/<folder>/v1/cities/. */
  file: string;
  name: string;
  lat: number;
  lon: number;
  /** The clock the table is printed in. */
  tz: string;
  /** Metres above sea level, where the authority lowers the horizon for the place. */
  heightM?: number;
  /** The authority's own allowance for the horizon, minutes, where it is a figure rather than a height. */
  horizonMin?: number;
  /** The authority's own horizon dip for the place, degrees (Morocco's, fitted from its tables). */
  horizonDipDeg?: number;
};

export type Authority = {
  id: string;
  name: string;
  folder: string;
  /** The app's calculation method id, or 'auto' where none is fitted yet. */
  method: number | 'auto';
  /** Shafiʿi (0) or Hanafi (1) Asr. */
  school: 0 | 1;
  /** A time this many minutes from the table's is still "right" (rounding). */
  toleranceMin: number;
  /** Alarm when more than this share of times fall outside the tolerance. */
  maxOutsideShare: number;
  /** Alarm on any single time this far off — a wrong day, a wrong hour. */
  hardMaxMin: number;
  /** False: report only; the method is not fitted to this table yet. */
  alarm: boolean;
  /**
   * The site serves last year's figures for a year it has not published
   * yet: a row identical to the previous year's for the date is compared
   * as that year rather than counted against the method.
   */
  copiedYears?: boolean;
  /**
   * Where the tables live when not under data/prayer-times/<folder>: an
   * absolute directory holding v1/cities/ (a download the check makes and
   * does not commit). A missing directory skips the authority.
   */
  root?: string;
  /**
   * Rows the source got wrong rather than the method: compared against the
   * authority's own original, a row that differs from it is the
   * republisher's fault and is set aside (reported, not counted).
   */
  original?: (place: Place) => Record<string, string[]> | null;
  places: () => Place[];
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

/** Diyanet's downloaded Swedish tables (diyanet-fetch.py); not committed. */
export const DIYANET_ROOT = process.env.DIYANET_TABLES ?? path.join(require('node:os').homedir(), '.cache/mihrab/diyanet');

let diyanetBySlug: Map<string, string> | null = null;
/** Diyanet's own rows for an Islamiska Förbundet city, by its slug, or null if not downloaded. */
function diyanetDaysFor(slug: string): Record<string, string[]> | null {
  if (!diyanetBySlug) {
    diyanetBySlug = new Map();
    const pts = readJson<Record<string, { slug: string | null }>>(path.join(__dirname, 'diyanet-sweden-points.json'));
    for (const [iid, v] of Object.entries(pts)) if (v.slug) diyanetBySlug.set(v.slug, iid);
  }
  const iid = diyanetBySlug.get(slug);
  if (!iid) return null;
  const f = path.join(DIYANET_ROOT, 'v1', 'cities', `${iid}.json`);
  return fs.existsSync(f) ? (readJson<{ days: Record<string, string[]> }>(f).days ?? null) : null;
}

/** Indonesia prints each regency in its own zone; the province says which. */
const WITA = new Set([
  'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Bali',
  'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Sulawesi Barat', 'Sulawesi Selatan',
  'Sulawesi Tengah', 'Sulawesi Tenggara', 'Sulawesi Utara', 'Gorontalo',
]);
const WIT = new Set(['Maluku', 'Maluku Utara', 'Papua', 'Papua Barat']);
export function indonesiaZone(province: string): string {
  if (WIT.has(province)) return 'Asia/Jayapura';
  if (WITA.has(province)) return 'Asia/Makassar';
  return 'Asia/Jakarta';
}

/**
 * Morocco left GMT+1 for GMT on 2026-09-20, for good and with no Ramadan
 * exception left to make; the tz databases on this autumn's Node and
 * runners still move the clock, so the zone is pinned rather than named.
 * Should the ministry's clock move again, this check is the alarm.
 */
const MOROCCO_TZ = 'Etc/GMT';

type IdPlace = { id: number; name: string; nameEn?: string; lat: number; lon: number; heightM?: number; horizonMin?: number };

export const AUTHORITIES: Authority[] = [
  {
    id: 'ifis',
    name: 'Sweden — Islamiska Förbundet',
    folder: '.', // data/prayer-times/v1 itself — the first table, before the folders
    method: 24,
    school: 0,
    toleranceMin: 1,
    // The tables are Diyanet's (Islamiska Förbundet republishes them), and
    // the method is Diyanet's (src/providers/congressMethod.ts), computed at
    // the points Diyanet computes the cities at (the coordinates file).
    // Rows where the site's table differs from Diyanet's own are the site's
    // fault — another year's figures served for the next, one town's table
    // printed for another — and are set aside when Diyanet's tables have
    // been downloaded (diyanet-fetch.py; the 'diyanet' check below).
    maxOutsideShare: 0.01,
    hardMaxMin: 3,
    alarm: true,
    copiedYears: true,
    original: place => diyanetDaysFor(place.file.replace(/\.json$/, '')),
    places: () => {
      const coords = readJson<Record<string, { lat: number; lng: number }>>(
        path.join(ROOT, 'src/providers/islamiskaForbundetCoords.json'),
      );
      const { citySlug } = require('../../src/providers/islamiskaForbundetParser') as {
        citySlug: (s: string) => string;
      };
      return Object.entries(coords).map(([name, c]) => ({
        file: `${citySlug(name)}.json`,
        name,
        lat: c.lat,
        lon: c.lng,
        tz: 'Europe/Stockholm',
      }));
    },
  },
  {
    id: 'diyanet',
    name: 'Sweden — Diyanet (the tables Islamiska Förbundet republishes)',
    folder: 'diyanet',
    root: DIYANET_ROOT,
    method: 24,
    school: 0,
    // The method is Diyanet's own, at Diyanet's own points: the check is to
    // the minute. 0.06 % of times are a fraction of a second the other side
    // of the rounding point (tools/verify-methods/README.md).
    toleranceMin: 0,
    maxOutsideShare: 0.002,
    hardMaxMin: 1,
    alarm: true,
    places: () =>
      Object.entries(readJson<Record<string, { name: string; lat: number; lon: number }>>(path.join(__dirname, 'diyanet-sweden-points.json'))).map(
        ([iid, v]) => ({ file: `${iid}.json`, name: v.name, lat: v.lat, lon: v.lon, tz: 'Europe/Stockholm' }),
      ),
  },
  {
    id: 'habous',
    name: 'Morocco — Ministry of Habous and Islamic Affairs',
    folder: 'morocco',
    method: 21,
    school: 0,
    // The ministry's own method (moroccoMethod.ts) at each city's point and
    // horizon as its tables show them (moroccoMethodPoints.json): the check
    // is to the minute. About 1.3 % of times — most of them sunrise and
    // Maghrib, whose height allowance is the least settled part — land a
    // minute the other side (tools/verify-methods/README.md).
    toleranceMin: 0,
    maxOutsideShare: 0.025,
    hardMaxMin: 1,
    alarm: true,
    // Cities the solver left without coordinates (tools/habous-dataset/
    // solveCoords.ts) have tables but no point to compute at; they are
    // not places until somebody places them.
    places: () => {
      const points = readJson<Record<string, number[]>>(path.join(ROOT, 'src/providers/data/moroccoMethodPoints.json'));
      return readJson<{ id: number; name: string; lat: number | null; lng: number | null; heightM?: number; horizonMin?: number }[]>(
        path.join(ROOT, 'src/providers/data/moroccoCities.json'),
      )
        .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map(c => {
          const p = points[String(c.id)];
          return p
            ? { file: `${c.id}.json`, name: c.name, lat: p[0], lon: p[1], tz: MOROCCO_TZ, horizonDipDeg: p[2] }
            : { file: `${c.id}.json`, name: c.name, lat: c.lat as number, lon: c.lng as number, tz: MOROCCO_TZ, heightM: c.heightM };
        });
    },
  },
  {
    id: 'marw',
    name: 'Algeria — Ministry of Religious Affairs and Wakfs',
    folder: 'algeria',
    method: 19,
    school: 0,
    // The Ministry's own method (algeriaMethod.ts) at the point it computes
    // each city (algeriaMethodPoints.json): the check is to the minute.
    // 0.63 % of times sit within about a second of a minute's edge and land
    // on the other side (tools/verify-methods/README.md); none is further.
    toleranceMin: 0,
    maxOutsideShare: 0.008,
    hardMaxMin: 1,
    alarm: true,
    places: () => {
      const points = readJson<Record<string, [number, number]>>(
        path.join(ROOT, 'src/providers/data/algeriaMethodPoints.json'),
      );
      return readJson<IdPlace[]>(path.join(ROOT, 'src/providers/data/algeriaCities.json')).map(c => ({
        file: `${c.id}.json`,
        name: c.nameEn ?? c.name,
        lat: points[String(c.id)]?.[0] ?? c.lat,
        lon: points[String(c.id)]?.[1] ?? c.lon,
        tz: 'Africa/Algiers',
      }));
    },
  },
  {
    id: 'muis',
    name: 'Singapore — MUIS',
    folder: 'singapore',
    method: 11,
    school: 0,
    toleranceMin: 1,
    maxOutsideShare: 0.02,
    hardMaxMin: 10,
    alarm: true,
    places: () =>
      readJson<IdPlace[]>(path.join(ROOT, 'src/providers/data/muisPlaces.json')).map(c => ({
        file: `${c.id}.json`,
        name: c.nameEn ?? c.name,
        lat: c.lat,
        lon: c.lon,
        tz: 'Asia/Singapore',
      })),
  },
  {
    id: 'jakim',
    name: 'Malaysia — JAKIM e-Solat',
    folder: 'malaysia',
    method: 17,
    school: 0,
    toleranceMin: 1,
    // A zone's single time is computed for a reference point the ministry
    // chose; our place is its first listed town. Two minutes either way is
    // the zone, not the method.
    maxOutsideShare: 0.1,
    hardMaxMin: 8,
    alarm: true,
    places: () => {
      const { JAKIM_ZONES } = require('../national-tables/jakim-zones') as {
        JAKIM_ZONES: readonly { code: string; towns: [string, number, number, number][] }[];
      };
      return JAKIM_ZONES.map((z, i) => ({
        file: `${i + 1}.json`,
        name: `${z.towns[0][0]} (${z.code})`,
        lat: z.towns[0][1],
        lon: z.towns[0][2],
        tz: 'Asia/Kuala_Lumpur',
        heightM: z.towns[0][3],
      }));
    },
  },
  {
    id: 'kemenag',
    name: 'Indonesia — Kemenag',
    folder: 'indonesia',
    method: 20,
    school: 0,
    toleranceMin: 1,
    maxOutsideShare: 0.05,
    hardMaxMin: 10,
    alarm: true,
    places: () =>
      readJson<IdPlace[]>(path.join(ROOT, 'src/providers/data/kemenagPlaces.json')).map(c => {
        const province = /\(([^)]*)\)\s*$/.exec(c.nameEn ?? '')?.[1] ?? '';
        return { file: `${c.id}.json`, name: c.nameEn ?? c.name, lat: c.lat, lon: c.lon, tz: indonesiaZone(province), heightM: c.heightM, horizonMin: c.horizonMin };
      }),
  },
];

export function cityFile(a: Authority, p: Place): string {
  return path.join(a.root ?? path.join(DATA, a.folder), 'v1', 'cities', p.file);
}
