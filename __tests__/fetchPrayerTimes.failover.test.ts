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
import { computeLocalAdhanInstants, computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { SWEDEN_METHOD_ID } from '../src/providers/swedenMethodId';

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
    // The listed city's own times (Stockholm, at the point it is computed
    // at): on 6 July the carried night share, not an 18° that the sun never
    // reaches. Compared in whatever zone the runner keeps.
    const city = computeLocalAdhanInstants({ latitude: 59.33, longitude: 18.034, date: PARAMS.date, calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    const stockholm = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(d);
    expect(stockholm(city.fajr) >= '02:10' && stockholm(city.fajr) <= '02:30').toBe(true);
    expect(stockholm(city.isha) >= '23:00' && stockholm(city.isha) <= '23:15').toBe(true);
    const asServed = computeLocalAdhanTimes({ latitude: 59.33, longitude: 18.034, date: PARAMS.date, calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    expect(res.timings).toEqual(asServed.timings);
  });

  it('computes the reader’s own spot beyond the listed cities’ reach', async () => {
    const res = await fetchPrayerTimesUnified({ ...PARAMS, latitude: 69.5, longitude: 30.5 });
    expect(res.source).toBe('local');
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
  });
});
