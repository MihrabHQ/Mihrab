/**
 * Dagestan — the Muftiate's table as a source: the builder's reading of a
 * place's file, the day of the year a date takes, where Automatic picks it
 * (a republic's outline, not a country's), and the one Asr.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for Dagestan’s table');
  }),
}));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { clockOf, dagestanRowOf, parseDagestanYear, DAGESTAN_PLACES } from '../tools/national-tables/dagestan';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { dagestanTable, _resetNationalTablesForTests } from '../src/providers/nationalTables';
import { isCoordinateInDagestan } from '../src/utils/dagestanRegion';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { _resetDataStatusMemoForTests } from '../src/prayer/dataStatus';

const mockFetch = fetchWithRetry as jest.Mock;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const city = (id: number) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'prayer-times', 'dagestan', 'v1', 'cities', `${id}.json`), 'utf8')) as {
    days: Record<string, string[]>;
  };
const row = { namaz_1: '05:42', voshod: '07:19', namaz_2: '11:58', namaz_3: '14:09', namaz_4: '16:31', namaz_5: '17:51' };

describe('the builder', () => {
  it('reads a place’s 365 rows, Imsak standing ten minutes before Fajr', () => {
    const year = parseDagestanYear(JSON.stringify(Array.from({ length: 365 }, () => row)), 'Makhachkala');
    expect(year).toHaveLength(365);
    expect(year[0]).toEqual([332, 342, 439, 718, 849, 991, 1071]);
  });

  it('refuses a file that is not 365 rows of six times in order', () => {
    expect(() => parseDagestanYear(JSON.stringify(Array.from({ length: 364 }, () => row)), 'x')).toThrow(/364 rows/);
    const late = Array.from({ length: 365 }, () => ({ ...row, namaz_3: '17:00' }));
    expect(() => parseDagestanYear(JSON.stringify(late), 'x')).toThrow(/out of order/);
    const blank = Array.from({ length: 365 }, () => ({ ...row, namaz_5: '' }));
    expect(() => parseDagestanYear(JSON.stringify(blank), 'x')).toThrow(/not a time/);
  });

  it('reads a time printed without its colon as what it is, and says so', () => {
    const notes: string[] = [];
    expect(clockOf('0252', 'Dagestanskiye Ogni day 124 namaz_1', notes)).toBe(172);
    expect(notes).toEqual(['Dagestanskiye Ogni day 124 namaz_1: "0252" read as 02:52']);
    expect(clockOf('02:52', 'x', notes)).toBe(172);
    expect(notes).toHaveLength(1);
    expect(() => clockOf('2572', 'x', notes)).toThrow();
  });

  it('takes a date’s row by the day of an ordinary year: 29 February is 28 February’s, and March is not moved', () => {
    expect(dagestanRowOf('2026-01-01')).toBe(0);
    expect(dagestanRowOf('2026-12-31')).toBe(364);
    expect(dagestanRowOf('2028-02-28')).toBe(58);
    expect(dagestanRowOf('2028-02-29')).toBe(58);
    expect(dagestanRowOf('2028-03-01')).toBe(59);
    expect(dagestanRowOf('2028-12-31')).toBe(364);
  });

  it('published all 27 places over the same window', () => {
    expect(DAGESTAN_PLACES).toHaveLength(27);
    const first = Object.keys(city(1).days);
    expect(first.length).toBeGreaterThan(100);
    for (const p of DAGESTAN_PLACES) expect(Object.keys(city(p.id).days)).toEqual(first);
  });
});

describe('where it is the source', () => {
  it.each([
    ['Makhachkala', 42.9831, 47.5047, true],
    // the seafront, which the outline's simplified coast leaves a few hundred metres out
    ['Makhachkala, the centre by the sea', 42.9849, 47.5047, true],
    ['Derbent, the harbour', 42.062, 48.305, true],
    ['Derbent', 42.0578, 48.2889, true],
    ['Khasavyurt', 43.2509, 46.5876, true],
    ['Kizlyar', 43.8484, 46.7141, true],
    ['Botlikh', 42.665, 46.22, true],
    ['Grozny (Chechnya)', 43.3178, 45.6949, false],
    ['Gudermes (Chechnya)', 43.3513, 46.1033, false],
    ['Astrakhan', 46.3497, 48.0408, false],
    ['Quba (Azerbaijan)', 41.3611, 48.5134, false],
    ['Zaqatala (Azerbaijan)', 41.6336, 46.6433, false],
    ['Telavi (Georgia)', 41.9198, 45.4731, false],
  ])('%s', (_name, latitude, longitude, inside) => {
    expect(isCoordinateInDagestan(latitude, longitude)).toBe(inside);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto') === 'dagestan').toBe(inside);
    if (inside) expect(dagestanTable.covers(latitude, longitude)).toBe(true);
  });

  it('prints one Asr, the first, and gives way to a method chosen by hand', () => {
    expect(providerHidesHanafiAsr('dagestan')).toBe(true);
    expect(providerPrintsHanafiAsrOnly('dagestan')).toBe(false);
    expect(providerHidesCalculationMethod('dagestan')).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude: 42.9831, longitude: 47.5047 }, 3)).toBe('aladhan');
  });
});

describe('on the phone', () => {
  beforeEach(async () => {
    _resetNationalTablesForTests();
    _resetDataStatusMemoForTests();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async () => ({ ok: false, status: 404, text: async () => '', json: async () => ({}) }));
    await AsyncStorage.clear();
  });

  it('serves Makhachkala’s day from the bundled seed on Moscow time, and Derbent’s from its own file', async () => {
    const days = city(1).days;
    const ymd = Object.keys(days).sort()[0];
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12);
    const at = (latitude: number, longitude: number) =>
      fetchPrayerTimesUnified({ provider: 'dagestan', latitude, longitude, date, calculationMethod: 'auto', school: 1 });
    const makhachkala = await at(42.9831, 47.5047);
    expect(makhachkala.source).toBe('seed');
    expect(makhachkala.timezone).toBe('Europe/Moscow');
    expect(makhachkala.timings.Fajr).toBe(days[ymd][1]);
    // the one Asr the table prints, whatever the school is set to
    expect(makhachkala.timings.Asr).toBe(days[ymd][4]);
    const derbent = await at(42.0578, 48.2889);
    expect(derbent.timings.Maghrib).toBe(city(10).days[ymd][5]);
  });

  it('computes a stand-in past the mirrored days, on Moscow time — never AlAdhan', async () => {
    const r = await fetchPrayerTimesUnified({ provider: 'dagestan', latitude: 42.9831, longitude: 47.5047, date: new Date(2031, 5, 21, 12), calculationMethod: 'auto', school: 0 });
    expect(r.source).toBe('local');
    expect(toMin(r.timings.Dhuhr)).toBeGreaterThan(11 * 60 + 40);
    expect(toMin(r.timings.Dhuhr)).toBeLessThan(12 * 60 + 5);
  });
});
