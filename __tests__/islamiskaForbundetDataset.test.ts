/**
 * Sweden (islamiskaForbundetDataset.ts): Islamiska Förbundet's cities,
 * calculated on the phone with Diyanet's method — nothing fetched.
 */
jest.unmock('adhan');

jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn().mockRejectedValue(new Error('no network in test')),
}));

import { getIslamiskaForbundetDatasetTimes, swedenServesCalculation } from '../src/providers/islamiskaForbundetDataset';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { SWEDEN_METHOD_ID } from '../src/providers/swedenMethodId';
import { SWEDEN_CLOCK } from '../src/providers/locationClock';
import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { ProviderError } from '../src/providers/errors';

// Stockholm — the nearest listed city is "Stockholm".
const STHLM = { latitude: 59.3293, longitude: 18.0686 };

describe('Sweden, calculated', () => {
  it('answers with method 24 at the nearest listed city, offline, for any date', async () => {
    expect(swedenServesCalculation()).toBe(true);
    const date = new Date(2031, 2, 3);
    const res = await getIslamiskaForbundetDatasetTimes({ ...STHLM, date });
    expect(res.source).toBe('local');
    expect(res.timezone).toBe('Europe/Stockholm');
    // the city's own point (59.330, 18.034), not the reader's — on Sweden's
    // clock, as the source prints it, whatever zone the runner keeps
    const atCity = computeLocalAdhanTimes({ latitude: 59.33, longitude: 18.034, date, calculationMethod: SWEDEN_METHOD_ID, school: 0, placeClock: SWEDEN_CLOCK });
    expect(res.timings).toEqual(atCity.timings);
    expect(fetchWithRetry).not.toHaveBeenCalled();
  });

  it('refuses a point beyond the listed cities’ reach, so the caller decides', async () => {
    await expect(
      getIslamiskaForbundetDatasetTimes({ latitude: 40.4, longitude: -3.7, date: new Date('2099-12-31T10:00:00Z') }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
