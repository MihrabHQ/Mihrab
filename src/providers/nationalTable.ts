/**
 * A national prayer-time table, served from a prepared dataset — the shape
 * Sweden, Morocco and Algeria each got by hand, made once for the countries
 * that came after them (Singapore, Malaysia, Indonesia).
 *
 * Read `marwDataset.ts` first: this is that module with the Algerian parts
 * taken out as a configuration. One authority publishes a table per listed
 * place; a server job (`tools/national-tables/`) writes every place's days
 * to the CDN as `cities/<id>.json`, a small `index.json` the phone polls,
 * and a compact seed bundled into the app so the first launch — and a
 * phone that never reaches the CDN — still has the published year. The user
 * is matched to the nearest listed place, as the authority's own app does.
 *
 * The seed holds seven minute counts per day from `start`: Imsak, Fajr,
 * sunrise, Dhuhr, Asr, Maghrib, Isha — the dataset tuple's order. A source
 * that publishes no Imsak has it written ten minutes before Fajr by the
 * builder, so the phone never has to know which.
 *
 * A miss (outside the country, past the published window) throws, and the
 * caller falls through to the on-device method for that country.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpUserAgent } from '../config/httpIdentity';
import { recordServerIndex, type ServerDatasetId, type ServerStatus } from '../prayer/dataStatus';
import { distanceKm } from '../utils/coords';
import { formatLocalDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import type { DatasetDayTuple } from './datasetTuple';
import { ProviderError } from './errors';
import { tupleToTimings } from './islamiskaForbundetParser';
import type { DataSource, PrayerTimesResult } from './types';

export type TablePlace = {
  id: number;
  /** As the authority writes it. */
  name: string;
  nameEn?: string;
  lat: number;
  lon: number;
  /** Metres above sea level, where the authority lowers the horizon for the place. */
  heightM?: number;
  /** The authority's own allowance for the horizon, minutes, where it is a figure rather than a height. */
  horizonMin?: number;
};

export type NationalTableSeed = {
  version: number;
  builtAt: string;
  timezone?: string;
  /** First date in the arrays, YYYY-MM-DD. */
  start: string;
  days: number;
  /** Place id → seven minute counts per day: Imsak, Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha. */
  cities: Record<string, number[]>;
};

export type NationalTableConfig = {
  /** The provider id, as the settings name it. */
  id: string;
  /** The statistics panel's slot. */
  dataset: ServerDatasetId;
  baseUrl: string;
  timezone: string;
  places: readonly TablePlace[];
  /** A point further than this from every listed place is outside the country's table. */
  maxPlaceKm: number;
  seed: NationalTableSeed;
  /** Refresh a cached place when the index cannot be reached and the copy is older than this. */
  refreshTtlMs: number;
  indexPollIntervalMs: number;
  /**
   * The authority's own method, computed for the nearest listed place —
   * served instead of the table when given (and not switched off for a
   * test). The table stays, for the weekly check against the source.
   */
  calculate?: (place: NearestPlace, date: Date) => PrayerTimesResult;
};

type CityFile = {
  id: number;
  city: string;
  timezone?: string;
  builtAt: string;
  days: Record<string, DatasetDayTuple>;
};

type IndexFile = {
  builtAt?: string;
  timezone?: string;
  serverStatus?: ServerStatus;
  minCoverageDays?: number;
  deadCities?: number[];
};

export type NearestPlace = TablePlace & { distanceKm: number };

export function nearestPlace(
  places: readonly TablePlace[],
  latitude: number,
  longitude: number,
): NearestPlace | null {
  let best: NearestPlace | null = null;
  for (const p of places) {
    const d = distanceKm(latitude, longitude, p.lat, p.lon);
    if (!best || d < best.distanceKm) best = { ...p, distanceKm: d };
  }
  return best;
}

function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function dayIndex(start: string, dateKey: string): number {
  return Math.round(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
  );
}

/** The seed's day for a place, as the shared tuple, or undefined. */
export function seedTuple(
  seed: NationalTableSeed,
  placeId: number,
  dateKey: string,
): DatasetDayTuple | undefined {
  const flat = seed.cities?.[String(placeId)];
  if (!flat || !seed.start) return undefined;
  const i = dayIndex(seed.start, dateKey);
  if (!Number.isFinite(i) || i < 0 || i >= seed.days || (i + 1) * 7 > flat.length) {
    return undefined;
  }
  const m = flat.slice(i * 7, i * 7 + 7);
  return [clock(m[0]), clock(m[1]), clock(m[2]), clock(m[3]), clock(m[4]), clock(m[5]), clock(m[6])];
}

function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

