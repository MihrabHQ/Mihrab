/**
 * Automatic asks AlAdhan for the method the phone computes, by number,
 * everywhere (`autoMethodToAsk`), so online and offline are one timetable.
 *
 * Left to choose, AlAdhan took the method whose home is nearest: Grozny
 * Tehran's (Maghrib 23 minutes after the Russian method's), Erbil the Shia
 * Leva Institute's (17 later), Vladivostok JAKIM's (Fajr 23 earlier),
 * Limassol Jordan's, Manama Qatar's, Muscat Dubai's, Baghdad Kuwait's —
 * while offline the phone computed Russia's or MWL (checked against
 * api.aladhan.com, 22 Nov 2026).
 */
import { autoMethodForCoords, autoMethodToAsk } from '../src/providers/autoMethod';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { ROUTING_PLACES } from './fixtures/routingPlaces';

const AT: [string, number, number, number][] = [
  ['Grozny', 43.32, 45.69, 14],
  ['Nalchik', 43.49, 43.62, 14],
  ['Novosibirsk', 55.03, 82.92, 14],
  ['Vladivostok', 43.12, 131.89, 14],
  ['Baghdad', 33.31, 44.37, 9],
  ['Basra', 30.51, 47.78, 9],
  ['Erbil', 36.19, 44.01, 9],
  ['Manama', 26.23, 50.59, 1],
  ['Muscat', 23.59, 58.41, 16],
  ['Salalah', 17.02, 54.09, 16],
  ['Limassol', 34.68, 33.04, 3],
  ['Riyadh', 24.71, 46.68, 4],
  ['Delhi', 28.61, 77.21, 1],
  ['Lisbon', 38.72, -9.14, 22],
];

describe('Automatic on AlAdhan', () => {
  it.each(AT)('%s is asked for the method the phone computes (%#)', (_n, latitude, longitude, method) => {
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('aladhan');
    expect(autoMethodForCoords(latitude, longitude)).toBe(method);
    expect(autoMethodToAsk(latitude, longitude)).toBe(method);
  });

  it('never leaves the choice to AlAdhan, anywhere', () => {
    for (const [, latitude, longitude] of ROUTING_PLACES) {
      expect(autoMethodToAsk(latitude, longitude)).toBe(autoMethodForCoords(latitude, longitude));
    }
  });
});

describe('South Africa ahead of Diyanet’s listed towns', () => {
  it.each([
    ['Cape Town', -33.92, 18.42],
    ['Johannesburg', -26.2, 28.05],
    ['Pretoria', -25.75, 28.19],
  ] as const)('%s computes the Muslim World League’s angles, the MJC’s timetable', (_n, latitude, longitude) => {
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('aladhan');
    expect(autoMethodToAsk(latitude, longitude)).toBe(3);
  });

  it('a source chosen by hand stays', () => {
    expect(getEffectiveDataProvider(false, 'diyanet', { latitude: -33.92, longitude: 18.42 }, 'auto')).toBe('diyanet');
  });
});
