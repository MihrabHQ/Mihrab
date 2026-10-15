/**
 * Morocco's, Algeria's and Indonesia's methods are the ministries' own,
 * computed on the phone — by their provider, and as the method a reader
 * picks by hand (or Automatic's) with another provider: inside the country
 * for the nearest listed place, with the correction list, exactly as the
 * provider gives it; outside, for the reader's own spot. AlAdhan is never
 * asked for them.
 */
jest.unmock('adhan');
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked for a ministry’s method');
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import type { PrayerDataProviderId } from '../src/settings/types';

const day = new Date(2026, 9, 20);
const six = (t: Record<string, string>) => ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);
const get = (provider: PrayerDataProviderId, at: { latitude: number; longitude: number }, calculationMethod: number | 'auto', school = 0) =>
  fetchPrayerTimesUnified({ provider, ...at, date: day, calculationMethod, school });

describe.each([
  ['Morocco', 'habous', 21, { latitude: 34.02, longitude: -6.84 }],
  ['Algeria', 'marw', 19, { latitude: 36.75, longitude: 3.06 }],
  ['Indonesia', 'kemenag', 20, { latitude: -6.2, longitude: 106.85 }],
] as const)('%s', (_name, provider, method, place) => {
  it('by hand, with AlAdhan as the source, is what the ministry’s provider gives', async () => {
    const theirs = await get(provider, place, 'auto');
    const byHand = await get('aladhan', place, method);
    expect(byHand.source).toBe('local');
    expect(six(byHand.timings)).toEqual(six(theirs.timings));
  });

  it('is Automatic’s method there, computed the same way', async () => {
    const theirs = await get(provider, place, 'auto');
    const auto = await get('aladhan', place, 'auto');
    expect(six(auto.timings)).toEqual(six(theirs.timings));
  });

  it('is computed for the reader’s own spot elsewhere, never asked of AlAdhan', async () => {
    const r = await get('aladhan', { latitude: 51.5, longitude: -0.12 }, method);
    expect(r.source).toBe('local');
    expect(r.timings.Fajr).toMatch(/^\d\d:\d\d$/);
  });

  it('keeps a Hanafi Asr for a reader who asks for it', async () => {
    const shafii = await get('aladhan', place, method, 0);
    const hanafi = await get('aladhan', place, method, 1);
    expect(hanafi.timings.Asr > shafii.timings.Asr).toBe(true);
    expect(hanafi.timings.Maghrib).toBe(shafii.timings.Maghrib);
  });
});