export type NationalTable = {
  config: NationalTableConfig;
  nearest(latitude: number, longitude: number): NearestPlace | null;
  /** Is this point within the table's reach — near enough to a listed place? */
  covers(latitude: number, longitude: number): boolean;
  getTimes(params: { latitude: number; longitude: number; date: Date }): Promise<PrayerTimesResult>;
  pollServerIndexNow(): Promise<void>;
  refetchNow(latitude: number, longitude: number): Promise<void>;
  _resetForTests(): void;
  /** Tests: serve the table even where the method is computed. */
  setServesCalculationForTests(v: boolean): void;
};

export function createNationalTable(config: NationalTableConfig): NationalTable {
  const cachePrefix = `${config.id}.dataset.v1.city.`;
  const memCity = new Map<number, CityFile | null>();
  const refreshInFlight = new Set<number>();
  let nextIndexPollAt = 0;
  let indexPollInFlight: Promise<IndexFile | null> | null = null;
  let servesCalculation = true;

  async function loadCachedCity(id: number): Promise<CityFile | null> {
    if (memCity.has(id)) return memCity.get(id) ?? null;
    try {
      const raw = await AsyncStorage.getItem(`${cachePrefix}${id}`);
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
          `${config.baseUrl}/index.json`,
          { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
          { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 7000 },
        );
        if (!res.ok) return null;
        const index = (await res.json()) as IndexFile;
        const dueAt = Date.now() + jitter(config.indexPollIntervalMs);
        await recordServerIndex(
          config.dataset,
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
        nextIndexPollAt = Date.now() + jitter(config.indexPollIntervalMs);
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
        `${config.baseUrl}/cities/${id}.json`,
        { headers: { 'User-Agent': httpUserAgent('Islamic prayer app; dataset') } },
        { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 9000 },
      );
      if (!res.ok) return;
      const file = (await res.json()) as CityFile;
      if (!file || typeof file.days !== 'object') return;
      await AsyncStorage.setItem(`${cachePrefix}${id}`, JSON.stringify(file));
      memCity.set(id, file);
    } catch {
      // Background refresh: the answer has already been served from cache or seed.
    } finally {
      refreshInFlight.delete(id);
    }
  }

  /** Fire-and-forget freshness: download only what the server has built since. */
  async function maybeRefresh(id: number, cached: CityFile | null): Promise<void> {
    const index = await pollServerIndex();
    const serverBuilt = index?.builtAt;
    if (!cached) {
      if (serverBuilt && serverBuilt !== config.seed.builtAt) await downloadCity(id);
      return;
    }
    if (serverBuilt && serverBuilt !== cached.builtAt) {
      await downloadCity(id);
      return;
    }
    const age = Date.now() - Date.parse(cached.builtAt);
    if (!index && Number.isFinite(age) && age > config.refreshTtlMs) {
      await downloadCity(id);
    }
  }

  const nearest = (latitude: number, longitude: number) =>
    nearestPlace(config.places, latitude, longitude);

  return {
    config,
    nearest,
    covers(latitude, longitude) {
      const n = nearest(latitude, longitude);
      return n != null && n.distanceKm <= config.maxPlaceKm;
    },
    async getTimes(params) {
      const near = nearest(params.latitude, params.longitude);
      if (!near) {
        throw new ProviderError(config.id, 'shape', `No ${config.id} place list is bundled.`);
      }
      if (near.distanceKm > config.maxPlaceKm) {
        throw new ProviderError(
          config.id,
          'shape',
          `Nearest listed place "${near.nameEn ?? near.name}" is ${Math.round(near.distanceKm)} km ` +
            `away (> ${config.maxPlaceKm} km) — outside the table's coverage.`,
        );
      }
      if (config.calculate && servesCalculation) return config.calculate(near, params.date);
      const dateKey = formatLocalDate(params.date);
      const cached = await loadCachedCity(near.id);
      void maybeRefresh(near.id, cached);
      const fromCache = cached?.days[dateKey];
      const tuple = fromCache ?? seedTuple(config.seed, near.id, dateKey);
      if (!tuple) {
        throw new ProviderError(
          config.id,
          'shape',
          `No published entry for "${near.nameEn ?? near.name}" on ${dateKey}.`,
        );
      }
      const source: DataSource = fromCache ? 'cdn' : 'seed';
      return {
        timings: tupleToTimings(tuple),
        timezone: cached?.timezone ?? config.seed.timezone ?? config.timezone,
        source,
      };
    },
    async pollServerIndexNow() {
      await pollServerIndex();
    },
    async refetchNow(latitude, longitude) {
      const near = nearest(latitude, longitude);
      if (!near || near.distanceKm > config.maxPlaceKm) return;
      memCity.delete(near.id);
      nextIndexPollAt = 0;
      try {
        await AsyncStorage.removeItem(`${cachePrefix}${near.id}`);
      } catch {
        // Superseded by the download below either way.
      }
      await downloadCity(near.id);
    },
    _resetForTests() {
      memCity.clear();
      refreshInFlight.clear();
      nextIndexPollAt = 0;
      indexPollInFlight = null;
    },
    setServesCalculationForTests(v: boolean) {
      servesCalculation = v;
    },
  };
}
