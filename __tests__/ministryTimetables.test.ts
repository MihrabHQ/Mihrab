/**
 * Egypt's, Kuwait's, Qatar's, Jordan's, Kazakhstan's and Brunei's
 * timetables, computed on the phone by each authority's own method: the
 * printed minute at a place of its table (rows of the published tables),
 * the Hanafi Asr where the method gives one, which place answers for a
 * reader, and where Automatic picks each.
 */
jest.unmock('adhan');
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked inside the country');
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { MINISTRY_TIMETABLES, getEgyptTimes, getJordanTimes, isMinistryTimetable } from '../src/providers/ministryTimetables';
import {
  BRUNEI_DISTRICTS,
  EGYPT_CITIES,
  JORDAN_ZONES,
  KAZAKHSTAN_CITIES,
  KUWAIT_AREAS,
  bruneiDistrictFor,
  jordanZoneAt,
  kuwaitAreaFor,
  nearestEgyptCity,
  nearestJordanZone,
} from '../src/providers/ministryPlaces';
import { kuwaitAreaMinutes } from '../src/providers/kuwaitMethod';
import { bruneiDistrictMinutes } from '../src/providers/bruneiMethod';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { methodAuthorityFor } from '../src/providers/methodCurrency';
import { METHOD_REVISION } from '../src/providers/methodRevisions';
import { CORRECTION_AUTHORITIES, correctionFor, correctionsInForce } from '../src/providers/swedenCorrections';
import type { PrayerDataProviderId } from '../src/settings/types';

const IDS = ['egypt', 'kuwait', 'qatar', 'jordan', 'kazakhstan', 'brunei'] as const;
const six = (t: Record<string, string>) => ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const at = (provider: PrayerDataProviderId, latitude: number, longitude: number, ymd: string, school = 0) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return fetchPrayerTimesUnified({ provider, latitude, longitude, date: new Date(y, m - 1, d, 12), calculationMethod: 'auto', school });
};

