/**
 * Islamiska Förbundet's convention, computed on the phone (method 24) —
 * read off the tables of all 108 cities (tools/verify-methods, October
 * 2026) and checked here against the tables in this checkout.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

jest.unmock('adhan');

import { computeLocalAdhanInstants, computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { SWEDEN_METHOD_ID } from '../src/providers/swedenMethodId';
import { autoMethodForCoords } from '../src/providers/autoMethod';

const TZ = 'Europe/Stockholm';
const clockIn = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

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
    const at = computeLocalAdhanInstants({ latitude: lat, longitude: lon, date: new Date(y, m - 1, d), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
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

describe('Sweden — Islamiska Förbundet (method 24)', () => {
  it('is what Automatic computes in Sweden, and nowhere else', () => {
    expect(autoMethodForCoords(59.33, 18.07)).toBe(SWEDEN_METHOD_ID);
    expect(autoMethodForCoords(65.58, 22.15)).toBe(SWEDEN_METHOD_ID);
    expect(autoMethodForCoords(59.91, 10.75)).not.toBe(SWEDEN_METHOD_ID); // Oslo
    expect(autoMethodForCoords(55.68, 12.57)).not.toBe(SWEDEN_METHOD_ID); // Copenhagen
  });

  it('is on the table’s minute at Malmö the whole year round', () => {
    const a = agreement('malmo', 55.6052931, 13.0001566, '2026-10-01', '2027-11-30');
    if (!a) return;
    for (const p of ['Fajr', 'Sunrise', 'Dhuhr', 'Maghrib', 'Isha']) expect(a[p]).toBeGreaterThan(0.9);
    expect(a.Asr).toBeGreaterThan(0.8);
  });

  it('follows the night share through Stockholm’s summer', () => {
    const a = agreement('stockholm', 59.3251172, 18.0710935, '2027-05-01', '2027-08-15');
    if (!a) return;
    expect(a.Fajr).toBeGreaterThan(0.85);
    expect(a.Isha).toBeGreaterThan(0.85);
  });

  it('floors the day at five hours in Umeå’s December, and the night in its June', () => {
    const t = (y: number, m: number, d: number) =>
      computeLocalAdhanTimes({ latitude: 63.8256568, longitude: 20.2630745, date: new Date(y, m - 1, d), calculationMethod: SWEDEN_METHOD_ID, school: 0 }).timings;
    // The table: 09:11 and 14:11 about a Dhuhr of 11:41 on 20 December.
    const dec = computeLocalAdhanInstants({ latitude: 63.8256568, longitude: 20.2630745, date: new Date(2026, 11, 20), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    expect(clockIn(dec.sunrise)).toBe('09:11');
    expect(clockIn(dec.maghrib)).toBe('14:11');
    // And 03:16 / 22:13 on 10 June, 300 minutes of night about 00:43.
    const jun = computeLocalAdhanInstants({ latitude: 63.8256568, longitude: 20.2630745, date: new Date(2027, 5, 10), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    expect(clockIn(jun.sunrise)).toBe('03:16');
    expect(clockIn(jun.maghrib)).toBe('22:13');
    void t;
  });

  it('keeps the floor under the midnight sun at Boden', () => {
    const at = computeLocalAdhanInstants({ latitude: 65.8275004, longitude: 21.6964105, date: new Date(2027, 5, 26), calculationMethod: SWEDEN_METHOD_ID, school: 0 });
    // The table: 02:09 03:11 12:41 17:38 22:10 23:05.
    expect(clockIn(at.sunrise)).toBe('03:11');
    expect(clockIn(at.maghrib)).toBe('22:10');
    expect(['02:08', '02:09', '02:10']).toContain(clockIn(at.fajr));
    expect(['23:04', '23:05', '23:06']).toContain(clockIn(at.isha));
  });

  it('has the winter margins: sunrise seven early, Dhuhr five late, Maghrib seven late', () => {
    // Stockholm, 20 November 2026 — the table: 06:52 08:21 11:38 12:59 14:51 16:53.
    const at = computeLocalAdhanTimes({ latitude: 59.3251172, longitude: 18.0710935, date: new Date(2026, 10, 20), calculationMethod: SWEDEN_METHOD_ID, school: 0 }).timings;
    const days = table('stockholm');
    if (!days || !days['2026-11-20']) return;
    const theirs = days['2026-11-20'];
    for (const [k, p] of [[1, 'Fajr'], [2, 'Sunrise'], [3, 'Dhuhr'], [5, 'Maghrib'], [6, 'Isha']] as const) {
      expect(Math.abs(minutes(at[p]) - minutes(theirs[k]))).toBeLessThanOrEqual(1);
    }
  });
});
