/**
 * Tatarstan's and the Central Muftiate of Russia's timetables, computed on
 * the phone by their own methods: the printed minute at a listed place
 * (rows of the published timetables, white nights and corrected minutes
 * among them), where Automatic picks each — and that the rest of Russia is
 * left on the calculated method — and the one Asr, the Hanafi one.
 */
jest.unmock('adhan');
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked inside a listed place');
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getCdumTimes, getTatarstanTimes } from '../src/providers/russiaMuftiates';
import { CDUM_CITIES, CDUM_CITY_KM, TATARSTAN_PLACES, isNearCdumCity, nearestCdumCity } from '../src/providers/russiaPlaces';
import { isCoordinateInTatarstan } from '../src/utils/tatarstanRegion';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { methodAuthorityFor } from '../src/providers/methodCurrency';
import { METHOD_REVISION } from '../src/providers/methodRevisions';
import { CORRECTION_AUTHORITIES, correctionFor, correctionsInForce } from '../src/providers/swedenCorrections';
import type { PrayerDataProviderId } from '../src/settings/types';

const six = (t: Record<string, string>) => ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);
const at = (provider: PrayerDataProviderId, latitude: number, longitude: number, ymd: string, school = 0) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return fetchPrayerTimesUnified({ provider, latitude, longitude, date: new Date(y, m - 1, d, 12), calculationMethod: 'auto', school });
};

describe('the printed minute', () => {
  // rows of the published timetables: Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha
  it.each([
    ['dumrt', 'Kazan, midwinter', 55.79, 49.12, '2026-01-15', ['05:48', '08:04', '11:53', '13:54', '15:43', '17:37'], 'Europe/Moscow'],
    ['dumrt', 'Kazan, a white night: the dawn 121 minutes before sunrise, Isha 90 after Maghrib', 55.79, 49.12, '2026-06-21', ['00:58', '02:59', '11:46', '17:35', '20:33', '22:03'], 'Europe/Moscow'],
    ['dumrt', 'Bugulma', 54.54, 52.8, '2026-10-03', ['03:34', '05:35', '11:18', '15:03', '17:01', '18:39'], 'Europe/Moscow'],
    ['cdum', 'Moscow, New Year', 55.75, 37.62, '2026-01-01', ['06:37', '08:57', '12:35', '14:21', '16:09', '18:22'], 'Europe/Moscow'],
    ['cdum', 'Moscow, a white night: the 45th parallel’s share of the night', 55.75, 37.62, '2026-06-21', ['01:44', '03:43', '12:33', '18:22', '21:20', '23:07'], 'Europe/Moscow'],
    ['cdum', 'Saint Petersburg, the evening back on its angle (after midnight) and the morning not yet', 59.94, 30.31, '2026-08-21', ['03:48', '05:25', '13:04', '18:04', '20:37', '00:01'], 'Europe/Moscow'],
    ['cdum', 'Khabarovsk, on its own clock', 48.48, 135.08, '2026-03-10', ['05:38', '07:22', '13:12', '17:07', '18:59', '20:37'], 'Asia/Vladivostok'],
    ['cdum', 'Rostov-on-Don, an Isha the correction list moves', 47.23, 39.72, '2026-05-03', ['02:53', '05:00', '12:20', '17:24', '19:37', '21:35'], 'Europe/Moscow'],
  ] as const)('%s — %s', async (provider, _name, latitude, longitude, ymd, row, zone) => {
    const r = await at(provider, latitude, longitude, ymd);
    expect(six(r.timings)).toEqual([...row]);
    expect(r.source).toBe('local');
    expect(r.timezone).toBe(zone);
    // the one Asr the timetable prints, whatever the school is set to
    expect((await at(provider, latitude, longitude, ymd, 1)).timings.Asr).toBe(row[3]);
  });

  it('has the correction that day needs, and the lists are of the revisions this build computes', () => {
    expect(correctionFor('cdum', 47.223, 39.719, 2026, 4, 3)).toEqual({ isha: -1 });
    expect(correctionFor('tatarstan', 55.78, 49.1255, 2026, 0, 25)).toEqual({ asr: -1 });
    expect(CORRECTION_AUTHORITIES).toEqual(expect.arrayContaining(['tatarstan', 'cdum']));
    expect(METHOD_REVISION.tatarstan).toBe(1);
    expect(METHOD_REVISION.cdum).toBe(1);
    expect(correctionsInForce('tatarstan').entries).toBeGreaterThan(1000);
    expect(correctionsInForce('cdum').entries).toBeGreaterThan(10);
  });
});

