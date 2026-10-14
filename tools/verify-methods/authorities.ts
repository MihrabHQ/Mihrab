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
  places: () => Place[];
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
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
    // The tables' summer is a share of the night with a blend to the angles
    // and a floor on the night, all read off the tables rather than
    // published (localAdhan.ts); the blend's edges are a few minutes
    // either way for a fortnight in April and in September.
    maxOutsideShare: 0.15,
    hardMaxMin: 15,
    alarm: true,
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
    id: 'habous',
    name: 'Morocco — Ministry of Habous and Islamic Affairs',
    folder: 'morocco',
    method: 21,
    school: 0,
    toleranceMin: 1,
    maxOutsideShare: 0.02,
    hardMaxMin: 10,
    alarm: true,
    // Cities the solver left without coordinates (tools/habous-dataset/
    // solveCoords.ts) have tables but no point to compute at; they are
    // not places until somebody places them.
    places: () =>
      readJson<{ id: number; name: string; lat: number | null; lng: number | null; heightM?: number; horizonMin?: number }[]>(
        path.join(ROOT, 'src/providers/data/moroccoCities.json'),
      )
        .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map(c => ({ file: `${c.id}.json`, name: c.name, lat: c.lat as number, lon: c.lng as number, tz: MOROCCO_TZ, heightM: c.heightM, horizonMin: c.horizonMin })),
  },
  {
    id: 'marw',
    name: 'Algeria — Ministry of Religious Affairs and Wakfs',
    folder: 'algeria',
    method: 19,
    school: 0,
    toleranceMin: 1,
    maxOutsideShare: 0.02,
    hardMaxMin: 10,
    alarm: true,
    places: () =>
      readJson<IdPlace[]>(path.join(ROOT, 'src/providers/data/algeriaCities.json')).map(c => ({
        file: `${c.id}.json`,
        name: c.nameEn ?? c.name,
        lat: c.lat,
        lon: c.lon,
        tz: 'Africa/Algiers',
      })),
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
  return path.join(DATA, a.folder, 'v1', 'cities', p.file);
}
