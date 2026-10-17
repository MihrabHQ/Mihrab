/**
 * Fitting a namazvakti.com city's own point from its year takes about six
 * and a half seconds of a phone's time, and every launch spent them again on
 * the city's first miss. The fit is now kept on disk beside the year, and
 * fitted again only when the year is fetched again.
 */
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');

const mockSun = jest.fn();
jest.mock('../src/providers/preciseSun', () => {
  const actual = jest.requireActual('../src/providers/preciseSun');
  return {
    ...actual,
    preciseApparentSun: (...a: unknown[]) => {
      mockSun();
      return actual.preciseApparentSun(...a);
    },
  };
});

// eslint-disable-next-line import/first
import {
  namazvaktiCityPoint,
  _resetNamazvaktiForTests,
} from '../src/providers/namazvakti';
// eslint-disable-next-line import/first
import { parseNamazvaktiXml } from '../src/providers/namazvaktiParser';

const xml = fs.readFileSync(
  path.join(__dirname, 'fixtures/namazvakti/stockholm-16258.xml'),
  'utf8',
);
const CITY = {
  id: 16258,
  lat: 59.3167,
  lon: 18.0667,
  name: 'Stockholm',
  heightM: 250,
  distanceKm: 0,
};
const YEAR_KEY = 'namazvakti.city.v1.16258';
const FIT_KEY = 'namazvakti.fit.v1.16258';

beforeEach(async () => {
  await AsyncStorage.clear();
  _resetNamazvaktiForTests();
  mockSun.mockClear();
});

async function holdYear(fetchedAt: string) {
  const year = parseNamazvaktiXml(xml, 2026, fetchedAt);
  expect(year.cityId).toBe(CITY.id);
  await AsyncStorage.setItem(YEAR_KEY, JSON.stringify(year));
}

it('fits once, and a later launch reads the fit from disk', async () => {
  await holdYear('2026-10-01T00:00:00.000Z');
  const first = await namazvaktiCityPoint(CITY);
  expect(first).not.toBeNull();
  expect(mockSun).toHaveBeenCalled();
  expect(JSON.parse((await AsyncStorage.getItem(FIT_KEY))!)).toEqual({
    fetchedAt: '2026-10-01T00:00:00.000Z',
    fit: first,
  });

  // The same session: the in-memory memo.
  mockSun.mockClear();
  expect(await namazvaktiCityPoint(CITY)).toEqual(first);
  expect(mockSun).not.toHaveBeenCalled();

  // A new launch: memory empty, the disk answers, nothing is computed.
  _resetNamazvaktiForTests();
  expect(await namazvaktiCityPoint(CITY)).toEqual(first);
  expect(mockSun).not.toHaveBeenCalled();
});

it('fits again when the year has been fetched again', async () => {
  await holdYear('2026-10-01T00:00:00.000Z');
  await namazvaktiCityPoint(CITY);
  _resetNamazvaktiForTests();
  await holdYear('2026-10-15T00:00:00.000Z');
  mockSun.mockClear();
  expect(await namazvaktiCityPoint(CITY)).not.toBeNull();
  expect(mockSun).toHaveBeenCalled();
  expect(JSON.parse((await AsyncStorage.getItem(FIT_KEY))!).fetchedAt).toBe(
    '2026-10-15T00:00:00.000Z',
  );
});

it('keeps nothing without a year', async () => {
  expect(await namazvaktiCityPoint(CITY)).toBeNull();
  expect(await AsyncStorage.getItem(FIT_KEY)).toBeNull();
});
