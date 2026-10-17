/**
 * namazvakti.com — the Türkiye Takvimi calendar's times, for any of the
 * some 120,000 places the site lists.
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────
 *
 * The more cautious Turkish calendar: Fajr at 19°, Isha at 17°, and a
 * temkin — a margin of eight minutes at Cairo to twenty at Stockholm, set
 * per city from its latitude and height — taken off the morning times and
 * added to the rest. North of about 62° the site publishes no times.
 * Turkey's directorate used it until 1983, and the calendar many Turkish
 * communities hang on the wall still does. The Diyanet method this app
 * already has (method 13) is what replaced it.
 *
 * ── HOW IT IS SERVED ──────────────────────────────────────────────────
 *
 * The site has no API and no way to find a place by coordinates. So:
 *
 *   1. WHICH CITY. A server-side job (tools/namazvakti-dataset) walks the
 *      site's lists and publishes every city's coordinates as small tiles
 *      on this repository's CDN. The phone fetches the tile it is in (a
 *      5° square — it says nothing finer about where the reader is) and
 *      picks the nearest city.
 *   2. THE YEAR. The phone reads that city's year from Mihrab's own mirror
 *      of the site (tools/namazvakti-dataset/years.ts — the
 *      `data-namazvakti-<year>` release of this repository, the cities in
 *      512 files by id, ~100 kB each) and keeps it. Only when the mirror
 *      does not have the city yet — a new year's first days, a city new to
 *      the site — is the site itself asked, for that one city's file
 *      (October 2026: every table from the repo, the source as a backup —
 *      docs/prayer-times-sources.md). The site is told a city, never
 *      coordinates.
 *   3. OFFLINE / OUT OF REACH. With no file for the day — no network yet,
 *      past the year published, a place no city with times is near — the
 *      calendar's method is computed on the phone, at the city's own point
 *      fitted from a year it holds (`fitNamazvaktiPoint`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpUserAgent } from '../config/httpIdentity';
import { recordServerIndex, type ServerStatus } from '../prayer/dataStatus';
import {
  NAMAZVAKTI_DATASET_BASE_URL,
  NAMAZVAKTI_INDEX_POLL_INTERVAL_MS,
  NAMAZVAKTI_MAX_CITY_KM,
  NAMAZVAKTI_ORIGIN,
  NAMAZVAKTI_REFETCH_AFTER_MS,
  NAMAZVAKTI_RETRY_AFTER_MS,
  NAMAZVAKTI_TILE_TTL_MS,
} from '../config/datasets';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { formatLocalTime } from '../utils/prayerTimes';
import { gunzipSync, strFromU8 } from 'fflate';
import { fromBase64 } from '../sync/secureRandom';
import { mirrorUrl } from '../config/mirrors';
import { namazvaktiBucketAsset, namazvaktiYearTag, unpackYear, type PackedBucket } from './namazvaktiPack';
import { preciseApparentSun } from './preciseSun';
import { ProviderError } from './errors';
import {
  NV_COL,
  nearestNvCity,
  nvTilesAround,
  parseNamazvaktiXml,
  timingsFromRow,
  type NamazvaktiYear,
  type NvCity,
  type NvTileRow,
} from './namazvaktiParser';
import type { PrayerTimesResult } from './types';
import { clockFormatter, placeCivilDay, type PlaceClock } from './locationClock';

const PROVIDER = 'namazvakti';
const TILE_PREFIX = 'namazvakti.tile.v1.';
const CITY_PREFIX = 'namazvakti.city.v1.';
/** Ids of listed cities the site publishes no times for (north of about 62°). */
const NO_TABLE_KEY = 'namazvakti.noTable.v1';

type TileRow = NvTileRow;
type CachedTile = { fetchedAt: number; cities: TileRow[] };

const memTiles = new Map<string, CachedTile>();
const tileInFlight = new Map<string, Promise<CachedTile>>();
const memYears = new Map<number, NamazvaktiYear | null>();
const yearInFlight = new Map<number, Promise<NamazvaktiYear | null>>();
/** City id → when a fetch of its year last failed (ms), so a dead site is not asked on every render. */
const failedAt = new Map<number, number>();
/** Listed cities with no published times — skipped when picking the nearest. */
let noTable: Set<number> | null = null;

/**
 * Has this session given an answer yet?
 *
 * The first answer is somebody looking at an empty screen. With a tile on
 * the phone but the mirror and the site black-holed (a captive portal, a
 * dead uplink), the requests behind it ran their full course — the mirror
 * twice at 20 s, the site twice at 15 s, with the waits between — and the
 * first time came after about 72 s. Until a first answer has been given,
 * every request is one attempt of a few seconds (`QUICK`), and a year that
 * did not come that way is fetched again in the background, with the long
 * timeouts, for the next read.
 */
