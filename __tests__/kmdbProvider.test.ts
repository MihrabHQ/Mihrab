/**
 * Kyrgyzstan — the Spiritual Administration's timetable as a source: the
 * builder's reading of its API, where Automatic picks it, the one (Hanafi)
 * Asr, and what stands in past the mirrored window.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for Kyrgyzstan’s timetable');
  }),
}));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { parseKmdbDate, parseKmdbRange } from '../tools/national-tables/kmdb';
import { KMDB_PLACES } from '../tools/national-tables/kmdb-places';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { kmdbTable, _resetNationalTablesForTests } from '../src/providers/nationalTables';
import { isCoordinateInKyrgyzstan } from '../src/utils/kyrgyzstanRegion';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { _resetDataStatusMemoForTests } from '../src/prayer/dataStatus';

const BISHKEK = { latitude: 42.8746, longitude: 74.5698 };
const mockFetch = fetchWithRetry as jest.Mock;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** A day the published table holds, read from it: the window moves with the calendar. */
const TABLE = (() => {
  const city = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'prayer-times', 'kyrgyzstan', 'v1', 'cities', '1.json'), 'utf8'),
  ) as { days: Record<string, string[]> };
  const ymd = Object.keys(city.days).sort()[0];
  const [y, m, d] = ymd.split('-').map(Number);
  return { date: new Date(y, m - 1, d, 12), day: city.days[ymd] };
})();

describe('the builder', () => {
  it('reads the API’s dates and rows', () => {
    expect(parseKmdbDate('31-12-2026')).toBe('2026-12-31');
    expect(() => parseKmdbDate('2026-12-31')).toThrow();
    const days = parseKmdbRange({
      prayertimes: [{ date: '01-06-2027', fajr: '03:14', sunrise: '05:25', dhuhr: '12:59', asr: '18:16', maghrib: '20:40', isha: '22:24' }],
    });
    // imsak (ten minutes before Fajr), fajr, sunrise, dhuhr, asr, maghrib, isha
    expect(days['2027-06-01']).toEqual([184, 194, 325, 779, 1096, 1240, 1344]);
    expect(() => parseKmdbRange({ prayertimes: [] })).toThrow();
  });

  it('lists every place once, inside the country', () => {
    expect(KMDB_PLACES.length).toBe(115);
    expect(new Set(KMDB_PLACES.map(p => p.id)).size).toBe(115);
    for (const p of KMDB_PLACES) {
      expect(p.lat).toBeGreaterThan(39);
      expect(p.lat).toBeLessThan(43.5);
      expect(p.lon).toBeGreaterThan(69);
      expect(p.lon).toBeLessThan(80.5);
    }
  });
});

describe('where it is the source', () => {
  it.each([
    ['Bishkek', 42.8746, 74.5698, true],
    ['Osh', 40.5283, 72.7985, true],
    ['Karakol', 42.4907, 78.3936, true],
    ['Naryn', 41.4287, 75.9911, true],
    ['Andijan (Uzbekistan)', 40.7821, 72.3442, false],
    ['Almaty (Kazakhstan)', 43.2389, 76.8897, false],
    ['Khujand (Tajikistan)', 40.2833, 69.6167, false],
    ['Kashgar (China)', 39.4704, 75.9898, false],
  ])('%s', (_name, latitude, longitude, inside) => {
    expect(isCoordinateInKyrgyzstan(latitude, longitude)).toBe(inside);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto') === 'kmdb').toBe(inside);
    expect(getEffectiveDataProvider(false, 'kmdb', { latitude, longitude }, 'auto') === 'kmdb').toBe(inside);
    if (inside) expect(kmdbTable.covers(latitude, longitude)).toBe(true);
  });

  it('gives way to a method chosen by hand, and says its one Asr is the Hanafi one', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', BISHKEK, 3)).toBe('aladhan');
    expect(providerHidesCalculationMethod('kmdb')).toBe(true);
    expect(providerHidesHanafiAsr('kmdb')).toBe(true);
    expect(providerPrintsHanafiAsrOnly('kmdb')).toBe(true);
    expect(providerPrintsHanafiAsrOnly('jakim')).toBe(false);
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

  const at = (date: Date, school: number) =>
    fetchPrayerTimesUnified({ provider: 'kmdb', ...BISHKEK, date, calculationMethod: 'auto', school });

  it('serves Bishkek’s day from the bundled seed, the same for every school', async () => {
    const r = await at(TABLE.date, 0);
    expect(r.source).toBe('seed');
    expect(r.timezone).toBe('Asia/Bishkek');
    expect([r.timings.Fajr, r.timings.Sunrise, r.timings.Dhuhr, r.timings.Asr, r.timings.Maghrib, r.timings.Isha]).toEqual(TABLE.day.slice(1));
    expect((await at(TABLE.date, 1)).timings).toEqual(r.timings);
  });

  it('computes a stand-in past the window with the Hanafi Asr, on Bishkek’s clock — never AlAdhan', async () => {
    const far = new Date(2031, 5, 21, 12);
    const standard = await at(far, 0);
    expect(standard.source).toBe('local');
    // UTC+6: midday prayer about one, and the Hanafi Asr late in the afternoon.
    expect(toMin(standard.timings.Dhuhr)).toBeGreaterThan(12 * 60 + 50);
    expect(toMin(standard.timings.Dhuhr)).toBeLessThan(13 * 60 + 15);
    expect(toMin(standard.timings.Asr)).toBeGreaterThan(18 * 60);
    expect((await at(far, 1)).timings.Asr).toBe(standard.timings.Asr);
  });
});
