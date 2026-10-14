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
 *   2. THE YEAR. The phone then asks the site itself for that city's year
 *      — one file, about 55 kB, once a year — and keeps it. The site is
 *      told a city, never coordinates.
 *   3. OFFLINE / OUT OF REACH. With no file for the day — no network yet,
 *      past the year the site serves, a place no city with times is near —
 *      the calendar's method is computed on the phone (19° / 17° and the
 *      temkin), within a minute or two of the site.
 *
 * Mirroring the TIMES, the way Sweden's dataset does, was not an option:
 * a year for every city is gigabytes. Every phone asking for its own one
 * file is a far lighter load on the site than one job asking for all.
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
import { meeusApparentSun } from './moroccoMethod';
import { ProviderError } from './errors';
import {
  nearestNvCity,
  nvTilesAround,
  parseNamazvaktiXml,
  timingsFromRow,
  type NamazvaktiYear,
  type NvCity,
  type NvTileRow,
} from './namazvaktiParser';
import type { PrayerTimesResult } from './types';

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
        { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 9000 },
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

async function fetchYear(cityId: number): Promise<NamazvaktiYear> {
  const res = await fetchWithRetry(
    `${NAMAZVAKTI_ORIGIN}/XML.php?cityID=${cityId}`,
    { headers: { 'User-Agent': httpUserAgent('Islamic prayer app') } },
    { maxAttempts: 2, baseDelayMs: 1500, timeoutMs: 15000 },
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
  return parsed;
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

  let p = yearInFlight.get(cityId);
  if (!p) {
    p = (async () => {
      try {
        const year = await fetchYear(cityId);
        memYears.set(cityId, year);
        failedAt.delete(cityId);
        await writeJson(`${CITY_PREFIX}${cityId}`, year);
        return year;
      } catch (e) {
        if (e instanceof NoTableError) {
          await markNoTable(cityId);
          return null;
        }
        failedAt.set(cityId, Date.now());
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
    return getNamazvaktiTimes({ ...params, retried: true });
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
  return { timings, source: 'namazvakti' };
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
 * Solar declination at the night’s lowest sun, degrees (the almanac’s low-precision
 * formula, good to about 0.01°). Precise enough to find the very night the
 * sun stops reaching 19° — a cruder sine curve picked the wrong night at
 * Stockholm and held a time half an hour off for four months.
 */
function declination(day: Date, longitude: number): number {
  const rad = Math.PI / 180;
  // At the night's lowest sun — local solar midnight that begins the day.
  const n =
    (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - (longitude / 15) * 3_600_000 - Date.UTC(2000, 0, 1, 12)) /
    86_400_000;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const epsilon = (23.439 - 0.0000004 * n) * rad;
  return Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / rad;
}

/** Does the sun get `angle` degrees below the horizon at all, that night? */
function reachesAngle(latitude: number, longitude: number, day: Date, angle: number): boolean {
  const lowest = Math.abs(latitude + declination(day, longitude)) - 90;
  return lowest <= -angle;
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
 * Meeus's apparent sun at each event's own moment, iterated.
 */
function sunEvents(latitude: number, longitude: number, day: Date) {
  const rad = Math.PI / 180;
  const d0 = (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - Date.UTC(2000, 0, 1)) / 86_400_000 - 0.5;
  const at = (t: number) => meeusApparentSun(d0 + t / 1440);
  let noon = 720 - 4 * longitude;
  for (let i = 0; i < 3; i++) noon = 720 - 4 * longitude - at(noon).eot;
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
  const asr = (shadow: number) => (dec: number) =>
    Math.atan(1 / (shadow + Math.tan(Math.abs(latitude * rad - dec)))) / rad;
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
 * the site does. At the city's own point the site's minute about 95 % of
 * the time and the rest one minute off; the site's files give a city's
 * point only to the arc-minute, and it computes with a finer one.
 */
export function computeNamazvaktiMethodTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  school: number;
  /** The nearest listed city's height, when known. */
  heightM?: number;
}): PrayerTimesResult {
  const height = params.heightM ?? NAMAZVAKTI_DEFAULT_HEIGHT_M;
  const T = temkinExact(params.latitude, height);
  const { latitude, longitude } = params;
  const day = new Date(params.date.getFullYear(), params.date.getMonth(), params.date.getDate());
  const instant = (on: Date, minutes: number, round: 'up' | 'down') => {
    const m = round === 'up' ? Math.ceil(minutes - 1e-9) : Math.floor(minutes + 1e-9);
    return formatLocalTime(new Date(Date.UTC(on.getFullYear(), on.getMonth(), on.getDate()) + m * 60_000));
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

/** Drop what is held for the nearest city and fetch its year again. */
export async function refetchNamazvaktiNow(latitude: number, longitude: number): Promise<void> {
  const city = await nearestNamazvaktiCity(latitude, longitude).catch(() => null);
  if (!city) return;
  memYears.delete(city.id);
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
  yearInFlight.clear();
  failedAt.clear();
  noTable = null;
  nextIndexPollAt = 0;
}
