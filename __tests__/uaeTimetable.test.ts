/**
 * The United Arab Emirates' timetable, computed on the phone by the
 * Authority's own method: the published minute in a zone (rows of its
 * timetable), the Hanafi Asr from the same method, which zone answers for a
 * reader, and where Automatic picks it.
 */
jest.unmock('adhan');
jest.mock('../src/providers/aladhan', () => ({
  fetchAladhanTimes: jest.fn(async () => {
    throw new Error('AlAdhan must not be asked inside the Emirates');
  }),
}));

import { fetchPrayerTimesUnified } from '../src/providers/fetchPrayerTimes';
import { UAE_AREAS, UAE_ZONES, getUaeTimes, uaeZoneAt, uaeZoneFor } from '../src/providers/uaeTimetable';
import { uaeTimes } from '../src/providers/uaeMethod';
import { getEffectiveDataProvider } from '../src/settings/effectiveProvider';
import { providerHidesCalculationMethod, providerHidesHanafiAsr, providerPrintsHanafiAsrOnly } from '../src/settings/providerUi';
import { methodAuthorityFor } from '../src/providers/methodCurrency';
import { METHOD_REVISION } from '../src/providers/methodRevisions';
import { CORRECTION_AUTHORITIES, correctionsInForce } from '../src/providers/swedenCorrections';
import { isCoordinateInUae } from '../src/utils/uaeRegion';

const six = (t: Record<string, string>) => ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(k => t[k]);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const at = (latitude: number, longitude: number, ymd: string, school = 0) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return fetchPrayerTimesUnified({ provider: 'uae', latitude, longitude, date: new Date(y, m - 1, d, 12), calculationMethod: 'auto', school });
};

describe('the published minute', () => {
  // rows of the Authority's timetable: Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha
  it.each([
    ['Abu Dhabi, winter', 24.4539, 54.3773, '2026-01-01', ['05:44', '07:03', '12:28', '15:26', '17:49', '19:07']],
    ['Abu Dhabi, midsummer', 24.4539, 54.3773, '2026-06-21', ['04:05', '05:31', '12:27', '15:45', '19:17', '20:43']],
    ['Dubai, midsummer', 25.2048, 55.2708, '2026-06-21', ['03:59', '05:26', '12:23', '15:44', '19:15', '20:42']],
    ['Dubai, November', 25.2048, 55.2708, '2026-11-12', ['05:14', '06:30', '12:06', '15:11', '17:36', '18:52']],
    ['Sharjah', 25.3463, 55.4209, '2026-09-15', ['04:46', '06:01', '12:16', '15:42', '18:25', '19:40']],
    ['Al Ain', 24.2075, 55.7447, '2026-03-10', ['05:15', '06:26', '12:30', '15:52', '18:27', '19:40']],
    ['Liwa, south of the Tropic, the sun overhead at noon', 23.13, 53.78, '2026-06-21', ['04:13', '05:37', '12:29', '15:45', '19:17', '20:40']],
    ['Jebel Jais, the summit and its low horizon', 25.946, 56.1686, '2026-01-01', ['05:40', '06:54', '12:21', '15:16', '17:44', '18:57']],
  ] as const)('%s', async (_name, latitude, longitude, ymd, row) => {
    const r = await at(latitude, longitude, ymd);
    expect(six(r.timings)).toEqual([...row]);
    expect(r.source).toBe('local');
    expect(r.timezone).toBe('Asia/Dubai');
    // the Hanafi Asr is the same method's at two shadow lengths: later, and nothing else moves
    const hanafi = await at(latitude, longitude, ymd, 1);
    expect(toMin(hanafi.timings.Asr)).toBeGreaterThan(toMin(row[3]) + 20);
    expect([hanafi.timings.Fajr, hanafi.timings.Sunrise, hanafi.timings.Dhuhr, hanafi.timings.Maghrib, hanafi.timings.Isha]).toEqual([row[0], row[1], row[2], row[4], row[5]]);
  });

  it('has its list at the revision this build computes', () => {
    expect(CORRECTION_AUTHORITIES).toContain('uae');
    expect(METHOD_REVISION.uae).toBe(1);
    expect(correctionsInForce('uae').entries).toBeGreaterThan(1000);
  });

  it('puts Dhuhr two minutes after the transit and a wide zone’s morning before its evening’s point', () => {
    const dubai = UAE_ZONES.find(z => z.name === 'Dubai')!;
    const plain = uaeTimes(dubai.lat, dubai.lon, 2026, 2, 20, dubai.dipEast, 1, dubai.dipWest, 0)!;
    const zone = uaeTimes(dubai.lat, dubai.lon, 2026, 2, 20, dubai.dipEast, 1, dubai.dipWest, dubai.morningMinutes)!;
    expect(dubai.morningMinutes).toBeLessThan(-1);
    expect(plain.fajr.getTime() - zone.fajr.getTime()).toBeGreaterThanOrEqual(60_000);
    expect(zone.isha.getTime()).toBe(plain.isha.getTime());
  });
});

