/**
 * namazvakti.com — the Türkiye Takvimi calendar's times, for any of the
 * hundred thousand places the site publishes.
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────
 *
 * The more cautious Turkish calendar: Fajr at 19°, Isha at 17°, and a
 * temkin — a margin of about ten minutes, set per city from its latitude
 * and highest point — taken off the morning times and added to the rest.
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
 *      past the year the site serves, a place no published city is near —
 *      the calendar's method is computed on the phone (19° / 17° and the
 *      temkin), within a minute or two of the site.
 *
 * Mirroring the TIMES, the way Sweden's dataset does, was not an option:
 * a year for every city is gigabytes. Every phone asking for its own one
 * file is a far lighter load on the site than one job asking for all.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CalculationMethod,
  type CalculationParameters,
  Coordinates,
  Madhab,
  PrayerTimes,
} from 'adhan';
import { httpUserAgent } from '../config/httpIdentity';
import {
  NAMAZVAKTI_DATASET_BASE_URL,
  NAMAZVAKTI_MAX_CITY_KM,
  NAMAZVAKTI_ORIGIN,
  NAMAZVAKTI_REFETCH_AFTER_MS,
  NAMAZVAKTI_RETRY_AFTER_MS,
  NAMAZVAKTI_TILE_TTL_MS,
} from '../config/datasets';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { formatLocalTime } from '../utils/prayerTimes';
import { computedLatitude } from './localAdhan';
import { ProviderError } from './errors';
import {
  nearestNvCity,
  nvTilesAround,
  parseNamazvaktiXml,
  timingsFromRow,
  type NamazvaktiYear,
  type NvCity,
} from './namazvaktiParser';
import type { PrayerTimesResult } from './types';

const PROVIDER = 'namazvakti';
const TILE_PREFIX = 'namazvakti.tile.v1.';
const CITY_PREFIX = 'namazvakti.city.v1.';

type TileRow = [number, number, number, string];
type CachedTile = { fetchedAt: number; cities: TileRow[] };

const memTiles = new Map<string, CachedTile>();
const tileInFlight = new Map<string, Promise<CachedTile>>();
const memYears = new Map<number, NamazvaktiYear | null>();
const yearInFlight = new Map<number, Promise<NamazvaktiYear | null>>();
/** City id → when a fetch of its year last failed (ms), so a dead site is not asked on every render. */
const failedAt = new Map<number, number>();

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
async function loadTile(key: string, offline = false): Promise<CachedTile> {
  const now = Date.now();
  const mem = memTiles.get(key);
  if (mem && (offline || now - mem.fetchedAt < NAMAZVAKTI_TILE_TTL_MS)) return mem;
  if (offline) {
    const disk = await readJson<CachedTile>(`${TILE_PREFIX}${key}`);
    if (disk) memTiles.set(key, disk);
    return disk ?? { fetchedAt: 0, cities: [] };
  }
  const inFlight = tileInFlight.get(key);
  if (inFlight) return inFlight;
  const p = (async () => {
    const disk = mem ?? (await readJson<CachedTile>(`${TILE_PREFIX}${key}`));
    if (disk && now - disk.fetchedAt < NAMAZVAKTI_TILE_TTL_MS) {
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
        // remembered as empty, and asked again when it ages out.
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
  for (const key of keys) {
    const tile = await loadTile(key, offline);
    rows.push(...tile.cities);
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
  const parsed = parseNamazvaktiXml(await res.text(), new Date().getFullYear());
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
      } catch {
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

// ── ON THE PHONE ─────────────────────────────────────────────────────

/**
 * The temkin the calendar uses at a latitude, in minutes. The site sets
 * it per city from the latitude and the city's highest point — ten
 * minutes at Istanbul's 41° and its 500 m, twelve or thirteen at
 * Cologne's 51° — and it grows with latitude because the sun crosses the
 * horizon more slowly there. Without a city's height, this is that trend.
 */
export function temkinMinutes(latitude: number): number {
  return Math.round(10 + Math.max(0, Math.abs(latitude) - 41) * 0.25);
}

/** Solar declination on a day, degrees — close enough to say whether the sun reaches an angle. */
function declination(day: Date): number {
  const start = new Date(day.getFullYear(), 0, 1);
  const n = Math.round((day.getTime() - start.getTime()) / 86_400_000) + 1;
  return 23.44 * Math.sin((2 * Math.PI * (284 + n)) / 365);
}

/** Does the sun get `angle` degrees below the horizon at all, that night? */
function reachesAngle(latitude: number, day: Date, angle: number): boolean {
  const lowest = Math.abs(latitude + declination(day)) - 90;
  return lowest <= -angle - 0.1;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * The day whose night times stand for this one. Where the sun no longer
 * gets to 19° below the horizon — Cologne from late May to late July —
 * the site holds the İmsâk, Sabâh and Isha of the last night it did, all
 * three together and unchanged until 19° comes back (its rows carry a `*`
 * meanwhile). So: this day, or the last one before it that reaches 19°.
 */
function nightTimesDay(latitude: number, day: Date): Date {
  if (reachesAngle(latitude, day, 19)) return day;
  for (let i = 1; i <= 200; i++) {
    const d = addDays(day, -i);
    if (reachesAngle(latitude, d, 19)) return d;
  }
  return day;
}

/**
 * The calendar's method computed on the phone, from the rules its own
 * tables follow:
 *
 *   İmsâk   the sun at 19°, less the temkin
 *   Sabâh   the sun at 18° — the time the calendar prints for Fajr
 *   sunrise, Maghrib   eight / nine minutes outside the sun's 0.833° —
 *           the temkin the calendar measures to its visible horizon
 *   Dhuhr, Asr, Isha (17°)   plus the temkin
 *
 * Each also carries the minute the site's tables sit from a plain angle
 * calculation (it measures Isha to the sun's upper edge and rounds towards
 * caution). Where the sun no longer gets to 19° — a northern summer —
 * the night times of the last night it did are held, as the site does.
 * Checked against the site's whole year for Istanbul and Cologne: within
 * about two minutes on almost every day.
 */
export function computeNamazvaktiMethodTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
  school: number;
}): PrayerTimesResult {
  const T = temkinMinutes(params.latitude);
  const coords = (day: Date, calc: CalculationParameters) =>
    new Coordinates(computedLatitude(params.latitude, params.longitude, day, calc), params.longitude);
  const at = (day: Date, fajrAngle: number, ishaAngle: number) => {
    const calc = CalculationMethod.Other();
    calc.fajrAngle = fajrAngle;
    calc.ishaAngle = ishaAngle;
    calc.madhab = params.school === 1 ? Madhab.Hanafi : Madhab.Shafi;
    calc.methodAdjustments = {
      fajr: fajrAngle === 19 ? -T - 1 : 0,
      sunrise: -8,
      dhuhr: T + 1,
      asr: T + 2,
      maghrib: 9,
      isha: T + 2,
    };
    return new PrayerTimes(coords(day, calc), day, calc);
  };
  const day = new Date(params.date.getFullYear(), params.date.getMonth(), params.date.getDate());
  const pt = at(day, 19, 17);
  const night = nightTimesDay(params.latitude, day);
  const imsak = at(night, 19, 17).fajr;
  const sabah = at(night, 18, 17).fajr;
  // Isha falls in the night that begins this evening and ends tomorrow, so
  // it is tomorrow's night that decides — held from the evening before the
  // last night that reached 19°.
  const tomorrow = addDays(day, 1);
  const ishaNight = nightTimesDay(params.latitude, tomorrow);
  const isha = at(ishaNight === tomorrow ? day : addDays(ishaNight, -1), 19, 17).isha;
  return {
    timings: {
      Imsak: formatLocalTime(imsak),
      Fajr: formatLocalTime(sabah),
      Sunrise: formatLocalTime(pt.sunrise),
      Dhuhr: formatLocalTime(pt.dhuhr),
      Asr: formatLocalTime(pt.asr),
      Maghrib: formatLocalTime(pt.maghrib),
      Isha: formatLocalTime(isha),
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
}
