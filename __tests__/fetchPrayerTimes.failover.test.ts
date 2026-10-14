/**
 * Same-request failover for the Swedish scraper (v2.7.30; the stand-in
 * changed October 2026).
 *
 * Before, an islamiska_forbundet failure threw all the way up and the
 * caller fell back to on-device adhan — for THREE separate sessions —
 * until the cooldown finally routed elsewhere. Now the very request that
 * observed the failure is computed on the phone with Islamiska
 * Förbundet's own convention (method 24, read off its tables), for the
 * nearest listed city. AlAdhan is no longer asked: its nearest method is
 * the Muslim World League's, an hour from the tables on a midsummer night.
 */
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { __resetProviderHealthForTests } from '../src/providers/providerHealth';
import { ProviderError } from '../src/providers/errors';

jest.mock('../src/providers/islamiskaForbundet', () => ({
  fetchIslamiskaForbundetTimes: jest.fn(),
}));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(),
}));
jest.unmock('adhan');
// This suite exercises the LIVE scraper → AlAdhan failover, so force the
// prepared-dataset rung (tried first) to miss and fall through.
jest.mock('../src/providers/islamiskaForbundetDataset', () => ({
  getIslamiskaForbundetDatasetTimes: jest
    .fn()
    .mockRejectedValue(new Error('dataset miss (test)')),
}));

import { fetchIslamiskaForbundetTimes } from '../src/providers/islamiskaForbundet';
import { fetchAladhanTimes } from '../src/providers/aladhan';

const GOOD = {
  timings: {
    Imsak: '02:10',
    Fajr: '02:20',
    Sunrise: '03:40',
    Dhuhr: '12:55',
    Asr: '17:30',
    Maghrib: '22:05',
    Isha: '23:35',
  },
  timezone: 'Europe/Stockholm',
};

const PARAMS = {
  provider: 'islamiska_forbundet' as const,
  latitude: 59.33,
  longitude: 18.06,
  date: new Date(2026, 6, 6),
  calculationMethod: 3 as const,
  school: 0,
};

describe('islamiska_forbundet same-request failover', () => {
  beforeEach(() => {
    __resetProviderHealthForTests();
    jest.clearAllMocks();
  });

  it('computes Islamiska Förbundet’s convention in the SAME call when the scraper fails', async () => {
    (fetchIslamiskaForbundetTimes as jest.Mock).mockRejectedValue(
      new ProviderError('islamiska_forbundet', 'timeout', 'origin down'),
    );

    const res = await fetchPrayerTimesUnified(PARAMS);
    expect(res.source).toBe('local');
    expect(res.timezone).toBe('Europe/Stockholm');
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
    // 6 July at Stockholm: the table's night share, not an 18° that the
    // sun never reaches — Fajr a little after two, Isha a little after eleven.
    expect(res.timings.Fajr >= '02:10' && res.timings.Fajr <= '02:30').toBe(true);
    expect(res.timings.Isha >= '23:00' && res.timings.Isha <= '23:15').toBe(true);
  });

  it('still uses the scraper result when it succeeds', async () => {
    (fetchIslamiskaForbundetTimes as jest.Mock).mockResolvedValue(GOOD);
    const res = await fetchPrayerTimesUnified(PARAMS);
    expect(res.timings.Isha).toBe('23:35');
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
  });
});
