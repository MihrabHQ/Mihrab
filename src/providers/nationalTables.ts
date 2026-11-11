/**
 * The national tables the app serves through `nationalTable.ts`, one entry
 * per country, and the lookups the rest of the app needs:
 *
 *   • Singapore — MUIS, one table for the whole country (`muis`)
 *   • Malaysia — JAKIM e-Solat, 59 zones (`jakim`)
 *   • London — the London Unified Prayer Timetable, one for the city (`london`)
 *   • Kyrgyzstan — the Spiritual Administration, 115 places (`kmdb`)
 *   • Tajikistan — the Islamic Centre, Dushanbe and eighteen towns (`shuro`)
 *   • Dagestan — the Muftiate, 27 towns and district seats (`dagestan`)
 *   • Indonesia — Kemenag (Bimas Islam), 517 regencies and cities (`kemenag`),
 *     computed on the phone (its method and correction list)
 *
 * Singapore, Malaysia and London have a bundled seed (`data/<id>Seed.json`, the
 * published window at the last app build) and a place list
 * (`data/<id>Places.json`), both written by `tools/national-tables/`.
 */
import {
  JAKIM_DATASET_BASE_URL,
  KMDB_DATASET_BASE_URL,
  SHURO_DATASET_BASE_URL,
  DAGESTAN_DATASET_BASE_URL,
  LONDON_DATASET_BASE_URL,
  MUIS_DATASET_BASE_URL,
  NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  NATIONAL_TABLE_REFRESH_TTL_MS,
} from '../config/datasets';
import type { PrayerDataProviderId } from '../settings/types';
import { createNationalTable, type NationalTable, type NationalTableSeed, type NearestPlace, type TablePlace } from './nationalTable';
import type { PrayerTimesResult } from './types';
import { computeLocalAdhanTimes } from './localAdhan';
import { indonesiaClock, type PlaceClock } from './locationClock';
import { LONDON_REACH_KM } from '../utils/londonRegion';
import { fetchJakimLive, fetchMuisLive, jakimZoneCode } from './nationalLive';

/** Each regency's point as Kemenag computes it, and its class (1 highland, 2 the degree on Fajr and Isha too). Read at the first Indonesian day, not at load. */
const kemenagPointOf = (id: number): number[] | undefined =>
  (require('./data/kemenagMethodPoints.json') as Record<string, number[]>)[String(id)];

// The seeds and the place lists are read when a table is first asked for
// a place, not when this module loads (the `get places()` and `get seed()`
// below): it loads at the first times of every launch (`prayerStorage.ts`
// asks `nationalTableFor`), and reading the three tables' files there was
// 4 ms of a cold start on a Pixel 10 Pro for a reader none of them serves.
// A `require` is answered from the module cache after the first.
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
  get places() {
    return placesOf(() => require('./data/muisPlaces.json'));
  },
  maxPlaceKm: 35,
  get seed() {
    return seedOf(() => require('./data/muisSeed.json'));
  },
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
  get places() {
    return placesOf(() => require('./data/jakimPlaces.json'));
  },
  maxPlaceKm: 120,
  get seed() {
    return seedOf(() => require('./data/jakimSeed.json'));
  },
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

/** London's clock, summer time and all, as the timetable prints it. */
export const LONDON_CLOCK: PlaceClock = { zone: 'Europe/London' };
/** The timetable is listed twice at one point: 1 with the first Asr, 2 with the second (Hanafi). */
export const LONDON_FIRST_ASR_PLACE = 1;
export const LONDON_SECOND_ASR_PLACE = 2;
/**
 * What stands in past the published year: the Moonsighting Committee's
 * method (AlAdhan's 15), the general one nearest the timetable's seasonal
 * Fajr and Isha. The timetable's own Fajr and Isha are from observation and
 * are not a formula; this is a stand-in, and the app says "calculated".
 */
export const LONDON_STAND_IN_METHOD = 15;

/** London: the city, about as far as the M25 (`londonRegion.ts`). */
export const londonTable = createNationalTable({
  id: 'london',
  dataset: 'london',
  baseUrl: LONDON_DATASET_BASE_URL,
  timezone: 'Europe/London',
  get places() {
    return placesOf(() => require('./data/londonPlaces.json'));
  },
  maxPlaceKm: LONDON_REACH_KM,
  get seed() {
    return seedOf(() => require('./data/londonSeed.json'));
  },
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  // No live backup: the source's API takes a key, which the phone does not carry.
  calculate: (place, date) => ({
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      date,
      calculationMethod: LONDON_STAND_IN_METHOD,
      school: place.id === LONDON_SECOND_ASR_PLACE ? 1 : 0,
      placeClock: LONDON_CLOCK,
    }),
    source: 'local',
  }),
});

/** Kyrgyzstan's clock: UTC+6, no summer time. */
export const KMDB_CLOCK: PlaceClock = { zone: 'Asia/Bishkek' };
/**
 * What stands in past the published window or off the list: the Muslim
 * World League's angles (Fajr 18°, as the Administration's; Isha 17°) with
 * the Hanafi Asr its timetable prints. A stand-in, not its method.
 */
