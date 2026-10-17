/**
 * The national tables the app serves through `nationalTable.ts`, one entry
 * per country, and the lookups the rest of the app needs:
 *
 *   • Singapore — MUIS, one table for the whole country (`muis`)
 *   • Malaysia — JAKIM e-Solat, 59 zones (`jakim`)
 *   • Indonesia — Kemenag (Bimas Islam), 517 regencies and cities (`kemenag`),
 *     computed on the phone (its method and correction list)
 *
 * Singapore and Malaysia have a bundled seed (`data/<id>Seed.json`, the
 * published window at the last app build) and a place list
 * (`data/<id>Places.json`), both written by `tools/national-tables/`.
 */
import {
  JAKIM_DATASET_BASE_URL,
  MUIS_DATASET_BASE_URL,
  NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  NATIONAL_TABLE_REFRESH_TTL_MS,
} from '../config/datasets';
import type { PrayerDataProviderId } from '../settings/types';
import { createNationalTable, type NationalTable, type NationalTableSeed, type NearestPlace, type TablePlace } from './nationalTable';
import type { PrayerTimesResult } from './types';
import { computeLocalAdhanTimes } from './localAdhan';
import { indonesiaClock, type PlaceClock } from './locationClock';
import { fetchJakimLive, fetchMuisLive, jakimZoneCode } from './nationalLive';
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

/**
 * The clock each table prints on — Sabah and Sarawak keep Kuala Lumpur's
 * (Asia/Kuching is the same UTC+8, with no summer time).
 */
export const MUIS_CLOCK: PlaceClock = { zone: 'Asia/Singapore' };
export const JAKIM_CLOCK: PlaceClock = { zone: 'Asia/Kuala_Lumpur' };

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
  // A day the repo's copy lacks: MUIS's own table on data.gov.sg, then MUIS's method.
  live: () => fetchMuisLive(),
  calculate: (place, date) => ({
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      date,
      calculationMethod: 11,
      school: 0,
      // on Singapore's clock, as the table's own days are
      placeClock: MUIS_CLOCK,
    }),
    source: 'local',
  }),
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
  // A day the repo's copy lacks: the zone's year from e-Solat itself, then
  // the zone's own computation (`malaysiaMethod.ts`) — past 31 December
  // e-Solat has nothing either until JAKIM publishes the new year.
  live: place => {
    const code = jakimZoneCode(place.nameEn);
    return code ? fetchJakimLive(code) : Promise.resolve(null);
  },
  calculate: (place, date) => ({
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      heightM: place.heightM,
      jakimZone: place.id,
      date,
      calculationMethod: 17,
      school: 0,
      // on Malaysia's clock, as the table's own days are
      placeClock: JAKIM_CLOCK,
    }),
    source: 'local',
  }),
});

/**
 * Indonesia: the ministry publishes per regency, and a regency's seat
 * stands for it. Regencies in Papua and Kalimantan are large.
 */
export const kemenagTable = createNationalTable({
  id: 'kemenag',
  dataset: 'kemenag',
  timezone: 'Asia/Jakarta',
  places: placesOf(() => require('./data/kemenagPlaces.json')),
  maxPlaceKm: 200,
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  // The ministry's own method at the regency's point (`indonesiaMethod.ts`,
  // from MihrabHQ/mihrab-methods), with the correction list for the few
  // times its program rounds the other way (`indonesiaCorrections.json`):
  // its printed minute, every time, over the days its tables were checked.
  // Nothing is downloaded; the phone's clock is the zone.
  servesCalculation: true,
  calculate: (place, date) => kemenagAt(place, date, 0),
});

/** Kemenag's method for a listed regency, at the point(s) the ministry computes it, with its correction list. */
function kemenagAt(place: NearestPlace, date: Date, school: number): PrayerTimesResult {
  const p = KEMENAG_POINTS[String(place.id)];
  const flags = p?.[2] ?? 0;
  return {
    ...computeLocalAdhanTimes({
      latitude: p?.[0] ?? place.lat,
      longitude: p?.[1] ?? place.lon,
      horizonMin: flags & 1 ? 1 : place.horizonMin,
      twilightDip: (flags & 2) !== 0,
      afternoonPoint: p && p.length >= 5 ? ([p[3], p[4]] as const) : undefined,
      date,
      calculationMethod: 20,
      school,
      // on the regency's own clock, as Kemenag's table prints it
      placeClock: indonesiaClock(place.nameEn),
    }),
    source: 'local',
  };
}

/**
 * Kemenag's times for the regency nearest a point (the method by hand, or
 * Automatic, in Indonesia): null beyond the regencies' reach.
 */
export function kemenagTimesNear(latitude: number, longitude: number, date: Date, school: number): PrayerTimesResult | null {
  if (!kemenagTable.covers(latitude, longitude)) return null;
  const place = kemenagTable.nearest(latitude, longitude);
  return place ? kemenagAt(place, date, school) : null;
}

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
