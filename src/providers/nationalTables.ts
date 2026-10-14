/**
 * The national tables the app serves through `nationalTable.ts`, one entry
 * per country, and the lookups the rest of the app needs:
 *
 *   • Singapore — MUIS, one table for the whole country (`muis`)
 *   • Malaysia — JAKIM e-Solat, 59 zones (`jakim`)
 *   • Indonesia — Kemenag (Bimas Islam), 517 regencies and cities (`kemenag`)
 *
 * Each has a bundled seed (`data/<id>Seed.json`, the published window at
 * the last app build) and a place list (`data/<id>Places.json`), both
 * written by `tools/national-tables/`.
 */
import {
  JAKIM_DATASET_BASE_URL,
  KEMENAG_DATASET_BASE_URL,
  MUIS_DATASET_BASE_URL,
  NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  NATIONAL_TABLE_REFRESH_TTL_MS,
} from '../config/datasets';
import type { PrayerDataProviderId } from '../settings/types';
import { createNationalTable, type NationalTable, type NationalTableSeed, type TablePlace } from './nationalTable';
import { computeLocalAdhanTimes } from './localAdhan';
import kemenagPoints from './data/kemenagMethodPoints.json';

/** Each regency's point as Kemenag computes it, and its class (1 highland, 2 the degree on Fajr and Isha too). */
const KEMENAG_POINTS = kemenagPoints as Record<string, number[]>;

function seedOf(load: () => unknown): NationalTableSeed {
  try {
    return load() as NationalTableSeed;
  } catch {
    return { version: 0, builtAt: '', start: '', days: 0, cities: {} };
  }
}

function placesOf(load: () => unknown): TablePlace[] {
  try {
    return load() as TablePlace[];
  } catch {
    return [];
  }
}

/** Singapore: the island and its islets, nothing further. */
export const muisTable = createNationalTable({
  id: 'muis',
  dataset: 'muis',
  baseUrl: MUIS_DATASET_BASE_URL,
  timezone: 'Asia/Singapore',
  places: placesOf(() => require('./data/muisPlaces.json')),
  maxPlaceKm: 35,
  seed: seedOf(() => require('./data/muisSeed.json')),
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
});

/**
 * Malaysia: a reader is matched to the nearest of the towns JAKIM names in
 * its zones. The towns are at most a few tens of kilometres apart within
 * the peninsula; the cap allows for the interior of Sabah and Sarawak.
 */
export const jakimTable = createNationalTable({
  id: 'jakim',
  dataset: 'jakim',
  baseUrl: JAKIM_DATASET_BASE_URL,
  timezone: 'Asia/Kuala_Lumpur',
  places: placesOf(() => require('./data/jakimPlaces.json')),
  maxPlaceKm: 120,
  seed: seedOf(() => require('./data/jakimSeed.json')),
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
});

/**
 * Indonesia: the ministry publishes per regency, and a regency's seat
 * stands for it. Regencies in Papua and Kalimantan are large.
 */
export const kemenagTable = createNationalTable({
  id: 'kemenag',
  dataset: 'kemenag',
  baseUrl: KEMENAG_DATASET_BASE_URL,
  timezone: 'Asia/Jakarta',
  places: placesOf(() => require('./data/kemenagPlaces.json')),
  maxPlaceKm: 200,
  seed: seedOf(() => require('./data/kemenagSeed.json')),
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  // The ministry's own method at the regency's point (`indonesiaMethod.ts`),
  // as for Sweden, Morocco and Algeria; the phone's clock is the zone.
  calculate: (place, date) => {
    const p = KEMENAG_POINTS[String(place.id)];
    const flags = p?.[2] ?? 0;
    return {
      ...computeLocalAdhanTimes({
        latitude: p?.[0] ?? place.lat,
        longitude: p?.[1] ?? place.lon,
        horizonMin: flags & 1 ? 1 : place.horizonMin,
        twilightDip: (flags & 2) !== 0,
        date,
        calculationMethod: 20,
        school: 0,
      }),
      source: 'local',
    };
  },
});

export const NATIONAL_TABLES: Partial<Record<PrayerDataProviderId, NationalTable>> = {
  muis: muisTable,
  jakim: jakimTable,
  kemenag: kemenagTable,
};

/** The national table behind a provider id, or null for the providers that are not one. */
export function nationalTableFor(id: PrayerDataProviderId): NationalTable | null {
  return NATIONAL_TABLES[id] ?? null;
}

/** Test seam. */
export function _resetNationalTablesForTests(): void {
  for (const t of Object.values(NATIONAL_TABLES)) t?._resetForTests();
}
