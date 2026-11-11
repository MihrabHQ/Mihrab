/**
 * Albania's and Bulgaria's timetables, computed on the phone by their own
 * methods: the printed minute at a listed town (rows of the published
 * tables, summer time and corrected minutes among them), the Hanafi Asr
 * from the same method, and where Automatic picks each.
 */
jest.unmock('adhan');
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked inside the country');
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getAlbaniaTimes, getBulgariaTimes } from '../src/providers/balkanTimetables';
import { ALBANIA_TOWNS, BULGARIA_TOWNS, nearestAlbaniaTown, nearestBulgariaTown } from '../src/providers/balkanTowns';
import { BULGARIA_TABLE } from '../src/providers/bulgariaMethod';
import { ALBANIA_TABLE } from '../src/providers/albaniaMethod';
import { townMinutes } from '../src/providers/townTableMethod';
import { isCoordinateInAlbania } from '../src/utils/albaniaRegion';
import { isCoordinateInBulgaria } from '../src/utils/bulgariaRegion';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { methodAuthorityFor } from '../src/providers/methodCurrency';
import { METHOD_REVISION } from '../src/providers/methodRevisions';
import { correctionFor, correctionsInForce } from '../src/providers/swedenCorrections';
import type { PrayerDataProviderId } from '../src/settings/types';

const six = (t: Record<string, string>) => ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const at = (provider: PrayerDataProviderId, latitude: number, longitude: number, ymd: string, school = 0) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return fetchPrayerTimesUnified({ provider, latitude, longitude, date: new Date(y, m - 1, d, 12), calculationMethod: 'auto', school });
};

describe('the printed minute', () => {
  // rows of the published timetables: Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha
  it.each([
    ['kmsh', 'Tirana, New Year', 41.3275, 19.8187, '2026-01-01', ['05:27', '07:00', '11:49', '14:08', '16:28', '17:55'], 'Europe/Tirane'],
    ['kmsh', 'Tirana, a Fajr the correction list moves', 41.3275, 19.8187, '2026-01-19', ['05:25', '06:56', '11:56', '14:24', '16:47', '18:12'], 'Europe/Tirane'],
    ['kmsh', 'Tirana, summer time', 41.3275, 19.8187, '2026-06-16', ['02:58', '05:00', '12:46', '16:47', '20:23', '22:15'], 'Europe/Tirane'],
    ['kmsh', 'Durrës, two minutes on Tirana', 41.3246, 19.4565, '2026-01-01', ['05:29', '07:02', '11:51', '14:10', '16:30', '17:57'], 'Europe/Tirane'],
    ['kmsh', 'Korçë, five minutes before Tirana', 40.6186, 20.7808, '2026-07-10', ['03:07', '05:05', '12:46', '16:46', '20:18', '22:06'], 'Europe/Tirane'],
    ['grandmufti', 'Sofia, New Year', 42.6977, 23.3219, '2026-01-01', ['06:14', '07:50', '12:35', '14:49', '17:10', '18:39'], 'Europe/Sofia'],
    ['grandmufti', 'Sofia, a Fajr the correction list moves', 42.6977, 23.3219, '2026-01-03', ['06:15', '07:50', '12:36', '14:50', '17:11', '18:40'], 'Europe/Sofia'],
    ['grandmufti', 'Varna, summer time', 43.214, 27.915, '2026-07-01', ['03:18', '05:27', '13:17', '17:21', '20:58', '22:56'], 'Europe/Sofia'],
    ['grandmufti', 'Kardzhali, the last day of summer time', 41.65, 25.367, '2026-10-24', ['06:06', '07:35', '13:08', '16:01', '18:31', '19:53'], 'Europe/Sofia'],
    ['grandmufti', 'Kardzhali, the day the clocks go back', 41.65, 25.367, '2026-10-25', ['05:07', '06:36', '12:08', '15:00', '17:30', '18:52'], 'Europe/Sofia'],
  ] as const)('%s — %s', async (provider, _name, latitude, longitude, ymd, row, zone) => {
    const r = await at(provider, latitude, longitude, ymd);
    expect(six(r.timings)).toEqual([...row]);
    expect(r.source).toBe('local');
    expect(r.timezone).toBe(zone);
    // the Hanafi Asr is the same method's at two shadow lengths: later, and nothing else moves
    const hanafi = await at(provider, latitude, longitude, ymd, 1);
    expect(toMin(hanafi.timings.Asr)).toBeGreaterThan(toMin(row[3]) + 20);
    expect([hanafi.timings.Fajr, hanafi.timings.Dhuhr, hanafi.timings.Maghrib, hanafi.timings.Isha]).toEqual([row[0], row[2], row[4], row[5]]);
  });

  it('has the corrections those days need, and the lists are of the revisions this build computes', () => {
    expect(correctionFor('albania', ALBANIA_TABLE.lat, ALBANIA_TABLE.lon, 2026, 0, 19)).toEqual({ fajr: -1 });
    expect(correctionFor('bulgaria', BULGARIA_TABLE.lat, BULGARIA_TABLE.lon, 2026, 0, 3)).toEqual({ fajr: 1 });
    expect(METHOD_REVISION.albania).toBe(1);
    expect(METHOD_REVISION.bulgaria).toBe(1);
    expect(correctionsInForce('albania').entries).toBeGreaterThan(100);
    expect(correctionsInForce('bulgaria').entries).toBeGreaterThan(1000);
  });
});

