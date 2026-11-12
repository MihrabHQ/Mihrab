/**
 * Iran: the Institute of Geophysics' own method on the phone — a province
 * capital's printed minute inside it, the reader's own spot elsewhere in
 * the country, and Automatic's choice inside Iran's outline only.
 */
jest.unmock('adhan');

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getTehranTimes, nearestTehranCity, TEHRAN_CITIES, TEHRAN_CITY_KM } from '../src/providers/tehranTimetable';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { isCoordinateInIran } from '../src/utils/iranRegion';

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

describe('Iran — the Institute of Geophysics', () => {
  it('lists the thirty-one province capitals, each inside the outline', () => {
    expect(TEHRAN_CITIES).toHaveLength(31);
    for (const c of TEHRAN_CITIES) expect(isCoordinateInIran(c.lat, c.lon)).toBe(true);
  });

  it('gives Tehran the first day of 1405 as the sheet prints it', async () => {
    // 21 March 2026: Fajr 4:43, sunrise 6:07, Dhuhr 12:12, Maghrib 18:35.
    const r = await getTehranTimes({ latitude: 35.6892, longitude: 51.389, date: new Date(2026, 2, 21, 12) });
    expect(r.source).toBe('local');
    expect(r.timezone).toBe('Asia/Tehran');
    expect([r.timings.Fajr, r.timings.Sunrise, r.timings.Dhuhr, r.timings.Maghrib]).toEqual(['04:43', '06:07', '12:12', '18:35']);
    // Asr and Isha are the method's, in their places
    expect(minutes(r.timings.Asr)).toBeGreaterThan(minutes(r.timings.Dhuhr) + 180);
    expect(minutes(r.timings.Isha)).toBeGreaterThan(minutes(r.timings.Maghrib) + 30);
  });

  it('takes a capital’s point inside the city and the reader’s own spot away from it', async () => {
    const date = new Date(2026, 5, 21, 12);
    const tehran = nearestTehranCity(35.6892, 51.389)!;
    expect(tehran.name).toBe('Tehran');
    expect(tehran.distanceKm).toBeLessThan(TEHRAN_CITY_KM);
    const centre = await getTehranTimes({ latitude: tehran.lat, longitude: tehran.lon, date });
    const suburb = await getTehranTimes({ latitude: 35.75, longitude: 51.3, date });
    expect(suburb.timings).toEqual(centre.timings);
    // Kashan, 190 km south of Tehran and no capital: its own noon, a minute or so off Tehran's
    expect(nearestTehranCity(33.985, 51.41)!.distanceKm).toBeGreaterThan(TEHRAN_CITY_KM);
    const kashan = await getTehranTimes({ latitude: 33.985, longitude: 51.41, date });
    expect(minutes(kashan.timings.Fajr)).toBeGreaterThan(minutes(centre.timings.Fajr) + 5);
  });

  it('is Automatic’s inside Iran, and gives way to a method chosen by hand', () => {
    for (const [latitude, longitude] of [[35.6892, 51.389], [36.29, 59.62], [27.18, 56.28], [38.07, 46.29], [33.985, 51.41], [26.53, 53.98]] as const) {
      expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('tehran');
      expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 7)).toBe('aladhan');
    }
  });

  it.each([
    ['Basra', 30.51, 47.81],
    ['Herat', 34.35, 62.2],
    ['Ashgabat', 37.95, 58.38],
    ['Nakhchivan', 39.21, 45.41],
    ['Dubai', 25.2, 55.27],
    ['Kuwait City', 29.37, 47.98],
  ] as const)('%s is outside', async (_name, latitude, longitude) => {
    expect(isCoordinateInIran(latitude, longitude)).toBe(false);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).not.toBe('tehran');
    await expect(getTehranTimes({ latitude, longitude, date: new Date(2026, 5, 21, 12) })).rejects.toThrow();
  });

  it('answers through the unified fetch, offline', async () => {
    const r = await fetchPrayerTimesUnified({ provider: 'tehran', latitude: 36.29, longitude: 59.62, date: new Date(2026, 11, 21, 12), calculationMethod: 'auto', school: 0 });
    expect(r.source).toBe('local');
    for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) expect(r.timings[k]).toMatch(/^\d\d:\d\d$/);
  });
});