export const KMDB_STAND_IN_METHOD = 3;

/**
 * Kyrgyzstan: the nearest of the Administration's listed places. The
 * valleys are well covered; the cap allows for the high east and south.
 */
export const kmdbTable = createNationalTable({
  id: 'kmdb',
  dataset: 'kmdb',
  baseUrl: KMDB_DATASET_BASE_URL,
  timezone: 'Asia/Bishkek',
  get places() {
    return placesOf(() => require('./data/kmdbPlaces.json'));
  },
  maxPlaceKm: 150,
  get seed() {
    return seedOf(() => require('./data/kmdbSeed.json'));
  },
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  calculate: (place, date) => ({
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      date,
      calculationMethod: KMDB_STAND_IN_METHOD,
      // the one Asr the timetable prints
      school: 1,
      placeClock: KMDB_CLOCK,
    }),
    source: 'local',
  }),
});

/** Tajikistan's clock: UTC+5, no summer time. */
export const SHURO_CLOCK: PlaceClock = { zone: 'Asia/Dushanbe' };
/**
 * What stands in past the published window: the Muslim World League's
 * angles with the Hanafi Asr the table prints. The Centre's table is set
 * by hand each year and is no calculation; this only fills the gap.
 */
export const SHURO_STAND_IN_METHOD = 3;

/**
 * Tajikistan: the nearest of Dushanbe and the eighteen towns the Centre
 * gives minutes for. The cap allows for the Pamir, where Khorugh and
 * Murghob stand for a wide country.
 */
export const shuroTable = createNationalTable({
  id: 'shuro',
  dataset: 'shuro',
  baseUrl: SHURO_DATASET_BASE_URL,
  timezone: 'Asia/Dushanbe',
  get places() {
    return placesOf(() => require('./data/shuroPlaces.json'));
  },
  maxPlaceKm: 200,
  get seed() {
    return seedOf(() => require('./data/shuroSeed.json'));
  },
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  calculate: (place, date) => ({
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      date,
      calculationMethod: SHURO_STAND_IN_METHOD,
      // the one Asr the table prints
      school: 1,
      placeClock: SHURO_CLOCK,
    }),
    source: 'local',
  }),
});

/** Dagestan's clock: Moscow time, no summer time. */
export const DAGESTAN_CLOCK: PlaceClock = { zone: 'Europe/Moscow' };
/**
 * What stands in past the window: the Muslim World League's angles with the
 * first Asr the table prints. The Muftiate's table is the same every year
 * and is mirrored four months ahead, so this is only for a phone that has
 * not reached the mirror in that long.
 */
export const DAGESTAN_STAND_IN_METHOD = 3;

/**
 * Dagestan: the nearest of the Muftiate's 27 towns and district seats. The
 * cap allows for the Nogai steppe in the north, where Yuzhno-Sukhokumsk and
 * Kizlyar stand for a wide plain.
 */
export const dagestanTable = createNationalTable({
  id: 'dagestan',
  dataset: 'dagestan',
  baseUrl: DAGESTAN_DATASET_BASE_URL,
  timezone: 'Europe/Moscow',
  get places() {
    return placesOf(() => require('./data/dagestanPlaces.json'));
  },
  maxPlaceKm: 120,
  get seed() {
    return seedOf(() => require('./data/dagestanSeed.json'));
  },
  refreshTtlMs: NATIONAL_TABLE_REFRESH_TTL_MS,
  indexPollIntervalMs: NATIONAL_TABLE_INDEX_POLL_INTERVAL_MS,
  calculate: (place, date) => ({
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      date,
      calculationMethod: DAGESTAN_STAND_IN_METHOD,
      // the one Asr the table prints
      school: 0,
      placeClock: DAGESTAN_CLOCK,
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
  get places() {
    return placesOf(() => require('./data/kemenagPlaces.json'));
  },
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
  const p = kemenagPointOf(place.id);
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
  london: londonTable,
  kmdb: kmdbTable,
  shuro: shuroTable,
  dagestan: dagestanTable,
};

/**
 * The listed place a reader's school asks for, where a table lists one
 * point twice: London's second Asr for the Hanafi school. Undefined for the
 * nearest place, as everywhere else.
 */
export function nationalTablePlaceId(id: PrayerDataProviderId, school: number): number | undefined {
  if (id !== 'london') return undefined;
  return school === 1 ? LONDON_SECOND_ASR_PLACE : LONDON_FIRST_ASR_PLACE;
}

/** The national table behind a provider id, or null for the providers that are not one. */
export function nationalTableFor(id: PrayerDataProviderId): NationalTable | null {
  return NATIONAL_TABLES[id] ?? null;
}

/** Test seam. */
export function _resetNationalTablesForTests(): void {
  for (const t of Object.values(NATIONAL_TABLES)) t?._resetForTests();
}