describe('the printed minute', () => {
  // rows of the published timetables: Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha
  it.each([
    ['egypt', 'Cairo, winter', 30.0444, 31.2357, '2026-01-15', ['05:20', '06:52', '12:04', '14:58', '17:17', '18:39'], 'Africa/Cairo'],
    ['egypt', 'Cairo, summer time', 30.0444, 31.2357, '2026-07-01', ['04:11', '05:57', '12:59', '16:35', '20:00', '21:33'], 'Africa/Cairo'],
    ['egypt', 'Alexandria', 31.2001, 29.9187, '2026-11-20', ['05:00', '06:32', '11:46', '14:40', '17:00', '18:22'], 'Africa/Cairo'],
    ['kuwait', 'Kuwait City, a day the correction list moves sunrise', 29.3759, 47.9774, '2026-01-15', ['05:20', '06:44', '11:57', '14:52', '17:11', '18:33'], 'Asia/Kuwait'],
    ['kuwait', 'Kuwait City, midsummer', 29.3759, 47.9774, '2026-06-21', ['03:13', '04:49', '11:50', '15:24', '18:50', '20:23'], 'Asia/Kuwait'],
    ['kuwait', 'a quarter of a degree west: the areas a minute on the city', 29.33, 47.755, '2026-01-15', ['05:21', '06:45', '11:58', '14:53', '17:12', '18:34'], 'Asia/Kuwait'],
    ['qatar', 'Doha, July', 25.2854, 51.531, '2026-07-01', ['03:17', '04:47', '11:39', '15:02', '18:30', '20:00'], 'Asia/Qatar'],
    ['qatar', 'Al Khor takes Doha’s table', 25.68, 51.5, '2026-09-15', ['04:02', '05:20', '11:30', '14:58', '17:41', '19:11'], 'Asia/Qatar'],
    ['jordan', 'Amman, winter', 31.9539, 35.9106, '2026-01-15', ['06:11', '07:30', '12:46', '15:36', '18:01', '19:21'], 'Asia/Amman'],
    ['jordan', 'Amman, midsummer', 31.9539, 35.9106, '2026-06-21', ['03:50', '05:24', '12:38', '16:19', '19:53', '21:26'], 'Asia/Amman'],
    ['jordan', 'Aqaba, with its own horizons', 29.5321, 35.0063, '2026-03-10', ['05:37', '06:53', '12:50', '16:13', '18:49', '20:04'], 'Asia/Amman'],
    ['brunei', 'Bandar Seri Begawan', 4.9031, 114.9398, '2026-01-15', ['05:11', '06:33', '12:31', '15:52', '18:25', '19:39'], 'Asia/Brunei'],
    ['brunei', 'Kuala Belait, three minutes on', 4.584, 114.2, '2026-06-21', ['04:48', '06:13', '12:26', '15:52', '18:37', '19:53'], 'Asia/Brunei'],
  ] as const)('%s — %s', async (provider, _name, latitude, longitude, ymd, row, zone) => {
    const r = await at(provider, latitude, longitude, ymd);
    expect(six(r.timings)).toEqual([...row]);
    expect(r.source).toBe('local');
    expect(r.timezone).toBe(zone);
    // the Hanafi Asr is the same method's at two shadow lengths: later, and nothing else moves
    const hanafi = await at(provider, latitude, longitude, ymd, 1);
    expect(toMin(hanafi.timings.Asr)).toBeGreaterThan(toMin(row[3]) + 20);
    expect([hanafi.timings.Fajr, hanafi.timings.Sunrise, hanafi.timings.Dhuhr, hanafi.timings.Maghrib, hanafi.timings.Isha]).toEqual([row[0], row[1], row[2], row[4], row[5]]);
  });

  it.each([
    ['Astana, winter', 51.1694, 71.4491, '2026-01-15', ['06:32', '08:07', '12:29', '14:54', '16:41', '18:16']],
    ['Astana, a white night', 51.1694, 71.4491, '2026-06-21', ['02:07', '03:54', '12:21', '17:58', '20:38', '22:25']],
    ['Almaty', 43.222, 76.8512, '2026-06-21', ['02:23', '04:09', '11:57', '17:16', '19:39', '21:25']],
  ] as const)('kazakhstan — %s, with its one Asr, the Hanafi one, whatever the school is set to', async (_name, latitude, longitude, ymd, row) => {
    for (const school of [0, 1]) {
      const r = await at('kazakhstan', latitude, longitude, ymd, school);
      expect(six(r.timings)).toEqual([...row]);
      expect(r.timezone).toBe('Asia/Almaty');
    }
  });

  it('computes Kazakhstan’s method for the reader’s own spot away from the listed cities', async () => {
    // Balkhash's shore, far from every listed city: the same day runs later in the west of a zone and earlier in the east
    const west = await at('kazakhstan', 46.8, 74.0, '2026-03-20');
    const east = await at('kazakhstan', 46.8, 75.0, '2026-03-20');
    expect(toMin(west.timings.Dhuhr) - toMin(east.timings.Dhuhr)).toBe(4);
    expect(west.source).toBe('local');
  });

  it('has each list at the revision this build computes, and the correction a listed day needs', () => {
    expect(CORRECTION_AUTHORITIES).toEqual(expect.arrayContaining([...IDS]));
    for (const id of IDS) expect(METHOD_REVISION[id]).toBe(1);
    const city = KUWAIT_AREAS.find(a => a.name === 'Kuwait City')!;
    expect(correctionFor('kuwait', city.lat, city.lon, 2026, 0, 15)).toMatchObject({ sunrise: 1 });
    expect(correctionsInForce('egypt').entries).toBeGreaterThan(500);
    expect(correctionsInForce('kuwait').entries).toBeGreaterThan(5000);
    expect(correctionsInForce('jordan').entries).toBeGreaterThan(300);
    // Kazakhstan's method gives every published time with no list
    expect(correctionsInForce('kazakhstan').entries).toBe(0);
  });
});

