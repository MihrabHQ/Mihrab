/**
 * The United States and Canada: Automatic computes 15° / 15° (the Islamic
 * Society of North America's angles, AlAdhan's method 2) — asked of AlAdhan
 * by number, the same on the phone offline, and ahead of the places Diyanet
 * lists in nearly every town of both. Mexico and the islands are as before.
 */
jest.unmock('adhan');

import { autoMethodAheadOfListedPlace, autoMethodForCoords, autoMethodToAsk } from '../src/providers/autoMethod';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { isCoordinateInUsOrCanada } from '../src/utils/northAmericaRegion';

const INSIDE = [
  ['New York', 40.713, -74.006],
  ['Manhattan, the Battery', 40.703, -74.016],
  ['Dearborn', 42.322, -83.176],
  ['Chicago, the lakefront', 41.88, -87.615],
  ['Houston', 29.76, -95.37],
  ['Los Angeles', 34.052, -118.244],
  ['El Paso', 31.76, -106.487],
  ['Key West', 24.555, -81.78],
  ['Honolulu', 21.307, -157.858],
  ['Anchorage', 61.218, -149.9],
  ['Boise', 43.615, -116.202],
  ['Toronto', 43.653, -79.383],
  ['Montreal', 45.502, -73.567],
  ['Edmonton', 53.546, -113.494],
  ['Vancouver', 49.283, -123.121],
  ['Windsor, across the river from Detroit', 42.314, -83.037],
  ['Halifax', 44.649, -63.575],
  ['St. John’s', 47.561, -52.713],
] as const;

const OUTSIDE = [
  ['Monterrey', 25.67, -100.31],
  ['Ensenada', 31.87, -116.6],
  ['Havana', 23.11, -82.37],
  ['Nassau', 25.05, -77.35],
  ['San Juan', 18.47, -66.11],
  ['Nuuk', 64.18, -51.72],
  ['Reykjavik', 64.15, -21.94],
  ['London', 51.507, -0.128],
  ['Paris', 48.857, 2.352],
] as const;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

describe('The United States and Canada on Automatic', () => {
  it.each(INSIDE)('%s computes 15° / 15°, and not Diyanet’s table', (_name, latitude, longitude) => {
    expect(isCoordinateInUsOrCanada(latitude, longitude)).toBe(true);
    expect(autoMethodForCoords(latitude, longitude)).toBe(2);
    expect(autoMethodToAsk(latitude, longitude)).toBe(2);
    expect(autoMethodAheadOfListedPlace(latitude, longitude)).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('aladhan');
  });

  it.each(OUTSIDE)('%s is outside', (_name, latitude, longitude) => {
    expect(isCoordinateInUsOrCanada(latitude, longitude)).toBe(false);
    expect(autoMethodToAsk(latitude, longitude)).toBe('auto');
    expect(autoMethodAheadOfListedPlace(latitude, longitude)).toBe(false);
  });

  it('a source chosen by hand stays', () => {
    expect(getEffectiveDataProvider(false, 'diyanet', { latitude: 40.713, longitude: -74.006 }, 'auto')).toBe('diyanet');
  });

  it('New York’s Fajr is later than at 18°, its Maghrib at sunset', () => {
    for (const month of [0, 3, 5, 8, 10]) {
      const at = { latitude: 40.713, longitude: -74.006, date: new Date(2026, month, 15, 12), school: 0 as const, placeClock: { zone: 'America/New_York' } };
      const auto = computeLocalAdhanTimes({ ...at, calculationMethod: 'auto' }).timings;
      const mwl = computeLocalAdhanTimes({ ...at, calculationMethod: 3 }).timings;
      expect(minutes(auto.Fajr) - minutes(mwl.Fajr)).toBeGreaterThanOrEqual(12);
      expect(minutes(mwl.Isha) - minutes(auto.Isha)).toBeGreaterThanOrEqual(8);
      expect(auto.Maghrib).toBe(mwl.Maghrib);
    }
  });

  it('AlAdhan is asked for the method by number', async () => {
    const asked: string[] = [];
    const fetchWas = global.fetch;
    global.fetch = jest.fn((url: unknown) => {
      asked.push(String(url));
      // Refused outright: the address asked is all this looks at, and a refusal is not retried.
      return Promise.resolve({ ok: false, status: 403 } as Response);
    }) as unknown as typeof fetch;
    try {
      await fetchPrayerTimesUnified({ provider: 'aladhan', latitude: 43.653, longitude: -79.383, date: new Date(2026, 5, 15, 12), calculationMethod: 'auto', school: 0 }).catch(() => null);
      expect(asked[0]).toContain('method=2&');
    } finally {
      global.fetch = fetchWas;
    }
  });
});
