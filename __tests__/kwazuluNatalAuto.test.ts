/**
 * KwaZulu-Natal: Automatic computes 18° / 18° (Karachi's angles, the Jamiatul
 * Ulama KwaZulu-Natal's Fajr and Isha) — on AlAdhan by number, on the phone
 * offline, and ahead of Diyanet's listed Durban, Pietermaritzburg and
 * Newcastle. The rest of South Africa asks AlAdhan for the Muslim World
 * League's angles by number, which is what the phone computed there
 * already; the neighbours are as before.
 */
jest.unmock('adhan');

import { autoMethodForCoords, autoMethodToAsk, DEFAULT_AUTO_METHOD } from '../src/providers/autoMethod';
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { isCoordinateInKwaZuluNatal } from '../src/utils/kwazuluNatalRegion';
import { isCoordinateInSouthAfrica } from '../src/utils/southAfricaRegion';

const INSIDE = [
  ['Durban', -29.86, 31.02],
  ['Durban, the Bluff seafront', -29.87, 31.05],
  ['Pietermaritzburg', -29.6, 30.38],
  ['Newcastle', -27.76, 29.93],
  ['Richards Bay', -28.78, 32.04],
  ['Ladysmith', -28.56, 29.78],
  ['Port Shepstone', -30.74, 30.45],
  ['Kokstad', -30.55, 29.42],
  ['Kosi Bay', -26.95, 32.83],
] as const;

const OUTSIDE = [
  ['Johannesburg', -26.2, 28.04, true],
  ['Cape Town', -33.93, 18.42, true],
  ['Mthatha', -31.59, 28.78, true],
  ['Harrismith', -28.27, 29.13, true],
  ['Volksrust', -27.37, 29.88, true],
  ['Maseru', -29.31, 27.48, false],
  ['Mbabane', -26.32, 31.14, false],
  ['Ponta do Ouro', -26.84, 32.89, false],
] as const;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

describe('KwaZulu-Natal on Automatic', () => {
  it.each(INSIDE)('%s computes 18° / 18°, and not Diyanet’s table', (_name, latitude, longitude) => {
    expect(isCoordinateInKwaZuluNatal(latitude, longitude)).toBe(true);
    expect(autoMethodForCoords(latitude, longitude)).toBe(1);
    expect(autoMethodToAsk(latitude, longitude)).toBe(1);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('aladhan');
  });

  it.each(OUTSIDE)('%s is outside the province', (_name, latitude, longitude, southAfrica) => {
    expect(isCoordinateInKwaZuluNatal(latitude, longitude)).toBe(false);
    expect(autoMethodForCoords(latitude, longitude)).toBe(DEFAULT_AUTO_METHOD);
    // The rest of South Africa asks AlAdhan for the Muslim World League's by
    // number (its own Automatic answers Umm al-Qura's there); the neighbours do not.
    expect(isCoordinateInSouthAfrica(latitude, longitude)).toBe(southAfrica);
    expect(autoMethodToAsk(latitude, longitude)).toBe(southAfrica ? 3 : 'auto');
  });

  it.each([
    ['Gqeberha', -33.96, 25.6],
    ['Bloemfontein', -29.12, 26.21],
    ['Polokwane', -23.9, 29.45],
    ['Musina', -22.34, 30.04],
    ['Upington', -28.45, 21.25],
    ['Cape Town, Sea Point', -33.915, 18.385],
    ['Ladybrand, across the river from Maseru', -29.19, 27.46],
    ['Komatipoort', -25.43, 31.95],
  ] as const)('%s is in South Africa', (_name, latitude, longitude) => {
    expect(isCoordinateInSouthAfrica(latitude, longitude)).toBe(true);
    expect(autoMethodToAsk(latitude, longitude)).toBe(3);
  });

  it.each([
    ['Gaborone', -24.65, 25.91],
    ['Beitbridge', -22.21, 30.0],
    ['Oranjemund', -28.55, 16.43],
    ['Mokhotlong, in Lesotho', -29.29, 29.06],
    ['Ressano Garcia', -25.44, 31.99],
    ['Lavumisa', -27.31, 31.89],
  ] as const)('%s is not', (_name, latitude, longitude) => {
    expect(isCoordinateInSouthAfrica(latitude, longitude)).toBe(false);
    expect(autoMethodToAsk(latitude, longitude)).toBe('auto');
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
      const ask = (latitude: number, longitude: number) =>
        fetchPrayerTimesUnified({ provider: 'aladhan', latitude, longitude, date: new Date(2026, 5, 15, 12), calculationMethod: 'auto', school: 0 }).catch(() => null);
      await ask(-28.78, 32.04); // Richards Bay
      expect(asked[0]).toContain('method=1&');
      asked.length = 0;
      await ask(-31.59, 28.78); // Mthatha
      expect(asked[0]).toContain('method=3&');
      asked.length = 0;
      await ask(-24.65, 25.91); // Gaborone
      expect(asked[0]).not.toContain('method=');
    } finally {
      global.fetch = fetchWas;
    }
  });

  it('Durban’s Isha is later than the Muslim World League’s, its Fajr the same', () => {
    for (const month of [0, 3, 5, 8, 10]) {
      const at = { latitude: -29.86, longitude: 31.02, date: new Date(2026, month, 15, 12), school: 0 as const, placeClock: { zone: 'Africa/Johannesburg' } };
      const auto = computeLocalAdhanTimes({ ...at, calculationMethod: 'auto' }).timings;
      const mwl = computeLocalAdhanTimes({ ...at, calculationMethod: 3 }).timings;
      const later = minutes(auto.Isha) - minutes(mwl.Isha);
      expect(later).toBeGreaterThanOrEqual(4);
      expect(later).toBeLessThanOrEqual(7);
      expect(auto.Fajr).toBe(mwl.Fajr);
      expect(auto.Maghrib).toBe(mwl.Maghrib);
    }
  });
});
