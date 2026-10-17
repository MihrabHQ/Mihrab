/**
 * A saved place far from the phone's zone, on the phone's days.
 *
 * Phone in Stockholm, saved Jakarta: rewritten a day at a time onto the
 * phone's clock, Jakarta's day read Fajr 23:12, Sunrise 00:30 … Isha 14:00
 * on one date — Fajr was the phone's evening BEFORE, and read on the date
 * it was written for it came a day late: the widget listed it after Isha,
 * the alerts drifted a day, the Fajr→Sunrise snooze window inverted. The
 * widget, the Live Activity and the alerts now get the place's days
 * regrouped onto the phone's (`phoneDaysOf`): each time on the phone day it
 * falls on, read back as its very instant.
 *
 * And the seasonal half: an ʿIshāʾ printed past midnight (00:02) was read
 * on its own date by the scheduler and the widgets, and as that evening's
 * by the rollover and the quick log — the night the season carried it
 * across midnight rang two adhans three minutes apart, or none. One rule
 * now (`eventAt` / `rowDateShift`).
 *
 * The phone's zone is the jest worker's (`setZone`), switched per case.
 */
jest.unmock('adhan');

import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { MOROCCO_CLOCK, SWEDEN_CLOCK } from '../src/providers/locationClock';
import { dayIsSpent, lastTimeOfDay } from '../src/prayer/dayRollover';
import { ishaTriggerAt } from '../src/notifications/endOfDayLog';
import { quickLogPhase } from '../src/journal/quickLog';
import type { TimingsMap } from '../src/types/prayer';
import {
  addDays,
  buildUpcomingSalahEvents,
  combineLocalDateAndTime,
  DEVICE_CLOCK,
  eventAt,
  getNextPrayerDisplay,
  phoneDaysOf,
  rowDateShift,
  type ClockedTimings,
} from '../src/utils/prayerTimes';
import { civilInZone } from '../src/utils/zoneClock';
import { widgetPayloadV2FromV1 } from '../src/widget/widgetPayloadV2';
import type { WidgetPrayerPayload } from '../src/widget/buildWidgetPayload';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const realProcess = require('vm').runInThisContext('process') as NodeJS.Process;
const ZONE_BEFORE = realProcess.env.TZ;
function setZone(zone: string): void {
  realProcess.env.TZ = zone;
}
afterAll(() => {
  if (ZONE_BEFORE === undefined) delete realProcess.env.TZ;
  else realProcess.env.TZ = ZONE_BEFORE;
});

const KEYS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
const DAY_MS = 86_400_000;

type Place = { latitude: number; longitude: number; zone: string };
const NEW_YORK: Place = {
  latitude: 40.7128,
  longitude: -74.006,
  zone: 'America/New_York',
};
const JAKARTA: Place = {
  latitude: -6.2088,
  longitude: 106.8456,
  zone: 'Asia/Jakarta',
};
const SINGAPORE: Place = {
  latitude: 1.3521,
  longitude: 103.8198,
  zone: 'Asia/Singapore',
};

/** A place's computed days from the phone's `base`, on the place's clock. */
function placeDays(place: Place, base: Date, n: number): ClockedTimings[] {
  const out: ClockedTimings[] = [];
  for (let i = 0; i < n; i++) {
    const r = computeLocalAdhanTimes({
      latitude: place.latitude,
      longitude: place.longitude,
      date: addDays(base, i),
      calculationMethod: 3,
      school: 0,
      placeClock: { zone: place.zone },
    });
    out.push({ timings: r.timings, clock: r.clock });
  }
  return out;
}

/** Every instant the place's days name, by key. */
function trueInstants(
  days: ClockedTimings[],
  base: Date,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  days.forEach((d, i) => {
    for (const k of KEYS) {
      const at = eventAt(k, d.timings, addDays(base, i), d.clock).getTime();
      out.set(k, [...(out.get(k) ?? []), at]);
    }
  });
  return out;
}

/** The phone day (index from `base`) an instant is on. */
const phoneDay = (base: Date, at: number) =>
  Math.round(
    (new Date(new Date(at).setHours(0, 0, 0, 0)).getTime() - base.getTime()) /
      DAY_MS,
  );

