/**
 * Bashkortostan — the Spiritual Administration's timetable as a source: the
 * builder's reading of a month, where Automatic picks it (a republic's
 * outline, not a country's), and the one Asr, the Hanafi one.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for Bashkortostan’s table');
  }),
}));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { BASHKORTOSTAN_PLACES, monthsOf, parseBashkortostanMonth } from '../tools/national-tables/bashkortostan';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { bashkortostanTable, _resetNationalTablesForTests } from '../src/providers/nationalTables';
import { isCoordinateInBashkortostan } from '../src/utils/bashkortostanRegion';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { _resetDataStatusMemoForTests } from '../src/prayer/dataStatus';

const mockFetch = fetchWithRetry as jest.Mock;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dir = path.join(__dirname, '..', 'data', 'prayer-times', 'bashkortostan', 'v1', 'cities');
const city = (id: number) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as { days: Record<string, string[]> };
const row = { suhurDo: '07:23', fajr: '07:38', sunrise: '09:39', dhuhr: '13:30', zaual: '13:19', asr: '15:11', maghrib: '16:59', isha: '18:53' };
const month = (rows: object[], year = 2026, m = 1) => JSON.stringify({ cityId: 1, cityName: 'Уфа', year, month: m, prayerTimes: rows });

describe('the builder', () => {
  it('reads a month as printed: the end of sahur as Imsak, the Administration’s Dhuhr and not the zenith', () => {
    const days = parseBashkortostanMonth(month(Array.from({ length: 31 }, () => row)), 'Ufa', 2026, 1);
    expect(Object.keys(days)).toHaveLength(31);
    expect(days['2026-01-01']).toEqual([443, 458, 579, 810, 911, 1019, 1133]);
    expect(Object.keys(days)[30]).toBe('2026-01-31');
  });

  it('refuses a month that is not a row a day, in order, for the month asked', () => {
    expect(() => parseBashkortostanMonth(month(Array.from({ length: 30 }, () => row)), 'x', 2026, 1)).toThrow(/30 rows, not 31/);
    expect(() => parseBashkortostanMonth(month(Array.from({ length: 28 }, () => row), 2026, 3), 'x', 2026, 2)).toThrow(/answered for 2026-3/);
    const late = Array.from({ length: 31 }, () => ({ ...row, asr: '17:30' }));
    expect(() => parseBashkortostanMonth(month(late), 'x', 2026, 1)).toThrow(/out of order/);
    const blank = Array.from({ length: 31 }, () => ({ ...row, isha: '' }));
    expect(() => parseBashkortostanMonth(month(blank), 'x', 2026, 1)).toThrow(/not a time/);
  });

  it('asks for the months a window touches, across the turn of the year', () => {
    expect(monthsOf('2026-11-05', '2027-02-12')).toEqual([[2026, 11], [2026, 12], [2027, 1], [2027, 2]]);
    expect(monthsOf('2026-06-01', '2026-06-30')).toEqual([[2026, 6]]);
  });

  it('lists the Administration’s 63 places, Ufa first, and published the same window for each place it has', () => {
    expect(BASHKORTOSTAN_PLACES).toHaveLength(63);
    expect(BASHKORTOSTAN_PLACES[0]).toMatchObject({ id: 1, nameEn: 'Ufa' });
    expect(new Set(BASHKORTOSTAN_PLACES.map(p => p.id)).size).toBe(63);
    const first = Object.keys(city(1).days);
    expect(first.length).toBeGreaterThan(30);
    const published = fs.readdirSync(dir).map(f => Number(f.replace('.json', '')));
    expect(published.length).toBeGreaterThan(50);
    for (const id of published) {
      expect(BASHKORTOSTAN_PLACES.some(p => p.id === id)).toBe(true);
      expect(Object.keys(city(id).days)).toEqual(first);
    }
  });
});

describe('where it is the source', () => {
  it.each([
    ['Ufa', 54.7352, 55.9587, true],
    ['Sterlitamak', 53.63, 55.95, true],
    ['Neftekamsk', 56.0992, 54.2615, true],
    ['Sibay', 52.72, 58.67, true],
    ['Oktyabrsky', 54.48, 53.47, true],
    ['Naberezhnye Chelny (Tatarstan)', 55.74, 52.4, false],
    ['Orenburg', 51.77, 55.1, false],
    ['Magnitogorsk (Chelyabinsk Oblast)', 53.41, 58.98, false],
    ['Chelyabinsk', 55.16, 61.4, false],
    ['Izhevsk (Udmurtia)', 56.85, 53.21, false],
    ['Perm', 58.0, 56.2, false],
  ])('%s', (_name, latitude, longitude, inside) => {
    expect(isCoordinateInBashkortostan(latitude, longitude)).toBe(inside);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto') === 'bashkortostan').toBe(inside);
    if (inside) expect(bashkortostanTable.covers(latitude, longitude)).toBe(true);
  });

  it('prints one Asr, the Hanafi one, and gives way to a method chosen by hand', () => {
    expect(providerHidesHanafiAsr('bashkortostan')).toBe(true);
    expect(providerPrintsHanafiAsrOnly('bashkortostan')).toBe(true);
    expect(providerHidesCalculationMethod('bashkortostan')).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude: 54.7352, longitude: 55.9587 }, 3)).toBe('aladhan');
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

  it('serves Ufa’s day from the bundled seed on Yekaterinburg time, and Sterlitamak’s from its own file', async () => {
    const days = city(1).days;
    const ymd = Object.keys(days).sort()[0];
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12);
    const at = (latitude: number, longitude: number) =>
      fetchPrayerTimesUnified({ provider: 'bashkortostan', latitude, longitude, date, calculationMethod: 'auto', school: 0 });
    const ufa = await at(54.7352, 55.9587);
    expect(ufa.source).toBe('seed');
    expect(ufa.timezone).toBe('Asia/Yekaterinburg');
    expect(ufa.timings.Imsak).toBe(days[ymd][0]);
    expect(ufa.timings.Fajr).toBe(days[ymd][1]);
    expect(ufa.timings.Dhuhr).toBe(days[ymd][3]);
    // the one Asr the table prints, whatever the school is set to
    expect(ufa.timings.Asr).toBe(days[ymd][4]);
    const sterlitamak = await at(53.63, 55.95);
    expect(sterlitamak.timings.Maghrib).toBe(city(23).days[ymd][5]);
  });

  it('computes a stand-in past the mirrored days, on Yekaterinburg time — never AlAdhan', async () => {
    const r = await fetchPrayerTimesUnified({ provider: 'bashkortostan', latitude: 54.7352, longitude: 55.9587, date: new Date(2031, 5, 21, 12), calculationMethod: 'auto', school: 0 });
    expect(r.source).toBe('local');
    expect(toMin(r.timings.Dhuhr)).toBeGreaterThan(13 * 60);
    expect(toMin(r.timings.Dhuhr)).toBeLessThan(13 * 60 + 35);
  });
});