describe('the zone that answers', () => {
  it('lists the Authority’s forty-one zones and places every one the app serves', () => {
    expect(UAE_ZONES).toHaveLength(41);
    const placed = new Set(UAE_AREAS.map(a => a.zone));
    // all but the two island zones in the middle of the Gulf
    expect(UAE_ZONES.filter(z => !placed.has(z.id)).map(z => z.id)).toEqual([85, 86]);
    for (const a of UAE_AREAS) expect(isCoordinateInUae(a.lat, a.lon)).toBe(true);
    const abuDhabi = UAE_ZONES.find(z => z.id === 36)!;
    expect(uaeZoneAt(abuDhabi.lat, abuDhabi.lon)).toMatchObject({ id: 36, dipEast: abuDhabi.dipEast });
  });

  it.each([
    ['Abu Dhabi, the corniche', 24.47, 54.34, 36],
    ['Mussafah', 24.35, 54.5, 36],
    ['Al Shahama', 24.55, 54.68, 40],
    ['Dubai Marina', 25.08, 55.14, 69],
    ['Deira', 25.27, 55.31, 69],
    ['Sharjah', 25.3463, 55.4209, 91],
    ['Ajman', 25.4052, 55.5136, 66],
    ['Umm Al Quwain', 25.5647, 55.5552, 94],
    ['Ras Al Khaimah', 25.7895, 55.9432, 82],
    ['Fujairah', 25.1288, 56.3265, 73],
    ['Khor Fakkan', 25.34, 56.35, 88],
    ['Kalba', 25.05, 56.35, 88],
    ['Al Ain', 24.2075, 55.7447, 37],
    ['Hatta', 24.8, 56.12, 71],
    ['Madinat Zayed', 23.68, 53.7, 57],
    ['Al Sila', 24.07, 51.76, 50],
    ['Jebel Jais, the summit', 25.946, 56.1686, 80],
    ['Jebel Hafeet, the summit', 24.058, 55.7778, 52],
  ] as const)('%s', (_name, latitude, longitude, zone) => {
    expect(uaeZoneFor(latitude, longitude).id).toBe(zone);
  });

  it('keeps the summits’ horizon to the summits', () => {
    // Wadi Bih's mouth and Al Rams, under Jebel Jais; Mezyad and the south of Al Ain, under Jebel Hafeet
    expect(uaeZoneFor(25.88, 56.02).id).toBe(82);
    expect(uaeZoneFor(25.86, 56.12).id).not.toBe(80);
    expect(uaeZoneFor(24.03, 55.84).id).toBe(37);
    expect(uaeZoneFor(24.13, 55.74).id).toBe(37);
  });

  it('answers only inside the Emirates', async () => {
    const date = new Date(2026, 0, 15, 12);
    await expect(getUaeTimes({ latitude: 24.25, longitude: 55.79, date })).rejects.toThrow(); // Buraimi
    await expect(getUaeTimes({ latitude: 25.2854, longitude: 51.531, date })).rejects.toThrow(); // Doha
  });
});

describe('where it is the source', () => {
  it.each([
    ['Abu Dhabi, the corniche', 24.47, 54.34],
    ['Dubai Marina, the seafront', 25.08, 55.14],
    ['Sharjah', 25.3463, 55.4209],
    ['Fujairah', 25.1288, 56.3265],
    ['Al Ain', 24.2075, 55.7447],
    ['Hatta', 24.8, 56.12],
    ['Liwa', 23.13, 53.78],
    ['Dalma Island', 24.5, 52.31],
    ['Das Island', 25.156, 52.87],
  ] as const)('%s', (_name, latitude, longitude) => {
    expect(isCoordinateInUae(latitude, longitude)).toBe(true);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).toBe('uae');
    // a method chosen by hand stays
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 3)).toBe('aladhan');
  });

  it.each([
    ['Buraimi, across the street from Al Ain', 24.25, 55.79],
    ['Madha, Oman’s enclave inside the Emirates', 25.28, 56.33],
    ['Khasab', 26.18, 56.25],
    ['Sohar', 24.34, 56.73],
    ['Doha', 25.2854, 51.531],
    ['Salwa, in Saudi Arabia', 24.72, 50.8],
    ['Abu Musa', 25.87, 55.03],
  ] as const)('%s is not', (_name, latitude, longitude) => {
    expect(isCoordinateInUae(latitude, longitude)).toBe(false);
    expect(getEffectiveDataProvider(true, 'aladhan', { latitude, longitude }, 'auto')).not.toBe('uae');
  });

  it('keeps the Hanafi Asr toggle and hides the method list', () => {
    expect(providerHidesCalculationMethod('uae')).toBe(true);
    expect(providerHidesHanafiAsr('uae')).toBe(false);
    expect(providerPrintsHanafiAsrOnly('uae')).toBe(false);
    expect(methodAuthorityFor('uae', 'auto', 25.2, 55.27)).toBe('uae');
  });
});