let sessionAnswered = false;
type Budget = { maxAttempts: number; baseDelayMs: number; timeoutMs: number };
const QUICK: Budget = { maxAttempts: 1, baseDelayMs: 0, timeoutMs: 6000 };
const TILE_BUDGET: Budget = { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 9000 };
const MIRROR_BUDGET: Budget = { maxAttempts: 2, baseDelayMs: 1000, timeoutMs: 20000 };
const SITE_BUDGET: Budget = { maxAttempts: 2, baseDelayMs: 1500, timeoutMs: 15000 };
/** City id → its background refill, after a quick first attempt missed. */
const refillInFlight = new Map<number, Promise<void>>();

async function loadNoTable(): Promise<Set<number>> {
  if (!noTable) noTable = new Set(await readJson<number[]>(NO_TABLE_KEY) ?? []);
  return noTable;
}

async function markNoTable(cityId: number): Promise<void> {
  const set = await loadNoTable();
  set.add(cityId);
  await writeJson(NO_TABLE_KEY, [...set]);
}

/** The site answered for the city, with its head and no days at all. */
class NoTableError extends Error {}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full disk costs a re-download next time, nothing more.
  }
}

/**
 * One tile of the city index: memory, then disk, then the CDN. `offline`
 * reads only what the phone holds, however old (an unknown tile is empty).
 */
/** An empty square is asked again after a day: the index may not have reached it yet. */
const EMPTY_TILE_TTL_MS = 24 * 60 * 60 * 1000;
const tileTtl = (t: CachedTile) => (t.cities.length ? NAMAZVAKTI_TILE_TTL_MS : EMPTY_TILE_TTL_MS);

