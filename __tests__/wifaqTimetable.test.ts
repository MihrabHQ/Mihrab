/**
 * United Kingdom: Wifaqul Ulama's own method on the phone — a listed town's
 * printed minute inside it, nothing outside its towns, and Automatic's
 * choice in them outside London.
 */
jest.unmock('adhan');

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getWifaqTimes } from '../src/providers/wifaqTimetable';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { WIFAQ_TOWNS, WIFAQ_TOWN_KM, isCoordinateInWifaqTown, wifaqTownAt } from '../src/utils/wifaqRegion';

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const BRADFORD = { latitude: 53.795, longitude: -1.759 };

describe('United Kingdom — Wifaqul Ulama', () => {
  it('lists eighty-one towns', () => {
    expect(WIFAQ_TOWNS).toHaveLength(81);
    expect(wifaqTownAt(BRADFORD.latitude, BRADFORD.longitude)!.name).toBe('Bradford');
    expect(wifaqTownAt(BRADFORD.latitude, BRADFORD.longitude)!.distanceKm).toBeLessThan(WIFAQ_TOWN_KM);
  });

  it('gives Bradford the first of January 2027 as the timetable prints it', async () => {
    // Fajr 06:13, sunrise 08:25, Zuhr 12:15, Asr 13:41 (Shafi'i) and 14:09 (Hanafi), Maghrib 16:01, Isha 17:47.
    const hanafi = await getWifaqTimes({ ...BRADFORD, date: new Date(2027, 0, 1, 12), school: 1 });
    expect(hanafi.source).toBe('local');
    expect(hanafi.timezone).toBe('Europe/London');
    const t = hanafi.timings;
    expect([t.Fajr, t.Sunrise, t.Dhuhr, t.Asr, t.Maghrib, t.Isha]).toEqual(['06:13', '08:25', '12:15', '14:09', '16:01', '17:47']);
    const shafii = await getWifaqTimes({ ...BRADFORD, date: new Date(2027, 0, 1, 12), school: 0 });
    // the Shafi'i Asr is the method's own, without the list: on the printed minute or one beside it
    expect(Math.abs(minutes(shafii.timings.Asr) - minutes('13:41'))).toBeLessThanOrEqual(1);
    expect(shafii.timings.Maghrib).toBe('16:01');
  });

  it('keeps Fajr and Isha through the summer nights without true dawn', async () => {
    // 22 June 2027, British Summer Time: Fajr 01:09 by the timetable's own rule; Isha a seventh of the night after sunset.
    const r = await getWifaqTimes({ ...BRADFORD, date: new Date(2027, 5, 22, 12), school: 1 });
    expect(r.timings.Fajr).toBe('01:09');
    const afterMaghrib = minutes(r.timings.Isha) - minutes(r.timings.Maghrib);
    expect(afterMaghrib).toBeGreaterThan(50);
    expect(afterMaghrib).toBeLessThan(60);
  });

  it.each([
    ['Bradford', 53.795, -1.759],
    ['Leicester', 52.637, -1.14],
    ['Blackburn', 53.748, -2.482],
    ['Glasgow', 55.864, -4.252],
    ['Cardiff', 51.481, -3.179],
    ['Manchester', 53.4808, -2.2426],
    ['Birmingham', 52.486, -1.89],
  ] as const)('%s takes Wifaqul Ulama’s timetable on Automatic', (_name, latitude, longitude) => {
    expect(isCoordinateInWifaqTown(latitude, longitude)).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('wifaq');
    // a method chosen by hand stays
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
  });

  it('London keeps its own unified timetable on Automatic, though Wifaqul Ulama lists London districts', () => {
    expect(isCoordinateInWifaqTown(51.5194, -0.0597)).toBe(true); // Whitechapel
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude: 51.5194, longitude: -0.0597 }, 'auto')).toBe('london');
  });

  it.each([
    ['Inverness', 57.478, -4.224],
    ['Norwich', 52.63, 1.297],
    ['Exeter', 50.726, -3.527],
    ['Dublin', 53.35, -6.26],
    ['Paris', 48.857, 2.352],
  ] as const)('%s is in none of its towns', async (_name, latitude, longitude) => {
    expect(isCoordinateInWifaqTown(latitude, longitude)).toBe(false);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).not.toBe('wifaq');
    await expect(getWifaqTimes({ latitude, longitude, date: new Date(2027, 0, 1, 12) })).rejects.toThrow();
  });

  it('answers through the unified fetch, offline', async () => {
    const r = await fetchPrayerTimesUnified({ provider: 'wifaq', latitude: 52.637, longitude: -1.14, date: new Date(2026, 11, 21, 12), calculationMethod: 'auto', school: 1 });
    expect(r.source).toBe('local');
    for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) expect(r.timings[k]).toMatch(/^\d\d:\d\d$/);
  });
});
