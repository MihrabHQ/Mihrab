/**
 * namazvakti.com — the pure half: the site's yearly XML in, a day's times
 * out, and the tile arithmetic the city lookup uses. No network, no storage;
 * `namazvakti.ts` does those.
 *
 * ── THE FILE ──────────────────────────────────────────────────────────
 *
 * `XML.php?cityID=N` is one city's year: a `<cityinfo>` root (name,
 * coordinates, height) and one `<prayertimes>` row per day, from 31
 * December of the year before to 2 January of the year after, each row
 * fourteen tab-separated clock times and nothing to say which is which.
 * Matched against the site's own page for the same city and day, they are:
 *
 *    0 İmsâk            the fast begins — Fajr's first moment (19°, less the temkin)
 *    1 Sabâh            the time the calendar prints for praying Fajr
 *    2 Güneş            sunrise
 *    3 İşrâk            the end of the sunrise karâhat
 *    4 Kerâhat          the zawāl karâhat begins
 *    5 Öğle             Dhuhr
 *    6 İkindi           Asr — first shadow (the two imams, the other madhhabs)
 *    7 Asr-ı sânî       Asr — second shadow (Imam Abû Hanîfa)
 *    8 İsfirâr          the sun yellows
 *    9 Akşam            Maghrib
 *   10 İştibâk          the stars are out
 *   11 Yatsı            Isha (17°)
 *   12 İşâ-ı sânî       Isha (19°, Imam Abû Hanîfa)
 *   13 Kıble saati      the hour the sun stands over the qibla
 *
 * A time may carry a leading `*` where the sun does not reach the angle
 * (high latitudes in summer) and the site has estimated it; the estimate is
 * the site's answer and is used as one. A `-` is a time the site does not
 * give at all — in practice only the second Isha, which the app does not
 * read — and a day missing a time the app needs is treated as missing.
 */
import type { TimingsMap } from '../types/prayer';

export const NV_COLUMNS = 14;
export const NV_COL = {
  imsak: 0,
  sabah: 1,
  sunrise: 2,
  dhuhr: 5,
  asr: 6,
  asrSani: 7,
  maghrib: 9,
  isha: 11,
} as const;

export type NamazvaktiYear = {
  cityId: number;
  /** As the site writes it (Turkish spelling), for the statistics panel. */
  city: string;
  /** The calendar year the file is for. */
  year: number;
  /** ISO — when this copy was fetched. */
  fetchedAt: string;
  /** YYYY-MM-DD → the fourteen columns, as published. */
  days: Record<string, string[]>;
  /** Where the phone got it: Mihrab's mirror, or the site itself (absent for a copy held before October 2026). */
  via?: 'mirror' | 'site';
  /**
   * The phone's copy only: calendar year → when it was last asked for
   * (ISO), so a year neither the mirror nor the site has yet is not asked
   * for again on every read (`loadYear`).
   */
  askedFor?: Record<string, string>;
};

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Parse one city's year. `year` is the year the file is for — the site does
 * not say, and serves the current one; the caller passes the year of the
 * date it fetched for. (At the turn of the year a file a day out of step is
 * harmless for the days on either side of it: 1 January's times differ from
 * one year to the next by seconds.)
 *
 * @throws Error when the file is not a namazvakti year — so a changed
 * format, an error page or a truncated download is never served as times.
 */
