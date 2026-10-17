/**
 * The place's own day across the date line.
 *
 * A computed day was the phone's civil date, whatever the place: on a phone
 * on Kiritimati (UTC+14) a saved Rabat's "today" was Rabat's tomorrow for
 * most of the day. Where the place's clock is known it is now the place's
 * own date — at the phone's noon, so that wherever the two clocks are less
 * than twelve hours apart (every pair but across the date line) nothing
 * changes.
 */
jest.unmock('adhan');

import {
  ALGERIA_CLOCK,
  MOROCCO_CLOCK,
  placeCivilDay,
} from '../src/providers/locationClock';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { computeNamazvaktiMethodTimes } from '../src/providers/namazvakti';

const RABAT = { latitude: 34.02, longitude: -6.84 };

let zoneSpy: jest.SpyInstance;
const phoneIn = (timeZone: string) =>
  zoneSpy.mockReturnValue({ timeZone } as Intl.ResolvedDateTimeFormatOptions);
beforeEach(() => {
  zoneSpy = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions');
});
afterEach(() => zoneSpy.mockRestore());

/** The phone's 16 October: its midnight, as the app asks for a day. */
const kiritimatiMidnight = new Date(Date.UTC(2026, 9, 15, 10)); // 16 Oct 00:00 at UTC+14

describe('the place’s civil date', () => {
  it('is Rabat’s own on a phone on Kiritimati', () => {
    phoneIn('Pacific/Kiritimati');
    // Noon on Kiritimati on the 16th is 22:00 GMT on the 15th: Rabat's day.
    expect(placeCivilDay(kiritimatiMidnight, MOROCCO_CLOCK)).toEqual({
      y: 2026,
      m: 9,
      d: 15,
    });
  });

  it('is the phone’s where the two clocks are less than twelve hours apart', () => {
    phoneIn('Europe/Stockholm');
    const stockholmMidnight = new Date(Date.UTC(2026, 9, 15, 22)); // 16 Oct 00:00 CEST
    expect(placeCivilDay(stockholmMidnight, MOROCCO_CLOCK)).toEqual({
      y: 2026,
      m: 9,
      d: 16,
    });
    phoneIn('America/Los_Angeles');
    const laMidnight = new Date(Date.UTC(2026, 9, 16, 7)); // 16 Oct 00:00 PDT
    expect(placeCivilDay(laMidnight, ALGERIA_CLOCK)).toEqual({
      y: 2026,
      m: 9,
      d: 16,
    });
  });

  it('is the phone’s on the place’s own clock, or with no clock', () => {
    phoneIn('Africa/Casablanca');
    const d = new Date(2026, 9, 16);
    const phone = { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
    expect(placeCivilDay(d, MOROCCO_CLOCK)).toEqual(phone);
    phoneIn('Pacific/Kiritimati');
    expect(placeCivilDay(d, undefined)).toEqual(phone);
  });
});

describe('the computed times', () => {
  it('are Rabat’s 15 October on a Kiritimati phone’s 16th', () => {
    phoneIn('Etc/UTC');
    const rabat15 = computeLocalAdhanTimes({
      ...RABAT,
      date: new Date(Date.UTC(2026, 9, 15, 12)),
      calculationMethod: 21,
      school: 0,
      placeClock: MOROCCO_CLOCK,
    }).timings;
    const rabat16 = computeLocalAdhanTimes({
      ...RABAT,
      date: new Date(Date.UTC(2026, 9, 16, 12)),
      calculationMethod: 21,
      school: 0,
      placeClock: MOROCCO_CLOCK,
    }).timings;
    phoneIn('Pacific/Kiritimati');
    const onKiritimati = computeLocalAdhanTimes({
      ...RABAT,
      date: kiritimatiMidnight,
      calculationMethod: 21,
      school: 0,
      placeClock: MOROCCO_CLOCK,
    }).timings;
    expect(onKiritimati).toEqual(rabat15);
    expect(onKiritimati.Fajr).not.toBe(rabat16.Fajr);
  });

  it('take the city’s clock in the Türkiye Takvimi calculation too, where one is given', () => {
    phoneIn('Etc/UTC');
    const own = computeNamazvaktiMethodTimes({
      ...RABAT,
      date: new Date(Date.UTC(2026, 9, 15, 12)),
      school: 0,
      placeClock: MOROCCO_CLOCK,
    });
    phoneIn('Pacific/Kiritimati');
    const there = computeNamazvaktiMethodTimes({
      ...RABAT,
      date: kiritimatiMidnight,
      school: 0,
      placeClock: MOROCCO_CLOCK,
    });
    expect(there.timings).toEqual(own.timings);
  });
});
