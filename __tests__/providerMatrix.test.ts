/**
 * EVERY PROVIDER, END TO END, IN EVERY PHONE ZONE.
 *
 * Each prayer-time provider is asked through `fetchPrayerTimesUnified` and
 * through the storage chain (`getOrFetchPrayerDay`) about its own cities, a
 * remote spot in its country, the places just across its borders and off its
 * coast, and a handful of places no provider is made for (far north, the
 * date line, the poles, 0°/0°), on the dates that break things: clock
 * changes, the turn of the year where the published windows end, Ramadan,
 * a leap day, the solstices, thirteen months ahead.
 *
 * Every answer must be six HH:mm times with an Imsak before Fajr, a clock
 * and a source; in order as instants on the clock it names (Isha may pass
 * midnight; the Swedish/Diyanet tables print a polar-night Asr at Dhuhr);
 * the same with the network gone, or answering a captive portal or half a
 * file, as the provider's own offline answer; within a few minutes of the
 * online answer; and — on a place's clock — the same instants whatever zone
 * the phone is in.
 *
 * The phone's zone is the process's: run it under several, e.g.
 *
 *   for z in UTC Europe/Stockholm Africa/Casablanca America/New_York \
 *     Asia/Jakarta Asia/Kolkata Pacific/Kiritimati Pacific/Pago_Pago; do
 *     TZ=$z npx jest --ci __tests__/providerMatrix; done
 *
 * The instants are held against `fixtures/providerMatrixInstants.json`,
 * written under TZ=UTC (MATRIX_WRITE_GOLDEN=1).
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn((url: string) =>
    require('./fixtures/providerMatrixHarness').fakeFetch(url),
  ),
}));

// Fitting a namazvakti.com city's own point from its year takes seconds per
// city (`fitNamazvaktiPoint`, held in namazvakti.test.ts); here the method is
// computed at the listed point, which the offline tolerance allows for.
jest.mock('../src/providers/namazvakti', () => ({
  ...jest.requireActual('../src/providers/namazvakti'),
  namazvaktiCityPoint: async () => null,
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import {
  _resetCacheSweepForTests,
  getOrFetchPrayerDay,
} from '../src/prayer/prayerStorage';
import { _resetNationalTablesForTests } from '../src/providers/nationalTables';
import { _resetNamazvaktiForTests } from '../src/providers/namazvakti';
import type { PrayerDataProviderId } from '../src/settings/types';
import { deviceZone } from '../src/utils/zoneClock';
import {
  type Answer,
  DATES,
  dayOf,
  EVERYWHERE,
  instantsOf,
  KEY_DATES,
  net,
  type PlaceName,
  PLACES,
  placeDateOf,
  problemsWith,
  readable,
} from './fixtures/providerMatrixHarness';

const GOLDEN_FILE = path.join(
  __dirname,
  'fixtures/providerMatrixInstants.json',
);
const WRITE_GOLDEN = process.env.MATRIX_WRITE_GOLDEN === '1';
const golden: Record<string, number[]> = WRITE_GOLDEN
  ? {}
  : JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));

/** Each provider's own places: cities, a remote spot, across the border, offshore, border towns. */
const OWN: Record<PrayerDataProviderId, PlaceName[]> = {
  aladhan: [
    'Cologne',
    'Mecca',
    'Tehran',
    'Kolkata',
    'Adelaide',
    'Quito',
    'Ushuaia',
    'Christchurch',
    'Suva',
    'Reykjavik',
    'Murmansk',
    'Rabat',
    'Stockholm',
    'Jakarta',
    'Istanbul',
    'SouthPole',
  ],
  local_adhan: [
    'Cologne',
    'Mecca',
    'Tehran',
    'Adelaide',
    'Quito',
    'Ushuaia',
    'Christchurch',
    'Suva',
    'Reykjavik',
    'Murmansk',
    'Rabat',
    'Stockholm',
    'Jakarta',
    'Istanbul',
    'SouthPole',
  ],
  islamiska_forbundet: [
    'Stockholm',
    'Karesuando',
    'Haparanda',
    'Tornio',
    'BalticOff',
    'Oslo',
    'Kiruna',
  ],
  habous: [
    'Rabat',
    'Dakhla',
    'Bouarfa',
    'Ceuta',
    'Tlemcen',
    'MoroccoOff',
    'LasPalmas',
  ],
  marw: ['Algiers', 'Tamanrasset', 'Tlemcen', 'Tunis', 'AlgeriaOff', 'Bouarfa'],
  kemenag: [
    'Jakarta',
    'Pontianak',
    'Jayapura',
    'PapuaRemote',
    'JavaSeaOff',
    'Dili',
    'SebatikID',
    'SebatikMY',
  ],
  muis: ['Singapore', 'JohorBahru', 'KualaLumpur'],
  jakim: [
    'KualaLumpur',
    'JohorBahru',
    'Singapore',
    'SabahInterior',
    'SebatikMY',
    'SebatikID',
  ],
  namazvakti: [
    'Istanbul',
    'Cologne',
    'Stockholm',
    'Van',
    'Kas',
    'Kastellorizo',
    'NicosiaNorth',
    'Batumi',
  ],
  diyanet: [
    'Istanbul',
    'Van',
    'Kas',
    'Kastellorizo',
    'NicosiaNorth',
    'Batumi',
    'Stockholm',
  ],
} as Record<PrayerDataProviderId, PlaceName[]>;
const PROVIDERS = Object.keys(OWN) as PrayerDataProviderId[];

