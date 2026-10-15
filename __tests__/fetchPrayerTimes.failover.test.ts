/**
 * Sweden on the phone (October 2026): Islamiska Förbundet's tables come from
 * Mihrab's repo, never from the site itself. Where the repo's mirror cannot
 * answer — outside its reach — the day is computed on the phone with the
 * method its tables follow (method 24), for the nearest listed city. The
 * site's widget is not scraped and AlAdhan is not asked: its nearest method
 * is the Muslim World League's, an hour from the tables on a midsummer night.
 */
import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';

jest.mock('../src/providers/islamiskaForbundet', () => ({
  fetchIslamiskaForbundetTimes: jest.fn(),
}));
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(),
}));
jest.unmock('adhan');
jest.mock('../src/providers/islamiskaForbundetDataset', () => ({
  getIslamiskaForbundetDatasetTimes: jest.fn(),
}));

import { fetchIslamiskaForbundetTimes } from '../src/providers/islamiskaForbundet';
import { fetchAladhanTimes } from '../src/providers/aladhan';
import { getIslamiskaForbundetDatasetTimes } from '../src/providers/islamiskaForbundetDataset';

const MIRRORED = {
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
  source: 'cdn' as const,
};

const PARAMS = {
  provider: 'islamiska_forbundet' as const,
  latitude: 59.33,
  longitude: 18.06,
  date: new Date(2026, 6, 6),
  calculationMethod: 3 as const,
  school: 0,
};

describe('Islamiska Förbundet, from the repo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('serves the repo’s mirrored day', async () => {
    (getIslamiskaForbundetDatasetTimes as jest.Mock).mockResolvedValue(MIRRORED);
    const res = await fetchPrayerTimesUnified(PARAMS);
    expect(res.timings.Isha).toBe('23:35');
    expect(res.source).toBe('cdn');
    expect(fetchIslamiskaForbundetTimes).not.toHaveBeenCalled();
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
  });

  it('computes Islamiska Förbundet’s convention where the mirror cannot answer — never the site, never AlAdhan', async () => {
    (getIslamiskaForbundetDatasetTimes as jest.Mock).mockRejectedValue(new Error('outside the dataset (test)'));
    const res = await fetchPrayerTimesUnified(PARAMS);
    expect(res.source).toBe('local');
    expect(res.timezone).toBe('Europe/Stockholm');
    expect(fetchIslamiskaForbundetTimes).not.toHaveBeenCalled();
    expect(fetchAladhanTimes).not.toHaveBeenCalled();
    // 6 July at Stockholm: the table's night share, not an 18° that the
    // sun never reaches — Fajr a little after two, Isha a little after eleven.
    expect(res.timings.Fajr >= '02:10' && res.timings.Fajr <= '02:30').toBe(true);
    expect(res.timings.Isha >= '23:00' && res.timings.Isha <= '23:15').toBe(true);
  });
});