async function loadTile(key: string, offline = false): Promise<CachedTile> {
  const now = Date.now();
  const mem = memTiles.get(key);
  if (mem && (offline || now - mem.fetchedAt < tileTtl(mem))) return mem;
  if (offline) {
    const disk = await readJson<CachedTile>(`${TILE_PREFIX}${key}`);
    if (disk) memTiles.set(key, disk);
    return disk ?? { fetchedAt: 0, cities: [] };
  }
  const inFlight = tileInFlight.get(key);
  if (inFlight) return inFlight;
  const p = (async () => {
    const disk = mem ?? (await readJson<CachedTile>(`${TILE_PREFIX}${key}`));
    if (disk && now - disk.fetchedAt < tileTtl(disk)) {
      memTiles.set(key, disk);
      return disk;
    }
    try {
      const res = await fetchWithRetry(
        `${NAMAZVAKTI_DATASET_BASE_URL}/tiles/${key}.json`,
        { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
        sessionAnswered ? TILE_BUDGET : QUICK,
      );
      let cities: TileRow[];
      if (res.ok) {
        const body = (await res.json()) as { cities?: unknown };
        cities = Array.isArray(body.cities) ? (body.cities as TileRow[]) : [];
      } else if (res.status === 404) {
        // A square of sea, or one the index has not reached yet:
        // remembered as empty for a day, then asked again.
        cities = [];
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
      const fresh: CachedTile = { fetchedAt: Date.now(), cities };
      memTiles.set(key, fresh);
      await writeJson(`${TILE_PREFIX}${key}`, fresh);
      return fresh;
    } catch {
      // Offline: an old tile is still the right list of cities.
      if (disk) {
        memTiles.set(key, disk);
        return disk;
      }
      throw new ProviderError(PROVIDER, 'network', `City index tile ${key} unavailable.`);
    }
  })();
  tileInFlight.set(key, p);
  try {
    return await p;
  } finally {
    tileInFlight.delete(key);
  }
}

/**
 * The site's nearest city to a point, from the tiles around it.
 *
 * A point near a tile's edge may be nearest a city across it, so the tiles
 * within NAMAZVAKTI_MAX_CITY_KM are read, not just the point's own; in
 * practice that is one or two files, cached for a month.
 */
export async function nearestNamazvaktiCity(
  latitude: number,
  longitude: number,
  offline = false,
): Promise<NvCity | null> {
  const marginDeg = NAMAZVAKTI_MAX_CITY_KM / 111;
  const keys = nvTilesAround(latitude, longitude, marginDeg);
  const rows: TileRow[] = [];
  const skip = await loadNoTable();
  for (const key of keys) {
    const tile = await loadTile(key, offline);
    for (const row of tile.cities) if (!skip.has(row[0])) rows.push(row);
  }
  const best = nearestNvCity(latitude, longitude, rows);
  return best && best.distanceKm <= NAMAZVAKTI_MAX_CITY_KM ? best : null;
}

/**
 * A response's bytes: `arrayBuffer` where it works, else the body as a data
 * URL, as the font store reads it (React Native's has not always had one).
 */
async function bytesOf(res: Response): Promise<Uint8Array> {
  if (typeof res.arrayBuffer === 'function') {
    try {
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      // Fall through to the blob.
    }
  }
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  return fromBase64(base64);
}

/** The city's year from Mihrab's mirror of the site, or null when the mirror does not have it. */
async function fetchMirroredYear(cityId: number, year: number, quick = false): Promise<NamazvaktiYear | null> {
  try {
    const res = await fetchWithRetry(
      mirrorUrl(namazvaktiYearTag(year), namazvaktiBucketAsset(cityId)),
      { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
      quick ? QUICK : MIRROR_BUDGET,
    );
    if (!res.ok) return null;
    const file = JSON.parse(strFromU8(gunzipSync(await bytesOf(res)))) as PackedBucket;
    const packed = file.cities?.[String(cityId)];
    if (!packed) return null;
    // Held from now: its age is the phone's copy's, so it is read again on the phone's schedule.
    return { ...unpackYear(packed, cityId), fetchedAt: new Date().toISOString(), via: 'mirror' };
  } catch {
    return null;
  }
}

/** The city's year: Mihrab's mirror first, the site itself only behind it. */
async function fetchYear(cityId: number, dateKey: string, quick = false): Promise<NamazvaktiYear> {
  const year = /^\d{4}-/.test(dateKey) ? Number(dateKey.slice(0, 4)) : new Date().getFullYear();
  const mirrored = await fetchMirroredYear(cityId, year, quick);
  if (mirrored && (!dateKey || mirrored.days[dateKey])) return mirrored;
  try {
    return await fetchSiteYear(cityId, quick);
  } catch (e) {
    // The site cannot answer either: whatever the mirror had is better than nothing.
    if (mirrored) return mirrored;
    throw e;
  }
}

async function fetchSiteYear(cityId: number, quick = false): Promise<NamazvaktiYear> {
  const res = await fetchWithRetry(
    `${NAMAZVAKTI_ORIGIN}/XML.php?cityID=${cityId}`,
    { headers: { 'User-Agent': httpUserAgent('Islamic prayer app') } },
    quick ? QUICK : SITE_BUDGET,
  );
  if (!res.ok) {
    throw new ProviderError(PROVIDER, 'network', `namazvakti.com answered HTTP ${res.status}.`);
  }
  const xml = await res.text();
  if (/<cityinfo\b/.test(xml) && !/<prayertimes\b/.test(xml)) {
    throw new NoTableError(`namazvakti.com publishes no times for city ${cityId}.`);
  }
  const parsed = parseNamazvaktiXml(xml, new Date().getFullYear());
  if (parsed.cityId !== cityId) {
    throw new ProviderError(PROVIDER, 'shape', `Asked for city ${cityId}, got ${parsed.cityId}.`);
  }
  return { ...parsed, via: 'site' };
}

/**
 * The city's year: memory, then disk, then the site — the site only when
 * the day asked for is not in the copy held (a new year) or the copy is
 * old enough that the site may have corrected it, and never more than
 * once per NAMAZVAKTI_RETRY_AFTER_MS after a failure.
 */
async function loadYear(
  cityId: number,
  dateKey: string,
  offline = false,
): Promise<NamazvaktiYear | null> {
  let held = memYears.get(cityId);
  if (held === undefined) {
    held = await readJson<NamazvaktiYear>(`${CITY_PREFIX}${cityId}`);
    memYears.set(cityId, held);
  }
  if (offline) return held ?? null;
  const age = held ? Date.now() - Date.parse(held.fetchedAt) : Infinity;
  const hasDay = !!held?.days[dateKey];
  const recentlyFailed = Date.now() - (failedAt.get(cityId) ?? 0) < NAMAZVAKTI_RETRY_AFTER_MS;
  const needed = !hasDay && !(held && age < NAMAZVAKTI_RETRY_AFTER_MS);
  const stale = hasDay && age > NAMAZVAKTI_REFETCH_AFTER_MS;
  if ((!needed && !stale) || recentlyFailed) return held ?? null;
  // A background refill is already asking with the long timeouts: what is
  // held answers now (the method is computed for a day it lacks), and the
  // refill lands for the next read.
  if (refillInFlight.has(cityId)) return held ?? null;

  let p = yearInFlight.get(cityId);
  if (!p) {
    const quick = !sessionAnswered;
    p = (async () => {
      try {
        const year = await fetchYear(cityId, dateKey, quick);
        memYears.set(cityId, year);
        failedAt.delete(cityId);
        await writeJson(`${CITY_PREFIX}${cityId}`, year);
        return year;
      } catch (e) {
        if (e instanceof NoTableError) {
          await markNoTable(cityId);
          return null;
        }
        if (quick && !(e instanceof ProviderError)) {
          // The quick first try had no answer in time (a site that answers
          // with an error has answered): the patient one, in the background.
          startRefill(cityId, dateKey);
        } else {
          failedAt.set(cityId, Date.now());
        }
        return held ?? null;
      } finally {
        yearInFlight.delete(cityId);
      }
    })();
    yearInFlight.set(cityId, p);
  }
  // A stale copy that has the day answers now; the refresh lands for the
  // next read. A missing day waits for the site.
  if (stale) return held ?? null;
  return p;
}

/** Fetch a city's year again with the long timeouts, without anyone waiting on it. */
function startRefill(cityId: number, dateKey: string): void {
  if (refillInFlight.has(cityId)) return;
  const p = (async () => {
    try {
      const year = await fetchYear(cityId, dateKey, false);
      memYears.set(cityId, year);
      failedAt.delete(cityId);
      await writeJson(`${CITY_PREFIX}${cityId}`, year);
    } catch (e) {
      if (e instanceof NoTableError) await markNoTable(cityId);
      else failedAt.set(cityId, Date.now());
    }
  })().finally(() => {
    refillInFlight.delete(cityId);
  });
  refillInFlight.set(cityId, p);
}

/**
 * The Türkiye Takvimi calendar's times for one day, as namazvakti.com
 * publishes them for the nearest city.
 *
 * @throws ProviderError when there is no published day to give — no city
 * near enough, the site unreachable with nothing held, or a date outside
 * the year it serves. The caller then computes the method on the phone.
 */
export async function getNamazvaktiTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  school: number;
  /** Only what the phone already holds — for the cache-only readers. */
  offline?: boolean;
  retried?: boolean;
}): Promise<PrayerTimesResult> {
  const offline = params.offline === true;
  if (offline) return namazvaktiTimesFor(params, true);
  try {
    return await namazvaktiTimesFor(params, false);
  } finally {
    // Whatever it was — a published day or a miss the caller computes —
    // the first answer has been given; from now on the network is waited
    // for as long as it takes.
    sessionAnswered = true;
  }
}

async function namazvaktiTimesFor(
  params: Parameters<typeof getNamazvaktiTimes>[0],
  offline: boolean,
): Promise<PrayerTimesResult> {
  const city = await nearestNamazvaktiCity(params.latitude, params.longitude, offline);
  if (!city) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `No namazvakti.com city within ${NAMAZVAKTI_MAX_CITY_KM} km.`,
    );
  }
  const dateKey = formatLocalDate(params.date);
  const year = await loadYear(city.id, dateKey, offline);
  if (!year && noTable?.has(city.id) && !params.retried) {
    // The nearest listed city turned out to have no times: the next one, if near enough.
    return namazvaktiTimesFor({ ...params, retried: true }, offline);
  }
  const row = year?.days[dateKey];
  const timings = row ? timingsFromRow(row, params.school) : null;
  if (!timings) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `No published day for ${city.name} on ${dateKey}.`,
    );
  }
  return { timings, source: year?.via === 'mirror' ? 'cdn' : 'namazvakti' };
}

