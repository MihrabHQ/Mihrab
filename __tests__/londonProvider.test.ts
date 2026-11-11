/**
 * London — the London Unified Prayer Timetable as a source: the builder's
 * reading of the API, the two Asr times, where Automatic picks it, and what
 * stands in past the published year.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for London’s timetable');
  }),
}));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { parseLondonMonth } from '../tools/national-tables/london';
import { checkDay } from '../tools/national-tables/write';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { londonTable, nationalTablePlaceId, _resetNationalTablesForTests } from '../src/providers/nationalTables';
import { isCoordinateInLondon } from '../src/utils/londonRegion';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr } from '../src/settings/providerUi';
import { _resetDataStatusMemoForTests } from '../src/prayer/dataStatus';

const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const mockFetch = fetchWithRetry as jest.Mock;

/** A day the published table holds, read from it: the window moves with the calendar. */
const TABLE = (() => {
  const city = (id: number) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'prayer-times', 'london', 'v1', 'cities', `${id}.json`), 'utf8')) as {
      days: Record<string, string[]>;
    };
  const first = city(1);
  const second = city(2);
  const ymd = Object.keys(first.days).sort()[0];
  const [y, m, d] = ymd.split('-').map(Number);
  return { ymd, date: new Date(y, m - 1, d, 12), first: first.days[ymd], second: second.days[ymd], all: first.days, all2: second.days };
})();

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

describe('the builder', () => {
  it('reads a month of the API’s answer into the two tables', () => {
    const { first, second } = parseLondonMonth({
      times: {
        '2026-06-21': {
          date: '2026-06-21', fajr: '02:47', sunrise: '04:40', dhuhr: '13:07',
          asr: '17:26', asr_2: '18:38', magrib: '21:25', isha: '22:42',
        },
      },
    });
    // imsak (ten minutes before Fajr), fajr, sunrise, dhuhr, asr, maghrib, isha
    expect(first['2026-06-21']).toEqual([157, 167, 280, 787, 1046, 1285, 1362]);
    expect(second['2026-06-21'][4]).toBe(18 * 60 + 38);
    expect(() => parseLondonMonth({ times: { '2026-06-21': { fajr: '02:47' } } })).toThrow();
  });

  it('accepts London’s midwinter Maghrib, before four, only where the builder says so', () => {
    const day: [number, number, number, number, number, number, number] = [371, 381, 481, 724, 818, 957, 1054];
    expect(() => checkDay('London', '2026-12-21', day)).toThrow();
    expect(() => checkDay('London', '2026-12-21', day, 15 * 60 + 30)).not.toThrow();
  });

  it('published both tables with the same days, differing in Asr alone', () => {
    const days = Object.keys(TABLE.all);
    expect(days.length).toBeGreaterThan(7);
    expect(Object.keys(TABLE.all2)).toEqual(days);
    for (const d of days) {
      const a = TABLE.all[d];
      const b = TABLE.all2[d];
      expect([b[0], b[1], b[2], b[3], b[5], b[6]]).toEqual([a[0], a[1], a[2], a[3], a[5], a[6]]);
      expect(toMin(b[4])).toBeGreaterThan(toMin(a[4]));
      expect(toMin(b[4])).toBeLessThan(toMin(a[5]));
    }
  });
});

describe('where it is the source', () => {
  it.each([
    ['Charing Cross', 51.5074, -0.1278, true],
    ['Whitechapel', 51.5176, -0.0652, true],
    ['Croydon', 51.3762, -0.0982, true],
    ['Watford', 51.6565, -0.3903, true],
    ['Luton', 51.8787, -0.42, false],
    ['Reading', 51.4543, -0.9781, false],
    ['Birmingham', 52.4862, -1.8904, false],
    ['Paris', 48.8566, 2.3522, false],
  ])('%s', (_name, latitude, longitude, inside) => {
    expect(isCoordinateInLondon(latitude, longitude)).toBe(inside);
    expect(londonTable.covers(latitude, longitude)).toBe(inside);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto') === 'london').toBe(inside);
    // Pinned, it is kept in the city and given up outside it.
    expect(getEffectiveDataProvider(false, 'london', { latitude, longitude }, 'auto') === 'london').toBe(inside);
  });

  it('gives way to a calculation method chosen by hand, and keeps the Hanafi switch', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', LONDON, 3)).toBe('aladhan');
    expect(providerHidesCalculationMethod('london')).toBe(true);
    expect(providerHidesHanafiAsr('london')).toBe(false);
    expect(nationalTablePlaceId('london', 0)).toBe(1);
    expect(nationalTablePlaceId('london', 1)).toBe(2);
    expect(nationalTablePlaceId('muis', 1)).toBeUndefined();
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

  const at = (date: Date, school: number, where = LONDON) =>
    fetchPrayerTimesUnified({ provider: 'london', ...where, date, calculationMethod: 'auto', school });

  it('serves the timetable’s day from the bundled seed, with the first Asr', async () => {
    const r = await at(TABLE.date, 0);
    expect(r.source).toBe('seed');
    expect(r.timezone).toBe('Europe/London');
    expect([r.timings.Fajr, r.timings.Sunrise, r.timings.Dhuhr, r.timings.Asr, r.timings.Maghrib, r.timings.Isha]).toEqual(TABLE.first.slice(1));
  });

  it('serves the timetable’s second Asr to the Hanafi school, and nothing else changes', async () => {
    const shafii = await at(TABLE.date, 0);
    const hanafi = await at(TABLE.date, 1);
    expect(hanafi.source).toBe('seed');
    expect(hanafi.timings.Asr).toBe(TABLE.second[4]);
    expect(hanafi.timings.Asr).not.toBe(shafii.timings.Asr);
    for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Maghrib', 'Isha'] as const) {
      expect(hanafi.timings[k]).toBe(shafii.timings[k]);
    }
  });

  it('serves the same day anywhere in the city', async () => {
    const croydon = await at(TABLE.date, 0, { latitude: 51.3762, longitude: -0.0982 });
    expect(croydon.source).toBe('seed');
    expect(croydon.timings.Maghrib).toBe(TABLE.first[5]);
  });

  it('computes a stand-in past the published year, on London’s clock, in summer time too — never AlAdhan', async () => {
    const summer = await at(new Date(2031, 5, 21, 12), 0);
    expect(summer.source).toBe('local');
    // British Summer Time: midday prayer after one, sunset after nine.
    expect(toMin(summer.timings.Dhuhr)).toBeGreaterThan(13 * 60);
    expect(toMin(summer.timings.Dhuhr)).toBeLessThan(13 * 60 + 15);
    expect(toMin(summer.timings.Maghrib)).toBeGreaterThan(21 * 60);
    const winter = await at(new Date(2031, 0, 15, 12), 0);
    expect(toMin(winter.timings.Dhuhr)).toBeGreaterThan(12 * 60);
    expect(toMin(winter.timings.Dhuhr)).toBeLessThan(12 * 60 + 20);
    // The stand-in keeps the reader's school.
    const hanafi = await at(new Date(2031, 0, 15, 12), 1);
    expect(toMin(hanafi.timings.Asr)).toBeGreaterThan(toMin(winter.timings.Asr));
  });
});
