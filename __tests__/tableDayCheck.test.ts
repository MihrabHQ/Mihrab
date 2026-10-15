/**
 * A published row must be the day it claims to be.
 *
 * A timetable asked for a 2027 date before 2027 is published may answer
 * with 2026's same date; between the two years' clock changes (28 March,
 * 25–30 October 2027) that row is an hour off. Dhuhr gives it away: solar
 * noon plus a few minutes on every true row.
 */
import {
  dhuhrOffsetFromNoon,
  equationOfTimeMinutes,
  isPlausibleTableDay,
  solarNoonMinutes,
  zoneOffsetMinutes,
} from '../src/prayer/tableDayCheck';
import { congressTimes } from '../src/providers/congressMethod';

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

describe('Stockholm', () => {
  it('has every Dhuhr of a year four to six minutes past solar noon', () => {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
      const t = congressTimes(59.33, STOCKHOLM_LON, 2026, d.getMonth(), d.getDate());
      const date = `2026-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const off = dhuhrOffsetFromNoon(date, fmt.format(new Date(Math.round(t.dhuhr.getTime() / 60_000) * 60_000)), STOCKHOLM_LON, TZ);
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