/**
 * Does the site have times for this place? 'site' when a listed city with
 * published times is near enough, 'no-city' when none is (nothing listed
 * within NAMAZVAKTI_MAX_CITY_KM, or only cities it publishes nothing for —
 * north of about 62°), 'unknown' when the city index cannot be read. With
 * 'no-city' the calendar's method is computed on the phone, and Settings
 * says so — the other regional sources warn the same way.
 */
export type NamazvaktiCoverage = 'site' | 'no-city' | 'unknown';

export async function namazvaktiCoverage(
  latitude: number,
  longitude: number,
  date: Date = new Date(),
): Promise<NamazvaktiCoverage> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let city: NvCity | null;
    try {
      city = await nearestNamazvaktiCity(latitude, longitude);
    } catch {
      return 'unknown';
    }
    if (!city) return 'no-city';
    // Reading the year is what finds a city with no times; the app needs
    // the year anyway, so this costs nothing it would not spend.
    const year = await loadYear(city.id, formatLocalDate(date));
    if (year || !noTable?.has(city.id)) return 'site';
  }
  return 'no-city';
}

// ── STATISTICS ───────────────────────────────────────────────────────

let nextIndexPollAt = 0;

/**
 * Read the city index's `index.json` for the statistics panel, as the other
 * datasets' providers do: when it was built, whether the build was healthy,
 * and how much of the site's city list it has placed so far. The provider
 * itself never needs it — tiles and years carry their own ages — so only
 * the panel calls this, and not more often than every six hours.
 */
export async function pollNamazvaktiIndexNow(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now < nextIndexPollAt) return;
  nextIndexPollAt = now + NAMAZVAKTI_INDEX_POLL_INTERVAL_MS;
  const res = await fetchWithRetry(
    `${NAMAZVAKTI_DATASET_BASE_URL}/index.json`,
    { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
    { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 7000 },
  );
  if (!res.ok) return;
  const idx = (await res.json()) as {
    builtAt?: string;
    serverStatus?: ServerStatus;
    cities?: number;
    located?: number;
  };
  await recordServerIndex(
    'namazvakti',
    {
      builtAt: idx.builtAt ?? null,
      serverStatus: idx.serverStatus,
      citiesListed: typeof idx.cities === 'number' ? idx.cities : null,
      citiesLocated: typeof idx.located === 'number' ? idx.located : null,
    },
    new Date(now + NAMAZVAKTI_INDEX_POLL_INTERVAL_MS),
  );
}

/**
 * What the phone holds for a place, without asking anything: the nearest
 * listed city with times, how far it is, and when its year was fetched
 * (null when none is held yet). For the statistics panel.
 */