describe('the towns', () => {
  it('lists Tirana and ten towns of Albania, Sofia and forty-seven of Bulgaria, each inside its country', () => {
    expect(ALBANIA_TOWNS).toHaveLength(11);
    expect(BULGARIA_TOWNS).toHaveLength(48);
    for (const t of ALBANIA_TOWNS) expect(isCoordinateInAlbania(t.lat, t.lon)).toBe(true);
    for (const t of BULGARIA_TOWNS) expect(isCoordinateInBulgaria(t.lat, t.lon)).toBe(true);
  });

  it('a town’s minutes on the reference town are the sun’s, near enough: its place and its point agree', () => {
    // four minutes of time to the degree of longitude; the tables' whole minutes are within three of that
    for (const t of ALBANIA_TOWNS) expect(Math.abs(townMinutes(ALBANIA_TABLE, t.pointLon) - (ALBANIA_TABLE.lon - t.lon) * 4)).toBeLessThan(3);
    for (const t of BULGARIA_TOWNS) expect(Math.abs(townMinutes(BULGARIA_TABLE, t.pointLon) - (BULGARIA_TABLE.lon - t.lon) * 4)).toBeLessThan(3);
  });

  it('matches a reader to the nearest town', () => {
    expect(nearestAlbaniaTown(41.33, 19.82)!.name).toBe('Tirana');
    expect(nearestAlbaniaTown(40.47, 19.49)!.name).toBe('Vlorë');
    expect(nearestBulgariaTown(42.14, 24.75)!.nameEn).toBe('Plovdiv');
    expect(nearestBulgariaTown(43.21, 27.91)!.nameEn).toBe('Varna');
    expect(nearestBulgariaTown(42.88, 27.89)!.nameEn).toBe('Byala');
  });
});

describe('where each is the source', () => {
  it.each([
    ['Tirana', 41.3275, 19.8187, 'kmsh'],
    ['Shkodër', 42.0683, 19.5126, 'kmsh'],
    ['Sarandë', 39.875, 20.005, 'kmsh'],
    ['Sofia', 42.6977, 23.3219, 'grandmufti'],
    ['Plovdiv', 42.15, 24.75, 'grandmufti'],
    ['Svilengrad', 41.7667, 26.2, 'grandmufti'],
  ] as const)('%s', (_name, latitude, longitude, provider) => {
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe(provider);
    // a method chosen by hand stays
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
  });

  it.each([
    // the calendar's towns across the border are not served by it here
    ['Prishtina', 42.6629, 21.1655],
    ['Skopje', 41.9981, 21.4254],
    ['Podgorica', 42.4411, 19.2636],
    ['Edirne', 41.6771, 26.5557],
    ['Thessaloniki', 40.6401, 22.9444],
    ['Bucharest', 44.4268, 26.1025],
  ] as const)('%s is neither', (_name, latitude, longitude) => {
    const auto = getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto');
    expect(auto).not.toBe('kmsh');
    expect(auto).not.toBe('grandmufti');
    expect(isCoordinateInAlbania(latitude, longitude)).toBe(false);
    expect(isCoordinateInBulgaria(latitude, longitude)).toBe(false);
  });

  it('refuses a place far from every town, offers the Hanafi Asr, hides the method picker, and answers for its own list', async () => {
    const date = new Date(2026, 0, 15, 12);
    await expect(getAlbaniaTimes({ latitude: 48.2, longitude: 16.37, date })).rejects.toThrow();
    await expect(getBulgariaTimes({ latitude: 48.2, longitude: 16.37, date })).rejects.toThrow();
    for (const id of ['kmsh', 'grandmufti'] as const) {
      expect(providerHidesHanafiAsr(id)).toBe(false);
      expect(providerPrintsHanafiAsrOnly(id)).toBe(false);
      expect(providerHidesCalculationMethod(id)).toBe(true);
    }
    expect(methodAuthorityFor('kmsh', 'auto', 41.33, 19.82)).toBe('albania');
    expect(methodAuthorityFor('grandmufti', 'auto', 42.7, 23.32)).toBe('bulgaria');
  });
});
