/**
 * Algeria — the Ministry of Religious Affairs and Wakfs's published times,
 * served from a prepared dataset (issue #70).
 *
 * The same arrangement as `habousDataset.ts` (read the Swedish module,
 * `islamiskaForbundetDataset.ts`, first): per-city JSON on the CDN, a small
 * `index.json` the device polls, and a seed bundled in the app. Only what
 * differs is explained here.
 *
 * ── WHERE THE TIMES COME FROM ─────────────────────────────────────────
 *
 * The Ministry's official app, "أذان الجزائر الرسمي", carries the year's
 * timetable for 68 cities in a database. `tools/algeria-ministry/build.ts`
 * reads it from the app's install file — after checking the file is signed
 * with the Ministry app's own certificate — and checks every time against
 * the Ministry's method before anything is written. The times are served
 * exactly as published; the user is matched to the nearest listed city, as
 * the Ministry's own app and the mosques do.
 *
 * ── THE SEED IS THE YEAR ──────────────────────────────────────────────
 *
 * The Ministry publishes once a year, as an app update, so unlike Morocco's
 * thirty days the bundled seed holds the whole published window. The CDN
 * copy exists so next year's table can reach phones before an app release;
 * a device that never reaches it still has the year. The seed is stored
 * compactly — six minute counts per day from `start` — and turned into the
 * shared day tuple here.
 *
 * A miss (outside Algeria, or past the published year) throws, and the
 * caller falls through to the on-device Algeria calculation, which sits
 * within a minute or two of the Ministry.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpUserAgent } from '../config/httpIdentity';
import {
  MARW_DATASET_BASE_URL,
  MARW_DATASET_REFRESH_TTL_MS,
  MARW_INDEX_POLL_INTERVAL_MS,
} from '../config/datasets';
import { nearestAlgeriaCity } from './algeriaCities';
import { tupleToTimings } from './islamiskaForbundetParser';
import type { DatasetDayTuple } from './datasetTuple';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { ProviderError } from './errors';
import { recordServerIndex, type ServerStatus } from '../prayer/dataStatus';
import type { DataSource, PrayerTimesResult } from './types';

const PROVIDER = 'marw';
const DEFAULT_TZ = 'Africa/Algiers';
const CACHE_PREFIX = 'marw.dataset.v1.city.';
/** Imsak is not in the Ministry's yearly table; ten minutes before Fajr, as the builder writes it. */
const IMSAK_BEFORE_FAJR_MIN = 10;

/**
 * Defence-in-depth distance cap. The region check (`algeriaRegion.ts`)
 * already keeps this to Algeria; in the Sahara the listed cities are
 * hundreds of kilometres apart and the Ministry still assigns every place
 * to one of them, so the cap is only there to refuse a coordinate that is
 * plainly not near any of them.
 */
const MAX_DATASET_CITY_KM = 500;

type CityDays = Record<string, DatasetDayTuple>;
type CityFile = {
  id: number;
  city: string;
  timezone?: string;
  builtAt: string;
  days: CityDays;
};
type SeedFile = {
  version: number;
  builtAt: string;
  timezone?: string;
  /** First date in the arrays, YYYY-MM-DD. */
  start: string;
  days: number;
  /** City id → Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha minutes, six per day. */
  cities: Record<string, number[]>;
};
type IndexFile = {
  builtAt?: string;
  timezone?: string;
  serverStatus?: ServerStatus;
  minCoverageDays?: number;
  deadCities?: number[];
};

function loadSeed(): SeedFile {
  try {
    return require('./data/marwSeed.json') as SeedFile;
  } catch {
    return { version: 0, builtAt: '', start: '', days: 0, cities: {} };
  }
}

const seed = loadSeed();

function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function dayIndex(start: string, dateKey: string): number {
  return Math.round(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
  );
}

/** The seed's day for a city, as the shared tuple, or undefined. */
export function seedTuple(
  cityId: number,
  dateKey: string,
  from: SeedFile = seed,
): DatasetDayTuple | undefined {
  const flat = from.cities?.[String(cityId)];
  if (!flat || !from.start) return undefined;
  const i = dayIndex(from.start, dateKey);
  if (!Number.isFinite(i) || i < 0 || i >= from.days || (i + 1) * 6 > flat.length) {
    return undefined;
  }
  const m = flat.slice(i * 6, i * 6 + 6);
  return [
    clock(m[0] - IMSAK_BEFORE_FAJR_MIN),
    clock(m[0]),
    clock(m[1]),
    clock(m[2]),
    clock(m[3]),
    clock(m[4]),
    clock(m[5]),
  ];
}

const memCity = new Map<number, CityFile | null>();
const refreshInFlight = new Set<number>();
let nextIndexPollAt = 0;
let indexPollInFlight: Promise<IndexFile | null> | null = null;

function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

