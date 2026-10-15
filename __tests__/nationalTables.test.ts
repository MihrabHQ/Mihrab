/**
 * Singapore (MUIS) and Malaysia (JAKIM): the two national tables served
 * through `nationalTable.ts`, from the builders' parsing to the phone.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for a national table');
  }),
}));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { parseMuisCsv, SINGAPORE } from '../tools/national-tables/muis';
import { parseJakimDate, parseJakimYear } from '../tools/national-tables/jakim';
import kemenagPlaces from '../src/providers/data/kemenagPlaces.json';
import { JAKIM_ZONES, jakimPlaces } from '../tools/national-tables/jakim-zones';
import { checkDay, BuildError } from '../tools/national-tables/write';
import { createNationalTable, seedTuple } from '../src/providers/nationalTable';
import { jakimZoneCode, parseJakimLive, parseMuisLive } from '../src/providers/nationalLive';
import { _resetNationalTablesForTests, jakimTable, kemenagTable, muisTable, nationalTableFor } from '../src/providers/nationalTables';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { autoMethodForCoords } from '../src/providers/autoMethod';
import { providerHidesCalculationMethod, providerHidesHanafiAsr } from '../src/settings/providerUi';
import { REGIONAL_PRAYER_PROVIDERS } from '../src/settings/providersCatalog';
import { getDataStatus, _resetDataStatusMemoForTests } from '../src/prayer/dataStatus';

const FIX = path.join(__dirname, 'fixtures/national-tables');
const read = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8');
const mockFetch = fetchWithRetry as jest.Mock;

const SG = { latitude: 1.3521, longitude: 103.8198 };
const KL = { latitude: 3.139, longitude: 101.6869 };
const KK = { latitude: 5.9804, longitude: 116.0735 };
const JAKARTA = { latitude: -6.2088, longitude: 106.8456 };
const NUNUKAN = { latitude: 4.13, longitude: 117.66 };
const TAWAU = { latitude: 4.25, longitude: 117.89 };

function response(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
}

describe('the builders read what the authorities publish', () => {
  it('reads MUIS’s CSV, on both of its clocks', () => {
    const days = parseMuisCsv(read('muis-head.csv'));
    // 2024 prints the afternoon on a 12-hour clock: "01:10" Zohor is 13:10.
    expect(days['2024-01-01']).toEqual([5 * 60 + 34, 5 * 60 + 44, 7 * 60 + 7, 13 * 60 + 10, 16 * 60 + 34, 19 * 60 + 10, 20 * 60 + 25]);
    // 2026 on a 24-hour one.
    expect(days['2026-12-31']).toEqual([5 * 60 + 34, 5 * 60 + 44, 7 * 60 + 7, 13 * 60 + 10, 16 * 60 + 34, 19 * 60 + 10, 20 * 60 + 25]);
    for (const d of Object.values(days)) expect(() => checkDay('Singapore', 'x', d)).not.toThrow();
  });

  it('reads e-Solat’s year, with its Malay month names', () => {
    expect(parseJakimDate('31-Dis-2026')).toBe('2026-12-31');
    expect(parseJakimDate('5-Ogos-2026')).toBe('2026-08-05');
    expect(parseJakimDate('15-Mac-2026')).toBe('2026-03-15');
    expect(() => parseJakimDate('15-March-2026')).toThrow(BuildError);
    const sample = JSON.parse(read('jakim-sgr01-sample.json'));
    sample.prayerTime = Array.from({ length: 365 }, (_, i) => sample.prayerTime[i % sample.prayerTime.length]);
    const days = parseJakimYear(sample);
    expect(days['2026-01-01']).toEqual([5 * 60 + 56, 6 * 60 + 6, 7 * 60 + 17, 13 * 60 + 19, 16 * 60 + 42, 19 * 60 + 17, 20 * 60 + 31]);
    expect(() => parseJakimYear({ prayerTime: [], status: 'NO RECORD!' })).toThrow(/NO RECORD/);
  });

  it('lists Kemenag’s regencies, each once and in Indonesia', () => {
    const places = kemenagPlaces as { id: number; nameEn: string; lat: number; lon: number }[];
    expect(places.length).toBeGreaterThan(500);
    expect(new Set(places.map(p => p.id)).size).toBe(places.length);
    expect(new Set(places.map(p => p.nameEn)).size).toBe(places.length);
    for (const p of places) {
      expect(p.lat).toBeGreaterThan(-11.2);
      expect(p.lat).toBeLessThan(6.2);
      expect(p.lon).toBeGreaterThan(94.9);
      expect(p.lon).toBeLessThan(141.1);
    }
  });

  it('refuses a day whose times are out of order or implausible', () => {
    expect(() => checkDay('x', 'd', [300, 310, 420, 780, 960, 1140, 1220])).not.toThrow();
    expect(() => checkDay('x', 'd', [310, 300, 420, 780, 960, 1140, 1220])).toThrow(/out of order/);
    expect(() => checkDay('x', 'd', [300, 310, 420, 500, 960, 1140, 1220])).toThrow(/implausible/);
  });

  it('lists every JAKIM zone once, each with its towns on the map', () => {
    const codes = JAKIM_ZONES.map(z => z.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBe(59);
    for (const z of JAKIM_ZONES) {
      expect(z.towns.length).toBeGreaterThan(0);
      for (const [, lat, lon] of z.towns) {
        expect(lat).toBeGreaterThan(0.8);
        expect(lat).toBeLessThan(7.5);
        expect(lon).toBeGreaterThan(99);
        expect(lon).toBeLessThan(120);
      }
    }
    const places = jakimPlaces();
    expect(places.find(p => p.name === 'Kuala Lumpur')?.id).toBe(codes.indexOf('WLY01') + 1);
  });
});

describe('the seed', () => {
  const seed = { version: 1, builtAt: 't', start: '2026-10-07', days: 2, cities: { '1': [323, 333, 410, 774, 965, 1136, 1205, 323, 333, 410, 774, 965, 1135, 1204] } };
  it('turns seven minute counts into the day tuple', () => {
    expect(seedTuple(seed, 1, '2026-10-07')).toEqual(['05:23', '05:33', '06:50', '12:54', '16:05', '18:56', '20:05']);
    expect(seedTuple(seed, 1, '2026-10-08')?.[5]).toBe('18:55');
    expect(seedTuple(seed, 1, '2026-10-09')).toBeUndefined();
    expect(seedTuple(seed, 2, '2026-10-07')).toBeUndefined();
  });
});

describe('the phone’s backup parsers read as the builders do', () => {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  it('e-Solat’s year', () => {
    const sample = JSON.parse(read('jakim-sgr01-sample.json'));
    // The builder refuses fewer than 300 days; the sample's run repeated to a year (the dates repeat too).
    const builder = parseJakimYear({ ...sample, prayerTime: Array.from({ length: 365 }, (_, i) => sample.prayerTime[i % sample.prayerTime.length]) });
    const phone = parseJakimLive(sample);
    expect(Object.keys(phone).sort()).toEqual(Object.keys(builder).sort());
    for (const [k, d] of Object.entries(builder)) expect(phone[k]).toEqual(d.map(clock));
  });
  it('MUIS’s CSV', () => {
    const csv = read('muis-head.csv');
    const builder = parseMuisCsv(csv);
    const phone = parseMuisLive(csv);
    for (const [k, d] of Object.entries(builder)) expect(phone[k]).toEqual(d.map(clock));
  });
  it('names a JAKIM place’s zone', () => {
    expect(jakimZoneCode('Kuala Lumpur (WLY01)')).toBe('WLY01');
    expect(jakimZoneCode('Singapore')).toBeNull();
  });
});

describe('on the phone', () => {
  beforeEach(async () => {
    _resetNationalTablesForTests();
    _resetDataStatusMemoForTests();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async () => response(404, ''));
    await AsyncStorage.clear();
  });

  it('serves MUIS’s day from the bundled seed, and JAKIM’s for the nearest zone', async () => {
    const sg = await fetchPrayerTimesUnified({ provider: 'muis', ...SG, date: new Date(2026, 9, 14), calculationMethod: 'auto', school: 0 });
    expect(sg.source).toBe('seed');
    expect(sg.timings.Fajr).toBe('05:31');
    expect(sg.timings.Maghrib).toBe('18:54');
    const kl = await fetchPrayerTimesUnified({ provider: 'jakim', ...KL, date: new Date(2026, 9, 14), calculationMethod: 'auto', school: 0 });
    expect(kl.source).toBe('seed');
    expect(jakimTable.nearest(KL.latitude, KL.longitude)?.nameEn).toBe('Kuala Lumpur (WLY01)');
    expect(jakimTable.nearest(KK.latitude, KK.longitude)?.nameEn).toBe('Kota Kinabalu (SBH07)');
  });

  it('computes the authority’s own method past the window or outside the country — never AlAdhan', async () => {
    const past = await fetchPrayerTimesUnified({ provider: 'jakim', ...KL, date: new Date(2027, 0, 3), calculationMethod: 'auto', school: 0 });
    expect(past.source).toBe('local');
    const away = await fetchPrayerTimesUnified({ provider: 'muis', latitude: 51.5, longitude: -0.1, date: new Date(2026, 9, 14), calculationMethod: 'auto', school: 0 });
    expect(away.source).toBe('local');
  });

  it('asks e-Solat itself for a day the repo’s copy lacks, and remembers its answer', async () => {
    const sample = JSON.parse(read('jakim-sgr01-sample.json')) as { prayerTime: { date: string }[] };
    const first = sample.prayerTime[0].date; // "01-Jan-2026"-style
    const [d, mon, y] = first.split('-');
    const months: Record<string, number> = { Jan: 0, Feb: 1, Mac: 2, Apr: 3, Mei: 4, Jun: 5, Jul: 6, Ogos: 7, Sep: 8, Okt: 9, Nov: 10, Dis: 11 };
    const date = new Date(Number(y), months[mon], Number(d));
    const seen: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      seen.push(url);
      if (url.includes('e-solat.gov.my')) return response(200, JSON.stringify(sample));
      return response(404, '');
    });
    const r = await jakimTable.getTimes({ ...KL, date });
    // January 2026 is before the bundled seed's window, so only the source has it.
    expect(r.source).toBe('live');
    expect(seen.some(u => u.includes('zone=WLY01'))).toBe(true);
    // The repo is asked first; the source only behind it.
    expect(seen.findIndex(u => u.includes('e-solat.gov.my'))).toBeGreaterThanOrEqual(0);
    expect(await AsyncStorage.getItem('jakim.live.v1.58')).toBeTruthy();
  });

  it('takes a newer file from the server and remembers it', async () => {
    const day = '2026-10-14';
    const file = JSON.stringify({ id: 1, city: 'Singapore', timezone: 'Asia/Singapore', builtAt: 'later', days: { [day]: ['05:00', '05:10', '06:30', '12:50', '16:00', '18:50', '20:00'] } });
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/index.json')) return response(200, JSON.stringify({ builtAt: 'later', serverStatus: 'ok', minCoverageDays: 70 }));
      if (url.endsWith('/cities/1.json')) return response(200, file);
      return response(404, '');
    });
    const first = await muisTable.getTimes({ ...SG, date: new Date(2026, 9, 14) });
    expect(first.source).toBe('seed');
    await new Promise(r => setTimeout(r, 20));
    const second = await muisTable.getTimes({ ...SG, date: new Date(2026, 9, 14) });
    expect(second.source).toBe('cdn');
    expect(second.timings.Fajr).toBe('05:10');
    expect((await getDataStatus()).servers.muis.minCoverageDays).toBe(70);
    expect(await AsyncStorage.getItem('muis.dataset.v1.city.1')).toContain('later');
  });

  it('is what Automatic picks in Singapore and Malaysia, with the matching method offline', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', SG)).toBe('muis');
    expect(getEffectiveDataProvider(true, 'aladhan', KL)).toBe('jakim');
    expect(getEffectiveDataProvider(true, 'aladhan', KK)).toBe('jakim');
    expect(getEffectiveDataProvider(false, 'jakim', SG)).not.toBe('jakim');
    expect(getEffectiveDataProvider(true, 'aladhan', JAKARTA)).toBe('kemenag');
    // Across the Sabah border, twenty kilometres apart: each to its own ministry.
    expect(getEffectiveDataProvider(true, 'aladhan', NUNUKAN)).toBe('kemenag');
    expect(getEffectiveDataProvider(true, 'aladhan', TAWAU)).toBe('jakim');
    expect(autoMethodForCoords(JAKARTA.latitude, JAKARTA.longitude)).toBe(20);
    expect(autoMethodForCoords(SG.latitude, SG.longitude)).toBe(11);
    expect(autoMethodForCoords(KL.latitude, KL.longitude)).toBe(17);
    expect(autoMethodForCoords(KK.latitude, KK.longitude)).toBe(17);
  });

  it('is offered as a regional source, with no method or madhab to pick', () => {
    for (const id of ['muis', 'jakim', 'kemenag'] as const) {
      expect(REGIONAL_PRAYER_PROVIDERS.some(p => p.id === id)).toBe(true);
      expect(providerHidesCalculationMethod(id)).toBe(true);
      expect(providerHidesHanafiAsr(id)).toBe(true);
      expect(nationalTableFor(id)).not.toBeNull();
    }
    expect(nationalTableFor('aladhan')).toBeNull();
  });

  it('bundles a seed that covers today for every place of the served tables', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const t of [muisTable, jakimTable]) {
      const seed = t.config.seed!;
      expect(seed.start <= today).toBe(true);
      const ids = new Set(t.config.places.map(p => p.id));
      for (const id of ids) expect(seedTuple(seed, id, seed.start)).toBeDefined();
    }
    // Kemenag's is computed on the phone: no seed, nothing downloaded.
    expect(kemenagTable.config.seed).toBeUndefined();
    expect(kemenagTable.config.baseUrl).toBeUndefined();
    expect(createNationalTable({ ...muisTable.config, id: 'x' }).nearest(SG.latitude, SG.longitude)?.name).toBe(SINGAPORE.name);
  });
});