/**
 * The regrouped rows hold every instant of the window, once, exactly, on
 * the phone day it falls on (an evening row past midnight on the evening
 * before) — the edges' estimates within a few minutes of a day's step.
 */
function expectRegrouped(days: ClockedTimings[], base: Date): TimingsMap[] {
  const rows = phoneDaysOf(days, base);
  expect(rows).toHaveLength(days.length);
  const truth = trueInstants(days, base);
  const n = days.length;
  for (const k of KEYS) {
    const all = truth.get(k)!;
    const seen: number[] = [];
    rows.forEach((row, j) => {
      expect(row[k]).toMatch(/^\d{2}:\d{2}$/);
      const at = eventAt(k, row, addDays(base, j)).getTime();
      // On this phone day, or (an evening row past midnight) the next.
      const shift = rowDateShift(k, row[k]);
      expect(phoneDay(base, at)).toBe(j + shift);
      if (j > 0 && j < n - 1) {
        expect(all).toContain(at);
      } else if (!all.includes(at)) {
        // An edge's estimate: a neighbouring date's same clock time.
        const near = Math.min(
          ...all.map(t => Math.abs(Math.abs(t - at) - DAY_MS)),
        );
        expect(near).toBeLessThanOrEqual(3 * 60_000);
      }
      seen.push(at);
    });
    // Once each, in time order down the window.
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    // Nothing that falls inside the window (past its first and last day,
    // whose place days are partly outside it) is lost.
    for (const t of all) {
      const home = phoneDay(base, t) - rowDateShift(k, hhmmOnPhone(t));
      if (home >= 1 && home <= n - 2) expect(seen).toContain(t);
    }
  }
  return rows;
}

const hhmmOnPhone = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
};

