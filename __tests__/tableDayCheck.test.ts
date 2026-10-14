/**
 * A published row must be the day it claims to be.
 *
 * Islamiska Förbundet's widget, asked for a 2027 date before 2027 is
 * published, answers with 2026's same date; between the two years' clock
 * changes (28 March, 25–30 October 2027) that row is an hour off. Dhuhr
 * gives it away: solar noon plus a few minutes on every true row.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('../src/utils/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(),
}));

import {
  dhuhrOffsetFromNoon,
  equationOfTimeMinutes,
  isPlausibleTableDay,
  solarNoonMinutes,
  zoneOffsetMinutes,
} from '../src/prayer/tableDayCheck';
import { fetchWithRetry } from '../src/utils/fetchWithRetry';
import { fetchIslamiskaForbundetTimes } from '../src/providers/islamiskaForbundet';

const STOCKHOLM_LON = 18.0686;
const TZ = 'Europe/Stockholm';

describe('solar arithmetic', () => {
  it('knows Stockholm’s clock on both sides of the change', () => {
    expect(zoneOffsetMinutes(TZ, new Date(Date.UTC(2027, 6, 1, 12)))).toBe(120);
    expect(zoneOffsetMinutes(TZ, new Date(Date.UTC(2027, 0, 1, 12)))).toBe(60);
    // 2027: summer time ends 31 October, not 25 October as in 2026.
    expect(zoneOffsetMinutes(TZ, new Date(Date.UTC(2027, 9, 27, 12)))).toBe(120);
    expect(zoneOffsetMinutes(TZ, new Date(Date.UTC(2026, 9, 27, 12)))).toBe(60);
  });

  it('has the equation of time within a minute of the almanac', () => {
    // Early November is the year's largest lead (+16.4 min); mid-February the largest lag (−14.2).
    expect(equationOfTimeMinutes(new Date(2026, 10, 3))).toBeCloseTo(16.4, 0);
    expect(equationOfTimeMinutes(new Date(2026, 1, 11))).toBeCloseTo(-14.2, 0);
    expect(Math.abs(equationOfTimeMinutes(new Date(2026, 3, 15)))).toBeLessThan(1);
  });

  it('puts Stockholm’s solar noon where the table’s Dhuhr sits, less its margin', () => {
    // The table says Dhuhr 12:40 on 9 October 2026 (CEST) and 11:37 on 25 October (CET).
    expect(solarNoonMinutes('2026-10-09', STOCKHOLM_LON, TZ)).toBeCloseTo(12 * 60 + 35, 0);
    expect(solarNoonMinutes('2026-10-25', STOCKHOLM_LON, TZ)).toBeCloseTo(11 * 60 + 32, 0);
  });
});

describe('the Stockholm table', () => {
  const file = join(__dirname, '..', 'data', 'prayer-times', 'v1', 'cities', 'stockholm.json');
  const days = JSON.parse(readFileSync(file, 'utf8')).days as Record<string, string[]>;

  it('has every stored Dhuhr four to six minutes past solar noon', () => {
    for (const [date, row] of Object.entries(days)) {
      const off = dhuhrOffsetFromNoon(date, row[3], STOCKHOLM_LON, TZ);
      expect({ date, off: Math.round(off) }).toEqual({ date, off: expect.any(Number) });
      expect(off).toBeGreaterThanOrEqual(3.5);
      expect(off).toBeLessThanOrEqual(6.5);
    }
  });

  it('rejects 2026’s row served for a 2027 date across the clock change', () => {
    // 2026-10-27 (CET): Dhuhr 11:37. On 2027-10-27 Stockholm is still on CEST.
    expect(isPlausibleTableDay('2026-10-27', '11:37', STOCKHOLM_LON, TZ)).toBe(true);
    expect(isPlausibleTableDay('2027-10-27', '11:37', STOCKHOLM_LON, TZ)).toBe(false);
    expect(Math.round(dhuhrOffsetFromNoon('2027-10-27', '11:37', STOCKHOLM_LON, TZ))).toBe(-55);
    // 2026-03-28 (CET) served for 2027-03-28 (CEST, the change is that morning).
    expect(isPlausibleTableDay('2027-03-28', '11:58', STOCKHOLM_LON, TZ)).toBe(false);
    expect(isPlausibleTableDay('2027-03-27', '11:58', STOCKHOLM_LON, TZ)).toBe(true);
  });
});

describe('the live scraper', () => {
  const html = (times: string[]) => `
    <html><body><table class="bonetider-widget">
      <tr><td>Fajr</td><td>${times[0]}</td></tr>
      <tr><td>Soluppgång</td><td>${times[1]}</td></tr>
      <tr><td>Dhuhr</td><td>${times[2]}</td></tr>
      <tr><td>Asr</td><td>${times[3]}</td></tr>
      <tr><td>Maghrib</td><td>${times[4]}</td></tr>
      <tr><td>Isha</td><td>${times[5]}</td></tr>
    </table></body></html>`;
  const answer = (body: string) =>
    (fetchWithRetry as jest.Mock).mockResolvedValue({ ok: true, status: 200, text: async () => body });

  it('takes the row when its Dhuhr is the day’s noon', async () => {
    answer(html(['04:36', '06:47', '11:37', '13:39', '16:17', '18:12']));
    const r = await fetchIslamiskaForbundetTimes({ latitude: 59.33, longitude: 18.07, date: new Date(2026, 9, 27) });
    expect(r.timings.Dhuhr).toBe('11:37');
  });

  it('refuses the same row for 27 October 2027, an hour off', async () => {
    answer(html(['04:36', '06:47', '11:37', '13:39', '16:17', '18:12']));
    await expect(
      fetchIslamiskaForbundetTimes({ latitude: 59.33, longitude: 18.07, date: new Date(2027, 9, 27) }),
    ).rejects.toMatchObject({ category: 'shape' });
  });
});
