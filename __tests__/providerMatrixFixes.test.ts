/**
 * What the provider matrix (`providerMatrix.test.ts`) turned up, each held
 * on its own, and the storage chain's handling of a network that answers
 * garbage: a captive portal's HTML, half a file, a table without the day.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceZone } from '../src/utils/zoneClock';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn((url: string) =>
    require('./fixtures/providerMatrixHarness').fakeFetch(url),
  ),
}));
jest.mock('../src/providers/locationClock', () => {
  const actual = jest.requireActual('../src/providers/locationClock');
  return {
    ...actual,
    // A phone across the date line from the place: its day is the place's next.
    placeCivilDay: jest.fn((date: Date, clock: unknown) => {
      const day = actual.placeCivilDay(date, clock);
      if (!(global as { acrossDateLine?: boolean }).acrossDateLine || !clock)
        return day;
      const next = new Date(day.y, day.m, day.d + 1);
      return { y: next.getFullYear(), m: next.getMonth(), d: next.getDate() };
    }),
  };
});

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { computeLocalAdhanInstants } from '../src/providers/localAdhan';
import { validateTimings } from '../src/providers/validateTimings';
import {
  getNamazvaktiTimes,
  _resetNamazvaktiForTests,
} from '../src/providers/namazvakti';
import { parseNamazvaktiXml } from '../src/providers/namazvaktiParser';
import {
  namazvaktiBucketAsset,
  NV_PACK_BUCKETS,
  packYear,
} from '../src/providers/namazvaktiPack';
import {
  _resetNationalTablesForTests,
  muisTable,
} from '../src/providers/nationalTables';
import { getMarwDatasetTimes } from '../src/providers/marwDataset';
import {
  _resetCacheSweepForTests,
  getDatasetPrayerDayOrNull,
  getOrFetchPrayerDay,
} from '../src/prayer/prayerStorage';
import { combineLocalDateAndTime } from '../src/utils/prayerTimes';
import { net, PLACES, response } from './fixtures/providerMatrixHarness';

const ROOT = path.join(__dirname, '..');
const mockFetch = fetchWithRetry as jest.Mock;
const settle = () => new Promise(r => setTimeout(r, 0));

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
beforeEach(async () => {
  await AsyncStorage.clear();
  net.mode = 'online';
  net.calls.length = 0;
  _resetNationalTablesForTests();
  _resetNamazvaktiForTests();
  _resetCacheSweepForTests();
  (global as { acrossDateLine?: boolean }).acrossDateLine = false;
});

describe('namazvakti.com at the turn of the year', () => {
  const XML = fs.readFileSync(
    path.join(__dirname, 'fixtures/namazvakti/cologne-5887.xml'),
    'utf8',
  );
  const COLOGNE = { latitude: 50.94, longitude: 6.96, school: 0 };
  const published = new Set([2026, 2027]);
  function bucket(y: number) {
    const year = parseNamazvaktiXml(
      XML.replace(/^(<\?xml[^>]*\?>)?/, `$1<!--${y}-->`),
      y,
    );
    const gz = zlib.gzipSync(
      JSON.stringify({
        v: 1,
        bucket: 5887 % NV_PACK_BUCKETS,
        year: y,
        builtAt: 'x',
        cities: { '5887': packYear(year) },
      }),
    );
    return {
      ...response(200, ''),
      arrayBuffer: async () =>
        gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength),
    };
  }
  beforeEach(() => {
    mockFetch.mockImplementation(async (url: string) => {
      net.calls.push(url);
      if (url.endsWith('/tiles/50_5.json')) {
        return response(
          200,
          fs.readFileSync(
            path.join(ROOT, 'data/prayer-times/namazvakti/v1/tiles/50_5.json'),
            'utf8',
          ),
        );
      }
      const m = /data-namazvakti-(\d{4})\//.exec(url);
      if (
        m &&
        url.endsWith(namazvaktiBucketAsset(5887)) &&
        published.has(Number(m[1]))
      )
        return bucket(Number(m[1]));
      return response(404, 'Not Found');
    });
  });
  afterEach(() => {
    mockFetch.mockImplementation((url: string) =>
      require('./fixtures/providerMatrixHarness').fakeFetch(url),
    );
    published.add(2027);
  });

  it('serves the published days on both sides of it, whichever year was fetched first', async () => {
    // Each file runs 31 December – 2 January. Holding 2026's (fetched a
    // moment ago), 3 January was computed for six hours, then 2027's
    // replaced 2026's and the last days of December were computed instead.
    const sources: string[] = [];
    for (const [y, m, d] of [
      [2026, 11, 30],
      [2027, 0, 3],
      [2026, 11, 29],
      [2027, 0, 4],
    ]) {
      const r = await getNamazvaktiTimes({
        ...COLOGNE,
        date: new Date(y, m, d),
      });
      sources.push(r.source!);
    }
    expect(sources).toEqual(['cdn', 'cdn', 'cdn', 'cdn']);
  });

  it('asks for a year nobody has published yet once, not on every read', async () => {
    published.delete(2027);
    await getNamazvaktiTimes({ ...COLOGNE, date: new Date(2026, 11, 30) });
    const asked = () =>
      net.calls.filter(u => u.includes('data-namazvakti-2027')).length;
    for (const d of [3, 4, 5, 6]) {
      await expect(
        getNamazvaktiTimes({ ...COLOGNE, date: new Date(2027, 0, d) }),
      ).rejects.toThrow(/No published day/);
    }
    expect(asked()).toBe(1);
    // …and what was held is still there.
    expect(
      (await getNamazvaktiTimes({ ...COLOGNE, date: new Date(2026, 11, 29) }))
        .source,
    ).toBe('cdn');
  });
});

describe('a network day whose sun sets after midnight', () => {
  // AlAdhan's Reykjavik, 21 June: the sun sets at 00:04 on Reykjavik's clock.
  const reykjavik = {
    Fajr: '02:04',
    Sunrise: '02:55',
    Dhuhr: '13:31',
    Asr: '18:23',
    Maghrib: '00:04',
    Isha: '00:53',
    Imsak: '01:54',
  };

  it('is a day, not damage', () => {
    expect(() => validateTimings(reykjavik)).not.toThrow();
  });

  it('still refuses a Maghrib that is plainly out of place', () => {
    expect(() =>
      validateTimings({ ...reykjavik, Maghrib: '14:00', Isha: '15:00' }),
    ).toThrow(/Asr/);
    expect(() =>
      validateTimings({
        ...reykjavik,
        Asr: '13:40',
        Maghrib: '02:30',
        Isha: '03:00',
      }),
    ).toThrow(/Asr/);
    expect(() => validateTimings({ ...reykjavik, Isha: '23:30' })).toThrow(
      /Isha/,
    );
  });

  it('reaches the storage chain as AlAdhan answered it', async () => {
    const r = PLACES.Reykjavik;
    const day = await getOrFetchPrayerDay({
      provider: 'aladhan',
      latitude: r.lat,
      longitude: r.lon,
      calculationMethod: 3,
      school: 0,
      date: new Date(2026, 5, 21),
    });
    expect(day.clock).toBe('Atlantic/Reykjavik');
  });
});

describe('the Ministry of Habous chosen in western Algeria', () => {
  it('stores and reads the Algerian ministry’s day, as the provider answers', async () => {
    const t = PLACES.Tlemcen;
    const at = {
      latitude: t.lat,
      longitude: t.lon,
      date: new Date(2026, 9, 17),
    };
    const params = {
      provider: 'habous' as const,
      ...at,
      calculationMethod: 'auto' as const,
      school: 0,
    };
    const algeria = await getMarwDatasetTimes(at);
    expect((await fetchPrayerTimesUnified(params)).timings).toEqual(
      algeria.timings,
    );
    // The dataset-first read of the storage chain, and the cache-only readers' (widget).
    expect((await getOrFetchPrayerDay(params)).timings).toEqual(
      algeria.timings,
    );
    expect((await getDatasetPrayerDayOrNull(params))?.timings).toEqual(
      algeria.timings,
    );
  });
});

describe('a national table past its window', () => {
  it('computes the authority’s day on the table’s clock, as the table prints its own', async () => {
    const sg = PLACES.Singapore;
    const p = {
      provider: 'muis' as const,
      latitude: sg.lat,
      longitude: sg.lon,
      calculationMethod: 'auto' as const,
      school: 0,
    };
    const printedDay = new Date(2026, 11, 28);
    const computedDay = new Date(2027, 0, 3);
    const printed = await fetchPrayerTimesUnified({ ...p, date: printedDay });
    const computed = await fetchPrayerTimesUnified({ ...p, date: computedDay });
    expect(printed.source).not.toBe('local');
    expect(computed.source).toBe('local');
    expect(printed.clock).toBe('Asia/Singapore');
    // Was the phone's: a saved Singapore read on a phone in Stockholm put Fajr the evening before.
    expect(computed.clock).toBe('Asia/Singapore');
    const minutes = (r: typeof printed, day: Date) =>
      combineLocalDateAndTime(day, r.timings.Fajr, r.clock).getTime() / 60_000;
    // Six days apart, a few minutes apart.
    expect(
      Math.abs(
        minutes(computed, computedDay) -
          minutes(printed, printedDay) -
          6 * 1440,
      ),
    ).toBeLessThanOrEqual(4);
  });

  it('gives the place’s own day for the phone’s, as the readers take it', async () => {
    // Across the date line the readers put the phone's 30 December on
    // Singapore's 31st (`utils/prayerTimes.ts`): the row must be the 31st's.
    const sg = PLACES.Singapore;
    const q = { latitude: sg.lat, longitude: sg.lon };
    const own = await muisTable.getTimes({
      ...q,
      date: new Date(2026, 11, 31),
    });
    (global as { acrossDateLine?: boolean }).acrossDateLine = true;
    const across = await muisTable.getTimes({
      ...q,
      date: new Date(2026, 11, 30),
    });
    expect(across.timings).toEqual(own.timings);
  });
});

describe('the storage chain when the network answers garbage', () => {
  const cases = [
    {
      name: 'AlAdhan (MWL in Cologne)',
      provider: 'aladhan' as const,
      place: PLACES.Cologne,
      method: 3,
      date: new Date(2026, 9, 17),
    },
    {
      name: 'MUIS past its window',
      provider: 'muis' as const,
      place: PLACES.Singapore,
      method: 'auto' as const,
      date: new Date(2027, 0, 3),
    },
    {
      name: 'namazvakti.com',
      provider: 'namazvakti' as const,
      place: PLACES.Istanbul,
      method: 'auto' as const,
      date: new Date(2026, 9, 17),
    },
  ];

  it.each(cases)(
    '$name: a portal page or half a file is the network gone',
    async c => {
      const params = {
        provider: c.provider,
        latitude: c.place.lat,
        longitude: c.place.lon,
        calculationMethod: c.method,
        school: 0,
        date: c.date,
      };
      const answers = [];
      for (const mode of ['offline', 'html', 'truncated'] as const) {
        await AsyncStorage.clear();
        _resetNationalTablesForTests();
        _resetNamazvaktiForTests();
        net.mode = mode;
        answers.push(await getOrFetchPrayerDay(params));
      }
      // A day written on the phone's clock is kept under the zone the
      // phone is in (prayerStorage `keptClock`); the two names are one clock.
      const named = (a: (typeof answers)[number]) => ({
        ...a,
        clock: a.clock === 'device' ? (deviceZone() ?? 'device') : a.clock,
      });
      expect(named(answers[1])).toEqual(named(answers[0]));
      expect(named(answers[2])).toEqual(named(answers[0]));
    },
  );

  it('writes the cache for a network answer and not for a table’s day', async () => {
    const slots = async () => {
      await settle();
      const raw = await AsyncStorage.getItem('prayer_times_cache.v2');
      return raw
        ? Object.values(
            JSON.parse(raw).caches as Record<
              string,
              {
                provider: string;
                months: Record<string, Record<string, unknown>>;
              }
            >,
          )
        : [];
    };
    const c = PLACES.Cologne;
    await getOrFetchPrayerDay({
      provider: 'aladhan',
      latitude: c.lat,
      longitude: c.lon,
      calculationMethod: 3,
      school: 0,
      date: new Date(2026, 9, 17),
    });
    const s = PLACES.Singapore;
    await getOrFetchPrayerDay({
      provider: 'muis',
      latitude: s.lat,
      longitude: s.lon,
      calculationMethod: 'auto',
      school: 0,
      date: new Date(2026, 9, 17),
    });
    const st = PLACES.Stockholm;
    await getOrFetchPrayerDay({
      provider: 'islamiska_forbundet',
      latitude: st.lat,
      longitude: st.lon,
      calculationMethod: 'auto',
      school: 0,
      date: new Date(2026, 9, 17),
    });
    const written = await slots();
    expect(written.map(e => e.provider)).toEqual(['aladhan']);
    expect(written[0].months['2026-10']['2026-10-17']).toBeDefined();
  });
});

describe('the Algerian Ministry’s method south of the equator', () => {
  it('puts Asr between Dhuhr and Maghrib, as the plain shadow does', () => {
    // The 'marw' provider abroad computes the method for the spot; its
    // signed noon shadow put Asr at Dhuhr in Pago Pago and Jakarta in June.
    for (const p of [
      PLACES.PagoPago,
      PLACES.Jakarta,
      PLACES.Quito,
      PLACES.Algiers,
    ]) {
      for (const date of [
        new Date(2026, 5, 21),
        new Date(2026, 11, 21),
        new Date(2027, 2, 20),
      ]) {
        const at = { latitude: p.lat, longitude: p.lon, date, school: 0 };
        const dz = computeLocalAdhanInstants({ ...at, calculationMethod: 19 });
        const mwl = computeLocalAdhanInstants({ ...at, calculationMethod: 3 });
        expect(dz.asr.getTime()).toBeGreaterThan(
          dz.dhuhr.getTime() + 60 * 60_000,
        );
        expect(dz.asr.getTime()).toBeLessThan(dz.maghrib.getTime());
        if (p.lat < 0) {
          // the same shadow as MWL's, to the Ministry's rounding
          expect(
            Math.abs(dz.asr.getTime() - mwl.asr.getTime()),
          ).toBeLessThanOrEqual(3 * 60_000);
        }
      }
    }
  });
});
