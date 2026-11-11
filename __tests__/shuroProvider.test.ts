/**
 * Tajikistan — the Islamic Centre's table as a source: the builder's reading
 * of the page, the towns' minutes, where Automatic picks it, and the one
 * (Hanafi) Asr.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');
jest.mock('../src/utils/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for Tajikistan’s table');
  }),
}));

import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { parseShuroMonth, parseShuroOffsets, SHURO_PLACES } from '../tools/national-tables/shuro';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { shuroTable, _resetNationalTablesForTests } from '../src/providers/nationalTables';
import { isCoordinateInTajikistan } from '../src/utils/tajikistanRegion';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { _resetDataStatusMemoForTests } from '../src/prayer/dataStatus';

const mockFetch = fetchWithRetry as jest.Mock;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const city = (id: number) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'prayer-times', 'tajikistan', 'v1', 'cities', `${id}.json`), 'utf8')) as {
    days: Record<string, string[]>;
  };

describe('the builder', () => {
  it('reads a row’s ranges: each prayer’s start, and sunrise as the end of Fajr', () => {
    const row =
      '<tr><td>Душанбе</td><td>01.06.2026</td><td>15.12.1447</td><td>03:26 - 04:59</td><td>12:40 - 17:46</td>' +
      '<td>17:47 - 19:34</td><td>19:35 - 19:52</td><td>19:53 - 20:33</td><td>21:23 - 03:25</td></tr>';
    // imsak (ten minutes before Fajr), fajr, sunrise, dhuhr, asr, maghrib, isha
    expect(parseShuroMonth(row)['2026-06-01']).toEqual([196, 206, 299, 760, 1067, 1193, 1283]);
    expect(parseShuroMonth('<tr><td>x</td></tr>')).toEqual({});
  });

  it('reads the note’s towns, earlier and later', () => {
    const note =
      'Шаҳру ноҳияҳое, ки вақти онҳо пеш аз вақти шаҳри Душанбе аст: Истаравшан - 1 дақиқа, Мурғоб - 20 дақиқа. ' +
      'Шаҳру ноҳияҳое, ки вақти онҳо баъд аз вақти шаҳри Душанбе аст: Бохтар - 4 дақиқа, Турсунзода - 3 дақиқа. © 2014';
    expect(parseShuroOffsets(note)).toEqual({ Истаравшан: -1, Мурғоб: -20, Бохтар: 4, Турсунзода: 3 });
    expect(() => parseShuroOffsets('nothing here')).toThrow();
    expect(SHURO_PLACES.length).toBe(19);
  });

  it('published each town as Dushanbe moved by its minutes', () => {
    const dushanbe = city(1).days;
    for (const p of SHURO_PLACES.slice(1)) {
      const town = city(p.id).days;
      for (const [d, t] of Object.entries(dushanbe)) {
        expect(town[d].map(toMin)).toEqual(t.map(x => toMin(x) + p.offset));
      }
    }
  });
});

describe('where it is the source', () => {
  it.each([
    ['Dushanbe', 38.5598, 68.787, true],
    ['Khujand', 40.2833, 69.6167, true],
    ['Khorugh', 37.4894, 71.553, true],
    ['Murghob', 38.171, 73.965, true],
    ['Termez (Uzbekistan)', 37.2242, 67.2783, false],
    ['Samarkand (Uzbekistan)', 39.6542, 66.9597, false],
    ['Osh (Kyrgyzstan)', 40.5283, 72.7985, false],
    ['Kunduz (Afghanistan)', 36.729, 68.857, false],
  ])('%s', (_name, latitude, longitude, inside) => {
    expect(isCoordinateInTajikistan(latitude, longitude)).toBe(inside);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto') === 'shuro').toBe(inside);
    if (inside) expect(shuroTable.covers(latitude, longitude)).toBe(true);
  });

  it('prints one Asr, the Hanafi one, and gives way to a method chosen by hand', () => {
    expect(providerHidesHanafiAsr('shuro')).toBe(true);
    expect(providerPrintsHanafiAsrOnly('shuro')).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude: 38.5598, longitude: 68.787 }, 3)).toBe('aladhan');
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

  it('serves Dushanbe’s day from the bundled seed, and Khujand’s three minutes earlier', async () => {
    const days = city(1).days;
    const ymd = Object.keys(days).sort()[0];
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12);
    const at = (latitude: number, longitude: number) =>
      fetchPrayerTimesUnified({ provider: 'shuro', latitude, longitude, date, calculationMethod: 'auto', school: 0 });
    const dushanbe = await at(38.5598, 68.787);
    expect(dushanbe.source).toBe('seed');
    expect(dushanbe.timezone).toBe('Asia/Dushanbe');
    expect(dushanbe.timings.Dhuhr).toBe('12:40');
    expect(dushanbe.timings.Fajr).toBe(days[ymd][1]);
    const khujand = await at(40.2833, 69.6167);
    expect(toMin(khujand.timings.Maghrib)).toBe(toMin(dushanbe.timings.Maghrib) - 3);
  });

  it('computes a stand-in past the published days, on Dushanbe’s clock — never AlAdhan', async () => {
    const r = await fetchPrayerTimesUnified({ provider: 'shuro', latitude: 38.5598, longitude: 68.787, date: new Date(2031, 5, 21, 12), calculationMethod: 'auto', school: 0 });
    expect(r.source).toBe('local');
    expect(toMin(r.timings.Dhuhr)).toBeGreaterThan(12 * 60 + 15);
    expect(toMin(r.timings.Dhuhr)).toBeLessThan(12 * 60 + 40);
  });
});
