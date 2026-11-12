/**
 * Turkmenistan: no timetable of its own to follow, so Automatic is Diyanet's
 * method throughout the country — near one of the towns Diyanet lists and
 * away from them alike — and nowhere over the border on that account.
 */
jest.unmock('adhan');

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { isCoordinateInTurkmenistan } from '../src/utils/turkmenistanRegion';

describe('Turkmenistan', () => {
  it.each([
    ['Ashgabat', 37.95, 58.38],
    ['Türkmenabat', 39.07, 63.58],
    ['Daşoguz', 41.84, 59.97],
    ['Mary', 37.6, 61.83],
    ['Türkmenbaşy, the seafront', 40.02, 52.97],
    ['Balkanabat', 39.51, 54.37],
    ['Darvaza, in the Karakum, far from every listed town', 40.25, 58.44],
    ['Serhetabat, the southern tip', 35.28, 62.34],
    ['Köneürgenç', 42.33, 59.15],
  ] as const)('%s takes Diyanet’s method on Automatic', (_name, latitude, longitude) => {
    expect(isCoordinateInTurkmenistan(latitude, longitude)).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('diyanet');
    // a method chosen by hand stays
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
  });

  it.each([
    ['Bukhara', 39.77, 64.42],
    ['Urgench', 41.55, 60.63],
    ['Nukus', 42.46, 59.6],
    ['Mashhad', 36.29, 59.59],
    ['Herat', 34.35, 62.2],
    ['Termez', 37.22, 67.28],
    ['Aktau', 43.65, 51.15],
    ['Sarakhs, on Iran’s side of the river', 36.54, 61.16],
  ] as const)('%s is outside', (_name, latitude, longitude) => {
    expect(isCoordinateInTurkmenistan(latitude, longitude)).toBe(false);
  });

  it('computes a day in the desert, offline', async () => {
    const r = await fetchPrayerTimesUnified({ provider: 'diyanet', latitude: 40.25, longitude: 58.44, date: new Date(2026, 5, 21, 12), calculationMethod: 'auto', school: 0 });
    expect(r.source).toBe('local');
    for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) expect(r.timings[k]).toMatch(/^\d\d:\d\d$/);
  });
});
