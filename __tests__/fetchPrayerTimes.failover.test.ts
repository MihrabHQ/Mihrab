/**
 * Sweden on the phone (October 2026): Islamiska Förbundet's cities are
 * calculated with Diyanet's method (method 24) — nothing is fetched. Beyond
 * the listed cities' reach the day is computed for the reader's own spot.
 * AlAdhan is not asked: its nearest method is the Muslim World League's,
 * an hour from Islamiska Förbundet's times on a midsummer night.
 */
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';

jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(),
}));
jest.unmock('adhan');

import { fetchAladhanTimes } from '../src/providers/aladhan';

const PARAMS = {
  provider: 'islamiska_forbundet' as const,
  latitude: 59.33,
  longitude: 18.06,
  date: new Date(2026, 6, 6),
  calculationMethod: 3 as const,
  school: 0,
};

describe('Islamiska Förbundet, calculated', () => {
  beforeEach(() => jest.clearAllMocks());

  it('computes the nearest listed city on the phone — never AlAdhan', async () => {
    const res = await fetchPrayerTimesUnified(PARAMS);
    expect(res.source).toBe('local');
    expect(res.timezone).toBe('Europe/Stockholm');
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
    // 6 July at Stockholm: the carried night share, not an 18° that the
    // sun never reaches — Fajr a little after two, Isha a little after eleven.
    expect(res.timings.Fajr >= '02:10' && res.timings.Fajr <= '02:30').toBe(true);
    expect(res.timings.Isha >= '23:00' && res.timings.Isha <= '23:15').toBe(true);
  });

  it('computes the reader’s own spot beyond the listed cities’ reach', async () => {
    const res = await fetchPrayerTimesUnified({ ...PARAMS, latitude: 69.5, longitude: 30.5 });
    expect(res.source).toBe('local');
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
  });
});