export async function namazvaktiHeld(
  latitude: number,
  longitude: number,
): Promise<{ city: NvCity; fetchedAt: string | null } | null> {
  const city = await nearestNamazvaktiCity(latitude, longitude, true).catch(() => null);
  if (!city) return null;
  const year = memYears.get(city.id) ?? (await readJson<NamazvaktiYear>(`${CITY_PREFIX}${city.id}`));
  return { city, fetchedAt: year?.fetchedAt ?? null };
}

// ── ON THE PHONE ─────────────────────────────────────────────────────

/** The city height the site gives almost every city (a few large ones get 500). */
export const NAMAZVAKTI_DEFAULT_HEIGHT_M = 250;

/**
 * How far below the level horizon the calendar takes the city's own horizon,
 * degrees, from its height. The site gives every city one of two heights,
 * 250 m or 500 m, and its tables put that horizon at 1.462° and 1.719°
 * (54 cities from 42°S to 47°N, every day of 2026 —
 * tools/verify-methods/nv-resid.py); between and beyond, the line through
 * the two in √height.
 */
function horizonDepth(heightM: number): number {
  return 0.8416 + 0.03924 * Math.sqrt(Math.max(0, heightM));
}

/**
 * The calendar's temkin, exact: minutes for the sun, on the summer solstice
 * at this latitude, to go from the level horizon down to the city's own
 * horizon (`horizonDepth`). 7.7 at Cairo, 10.8 at Istanbul (500 m), 12.6 at
 * Cologne, 19.6 at Stockholm. Capped at 62°, beyond which the site
 * publishes no times.
 */
/** The solstice the temkin is measured on: the declination its tables fit best (to ±0.02°). */
const SOLSTICE_DECLINATION = 23.38;

export function temkinExact(latitude: number, heightM = NAMAZVAKTI_DEFAULT_HEIGHT_M): number {
  const rad = Math.PI / 180;
  const phi = Math.min(Math.abs(latitude), 62) * rad;
  const dec = SOLSTICE_DECLINATION * rad;
  const hourAngle = (alt: number) =>
    Math.acos(
      Math.max(-1, Math.min(1, (Math.sin(alt * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)))),
    );
  return ((hourAngle(-horizonDepth(heightM)) - hourAngle(0)) / rad) * 4;
}

/** The calendar's temkin at a latitude and city height, in whole minutes. */
export function temkinMinutes(latitude: number, heightM = NAMAZVAKTI_DEFAULT_HEIGHT_M): number {
  return Math.ceil(temkinExact(latitude, heightM));
}

/**
 * Does the sun get `angle` degrees below the horizon at all in the night
 * that ends on the morning of `day`?
 *
 * The site counts the night as reaching when the sun's lowest point does
 * with the declination of either of two moments: the local solar midnight
 * that begins the day, or 12:00 UT of the day. That rule, and no single
 * moment, reproduces the first and last held nights of all 61 cities above
 * 48° in the saved files (spring and autumn, Cologne to Oslo, London to
 * the Russian Far East) — the midnight alone gets the spring right and
 * resumes the autumn a night late.
 */