describe('where each is the source', () => {
  it('lists 44 places of Tatarstan, every one inside the republic’s outline, and 18 cities', () => {
    expect(TATARSTAN_PLACES).toHaveLength(44);
    expect(CDUM_CITIES).toHaveLength(18);
    for (const p of TATARSTAN_PLACES) expect(isCoordinateInTatarstan(p.lat, p.lon)).toBe(true);
    // no city of the Central Muftiate's list is in Tatarstan, and none is in reach of another
    for (const c of CDUM_CITIES) {
      expect(isCoordinateInTatarstan(c.lat, c.lon)).toBe(false);
      expect(isNearCdumCity(c.lat, c.lon)).toBe(true);
    }
  });

  it.each([
    ['Kazan', 55.79, 49.12, 'dumrt'],
    ['Naberezhnye Chelny', 55.74, 52.4, 'dumrt'],
    ['Bugulma', 54.54, 52.8, 'dumrt'],
    ['Moscow', 55.75, 37.62, 'cdum'],
    ['Khimki, at Moscow’s edge', 55.89, 37.43, 'cdum'],
    ['Saint Petersburg', 59.94, 30.31, 'cdum'],
    ['Yekaterinburg', 56.84, 60.61, 'cdum'],
    ['Khabarovsk', 48.48, 135.08, 'cdum'],
    ['Ulyanovsk', 54.31, 48.4, 'cdum'],
    ['Izhevsk', 56.85, 53.21, 'cdum'],
    // the rest of Russia stays on the calculated method
    ['Novosibirsk', 55.03, 82.92, 'aladhan'],
    ['Tver, 160 km from Moscow', 56.86, 35.9, 'aladhan'],
    ['Sergiyev Posad, 70 km from Moscow', 56.31, 38.13, 'aladhan'],
    ['Grozny', 43.32, 45.69, 'aladhan'],
    ['Murmansk', 68.97, 33.07, 'aladhan'],
    // and the two table sources keep their republics
    ['Ufa', 54.7352, 55.9587, 'bashkortostan'],
    ['Makhachkala', 42.9831, 47.5047, 'dagestan'],
  ] as const)('%s', (_name, latitude, longitude, provider) => {
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe(provider);
  });

  it('gives way to a method chosen by hand', () => {
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude: 55.79, longitude: 49.12 }, 14)).toBe('aladhan');
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude: 55.75, longitude: 37.62 }, 3)).toBe('aladhan');
  });

  it('reaches a city’s near suburbs and no further, and refuses a place it does not have', async () => {
    expect(CDUM_CITY_KM).toBe(30);
    expect(nearestCdumCity(55.89, 37.43)!.name).toBe('Moscow');
    expect(isNearCdumCity(56.31, 38.13)).toBe(false);
    const date = new Date(2026, 0, 15, 12);
    await expect(getCdumTimes({ latitude: 55.03, longitude: 82.92, date })).rejects.toThrow();
    await expect(getTatarstanTimes({ latitude: 43.32, longitude: 45.69, date })).rejects.toThrow();
  });

  it('prints one Asr, the Hanafi one, hides the method picker, and answers for its own correction list', () => {
    for (const id of ['dumrt', 'cdum'] as const) {
      expect(providerHidesHanafiAsr(id)).toBe(true);
      expect(providerPrintsHanafiAsrOnly(id)).toBe(true);
      expect(providerHidesCalculationMethod(id)).toBe(true);
    }
    expect(methodAuthorityFor('dumrt', 'auto', 55.79, 49.12)).toBe('tatarstan');
    expect(methodAuthorityFor('cdum', 'auto', 55.75, 37.62)).toBe('cdum');
  });
});
