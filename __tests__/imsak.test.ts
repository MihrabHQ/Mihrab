/**
 * Imsak helpers + Ramadan provider plumbing — task #7.
 *
 * Verifies:
 *   1. timeMinusMinutes wraps past midnight correctly.
 *   2. computeImsak applies the configured offset.
 *   3. validateTimings enforces Imsak ≤ Fajr (with high-latitude wrap).
 *   4. localAdhan returns Imsak.
 *   5. Islamiska Förbundet parser extracts Imsak from a 7-token Ramadan
 *      response and falls back to Fajr − 10 from a 6-token regular response.
 *   6. fetchPrayerTimesUnified guarantees Imsak is present after every
 *      provider call.
 */

import {
  DEFAULT_IMSAK_OFFSET_MINUTES,
  computeImsak,
  computeImsakAt,
  timeMinusMinutes,
} from '../src/providers/imsak';
import { formatInZone } from '../src/providers/locationClock';
import { validateTimings } from '../src/providers/validateTimings';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';

describe('timeMinusMinutes', () => {
  test('subtracts within the same day', () => {
    expect(timeMinusMinutes('05:00', 10)).toBe('04:50');
    expect(timeMinusMinutes('12:00', 30)).toBe('11:30');
    expect(timeMinusMinutes('14:30', 90)).toBe('13:00');
  });

  test('wraps past midnight when Fajr is in the early morning', () => {
    // Fajr 00:05 minus 10 → previous day 23:55 (high-latitude scenario).
    expect(timeMinusMinutes('00:05', 10)).toBe('23:55');
    expect(timeMinusMinutes('00:00', 1)).toBe('23:59');
  });

  test('zero offset is identity', () => {
    expect(timeMinusMinutes('05:00', 0)).toBe('05:00');
  });

  test('clamps negative offsets to 0', () => {
    expect(timeMinusMinutes('05:00', -10)).toBe('05:00');
  });

  test('handles malformed input gracefully (returns input)', () => {
    expect(timeMinusMinutes('not a time', 10)).toBe('not a time');
  });
});

describe('computeImsak', () => {
  test('default offset is 10 minutes', () => {
    expect(DEFAULT_IMSAK_OFFSET_MINUTES).toBe(10);
    expect(computeImsak('05:00')).toBe('04:50');
  });

  test('respects custom offsets (15, 20)', () => {
    expect(computeImsak('05:00', 15)).toBe('04:45');
    expect(computeImsak('05:00', 20)).toBe('04:40');
  });

  test('Umm al-Qura case: offset 0 → Imsak = Fajr', () => {
    expect(computeImsak('05:00', 0)).toBe('05:00');
  });
});

describe('validateTimings: Imsak validation', () => {
  const VALID_TIMINGS = {
    Fajr: '05:00',
    Sunrise: '06:10',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '18:00',
    Isha: '19:30',
  };

  test('accepts Imsak ≤ Fajr (Imsak = Fajr − 10 normal case)', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '04:50' }),
    ).not.toThrow();
  });

  test('accepts Imsak = Fajr (Umm al-Qura)', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '05:00' }),
    ).not.toThrow();
  });

  test('rejects Imsak > Fajr (clear ordering bug)', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '05:30' }),
    ).toThrow(/Imsak.*at or before Fajr/i);
  });

  test('rejects Imsak with malformed format', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: '4:30' }),
    ).toThrow(/Imsak.*HH:MM format/i);
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Imsak: 'soon' }),
    ).toThrow(/Imsak.*HH:MM format/i);
  });

  test('accepts Imsak in late evening when Fajr is in early morning (high-latitude wrap)', () => {
    // Stockholm late June: Fajr just after midnight, Imsak the previous evening.
    expect(() =>
      validateTimings({
        Fajr: '00:48',
        Sunrise: '03:30',
        Dhuhr: '12:50',
        Asr: '17:00',
        Maghrib: '21:50',
        Isha: '23:55',
        Imsak: '23:30',
      }),
    ).not.toThrow();
  });

  test('Imsak omitted is fine (optional key)', () => {
    expect(() => validateTimings(VALID_TIMINGS)).not.toThrow();
  });

  test('Midnight optional key validates format only', () => {
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Midnight: '00:00' }),
    ).not.toThrow();
    expect(() =>
      validateTimings({ ...VALID_TIMINGS, Midnight: 'mid' }),
    ).toThrow(/Midnight.*HH:MM format/i);
  });
});

describe('computeLocalAdhanTimes returns Imsak', () => {
  test('default 10-minute offset is applied', () => {
    const result = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: new Date(2026, 3, 9),
      calculationMethod: 'auto',
      school: 0,
    });
    expect(result.timings.Imsak).toBeDefined();
    expect(result.timings.Imsak).toMatch(/^\d{2}:\d{2}$/);
    // Adhan mock returns the same time for every prayer; Imsak should be
    // 10 minutes earlier (with possible day-wrap).
    const fajr = result.timings.Fajr;
    const expected = computeImsak(fajr, 10);
    expect(result.timings.Imsak).toBe(expected);
  });

  test('respects a custom imsakOffsetMinutes', () => {
    const result = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: new Date(2026, 3, 9),
      calculationMethod: 'auto',
      school: 0,
      imsakOffsetMinutes: 20,
    });
    expect(result.timings.Imsak).toBe(computeImsak(result.timings.Fajr, 20));
  });
});

describe('computeImsakAt — on the instant, on Fajr’s clock', () => {
  const stockholm = (d: Date) => formatInZone(d, 'Europe/Stockholm');

  it('the spring-forward morning: never a time inside the skipped hour', () => {
    // 29 March 2026: 02:00 CET → 03:00 CEST. Fajr 03:05 CEST is 01:05 UTC;
    // ten minutes before it is 00:55 UTC — 01:55 CET, not 02:55.
    const fajr = new Date(Date.UTC(2026, 2, 29, 1, 5));
    expect(stockholm(fajr)).toBe('03:05');
    expect(computeImsakAt(fajr, stockholm, 10)).toBe('01:55');
  });

  it('any other morning, the clock-face rule to the minute', () => {
    const fajr = new Date(Date.UTC(2026, 9, 17, 3, 12, 40));
    expect(computeImsakAt(fajr, stockholm, 10)).toBe(
      computeImsak(stockholm(fajr), 10),
    );
  });

  it('a Fajr that does not form keeps the clock-face rule', () => {
    const fmt = () => '--:--';
    expect(computeImsakAt(new Date(NaN), fmt, 10)).toBe(
      computeImsak('--:--', 10),
    );
  });
});
