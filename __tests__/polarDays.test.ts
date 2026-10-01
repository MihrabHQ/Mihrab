/**
 * Issue #61 — "App crashes on extreme coordinates".
 *
 * Inside the polar circles some days have no sunrise or sunset. adhan.js
 * answers those with Invalid Date, which reached the Today card as
 * "NaN:NaN"; the card threw, and the app closed on every launch with the
 * location that caused it saved. Those days are now computed at the
 * nearest latitude (48.5°) on the same longitude, and a cached "NaN:NaN"
 * from an earlier version reads as a miss.
 */
jest.unmock('adhan');

import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';
import { computeLocalAdhanTimes, computedLatitude, NEAREST_LATITUDE } from '../src/providers/localAdhan';
import { validateTimingShape } from '../src/providers/validateTimings';
import { readFileSync } from 'fs';
import { join } from 'path';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

const PLACES: Array<[string, number, number]> = [
  ['South Pole', -90, 0],
  ['North Pole', 90, 0],
  ['Svalbard', 78.22, 15.65],
  ['Tromsø', 69.65, 18.96],
  ['Kiruna', 67.86, 20.23],
];
const DAYS = [day(2026, 6, 21), day(2026, 12, 21), day(2026, 10, 1), day(2026, 3, 20)];

describe('a day with no sunrise or sunset', () => {
  it('still has six real times, wherever and whenever', () => {
    for (const [name, lat, lng] of PLACES) {
      for (const date of DAYS) {
        const { timings } = computeLocalAdhanTimes({
          latitude: lat,
          longitude: lng,
          date,
          calculationMethod: 3,
          school: 0,
        });
        for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const) {
          expect(`${name} ${date.toDateString()} ${k} ${timings[k]}`).toMatch(/ \d{2}:\d{2}$/);
        }
        expect(() => validateTimingShape(timings)).not.toThrow();
      }
    }
  });

  it('is computed at the nearest latitude, on its own side of the equator', () => {
    const mwl = CalculationMethod.MuslimWorldLeague();
    expect(computedLatitude(-90, 0, day(2026, 10, 1), mwl)).toBe(-NEAREST_LATITUDE);
    expect(computedLatitude(69.65, 18.96, day(2026, 6, 21), mwl)).toBe(NEAREST_LATITUDE);
  });

  it('leaves an ordinary day alone, however far north', () => {
    const mwl = CalculationMethod.MuslimWorldLeague();
    // Stockholm at midsummer, and Tromsø in March: real sunrises and sunsets.
    expect(computedLatitude(59.33, 18.07, day(2026, 6, 21), mwl)).toBe(59.33);
    expect(computedLatitude(69.65, 18.96, day(2026, 3, 20), mwl)).toBe(69.65);
    const own = new PrayerTimes(new Coordinates(59.33, 18.07), new Date(2026, 5, 21), mwl);
    const ours = computeLocalAdhanTimes({
      latitude: 59.33,
      longitude: 18.07,
      date: day(2026, 6, 21),
      calculationMethod: 3,
      school: 0,
    }).timings;
    const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    expect(ours.Sunrise).toBe(hm(own.sunrise));
    expect(ours.Maghrib).toBe(hm(own.maghrib));
  });
});

describe('what an earlier version left behind', () => {
  it('reads a cached "NaN:NaN" day as a miss, so it is fetched again', () => {
    const storage = readFileSync(join(__dirname, '..', 'src', 'prayer', 'prayerStorage.ts'), 'utf8');
    expect(storage).toContain('return day && isReadableDay(day) ? day : null;');
    expect(storage).toContain("return !Object.values(day).some(v => typeof v === 'string' && v.includes('NaN'));");
    expect(() => validateTimingShape({ Fajr: 'NaN:NaN' } as never)).toThrow();
  });

  it('checks the on-device answer before it can reach a screen', () => {
    const fetch = readFileSync(join(__dirname, '..', 'src', 'providers', 'fetchPrayerTimes.ts'), 'utf8');
    expect(fetch).toContain('validateTimingShape(local.timings);');
  });
});
