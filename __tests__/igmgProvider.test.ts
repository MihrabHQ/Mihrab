/**
 * IGMG as a source: its prayer calendar is Diyanet's tables for its cities,
 * so the app serves it with Diyanet's method on the phone — the same day,
 * time for time, as the Diyanet source.
 */
jest.unmock('adhan');
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for IGMG');
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { isDiyanetSource, providerHidesCalculationMethod, providerHidesHanafiAsr } from '../src/settings/providerUi';
import { PRAYER_DATA_PROVIDERS } from '../src/settings/providersCatalog';

const PLACES: [string, number, number][] = [
  ['Berlin', 52.52, 13.405],
  ['Cologne', 50.9375, 6.9603],
  ['Vienna', 48.2082, 16.3738],
  ['Oslo', 59.9139, 10.7522],
  ['Sydney', -33.8688, 151.2093],
];

describe('IGMG', () => {
  it.each(PLACES)('serves Diyanet’s day in %s, winter and midsummer', async (_name, latitude, longitude) => {
    for (const date of [new Date(2027, 0, 15, 12), new Date(2027, 5, 21, 12)]) {
      for (const school of [0, 1]) {
        const at = (provider: 'igmg' | 'diyanet') =>
          fetchPrayerTimesUnified({ provider, latitude, longitude, date, calculationMethod: 'auto', school });
        const igmg = await at('igmg');
        const diyanet = await at('diyanet');
        expect(igmg.timings).toEqual(diyanet.timings);
        expect(igmg.source).toBe(diyanet.source);
      }
    }
  });

  it('is in the list, keeps the Hanafi switch and hides the method picker, as Diyanet does', () => {
    expect(PRAYER_DATA_PROVIDERS.some(p => p.id === 'igmg')).toBe(true);
    expect(isDiyanetSource('igmg')).toBe(true);
    expect(isDiyanetSource('aladhan')).toBe(false);
    expect(providerHidesCalculationMethod('igmg')).toBe(true);
    expect(providerHidesHanafiAsr('igmg')).toBe(false);
  });

  it('is kept wherever the reader is when chosen, and is never Automatic’s pick', () => {
    const berlin = { latitude: 52.52, longitude: 13.405 };
    expect(getEffectiveDataProvider(false, 'igmg', berlin, 'auto')).toBe('igmg');
    expect(getEffectiveDataProvider(false, 'igmg', { latitude: -29.0135, longitude: 134.7544 }, 'auto')).toBe('igmg');
    expect(getEffectiveDataProvider(true, 'aladhan', berlin, 'auto')).toBe('diyanet');
  });
});