async function loadCachedCity(id: number): Promise<CityFile | null> {
  if (memCity.has(id)) return memCity.get(id) ?? null;
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${id}`);
    const parsed = raw ? (JSON.parse(raw) as CityFile) : null;
    memCity.set(id, parsed);
    return parsed;
  } catch {
    memCity.set(id, null);
    return null;
  }
}

async function pollServerIndex(): Promise<IndexFile | null> {
  const now = Date.now();
  if (now < nextIndexPollAt) return null;
  if (indexPollInFlight) return indexPollInFlight;
  indexPollInFlight = (async () => {
    try {
      const res = await fetchWithRetry(
        `${MARW_DATASET_BASE_URL}/index.json`,
        { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
        { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 7000 },
      );
      if (!res.ok) return null;
      const index = (await res.json()) as IndexFile;
      const dueAt = Date.now() + jitter(MARW_INDEX_POLL_INTERVAL_MS);
      await recordServerIndex(
        'marw',
        {
          builtAt: index.builtAt ?? null,
          serverStatus: index.serverStatus,
          minCoverageDays: index.minCoverageDays ?? null,
          deadCities: Array.isArray(index.deadCities) ? index.deadCities.length : null,
        },
        new Date(dueAt),
      );
      return index;
    } catch {
      return null;
    } finally {
      nextIndexPollAt = Date.now() + jitter(MARW_INDEX_POLL_INTERVAL_MS);
      indexPollInFlight = null;
    }
  })();
  return indexPollInFlight;
}

async function downloadCity(id: number): Promise<void> {
  if (refreshInFlight.has(id)) return;
  refreshInFlight.add(id);
  try {
    const res = await fetchWithRetry(
      `${MARW_DATASET_BASE_URL}/cities/${id}.json`,
      { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
      { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 9000 },
    );
    if (!res.ok) return;
    const file = (await res.json()) as CityFile;
    if (!file || typeof file.days !== 'object') return;
    await AsyncStorage.setItem(`${CACHE_PREFIX}${id}`, JSON.stringify(file));
    memCity.set(id, file);
  } catch {
    // Background refresh: the answer has already been served from cache or seed.
  } finally {
    refreshInFlight.delete(id);
  }
}

/**
 * Fire-and-forget freshness. A download only happens when the server has
 * built something the device has not seen — once a year, in practice —
 * or, if the index cannot be reached, when the cached copy is old.
 */
async function maybeRefresh(id: number, cached: CityFile | null): Promise<void> {
  const index = await pollServerIndex();
  const serverBuilt = index?.builtAt;
  if (!cached) {
    // The seed already covers the year; fetch only when the server has
    // something newer than the build the seed came from.
    if (serverBuilt && serverBuilt !== seed.builtAt) await downloadCity(id);
    return;
  }
  if (serverBuilt && serverBuilt !== cached.builtAt) {
    await downloadCity(id);
    return;
  }
  const age = Date.now() - Date.parse(cached.builtAt);
  if (!index && Number.isFinite(age) && age > MARW_DATASET_REFRESH_TTL_MS) {
    await downloadCity(id);
  }
}

/**
 * The Ministry's published times for the nearest listed Algerian city.
 *
 * @throws ProviderError('shape') out of coverage or past the published
 * window — the caller then computes the Algeria method on the device.
 */
export async function getMarwDatasetTimes(params: {
  latitude: number;
  longitude: number;
  date: Date;
}): Promise<PrayerTimesResult> {
  const nearest = nearestAlgeriaCity(params.latitude, params.longitude);
  if (!nearest) {
    throw new ProviderError(PROVIDER, 'shape', 'No Algerian city list is bundled.');
  }
  if (nearest.distanceKm > MAX_DATASET_CITY_KM) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `Nearest listed city "${nearest.nameEn}" is ${Math.round(nearest.distanceKm)} km ` +
        `away (> ${MAX_DATASET_CITY_KM} km) — outside the Ministry's coverage.`,
    );
  }

  const dateKey = formatLocalDate(params.date);
  const cached = await loadCachedCity(nearest.id);
  void maybeRefresh(nearest.id, cached);

  const fromCache = cached?.days[dateKey];
  const tuple = fromCache ?? seedTuple(nearest.id, dateKey);
  if (!tuple) {
    throw new ProviderError(
      PROVIDER,
      'shape',
      `No published entry for "${nearest.nameEn}" on ${dateKey} — past the ` +
        "Ministry's published year, or before the window.",
    );
  }

  const source: DataSource = fromCache ? 'cdn' : 'seed';
  return {
    timings: tupleToTimings(tuple),
    timezone: cached?.timezone ?? seed.timezone ?? DEFAULT_TZ,
    source,
  };
}

/** Refresh the server-index snapshot for the statistics panel. */
export async function pollServerIndexNow(): Promise<void> {
  await pollServerIndex();
}

/**
 * Drop the cached table and fetch it now — the same escape hatch as
 * `refetchHabousDatasetNow` (issue #56), for a time-zone change.
 */
export async function refetchMarwDatasetNow(
  latitude: number,
  longitude: number,
): Promise<void> {
  const nearest = nearestAlgeriaCity(latitude, longitude);
  if (!nearest || nearest.distanceKm > MAX_DATASET_CITY_KM) return;
  memCity.delete(nearest.id);
  nextIndexPollAt = 0;
  try {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${nearest.id}`);
  } catch {
    // Superseded by the download below either way.
  }
  await downloadCity(nearest.id);
}

/** Test seam. */
export function _resetMarwDatasetMemoForTests(): void {
  memCity.clear();
  refreshInFlight.clear();
  nextIndexPollAt = 0;
  indexPollInFlight = null;
}