function reachesAngle(latitude: number, longitude: number, day: Date, angle: number): boolean {
  const rad = Math.PI / 180;
  const base = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - Date.UTC(2000, 0, 1, 12);
  const decAt = (ms: number) => preciseApparentSun(ms / 86_400_000).dec / rad;
  const lowest = (dec: number) => Math.abs(latitude + dec) - 90;
  const midnight = lowest(decAt(base - (longitude / 15) * 3_600_000));
  const noonUT = lowest(decAt(base + 12 * 3_600_000));
  return Math.min(midnight, noonUT) <= -angle;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * The day whose night times stand for this one. Where the sun no longer
 * gets to 19° below the horizon — Cologne from late May to late July —
 * the site holds the İmsâk, Sabâh and Isha of the last night it did, all
 * three together and unchanged until 19° comes back (its rows carry a `*`
 * meanwhile). So: this day, or the last one before it that reaches 19°.
 */
function nightTimesDay(latitude: number, longitude: number, day: Date): Date {
  if (reachesAngle(latitude, longitude, day, 19)) return day;
  for (let i = 1; i <= 200; i++) {
    const d = addDays(day, -i);
    if (reachesAngle(latitude, longitude, d, 19)) return d;
  }
  return day;
}

/**
 * The sun's events for a civil date at a point, minutes past 00:00 UT:
 * the precise apparent sun (`preciseApparentSun`) at each event's own
 * moment, iterated. Meeus's shorter series drifts about a second over the
 * year against the site's sun, which alone cost one time in fifty; the
 * precise one does not.
 */
function sunEvents(
  latitude: number,
  longitude: number,
  day: Date,
  sun: (d: number) => { dec: number; eot: number } = preciseApparentSun,
) {
  const rad = Math.PI / 180;
  const d0 = (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - Date.UTC(2000, 0, 1)) / 86_400_000 - 0.5;
  const at = (t: number) => sun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < 3; i++) noon = 720 - 4 * longitude - at(noon).eot;
  // Asr's shadow is measured from the noon sun's declination (the hour angle
  // still from the sun at Asr itself): a third fewer Asr misses than the
  // declination at Asr.
  const noonDec = at(noon).dec;
  const sp = Math.sin(latitude * rad);
  const cp = Math.cos(latitude * rad);
  const event = (altitudeOf: (dec: number) => number, sign: 1 | -1, start: number) => {
    let t = start;
    for (let i = 0; i < 3; i++) {
      const { dec, eot } = at(t);
      const c = (Math.sin(altitudeOf(dec) * rad) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
      t = 720 - 4 * longitude - eot + (sign * 4 * Math.acos(Math.max(-1, Math.min(1, c)))) / rad;
    }
    return t;
  };
  const level = (a: number) => () => a;
  const asr = (shadow: number) => () =>
    Math.atan(1 / (shadow + Math.tan(Math.abs(latitude * rad - noonDec)))) / rad;
  return {
    fajr19: () => event(level(-19), -1, noon - 420),
    fajr18: () => event(level(-18), -1, noon - 420),
    sunrise: () => event(level(0), -1, noon - 360),
    noon,
    asr: (shadow: number) => event(asr(shadow), 1, noon + 200),
    sunset: () => event(level(0), 1, noon + 360),
    isha17: () => event(level(-17), 1, noon + 420),
  };
}

/**
 * The calendar's method computed on the phone, from the rules its own
 * tables follow (54 cities' whole 2026, from 42°S to 60°N —
 * tools/verify-methods/nv-resid.py), with the city's temkin T (exact,
 * `temkinExact`):
 *
 *   İmsâk   the sun at 19°, less T, rounded down
 *   Sabâh   the sun at 18°, rounded up — the time the calendar prints for Fajr
 *   Sunrise the sun at the level horizon (0°), less T and two minutes
 *   Dhuhr, Asr, Isha (17°)   plus T
 *   Maghrib the sun at 0°, plus T and two minutes
 *
 * Everything but İmsâk rounded up. Where the sun no longer gets to 19° — a
 * northern summer — the night times of the last night it did are held, as
 * the site does. The site's files give a city's point only to the
 * arc-minute, and it computes with a finer one: at the listed point the
 * site's minute about 94 % of the time (the rest one minute off); at the
 * point fitted from a year it published (`fitNamazvaktiPoint`, with the
 * city's `temkin`) all but about one time in a thousand — 118 saved cities
 * from 42°S to 60°N, 301,392 times: 46 with none off, 102 with two or
 * fewer in the year, and five south of Stockholm that fit no point.
 */
export function computeNamazvaktiMethodTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  school: number;
  /** The nearest listed city's height, when known. */
  heightM?: number;
  /** The city's own temkin, when fitted from its year (`fitNamazvaktiPoint`). */
  temkin?: number;
  /**
   * The city's clock, where known: the day is the city's own and the times
   * are written on it (`locationClock.ts`), as for the national sources.
   * Without it, the phone's day and clock, as before.
   */
  placeClock?: PlaceClock;
}): PrayerTimesResult {
  const height = params.heightM ?? NAMAZVAKTI_DEFAULT_HEIGHT_M;
  const T = params.temkin ?? temkinExact(params.latitude, height);
  const { latitude, longitude } = params;
  const civil = placeCivilDay(params.date, params.placeClock);
  const day = new Date(civil.y, civil.m, civil.d);
  const format = clockFormatter(params.placeClock);
  const instant = (on: Date, minutes: number, round: 'up' | 'down') => {
    const m = round === 'up' ? Math.ceil(minutes - 1e-9) : Math.floor(minutes + 1e-9);
    return format(new Date(Date.UTC(on.getFullYear(), on.getMonth(), on.getDate()) + m * 60_000));
  };
  const today = sunEvents(latitude, longitude, day);
  const night = nightTimesDay(latitude, longitude, day);
  const nightSun = night === day ? today : sunEvents(latitude, longitude, night);
  // Isha falls in the night that begins this evening and ends tomorrow, so
  // it is tomorrow's night that decides — held from the evening before the
  // last night that reached 19°.
  const tomorrow = addDays(day, 1);
  const ishaNight = nightTimesDay(latitude, longitude, tomorrow);
  const ishaDay = ishaNight === tomorrow ? day : addDays(ishaNight, -1);
  const ishaSun = ishaDay === day ? today : sunEvents(latitude, longitude, ishaDay);
  return {
    timings: {
      Imsak: instant(night, nightSun.fajr19() - T, 'down'),
      Fajr: instant(night, nightSun.fajr18(), 'up'),
      Sunrise: instant(day, today.sunrise() - T - 2, 'up'),
      Dhuhr: instant(day, today.noon + T, 'up'),
      Asr: instant(day, today.asr(params.school === 1 ? 2 : 1) + T, 'up'),
      Maghrib: instant(day, today.sunset() + T + 2, 'up'),
      Isha: instant(ishaDay, ishaSun.isha17() + T, 'up'),
    },
    source: 'local',
  };
}

