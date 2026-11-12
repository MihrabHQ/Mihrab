/**
 * Pakistan — Jamia Banuri Town's prayer times, computed on the phone by its
 * own method: the printed minute in a listed city (rows of its page), Dhuhr
 * a minute after the zenith it prints, the Asr of the reader's school, the
 * reader's own spot away from the cities, and where Automatic picks it.
 */
jest.unmock('adhan');
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked inside Pakistan');
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { BANURI_CITIES, BANURI_CITY_KM, getBanuriTimes, nearestBanuriCity } from '../src/providers/banuriTimetable';
import { banuriTimes } from '../src/providers/banuriMethod';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { methodAuthorityFor } from '../src/providers/methodCurrency';
import { METHOD_REVISION } from '../src/providers/methodRevisions';
import { CORRECTION_AUTHORITIES, correctionFor } from '../src/providers/swedenCorrections';
import { isCoordinateInPakistan } from '../src/utils/pakistanRegion';

const six = (t: Record<string, string>) => ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const at = (latitude: number, longitude: number, ymd: string, school = 1) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return fetchPrayerTimesUnified({ provider: 'banuri', latitude, longitude, date: new Date(y, m - 1, d, 12), calculationMethod: 'auto', school });
};

describe('the printed minute', () => {
  // rows of the Jamia's page: Fajr, sunrise, the zenith (zawal), Asr (Hanafi), sunset, Isha
  it.each([
    ['Karachi, winter', 24.8607, 67.0011, '2026-01-01', ['05:55', '07:17', '12:35', '16:18', '17:54', '19:15']],
    ['Karachi, midsummer', 24.8607, 67.0011, '2026-06-21', ['04:14', '05:43', '12:34', '17:16', '19:24', '20:53']],
    ['Lahore, midsummer', 31.5204, 74.3587, '2026-06-21', ['03:19', '04:58', '12:04', '17:01', '19:11', '20:50']],
    ['Lahore, November', 31.5204, 74.3587, '2026-11-12', ['05:04', '06:28', '11:47', '15:28', '17:06', '18:29']],
    ['Peshawar', 34.0151, 71.5249, '2026-03-10', ['05:08', '06:31', '12:24', '16:35', '18:17', '19:40']],
    ['Quetta, a day the correction list moves sunrise', 30.187, 67.0124, '2026-05-04', ['04:19', '05:46', '12:29', '17:14', '19:11', '20:39']],
  ] as const)('%s', async (_name, latitude, longitude, ymd, row) => {
    const r = await at(latitude, longitude, ymd);
    // Dhuhr is the minute after the zenith the page prints
    expect(six(r.timings)).toEqual([row[0], row[1], clock(toMin(row[2]) + 1), row[3], row[4], row[5]]);
    expect(r.source).toBe('local');
    expect(r.timezone).toBe('Asia/Karachi');
    // a reader of another school: the same method's Asr at one shadow length, earlier, and nothing else moves
    const first = await at(latitude, longitude, ymd, 0);
    expect(toMin(first.timings.Asr)).toBeLessThan(toMin(row[3]) - 20);
    expect([first.timings.Fajr, first.timings.Sunrise, first.timings.Dhuhr, first.timings.Maghrib, first.timings.Isha]).toEqual([r.timings.Fajr, r.timings.Sunrise, r.timings.Dhuhr, r.timings.Maghrib, r.timings.Isha]);
  });

  it('has its list at the revision this build computes, and the correction a listed day needs', () => {
    expect(CORRECTION_AUTHORITIES).toContain('banuri');
    expect(METHOD_REVISION.banuri).toBe(1);
    const quetta = BANURI_CITIES.find(c => c.name === 'Quetta')!;
    expect(correctionFor('banuri', quetta.lat, quetta.lon, 2026, 4, 4)).toMatchObject({ sunrise: -1 });
    // without the list the method is a minute late there
    const alone = banuriTimes(quetta.lat, quetta.lon, 2026, 4, 4)!;
    expect(alone.sunrise.toISOString()).toBe('2026-05-04T00:47:00.000Z');
  });
});

describe('the place that answers', () => {
  it('gives a listed city’s one timetable across the city', async () => {
    expect(BANURI_CITIES).toHaveLength(100);
    expect(nearestBanuriCity(24.8607, 67.0011)).toMatchObject({ name: 'Karachi', lat: 24.8667, lon: 67.05 });
    // Clifton and Gulshan-e-Iqbal, eleven kilometres apart: the same row
    const clifton = await at(24.82, 67.03, '2026-03-20');
    const gulshan = await at(24.92, 67.09, '2026-03-20');
    expect(six(gulshan.timings)).toEqual(six(clifton.timings));
  });

  it('computes the method for the reader’s own spot away from the listed cities', async () => {
    // Makran, inland between Turbat and Awaran, far from every listed city: four minutes to the degree
    for (const lon of [63.9, 64.9]) expect(nearestBanuriCity(26.0, lon)!.distanceKm).toBeGreaterThan(BANURI_CITY_KM);
    const west = await at(26.0, 63.9, '2026-03-20');
    const east = await at(26.0, 64.9, '2026-03-20');
    expect(toMin(west.timings.Dhuhr) - toMin(east.timings.Dhuhr)).toBe(4);
    expect(west.source).toBe('local');
  });

  it('answers only inside Pakistan', async () => {
    const date = new Date(2026, 0, 15, 12);
    await expect(getBanuriTimes({ latitude: 28.6139, longitude: 77.209, date })).rejects.toThrow();
    await expect(getBanuriTimes({ latitude: 34.5553, longitude: 69.2075, date })).rejects.toThrow();
  });
});

describe('where it is the source', () => {
  it.each([
    ['Karachi, the seafront at Clifton', 24.8, 67.03],
    ['Lahore', 31.5204, 74.3587],
    ['Islamabad', 33.6844, 73.0479],
    ['Quetta', 30.1798, 66.975],
    ['Gwadar', 25.126, 62.322],
    ['Gilgit', 35.92, 74.31],
    ['Muzaffarabad', 34.37, 73.47],
  ] as const)('%s', (_name, latitude, longitude) => {
    expect(isCoordinateInPakistan(latitude, longitude)).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('banuri');
    // a method chosen by hand stays
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
  });

  it.each([
    ['Amritsar', 31.634, 74.872],
    ['Srinagar', 34.08, 74.8],
    ['Jammu', 32.73, 74.86],
    ['Delhi', 28.6139, 77.209],
    ['Jalalabad', 34.43, 70.45],
    ['Spin Boldak', 31.005, 66.4],
    ['Zahedan', 29.49, 60.86],
    ['Kashgar', 39.47, 75.99],
  ] as const)('%s is not', (_name, latitude, longitude) => {
    expect(isCoordinateInPakistan(latitude, longitude)).toBe(false);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).not.toBe('banuri');
  });

  it('keeps the Hanafi Asr toggle and hides the method list', () => {
    expect(providerHidesCalculationMethod('banuri')).toBe(true);
    expect(providerHidesHanafiAsr('banuri')).toBe(false);
    expect(providerPrintsHanafiAsrOnly('banuri')).toBe(false);
    expect(methodAuthorityFor('banuri', 'auto', 24.86, 67.0)).toBe('banuri');
  });
});
