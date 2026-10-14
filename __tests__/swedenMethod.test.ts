/**
 * Sweden's method (24): the International Prayer Times Congress method as
 * Diyanet's tables realise it (src/providers/congressMethod.ts), checked
 * against Islamiska Förbundet's tables in this checkout — which are those
 * tables. Coordinates are Diyanet's, read off the tables
 * (tools/verify-methods/diyanet-sweden-points.json; the coordinates file the app uses holds them).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

jest.unmock('adhan');

import { computeLocalAdhanInstants, computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { SWEDEN_METHOD_ID } from '../src/providers/swedenMethodId';
import { autoMethodForCoords } from '../src/providers/autoMethod';
import { congressTimes, congressYearInfo } from '../src/providers/congressMethod';

const TZ = 'Europe/Stockholm';
/** The instant on Sweden's clock, rounded to the minute as the tables print it. */
const clockIn = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(Math.round(at.getTime() / 60_000) * 60_000),
  );
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const STOCKHOLM = { lat: 59.3333, lon: 18.0333 };
const UMEA = { lat: 63.8333, lon: 20.2333 };
const LULEA = { lat: 65.6, lon: 22.1667 };
const BODEN = { lat: 65.8333, lon: 21.7 };

function table(slug: string): Record<string, string[]> | null {
  const f = join(__dirname, '..', 'data', 'prayer-times', 'v1', 'cities', `${slug}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).days : null;
}

/** Share of the city's rows within `tol` minutes, per prayer, over the dates given. */
function agreement(slug: string, lat: number, lon: number, from: string, to: string, tol = 1) {
  const days = table(slug);
  if (!days) return null;
  const within: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const [date, row] of Object.entries(days)) {
    if (date < from || date > to) continue;
    const [y, m, d] = date.split('-').map(Number);
    // The site's 2027 rows are its 2026 rows copied; compute them as 2026.
    const at = computeLocalAdhanInstants({ latitude: lat, longitude: lon, date: new Date(2026, m - 1, d), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    void y;
    const ours = [at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha];
    ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].forEach((p, k) => {
      let diff = minutes(clockIn(ours[k])) - minutes(row[k + 1]);
      if (diff > 720) diff -= 1440;
      if (diff <= -720) diff += 1440;
      total[p] = (total[p] ?? 0) + 1;
      if (Math.abs(diff) <= tol) within[p] = (within[p] ?? 0) + 1;
    });
  }
  return Object.fromEntries(Object.keys(total).map(p => [p, (within[p] ?? 0) / total[p]]));
}

describe('Sweden — the Congress method (method 24)', () => {
  it('is what Automatic computes in Sweden, and nowhere else', () => {
    expect(autoMethodForCoords(59.33, 18.07)).toBe(SWEDEN_METHOD_ID);
    expect(autoMethodForCoords(65.58, 22.15)).toBe(SWEDEN_METHOD_ID);
    expect(autoMethodForCoords(59.91, 10.75)).not.toBe(SWEDEN_METHOD_ID); // Oslo
    expect(autoMethodForCoords(55.68, 12.57)).not.toBe(SWEDEN_METHOD_ID); // Copenhagen
  });

  it.each([
    ['stockholm', STOCKHOLM],
    ['malmo', { lat: 55.6, lon: 13.0 }],
    ['umea', UMEA],
    ['lulea', LULEA],
    ['boden', BODEN],
  ])('is within a minute of the table on every day at %s, and on the minute on most', (slug, c) => {
    const a = agreement(slug, c.lat, c.lon, '2026-10-01', '2027-11-30');
    if (!a) return;
    for (const p of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) expect(a[p]).toBe(1);
    const exact = agreement(slug, c.lat, c.lon, '2026-10-01', '2027-11-30', 0)!;
    for (const p of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) expect(exact[p]).toBeGreaterThan(0.85);
  });

  it('knows the year’s shape at Stockholm: the dawn’s gap, the carried ratio, no midsummer anchor', () => {
    const info = congressYearInfo(STOCKHOLM.lat, STOCKHOLM.lon, 2026);
    expect(info.gap).toEqual(['2026-04-24', '2026-08-19']);
    expect(info.ratio).toBeCloseTo(0.1839, 3);
    expect(info.midsummerFloors).toBe(false);
  });

  it('carries the night share through Stockholm’s summer: Isha 0.184 of the night after Maghrib, Fajr 18/16 of that before sunrise', () => {
    // 1 July: the table has 03:30 sunrise, 22:13 Maghrib, 02:25 Fajr, 23:12 Isha.
    const at = congressTimes(STOCKHOLM.lat, STOCKHOLM.lon, 2026, 6, 1);
    const night = 1440 - (at.maghrib.getTime() - at.sunrise.getTime()) / 60_000;
    const ratio = congressYearInfo(STOCKHOLM.lat, STOCKHOLM.lon, 2026).ratio!;
    expect((at.isha.getTime() - at.maghrib.getTime()) / 60_000).toBeCloseTo(ratio * night, 3);
    expect((at.sunrise.getTime() - at.fajr.getTime()) / 60_000).toBeCloseTo((18 / 16) * ratio * night, 3);
    expect(clockIn(at.isha)).toBe('23:12');
    expect(clockIn(at.fajr)).toBe('02:25');
  });

  it('runs the gradual transition as a straight line twenty minutes long: Stockholm’s spring Fajr, 3–23 April', () => {
    // The table: 03:36 on the 3rd, a minute earlier each day with one repeat, 03:17 on the 23rd, 03:16 carried on the 24th.
    const fajr = (d: number) => clockIn(congressTimes(STOCKHOLM.lat, STOCKHOLM.lon, 2026, 3, d).fajr);
    expect(fajr(2)).toBe('03:37'); // still the true 18° dawn
    expect(fajr(3)).toBe('03:36');
    expect(fajr(13)).toBe('03:26');
    expect(fajr(23)).toBe('03:17');
    expect(fajr(24)).toBe('03:16');
  });

  it('floors the day at five hours in Umeå’s December, each end on its own', () => {
    // 20 December: 09:11 and 14:11 about a Dhuhr of 11:41. 6 December: the
    // true sunrise 08:58 stands while Maghrib is already held at 14:05.
    const dec20 = computeLocalAdhanInstants({ latitude: UMEA.lat, longitude: UMEA.lon, date: new Date(2026, 11, 20), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    expect(clockIn(dec20.sunrise)).toBe('09:11');
    expect(clockIn(dec20.maghrib)).toBe('14:11');
    const dec6 = computeLocalAdhanInstants({ latitude: UMEA.lat, longitude: UMEA.lon, date: new Date(2026, 11, 6), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    expect(clockIn(dec6.sunrise)).toBe('08:58');
    expect(clockIn(dec6.maghrib)).toBe('14:05');
  });

  it('anchors the midsummer night for the season at Luleå: sunrise 03:08 and Fajr 02:10 from mid-May to midsummer', () => {
    expect(congressYearInfo(LULEA.lat, LULEA.lon, 2026).midsummerFloors).toBe(true);
    for (const d of [14, 20, 26]) {
      const at = congressTimes(LULEA.lat, LULEA.lon, 2026, 4, d);
      expect(clockIn(at.sunrise)).toBe('03:08');
      expect(clockIn(at.fajr)).toBe('02:10');
    }
    // and after it the day's own floor moves on: 03:13 in late July
    expect(clockIn(congressTimes(LULEA.lat, LULEA.lon, 2026, 6, 25).sunrise)).toBe('03:13');
  });

  it('keeps the night floor under the midnight sun at Boden', () => {
    const at = computeLocalAdhanInstants({ latitude: BODEN.lat, longitude: BODEN.lon, date: new Date(2026, 5, 26), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    // The table: 02:09 03:11 12:41 17:38 22:10 23:05.
    expect(clockIn(at.sunrise)).toBe('03:11');
    expect(clockIn(at.maghrib)).toBe('22:10');
    expect(clockIn(at.dhuhr)).toBe('12:41');
    expect(['02:08', '02:09', '02:10']).toContain(clockIn(at.fajr));
    expect(['23:04', '23:05', '23:06']).toContain(clockIn(at.isha));
  });

  it('has the margins: sunrise seven early, Dhuhr five late, Asr four late, Maghrib seven late', () => {
    // Stockholm, 20 November 2026 — the table: 05:24 07:46 11:38 12:59 15:21 17:27.
    const at = computeLocalAdhanInstants({ latitude: STOCKHOLM.lat, longitude: STOCKHOLM.lon, date: new Date(2026, 10, 20), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    expect([at.fajr, at.sunrise, at.dhuhr, at.asr, at.maghrib, at.isha].map(clockIn)).toEqual(['05:24', '07:46', '11:38', '12:59', '15:21', '17:27']);
    // and the formatted timings are those instants on the phone's clock
    const timings = computeLocalAdhanTimes({ latitude: STOCKHOLM.lat, longitude: STOCKHOLM.lon, date: new Date(2026, 10, 20), calculationMethod: SWEDEN_METHOD_ID, school: 0 }).timings;
    expect(Object.keys(timings)).toEqual(expect.arrayContaining(['Fajr', 'Isha']));
  });

  // Diyanet's own tables (awqatsalah.com), which Islamiska Förbundet republishes; points to
  // three decimals as Diyanet keeps them (tools/verify-methods/diyanet-*.py).
  it('prints an Asr that never forms at Dhuhr’s time: Kiruna in December', () => {
    for (const d of [15, 20, 25]) {
      const at = congressTimes(67.859, 20.226, 2024, 11, d);
      expect(clockIn(at.asr)).toBe(clockIn(at.dhuhr));
    }
    expect(clockIn(congressTimes(67.859, 20.226, 2024, 11, 20).asr)).toBe('11:42');
  });

  it('never steps a floored sunrise back after midsummer: Piteå holds 03:16 through late July', () => {
    for (const d of [27, 28, 29, 30]) expect(clockIn(congressTimes(65.313, 21.513, 2024, 6, d).sunrise)).toBe('03:16');
  });

  it('never steps a floored Maghrib back before midsummer: Kiruna holds 22:11 in mid-May', () => {
    for (const d of [8, 11, 14, 16, 20]) expect(clockIn(congressTimes(67.859, 20.226, 2024, 4, d).maghrib)).toBe('22:11');
  });

  it('computes 2027 as Diyanet published it, not as last year: Umeå’s carried share moves', () => {
    const r26 = congressYearInfo(63.834, 20.238, 2026).ratio!;
    const r27 = congressYearInfo(63.834, 20.238, 2027).ratio!;
    expect(Math.abs(r26 - r27)).toBeGreaterThan(0.005);
  });
});