/** A city's point as the site computes it, and its temkin. */
export type NamazvaktiFittedPoint = { lat: number; lon: number; temkin: number; misses: number; checked: number };

/**
 * The site's own point for a city, and its temkin, from a year it published.
 *
 * The site's files give a city's latitude and longitude only to the
 * arc-minute (truncated), and it computes with finer ones; its temkin also
 * strays from the solstice formula by a few hundredths of a minute. At the
 * truncated point a twentieth of its times come out a minute off; at the
 * fitted one almost none (about one a year per city, against JPL's sun).
 *
 * Every published time is a band its exact time must fall in. With the
 * latitude fixed, a longitude change moves every time by the same amount
 * a, and the temkin moves the times that carry it by ±T — so for each
 * candidate latitude and temkin the best a is the deepest overlap of the
 * bands, found on a grid. Whole hours (and half and quarter hours) of
 * clock offset fall away: each band is taken modulo a quarter of an hour.
 */
export function fitNamazvaktiPoint(
  year: Pick<NamazvaktiYear, 'days'>,
  city: { lat: number; lon: number; heightM?: number },
): NamazvaktiFittedPoint | null {
  const keys = Object.keys(year.days).sort();
  if (keys.length < 30) return null;
  const T0 = temkinExact(city.lat, city.heightM ?? NAMAZVAKTI_DEFAULT_HEIGHT_M);
  // The sun at each 0h UT across the year, interpolated (quadratically) between.
  const first = new Date(`${keys[0]}T00:00:00Z`);
  const dFirst = (first.getTime() - Date.UTC(2000, 0, 1)) / 86_400_000 - 0.5 - 2;
  const samples: { dec: number; eot: number }[] = [];
  const last = new Date(`${keys[keys.length - 1]}T00:00:00Z`);
  const span = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 5;
  for (let k = 0; k <= span; k++) samples.push(preciseApparentSun(dFirst + k));
  const sun = (d: number) => {
    const x = d - dFirst;
    const k = Math.min(samples.length - 2, Math.max(1, Math.round(x)));
    const u = x - k;
    const q = (f: (s: { dec: number; eot: number }) => number) => {
      const a = f(samples[k - 1]), b = f(samples[k]), c = f(samples[k + 1]);
      return b + (u * (c - a)) / 2 + (u * u * (c - 2 * b + a)) / 2;
    };
    return { dec: q(s => s.dec), eot: q(s => s.eot) };
  };
  // What each column is: its time from the events, how T enters (s), its fixed add, its rounding.
  const COLS: { col: number; s: number; add: number; up: boolean; night: boolean; ev: (e: ReturnType<typeof sunEvents>) => number }[] = [
    { col: NV_COL.imsak, s: -1, add: 0, up: false, night: true, ev: e => e.fajr19() },
    { col: NV_COL.sabah, s: 0, add: 0, up: true, night: true, ev: e => e.fajr18() },
    { col: NV_COL.sunrise, s: -1, add: -2, up: true, night: false, ev: e => e.sunrise() },
    { col: NV_COL.dhuhr, s: 1, add: 0, up: true, night: false, ev: e => e.noon },
    { col: NV_COL.asr, s: 1, add: 0, up: true, night: false, ev: e => e.asr(1) },
    { col: NV_COL.maghrib, s: 1, add: 2, up: true, night: false, ev: e => e.sunset() },
    { col: NV_COL.isha, s: 1, add: 0, up: true, night: true, ev: e => e.isha17() },
  ];
  const published = keys.map(k => {
    const row = year.days[k];
    return COLS.map(c => {
      const m = /^(\*?)(\d{1,2}):(\d{2})$/.exec((row[c.col] ?? '').trim());
      // Held night times (`*`) are not the day's own.
      if (!m || (m[1] && c.night)) return NaN;
      return Number(m[2]) * 60 + Number(m[3]);
    });
  });
  // A held time repeats the night it was held from: that night counts once more for each day it stands for.
  const weight = published.map(row => row.map(() => 1));
  COLS.forEach((c, j) => {
    let from = -1;
    keys.forEach((k, i) => {
      if (Number.isFinite(published[i][j])) from = i;
      else if (from >= 0 && c.night && (year.days[k][c.col] ?? '').trim().startsWith('*')) weight[from][j]++;
    });
  });
  const days = keys.map(k => {
    const [y, mo, d] = k.split('-').map(Number);
    return new Date(y, mo - 1, d);
  });
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const STEP = 0.0005; // minutes of a
  const SPAN = 0.6;
  const NB = Math.round((2 * SPAN) / STEP) + 1;
  const hist = new Int32Array(NB + 1);
  type Band = { lo: number; s: number; w: number };
  /** The bands of every published time, at a latitude: a + s·dT ∈ [lo, lo + 1). */
  const bandsAt = (lat: number): Band[] => {
    const out: Band[] = [];
    days.forEach((day, i) => {
      const e = sunEvents(lat, city.lon, day, sun);
      COLS.forEach((c, j) => {
        const o = published[i][j];
        const x = c.ev(e);
        if (!Number.isFinite(o) || !Number.isFinite(x)) return;
        // Published minute o: rounded up, o − 1 < x + add + s·T + a + zone ≤ o.
        let r = o - (x + c.add + c.s * T0) - (c.up ? 1 : 0);
        r -= 15 * Math.round(r / 15);
        out.push({ lo: r, s: c.s, w: weight[i][j] });
      });
    });
    return out;
  };
  /** The deepest overlap of the bands over a, at a temkin change dT: [count, a]. */
  const bestA = (bands: Band[], dT: number): [number, number] => {
    hist.fill(0);
    for (const b of bands) {
      const lo = b.lo - b.s * dT;
      const i0 = Math.max(0, Math.ceil((lo + SPAN) / STEP - 1e-9));
      const i1 = Math.min(NB, Math.ceil((lo + 1 + SPAN) / STEP - 1e-9));
      if (i0 >= i1) continue;
      hist[i0] += b.w;
      hist[i1] -= b.w;
    }
    let run = 0, best = -1, bi = 0, bj = 0;
    for (let i = 0; i < NB; i++) {
      run += hist[i];
      if (run > best) { best = run; bi = bj = i; } else if (run === best && bj === i - 1) bj = i;
    }
    return [best, ((bi + bj) / 2) * STEP - SPAN];
  };
  let best = { count: -1, dLat: 0, dT: 0, a: 0, n: 0 };
  const tryLat = (dLat: number, dTs: number[]) => {
    const bands = bandsAt(city.lat + sign(city.lat) * dLat);
    const n = bands.reduce((s, b) => s + b.w, 0);
    for (const dT of dTs) {
      const [count, a] = bestA(bands, dT);
      if (count > best.count) best = { count, dLat, dT, a, n };
    }
  };
  const range = (lo: number, hi: number, step: number) => {
    const out: number[] = [];
    for (let v = lo; v <= hi + 1e-12; v += step) out.push(v);
    return out;
  };
  // Coarse: the truncation box (0 to 1′ from the zero side), T within ±0.06.
  for (const dLat of range(0, 1 / 60, 0.1 / 60)) tryLat(dLat, range(-0.06, 0.06, 0.005));
  // Fine, around the best.
  const c0 = best;
  for (const dLat of range(c0.dLat - 0.1 / 60, c0.dLat + 0.1 / 60, 0.01 / 60)) {
    tryLat(dLat, range(c0.dT - 0.005, c0.dT + 0.005, 0.0005));
  }
  return {
    lat: city.lat + sign(city.lat) * best.dLat,
    // a = −4·Δlon (minutes per degree), the band offsets carry the times' shift.
    lon: city.lon - best.a / 4,
    temkin: T0 + best.dT,
    misses: best.n - best.count,
    checked: best.n,
  };
}