const SOURCES: Record<string, string[]> = {
  aladhan: ['aladhan', 'local'],
  // beyond Morocco's listed cities, AlAdhan
  habous: ['aladhan', 'local'],
  muis: ['cdn', 'seed', 'local'],
  jakim: ['cdn', 'seed', 'local'],
  namazvakti: ['namazvakti', 'cdn', 'local'],
};

/** How far the phone's own answer may be from the online one for the same day, minutes. */
const OFFLINE_TOLERANCE_MIN = 3;

function reset(mode: typeof net.mode) {
  net.mode = mode;
  _resetNationalTablesForTests();
  _resetCacheSweepForTests();
}

type Combo = {
  provider: PrayerDataProviderId;
  place: PlaceName;
  ds: string;
  method: number | 'auto';
};
function combos(provider: PrayerDataProviderId): Combo[] {
  const out: Combo[] = [];
  const own = OWN[provider];
  // AlAdhan and the phone's calculation: Automatic everywhere, and a method
  // by hand (MWL) where Automatic would be a country's own.
  const methods: Array<number | 'auto'> =
    provider === 'aladhan' || provider === 'local_adhan'
      ? ['auto', 3]
      : ['auto'];
  for (const method of methods) {
    const places =
      method === 'auto'
        ? [...own, ...EVERYWHERE]
        : ([
            'Cologne',
            'Rabat',
            'Stockholm',
            'Jakarta',
            'Istanbul',
            'Tromso',
          ] as PlaceName[]);
    for (const place of places) {
      // Every date for the provider's first two places, the key dates elsewhere.
      const dates =
        own.indexOf(place) >= 0 && own.indexOf(place) < 2 ? DATES : KEY_DATES;
      for (const ds of dates) out.push({ provider, place, ds, method });
    }
  }
  return out;
}

const key = (c: Combo, placeDate: string) =>
  `${c.provider}|${c.method}|${c.place}|${placeDate}`;

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  if (WRITE_GOLDEN) {
    const sorted = Object.fromEntries(
      Object.entries(golden).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    fs.writeFileSync(
      GOLDEN_FILE,
      JSON.stringify(sorted, null, 0).replace(/\],"/g, '],\n"') + '\n',
    );
  }
});

