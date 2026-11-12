/**
 * Tunisia: the Institut National de la Météorologie's own method on the
 * phone — a listed place's published minute inside it, nothing outside
 * its places, and Automatic's choice in them.
 */
jest.unmock('adhan');

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { getTunisiaTimes } from '../src/providers/tunisiaTimetable';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { TUNISIA_PLACES, TUNISIA_PLACE_KM, isCoordinateInTunisiaPlace, tunisiaPlaceAt } from '../src/utils/tunisiaRegion';

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const TUNIS = { latitude: 36.8, longitude: 10.183 };
const LE_KEF = { latitude: 36.184, longitude: 8.715 };
const KAIROUAN = { latitude: 35.677, longitude: 10.097 };

describe('Tunisia — Institut National de la Météorologie', () => {
  it('lists the twenty-four governorates’ seats and two more', () => {
    expect(TUNISIA_PLACES).toHaveLength(26);
    expect(tunisiaPlaceAt(TUNIS.latitude, TUNIS.longitude)!.name).toBe('Tunis');
    expect(tunisiaPlaceAt(TUNIS.latitude, TUNIS.longitude)!.distanceKm).toBeLessThan(TUNISIA_PLACE_KM);
    // every place has the horizon of its own height
    for (const p of TUNISIA_PLACES) {
      expect(p.dip).toBeGreaterThanOrEqual(0);
      expect(p.dipSunset).toBeLessThan(1);
    }
  });

  it.each([
    // the Institute's five times: sobh, dhohr, aser, magreb, isha
    ['Tunis', TUNIS, new Date(2026, 0, 1, 12), ['05:59', '12:30', '14:55', '17:16', '18:47']],
    ['Tunis', TUNIS, new Date(2026, 5, 21, 12), ['03:08', '12:28', '16:13', '19:44', '21:35']],
    ['Tunis', TUNIS, new Date(2026, 10, 12, 12), ['05:25', '12:10', '14:52', '17:15', '18:42']],
    // 0.88° of horizon, the highest listed
    ['Le Kef', LE_KEF, new Date(2026, 0, 1, 12), ['06:00', '12:35', '15:03', '17:28', '18:58']],
    ['Le Kef', LE_KEF, new Date(2026, 5, 21, 12), ['03:11', '12:34', '16:17', '19:53', '21:43']],
    // its allowance at sunset only
    ['Kairouan', KAIROUAN, new Date(2026, 5, 21, 12), ['03:15', '12:28', '16:10', '19:42', '21:28']],
    ['Kairouan', KAIROUAN, new Date(2026, 10, 12, 12), ['05:24', '12:11', '14:54', '17:18', '18:43']],
  ] as const)('gives %s the day as the Institute does', async (_name, at, date, five) => {
    const r = await getTunisiaTimes({ ...at, date, school: 0 });
    expect(r.source).toBe('local');
    expect(r.timezone).toBe('Africa/Tunis');
    const t = r.timings;
    expect([t.Fajr, t.Dhuhr, t.Asr, t.Maghrib, t.Isha]).toEqual([...five]);
    // the sunrise is the method's own: between Fajr and Dhuhr, and the mirror of the sunset about the noon
    const sunset = minutes(t.Maghrib) - 2;
    const noon = minutes(t.Dhuhr) - 7;
    expect(Math.abs(noon - minutes(t.Sunrise) - (sunset - noon))).toBeLessThanOrEqual(2);
  });

  it('a Hanafi reader’s Asr is the method’s at two shadow lengths, later than the Institute’s', async () => {
    const shafii = await getTunisiaTimes({ ...TUNIS, date: new Date(2026, 5, 21, 12), school: 0 });
    const hanafi = await getTunisiaTimes({ ...TUNIS, date: new Date(2026, 5, 21, 12), school: 1 });
    expect(minutes(hanafi.timings.Asr)).toBeGreaterThan(minutes(shafii.timings.Asr) + 40);
    expect(hanafi.timings.Maghrib).toBe(shafii.timings.Maghrib);
  });

  it.each([
    ['Tunis', 36.8, 10.183],
    ['Sfax', 34.733, 10.75],
    ['Sousse', 35.833, 10.639],
    ['Tozeur', 33.924, 8.131],
    ['Tataouine', 32.933, 10.45],
  ] as const)('%s takes the Institute’s times on Automatic', (_name, latitude, longitude) => {
    expect(isCoordinateInTunisiaPlace(latitude, longitude)).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('tunisia');
    // a method chosen by hand stays
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
  });

  it('outside the listed places it has nothing to say, and Automatic is as it was', async () => {
    // Djerba (Houmt Souk): a delegation that was not read
    const djerba = { latitude: 33.876, longitude: 10.858 };
    expect(isCoordinateInTunisiaPlace(djerba.latitude, djerba.longitude)).toBe(false);
    await expect(getTunisiaTimes({ ...djerba, date: new Date(2026, 5, 21, 12) })).rejects.toThrow();
    expect(getEffectiveDataProvider(true, 'aladhan', djerba, 'auto')).not.toBe('tunisia');
    // across the border
    expect(isCoordinateInTunisiaPlace(36.9, 7.76)).toBe(false); // Annaba
    expect(isCoordinateInTunisiaPlace(32.89, 13.19)).toBe(false); // Tripoli
  });

  it('through the unified fetch, a listed place is computed on the phone', async () => {
    const r = await fetchPrayerTimesUnified({ ...TUNIS, date: new Date(2026, 0, 1, 12), provider: 'tunisia', calculationMethod: 'auto', school: 0 } as never);
    expect(r.timings.Fajr).toBe('05:59');
    expect(r.timings.Isha).toBe('18:47');
  });
});