/** City id → its fitted point (null: no year held, or none that fits). */
const memFits = new Map<number, NamazvaktiFittedPoint | null>();

/**
 * The site's own point for a listed city, fitted from the year the phone
 * holds for it (`fitNamazvaktiPoint`), or null when it holds none. A fit
 * that leaves more than one time in a hundred off is not used. Kept for
 * the session: the point does not change from year to year.
 */
export async function namazvaktiCityPoint(city: NvCity): Promise<NamazvaktiFittedPoint | null> {
  if (memFits.has(city.id)) return memFits.get(city.id)!;
  const year = await loadYear(city.id, '', true).catch(() => null);
  const fit = year ? fitNamazvaktiPoint(year, city) : null;
  const usable = fit && fit.misses <= 0.01 * fit.checked ? fit : null;
  if (year) memFits.set(city.id, usable);
  return usable;
}

/** Drop what is held for the nearest city and fetch its year again. */
export async function refetchNamazvaktiNow(latitude: number, longitude: number): Promise<void> {
  const city = await nearestNamazvaktiCity(latitude, longitude).catch(() => null);
  if (!city) return;
  memYears.delete(city.id);
  memFits.delete(city.id);
  failedAt.delete(city.id);
  try {
    await AsyncStorage.removeItem(`${CITY_PREFIX}${city.id}`);
  } catch {
    // Replaced by the fetch below either way.
  }
  await loadYear(city.id, formatLocalDate(new Date()));
}

/** Test seam. */
export function _resetNamazvaktiForTests(): void {
  memTiles.clear();
  tileInFlight.clear();
  memYears.clear();
  memFits.clear();
  yearInFlight.clear();
  failedAt.clear();
  noTable = null;
  nextIndexPollAt = 0;
  sessionAnswered = false;
  refillInFlight.clear();
}

/** Tests: wait for any background refill. */
export async function _settleNamazvaktiRefillsForTests(): Promise<void> {
  await Promise.all([...refillInFlight.values()]);
}