describe.each(PROVIDERS)('%s', provider => {
  it('answers soundly online, offline and through the storage chain, the same in every phone zone', async () => {
    const problems: string[] = [];
    let compared = 0;
    let held = 0;
    let last = '';
    for (const c of combos(provider)) {
      const place = PLACES[c.place];
      // namazvakti.com's index and years are kept for a place's run of
      // dates, as a phone keeps them (fitting a city's point is the slow part).
      if (c.place !== last) {
        _resetNamazvaktiForTests();
        last = c.place;
      }
      const day = dayOf(c.ds);
      const base = {
        provider,
        latitude: place.lat,
        longitude: place.lon,
        calculationMethod: c.method,
        school: 0,
        date: day,
      };
      const tag = `${provider}/${c.method}/${c.place}/${c.ds}`;

      // Online, through the provider (it may refuse a day; the chain answers then).
      reset('online');
      let online: Answer | null = null;
      try {
        online = await fetchPrayerTimesUnified(base);
      } catch {
        online = null;
      }
      // The provider's own answer from the phone (the widget's headless refresh).
      reset('offline');
      let offline: Answer | null = null;
      try {
        offline = await fetchPrayerTimesUnified({ ...base, offline: true });
      } catch (e) {
        problems.push(`${tag} offline threw ${String(e).slice(0, 100)}`);
      }
      // The storage chain with the network gone: never throws.
      await AsyncStorage.clear();
      reset('offline');
      let chain: Answer | null = null;
      try {
        chain = await getOrFetchPrayerDay(base);
      } catch (e) {
        problems.push(`${tag} storage chain threw ${String(e).slice(0, 100)}`);
      }

      for (const [label, a] of [
        ['online', online],
        ['offline', offline],
        ['chain', chain],
      ] as const) {
        if (!a) continue;
        for (const p of problemsWith(
          a,
          place,
          day,
          provider === 'namazvakti' ? 120 : 30,
        ))
          problems.push(`${tag} ${label}: ${p}`);
        if (label === 'chain') continue; // a stored day carries its clock, not its source
        const allowed = SOURCES[provider] ?? ['local'];
        if (!allowed.includes(a.source ?? ''))
          problems.push(`${tag} ${label}: source ${a.source}`);
      }
      // Offline lands within a few minutes of online, for the same day.
      if (
        online &&
        chain &&
        readable(online, place, day) &&
        readable(chain, place, day)
      ) {
        const on = instantsOf(online, day);
        const off = instantsOf(chain, day);
        const worst =
          Math.max(...on.map((t, i) => Math.abs(t - off[i]))) / 60_000;
        if (worst > OFFLINE_TOLERANCE_MIN) {
          problems.push(
            `${tag} offline ${worst} min from online: ${JSON.stringify(
              online.timings,
            )} ${online.clock} vs ${JSON.stringify(chain.timings)} ${
              chain.clock
            }`,
          );
        }
        compared++;
      }
      // The same instants whatever the phone's zone: every answer that can
      // be read as instants here (on a place's clock, or on the phone's with
      // the phone in the place's zone), against the instants under UTC.
      if (online && readable(online, place, day)) {
        const pd = placeDateOf(online, day);
        // AlAdhan is asked for the phone's date; across the date line that is not the place's (reported).
        const comparable = provider !== 'aladhan' || pd === c.ds;
        const k = key(c, pd);
        const ins = instantsOf(online, day);
        if (WRITE_GOLDEN) golden[k] = ins;
        else if (comparable && golden[k]) {
          if (golden[k].join() !== ins.join()) {
            const d = ins.map((t, i) => (t - golden[k][i]) / 60_000);
            problems.push(
              `${tag} on ${online.clock}: instants moved ${JSON.stringify(
                d,
              )} min with the phone in ${deviceZone()}`,
            );
          }
          held++;
        }
      }
    }
    if (problems.length)
      process.stdout.write(
        `${provider}: ${problems.length} problems\n${problems
          .slice(0, 40)
          .join('\n')}\n`,
      );
    process.stdout.write(
      `${provider} in ${deviceZone()}: ${compared} offline/online pairs, ${held} days held to UTC's instants\n`,
    );
    expect(problems).toEqual([]);
  });
});