describe('a saved place far from the phone, regrouped on the phone’s days', () => {
  it('phone in Stockholm, saved Jakarta: the phone day’s Fajr is Jakarta’s next morning, at its instant', () => {
    setZone('Europe/Stockholm');
    const base = new Date(2026, 9, 12);
    const days = placeDays(JAKARTA, base, 7);
    expect(days[0].clock).toBe('Asia/Jakarta');
    const rows = expectRegrouped(days, base);
    // 23:xx on the phone, and Jakarta's FOLLOWING morning.
    expect(rows[2].Fajr >= '22:00').toBe(true);
    expect(eventAt('Fajr', rows[2], addDays(base, 2)).getTime()).toBe(
      eventAt(
        'Fajr',
        days[3].timings,
        addDays(base, 3),
        days[3].clock,
      ).getTime(),
    );
    // Sunrise to Isha are Jakarta's own day, in the order they happen.
    const order = ['Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Fajr'].map(
      k => eventAt(k, rows[2], addDays(base, 2)).getTime(),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The Fajr→Sunrise window no longer inverts: the next Sunrise after
    // the phone day's Fajr is the next phone day's, an hour and a bit on.
    const fajr = eventAt('Fajr', rows[2], addDays(base, 2)).getTime();
    const sunrise = eventAt('Sunrise', rows[3], addDays(base, 3)).getTime();
    expect(sunrise - fajr).toBeGreaterThan(60 * 60_000);
    expect(sunrise - fajr).toBeLessThan(2 * 60 * 60_000);
  });

  it('phone in Kolkata, saved New York: the phone’s morning holds New York’s evening before', () => {
    setZone('Asia/Kolkata');
    const base = new Date(2026, 0, 12);
    const days = placeDays(NEW_YORK, base, 7);
    expect(days[0].clock).toBe('America/New_York');
    const rows = expectRegrouped(days, base);
    // New York's Maghrib (16:5x EST) is the phone's early morning, the
    // previous New York date's.
    const maghrib = eventAt('Maghrib', rows[3], addDays(base, 3)).getTime();
    expect(maghrib).toBe(
      eventAt(
        'Maghrib',
        days[2].timings,
        addDays(base, 2),
        days[2].clock,
      ).getTime(),
    );
  });

  it('phone in Pago Pago, saved Singapore (19 hours apart): every time once, on its phone day', () => {
    setZone('Pacific/Pago_Pago');
    const base = new Date(2026, 3, 6);
    const days = placeDays(SINGAPORE, base, 7);
    expect(days[0].clock).toBe('Asia/Singapore');
    expectRegrouped(days, base);
  });

  it('across both clocks’ changes (Stockholm 25 October, New York 1 November), nothing lost or doubled', () => {
    setZone('Europe/Stockholm');
    const base = new Date(2026, 9, 21);
    const days = placeDays(NEW_YORK, base, 15);
    const rows = expectRegrouped(days, base);
    for (const row of rows.slice(1, -1)) {
      for (const k of KEYS) expect(row[k]).toBeDefined();
    }
  });

  it('the widget contract counts an evening row past the phone’s midnight past 1440, in time order', () => {
    setZone('Europe/Stockholm');
    const base = new Date(2026, 9, 12);
    const rows = phoneDaysOf(placeDays(NEW_YORK, base, 5), base);
    // New York's Isha is the phone's small hours, kept on its evening.
    expect(rowDateShift('Isha', rows[2].Isha)).toBe(1);
    const v1: WidgetPrayerPayload = {
      dayLabel: 'x',
      rows: [],
      nextKey: null,
      days: [
        {
          dateKey: '2026-10-14',
          dayLabel: 'x',
          rows: KEYS.filter(k => k !== 'Sunrise').map(k => ({
            key: k,
            time: rows[2][k],
            name: k,
            abbr: k,
          })),
        },
      ],
    } as unknown as WidgetPrayerPayload;
    const v2 = widgetPayloadV2FromV1(v1, {
      clock: { hour12: false },
      now: addDays(base, 2),
    });
    const isha = v2.days[0].prayers.find(p => p.key === 'Isha')!;
    expect(isha.minutes).toBeGreaterThan(1440);
    const ishaAt = eventAt('Isha', rows[2], addDays(base, 2));
    expect(isha.minutes).toBe(
      Math.round((ishaAt.getTime() - addDays(base, 2).getTime()) / 60_000),
    );
  });
});

describe('the phone’s own place is untouched', () => {
  it('Stockholm on a Stockholm phone: the same objects, the same instants', () => {
    setZone('Europe/Stockholm');
    const base = new Date(2026, 9, 12);
    const days: ClockedTimings[] = [];
    for (let i = 0; i < 5; i++) {
      const r = computeLocalAdhanTimes({
        latitude: 59.3293,
        longitude: 18.0686,
        date: addDays(base, i),
        calculationMethod: 24,
        school: 0,
        placeClock: SWEDEN_CLOCK,
      });
      expect(r.clock).toBe(DEVICE_CLOCK);
      days.push({ timings: r.timings, clock: r.clock });
    }
    // Tagged with the phone's own zone (a kept slot), too.
    const tagged = days.map(d => ({ ...d, clock: 'Europe/Stockholm' }));
    const rows = phoneDaysOf(tagged, base);
    rows.forEach((row, i) => {
      expect(row).toBe(days[i].timings);
      for (const k of KEYS) {
        expect(eventAt(k, row, addDays(base, i)).getTime()).toBe(
          combineLocalDateAndTime(addDays(base, i), row[k]).getTime(),
        );
      }
    });
  });

  it('Casablanca on a Casablanca phone: the same objects, the same instants', () => {
    setZone('Africa/Casablanca');
    const base = new Date(2026, 9, 12);
    const days: ClockedTimings[] = [];
    for (let i = 0; i < 5; i++) {
      const r = computeLocalAdhanTimes({
        latitude: 33.5731,
        longitude: -7.5898,
        date: addDays(base, i),
        calculationMethod: 21,
        school: 0,
        placeClock: MOROCCO_CLOCK,
      });
      expect(r.clock).toBe(DEVICE_CLOCK);
      days.push({ timings: r.timings, clock: r.clock });
    }
    const rows = phoneDaysOf(days, base);
    rows.forEach((row, i) => {
      expect(row).toBe(days[i].timings);
      for (const k of KEYS) {
        expect(eventAt(k, row, addDays(base, i)).getTime()).toBe(
          combineLocalDateAndTime(addDays(base, i), row[k]).getTime(),
        );
      }
    });
  });
});

describe('the night the season carries ʿIshāʾ across midnight', () => {
  // Four evenings on the phone's own clock: 23:56, 23:59, 00:02, 00:05.
  const ISHA = ['23:56', '23:59', '00:02', '00:05'];
  const day = (isha: string): TimingsMap => ({
    Fajr: '02:10',
    Sunrise: '03:40',
    Dhuhr: '13:05',
    Asr: '17:20',
    Maghrib: '22:10',
    Isha: isha,
  });

  it('exactly one Isha alert a night, in order, a day apart', () => {
    setZone('Europe/Stockholm');
    const base = new Date(2026, 5, 10);
    const week = ISHA.map(day);
    const events = buildUpcomingSalahEvents(
      week[0],
      week[1],
      new Date(2026, 5, 10, 0, 1),
      base,
      week.slice(2),
    ).filter(e => e.name === 'Isha');
    expect(events).toHaveLength(4);
    const at = events.map(e => e.at.getTime());
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (let i = 1; i < at.length; i++) {
      // A day and three minutes apart — never three minutes.
      expect(at[i] - at[i - 1]).toBe(DAY_MS + 3 * 60_000);
    }
    // Each the evening of its own card: the 00:02 is the night of the
    // third card, past its midnight.
    expect(events[2].at.getTime()).toBe(new Date(2026, 5, 13, 0, 2).getTime());
  });

  it('after midnight, a schedule and a countdown from today on still have last night’s', () => {
    setZone('Europe/Stockholm');
    // 00:01 on the 13th: the 12th's Isha (00:02) is a minute away.
    const now = new Date(2026, 5, 13, 0, 1);
    const base = new Date(2026, 5, 13);
    const [y, t, tm] = ['00:02', '00:05', '00:08'].map(day);
    const events = buildUpcomingSalahEvents(
      t,
      tm,
      now,
      base,
      [],
      undefined,
      y,
    ).filter(e => e.name === 'Isha');
    expect(events.map(e => e.at.getTime())).toEqual([
      new Date(2026, 5, 13, 0, 2).getTime(),
      new Date(2026, 5, 14, 0, 5).getTime(),
      new Date(2026, 5, 15, 0, 8).getTime(),
    ]);
    // Without yesterday, from today on, it was gone — the reason it is passed.
    expect(
      buildUpcomingSalahEvents(t, tm, now, base)
        .filter(e => e.name === 'Isha')
        .map(e => e.at.getTime()),
    ).not.toContain(new Date(2026, 5, 13, 0, 2).getTime());
    const next = getNextPrayerDisplay(t, tm, now, undefined, y);
    expect(next?.name).toBe('Isha');
    expect(next?.at.getTime()).toBe(new Date(2026, 5, 13, 0, 2).getTime());
  });

  it('every reader names the same instant for it', () => {
    setZone('Europe/Stockholm');
    const base = new Date(2026, 5, 12);
    const timings = day('00:02');
    const isha = eventAt('Isha', timings, base);
    expect(isha.getTime()).toBe(new Date(2026, 5, 13, 0, 2).getTime());
    // The rollover: the day is spent only after it.
    expect(lastTimeOfDay(timings, base)!.getTime()).toBe(isha.getTime());
    expect(dayIsSpent(timings, base, new Date(2026, 5, 13, 0, 1))).toBe(false);
    // The end-of-day prompt: ten minutes after it.
    expect(ishaTriggerAt(base, timings)!.getTime()).toBe(
      isha.getTime() + 10 * 60_000,
    );
    // The quick log: Maghrib's window runs to it, Isha's not yet open at 23:59.
    expect(
      quickLogPhase(
        'Isha',
        timings,
        new Date(2026, 5, 12, 23, 59),
        undefined,
        base,
      ),
    ).toBe('not-yet');
    expect(
      quickLogPhase(
        'Maghrib',
        timings,
        new Date(2026, 5, 12, 23, 59),
        undefined,
        base,
      ),
    ).toBe('in-window');
  });
});

describe('the phone’s zone, for the record', () => {
  it('names an instant on the zone’s clock', () => {
    setZone('Europe/Stockholm');
    const c = civilInZone(
      new Date('2026-10-12T21:12:00Z'),
      'Asia/Jakarta',
      true,
    )!;
    expect([c.d, c.h, c.min]).toEqual([13, 4, 12]);
  });
});