export function parseNamazvaktiXml(xml: string, fallbackYear: number, fetchedAt = new Date().toISOString()): NamazvaktiYear {
  // The file says which year it is (`<?xml …?><!--2026-->`). The phone's
  // year is only a guess at it: a file fetched on 31 December for the
  // year about to begin would be filed a year early.
  const stamped = /^\s*(?:<\?xml[^>]*\?>)?\s*<!--\s*(\d{4})\s*-->/.exec(xml);
  const year = stamped ? Number(stamped[1]) : fallbackYear;
  const root = /<cityinfo\b[^>]*>/.exec(xml);
  if (!root) throw new Error('namazvakti: no <cityinfo> in the response');
  const cityId = Number(attr(root[0], 'ID'));
  if (!(cityId > 0)) throw new Error('namazvakti: <cityinfo> has no ID');
  const days: Record<string, string[]> = {};
  const re = /<prayertimes\s+dayofyear="(\d+)"\s+day="(\d+)"\s+month="(\d+)"\s*>([^<]*)<\/prayertimes>/g;
  let rows = 0;
  for (const m of xml.matchAll(re)) {
    const doy = Number(m[1]);
    const day = Number(m[2]);
    const month = Number(m[3]);
    const cols = m[4].split('\t').map(s => s.trim()).filter(s => s !== '');
    if (cols.length < NV_COLUMNS) continue;
    // Day 0 is 31 December of the year before; the last two rows are the
    // first days of the year after.
    const y = doy === 0 ? year - 1 : month === 1 && doy > 300 ? year + 1 : year;
    days[`${y}-${pad(month)}-${pad(day)}`] = cols.slice(0, NV_COLUMNS);
    rows++;
  }
  if (rows < 360) throw new Error(`namazvakti: only ${rows} days in the file`);
  return { cityId, city: attr(root[0], 'cityNameTR') ?? '', year, fetchedAt, days };
}

/** "6:14" / "*0:22" → "06:14" / "00:22"; null for "-" or anything unreadable. */
export function clockOf(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^\*?(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${m[2]}`;
}

/**
 * The app's times for one published day.
 *
 * Fajr is the Sabâh column — the time the calendar prints for the prayer,
 * and what a reader of it prays at — and Imsak the İmsâk column, where the
 * fast begins. Asr is the first-shadow time unless the reader has chosen
 * the Hanafi Asr, which is the calendar's Asr-ı sânî. Isha is the
 * calendar's Yatsı.
 *
 * @returns null when a needed time is absent from the day.
 */
export function timingsFromRow(cols: string[], school: number): TimingsMap | null {
  const get = (i: number) => clockOf(cols[i]);
  const t = {
    Imsak: get(NV_COL.imsak),
    Fajr: get(NV_COL.sabah),
    Sunrise: get(NV_COL.sunrise),
    Dhuhr: get(NV_COL.dhuhr),
    Asr: get(school === 1 ? NV_COL.asrSani : NV_COL.asr),
    Maghrib: get(NV_COL.maghrib),
    Isha: get(NV_COL.isha),
  };
  if (Object.values(t).some(v => v == null)) return null;
  return t as TimingsMap;
}

/**
 * The tile a point falls in — the same function as the builder's
 * (tools/namazvakti-dataset/parse.ts), held equal by a test. Tiles are
 * TILE_DEG on a side, keyed by their south-west corner.
 */
export const NV_TILE_DEG = 5;
export function nvTileKey(lat: number, lon: number): string {
  const la = Math.floor(Math.max(-90, Math.min(89.999, lat)) / NV_TILE_DEG) * NV_TILE_DEG;
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  const lo = Math.floor(wrapped / NV_TILE_DEG) * NV_TILE_DEG;
  return `${la}_${lo}`;
}

/** The tiles within `marginDeg` of a point: its own first, then any neighbour the margin reaches. */
export function nvTilesAround(lat: number, lon: number, marginDeg: number): string[] {
  const keys = [nvTileKey(lat, lon)];
  for (const dLat of [-marginDeg, 0, marginDeg]) {
    for (const dLon of [-marginDeg, 0, marginDeg]) {
      const k = nvTileKey(Math.max(-90, Math.min(89.999, lat + dLat)), lon + dLon);
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** A tile's row: [id, lat, lon, name], and the city's height in metres when it is not 250. */
export type NvTileRow = readonly [number, number, number, string, number?];

export type NvCity = { id: number; lat: number; lon: number; name: string; heightM: number; distanceKm: number };

/** The nearest of the cities in some tiles' rows. */
export function nearestNvCity(lat: number, lon: number, rows: readonly NvTileRow[]): NvCity | null {
  let best: NvCity | null = null;
  for (const [id, cLat, cLon, name, height] of rows) {
    const d = distanceKm(lat, lon, cLat, cLon);
    if (!best || d < best.distanceKm) {
      best = { id, lat: cLat, lon: cLon, name, heightM: height ?? 250, distanceKm: d };
    }
  }
  return best;
}