describe('the place that answers', () => {
  it('lists Egypt’s 77 cities, Jordan’s 16 zones (Jerusalem is not served here), Kazakhstan’s 84 cities', () => {
    expect(EGYPT_CITIES).toHaveLength(77);
    expect(JORDAN_ZONES).toHaveLength(16);
    expect(JORDAN_ZONES.some(z => /Jerusalem/.test(z.name))).toBe(false);
    expect(KAZAKHSTAN_CITIES).toHaveLength(84);
    expect(nearestEgyptCity(31.2, 29.92)!.id).toBe(2);
    expect(nearestJordanZone(29.53, 35.0)!.name).toBe('Aqaba');
    const amman = nearestJordanZone(31.95, 35.91)!;
    expect(jordanZoneAt(amman.lat, amman.lon)).toMatchObject({ id: 1 });
  });

  it('gives a reader of Kuwait and of Brunei the area whose minutes are the sun’s for their longitude', () => {
    expect(kuwaitAreaMinutes(kuwaitAreaFor(47.9774).lon)).toBe(0);
    expect(kuwaitAreaMinutes(kuwaitAreaFor(47.66).lon)).toBe(1); // Jahra
    expect(kuwaitAreaMinutes(kuwaitAreaFor(48.33).lon)).toBe(-1); // Failaka
    // never beyond what the Ministry lists
    const listed = KUWAIT_AREAS.map(a => kuwaitAreaMinutes(a.lon));
    expect(kuwaitAreaMinutes(kuwaitAreaFor(40).lon)).toBe(Math.max(...listed));
    expect(kuwaitAreaMinutes(kuwaitAreaFor(60).lon)).toBe(Math.min(...listed));
    expect(BRUNEI_DISTRICTS).toHaveLength(4);
    expect(bruneiDistrictMinutes(bruneiDistrictFor(114.9398).lon)).toBe(0);
    expect(bruneiDistrictMinutes(bruneiDistrictFor(114.65).lon)).toBe(1); // Tutong
    expect(bruneiDistrictMinutes(bruneiDistrictFor(114.32).lon)).toBe(3); // Seria, in Belait
  });
});

describe('where each is the source', () => {
  it.each([
    ['Cairo', 30.0444, 31.2357, 'egypt'],
    ['Aswan', 24.0889, 32.8998, 'egypt'],
    ['Alexandria, the corniche', 31.2156, 29.8853, 'egypt'],
    ['Kuwait City, the seafront', 29.3759, 47.9774, 'kuwait'],
    ['Doha, the corniche', 25.2854, 51.531, 'qatar'],
    ['Amman', 31.9539, 35.9106, 'jordan'],
    ['Aqaba', 29.5321, 35.0063, 'jordan'],
    ['Astana', 51.1694, 71.4491, 'kazakhstan'],
    ['Aktau, on the Caspian', 43.65, 51.15, 'kazakhstan'],
    ['Bandar Seri Begawan', 4.9031, 114.9398, 'brunei'],
    ['Bangar, in Temburong', 4.708, 115.07, 'brunei'],
  ] as const)('%s', (_name, latitude, longitude, provider) => {
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe(provider);
    // a method chosen by hand stays
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
  });

  it.each([
    ['Eilat, across the bay from Aqaba', 29.5577, 34.9519],
    ['Jerusalem', 31.776, 35.2345],
    ['Jericho', 31.857, 35.46],
    ['Rafah, in Gaza', 31.2969, 34.2436],
    ['Safwan, in Iraq', 30.11, 47.72],
    ['Khafji, in Saudi Arabia', 28.43, 48.49],
    ['Manama', 26.2285, 50.586],
    ['Tashkent', 41.31, 69.28],
    ['Orenburg', 51.77, 55.1],
    ['Miri, in Sarawak', 4.4, 113.99],
  ] as const)('%s is none of them', (_name, latitude, longitude) => {
    expect(isMinistryTimetable(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto'))).toBe(false);
  });

  it('refuses a place far from every listed one, and answers for its own correction list', async () => {
    const date = new Date(2026, 0, 15, 12);
    await expect(getEgyptTimes({ latitude: 48.2, longitude: 16.37, date })).rejects.toThrow();
    await expect(getJordanTimes({ latitude: 48.2, longitude: 16.37, date })).rejects.toThrow();
    for (const id of IDS) {
      expect(Object.keys(MINISTRY_TIMETABLES)).toContain(id);
      expect(providerHidesCalculationMethod(id)).toBe(true);
      expect(providerHidesHanafiAsr(id)).toBe(id === 'kazakhstan');
      expect(providerPrintsHanafiAsrOnly(id)).toBe(id === 'kazakhstan');
      expect(methodAuthorityFor(id, 'auto', 30, 31)).toBe(id);
    }
  });
});
