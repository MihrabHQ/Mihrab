/**
 * The compact form namazvakti.com's years take in Mihrab's own mirror
 * (`tools/namazvakti-dataset/years.ts`, published as the
 * `data-namazvakti-<year>` release of this repository, the cities spread
 * over NV_PACK_BUCKETS gzipped files by id — `namazvaktiBucketAsset`). The
 * phone reads its city's year from there first, and asks the site only
 * when the mirror cannot answer (docs/prayer-times-sources.md).
 *
 * A year is the eight columns the app reads (İmsâk, Sabâh, sunrise, Dhuhr,
 * Asr, Asr-ı sânî, Maghrib, Isha), each one string with a character a day:
 * the change in minutes from the day before, from an 85-character
 * alphabet for −42…+42; `~hhmm` (minutes of the day, four digits) for the
 * first day and any jump past that (a clock change); `!` before a day the
 * site holds from an earlier night (its `*`); `_` for a day the site gives
 * no time. Decoded, a day is the site's own text again ("6:14", "*0:22"),
 * so everything that reads the site's file reads the mirror unchanged.
 */
import { NV_COL, NV_COLUMNS, type NamazvaktiYear } from './namazvaktiParser';

/** The columns kept, in order. */
export const PACK_COLUMNS = [
  NV_COL.imsak,
  NV_COL.sabah,
  NV_COL.sunrise,
  NV_COL.dhuhr,
  NV_COL.asr,
  NV_COL.asrSani,
  NV_COL.maghrib,
  NV_COL.isha,
] as const;

const ALPHABET = (() => {
  let s = '';
  for (let c = 0x23; c <= 0x7d; c++) {
    const ch = String.fromCharCode(c);
    if (ch !== '\\' && ch !== '_') s += ch;
  }
  return s.slice(0, 85);
})();
const SPAN = (ALPHABET.length - 1) / 2; // 42

/** One city's year in the mirror. */
export type PackedYear = {
  /** The first day, YYYY-MM-DD (31 December of the year before). */
  s: string;
  /** Days. */
  n: number;
  /** The calendar year the site's file is for. */
  y: number;
  /** When the mirror read it from the site, YYYY-MM-DD. */
  f: string;
  /** One string per column of `PACK_COLUMNS`. */
  c: string[];
};

/**
 * The cities are spread over this many files by id, so a file is a few
 * hundred cities (~100 kB gzipped) wherever the city is — the index's
 * tiles run from one city to ten thousand (central Anatolia).
 */
export const NV_PACK_BUCKETS = 512;

/** The mirror file a city's year is in. */
export function namazvaktiBucketAsset(cityId: number): string {
  return `b${String(cityId % NV_PACK_BUCKETS).padStart(3, '0')}.json.gz`;
}

/** The release a year's mirror is published as. */
export function namazvaktiYearTag(year: number): string {
  return `data-namazvakti-${year}`;
}

/** One file of the mirror. */
export type PackedBucket = { v: 1; bucket: number; year: number; builtAt: string; cities: Record<string, PackedYear> };

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDays = (iso: string, n: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000));

function readCell(raw: string | undefined): { star: boolean; min: number } | null {
  const m = /^(\*?)(\d{1,2}):(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return null;
  return { star: m[1] === '*', min: Number(m[2]) * 60 + Number(m[3]) };
}

/** A parsed year (`parseNamazvaktiXml`) in the mirror's form. */
export function packYear(year: Pick<NamazvaktiYear, 'days' | 'year' | 'fetchedAt'>): PackedYear {
  const keys = Object.keys(year.days).sort();
  const s = keys[0];
  const n = Math.round((Date.parse(`${keys[keys.length - 1]}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000) + 1;
  const c = PACK_COLUMNS.map(col => {
    let out = '';
    let prev: number | null = null;
    for (let i = 0; i < n; i++) {
      const cell = readCell(year.days[addDays(s, i)]?.[col]);
      if (!cell) {
        out += '_';
        continue;
      }
      if (cell.star) out += '!';
      const d = prev == null ? NaN : cell.min - prev;
      out += Number.isFinite(d) && Math.abs(d) <= SPAN ? ALPHABET[d + SPAN] : `~${String(cell.min).padStart(4, '0')}`;
      prev = cell.min;
    }
    return out;
  });
  return { s, n, y: year.year, f: year.fetchedAt.slice(0, 10), c };
}

/** The mirror's form back to the site's: date → the fourteen columns (those not kept empty). */
export function unpackYear(p: PackedYear, cityId: number, city = ''): NamazvaktiYear {
  const days: Record<string, string[]> = {};
  for (let i = 0; i < p.n; i++) days[addDays(p.s, i)] = new Array<string>(NV_COLUMNS).fill('');
  PACK_COLUMNS.forEach((col, k) => {
    const str = p.c[k] ?? '';
    let prev = 0;
    let day = 0;
    for (let i = 0; i < str.length && day < p.n; ) {
      const key = addDays(p.s, day);
      if (str[i] === '_') {
        i++;
        day++;
        continue;
      }
      let star = false;
      if (str[i] === '!') {
        star = true;
        i++;
      }
      let min: number;
      if (str[i] === '~') {
        min = Number(str.slice(i + 1, i + 5));
        i += 5;
      } else {
        min = prev + ALPHABET.indexOf(str[i]) - SPAN;
        i++;
      }
      prev = min;
      days[key][col] = `${star ? '*' : ''}${Math.floor(min / 60)}:${pad2(min % 60)}`;
      day++;
    }
  });
  return { cityId, city, year: p.y, fetchedAt: `${p.f}T00:00:00.000Z`, days };
}
