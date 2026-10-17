import {
  clockNightTimes,
  injectNightTimes,
  filterOptionalTimes,
} from '../src/utils/nightTimes';
import type { TimingsMap } from '../src/types/prayer';
import {
  addDays,
  combineLocalDateAndTime,
  eventAt,
} from '../src/utils/prayerTimes';

describe('clockNightTimes (Maghrib → Fajr, classical basis)', () => {
  it('computes the midpoint and last-third for a normal night', () => {
    // Maghrib 22:00 → Fajr 03:00 = 5h night. First third ends +1h40 =
    // 23:40 ; Midnight = +2h30 = 00:30 ; Last third start = +3h20 = 01:20.
    expect(clockNightTimes('22:00', '03:00')).toEqual({
      Firstthird: '23:40',
      Midnight: '00:30',
      Lastthird: '01:20',
    });
  });

  it('handles a short summer night that still crosses midnight', () => {
    // Maghrib 22:10 → Fajr 02:20 = 4h10 (250m). First third = +83.3m ≈
    // 23:33 ; Midnight = +125m = 00:15 ; Last third = +166.67m ≈ 00:57.
    expect(clockNightTimes('22:10', '02:20')).toEqual({
      Firstthird: '23:33',
      Midnight: '00:15',
      Lastthird: '00:57',
    });
  });

  it('handles a midpoint that lands before midnight', () => {
    // Maghrib 16:00 → Fajr 06:00 = 14h. Midnight = +7h = 23:00.
    expect(clockNightTimes('16:00', '06:00').Midnight).toBe('23:00');
  });
});

describe('injectNightTimes', () => {
  const day = (Maghrib: string, Fajr: string): TimingsMap => ({
    Fajr,
    Sunrise: '05:00',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib,
    Isha: '21:00',
  });

  it('derives each day from the previous day Maghrib + that day Fajr', () => {
    const week = [day('22:00', '03:00'), day('22:02', '03:02')];
    const out = injectNightTimes(week);
    // Day 0 (today) uses its own Maghrib as the prev-day proxy.
    expect(out[0].Midnight).toBe('00:30');
    expect(out[0].Lastthird).toBe('01:20');
    // Day 1 uses day 0's Maghrib (22:00) + day 1's Fajr (03:02).
    // night = 302m → midpoint +151 = 00:31, last third +201.3 ≈ 01:21.
    expect(out[1].Midnight).toBe('00:31');
    expect(out[1].Lastthird).toBe('01:21');
  });

  it('leaves a day untouched when Maghrib or Fajr is missing', () => {
    const week: TimingsMap[] = [{ Fajr: '03:00' }];
    expect(injectNightTimes(week)[0].Midnight).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const week = [day('22:00', '03:00')];
    const snapshot = JSON.stringify(week);
    injectNightTimes(week);
    expect(JSON.stringify(week)).toBe(snapshot);
  });
});

/**
 * With the week's date the night is measured between instants, on the
 * week's clock, and each mark is the one that falls on its row's date.
 */
describe('injectNightTimes across a clock change', () => {
  const minutesOff = (a: Date, b: number) => Math.abs(a.getTime() - b) / 60_000;
  const markOf = (
    clock: string,
    eveningDate: Date,
    maghrib: string,
    morningDate: Date,
    fajr: string,
    fraction: number,
  ) => {
    const m = combineLocalDateAndTime(eveningDate, maghrib, clock).getTime();
    // The first Fajr after that Maghrib: on a phone across the date line
    // from the clock (Kiritimati, for Stockholm) two of the phone's days
    // can name the same date on it the night the clocks go back.
    let f = combineLocalDateAndTime(morningDate, fajr, clock).getTime();
    for (let i = 1; f <= m && i <= 2; i++) {
      f = combineLocalDateAndTime(
        addDays(morningDate, i),
        fajr,
        clock,
      ).getTime();
    }
    return m + (f - m) * fraction;
  };

  it('the night the clocks go back (Stockholm, 25 October 2026)', () => {
    const clock = 'Europe/Stockholm';
    const d = (n: number) => new Date(2026, 9, n);
    const week = [
      { Fajr: '05:40', Maghrib: '17:40' },
      { Fajr: '04:42', Maghrib: '16:37' },
      { Fajr: '04:44', Maghrib: '16:35' },
    ];
    const out = injectNightTimes(week, d(24), clock);
    // The night 24→25 is 12h02, not the 11h02 the clock faces show: its
    // last third and the first third of the 24th were 40 and 20 min early.
    const last = markOf(clock, d(24), '17:40', d(25), '04:42', 2 / 3);
    expect(
      minutesOff(eventAt('Lastthird', out[1], d(25), clock), last),
    ).toBeLessThan(1);
    const first = markOf(clock, d(24), '17:40', d(25), '04:42', 1 / 3);
    expect(
      minutesOff(eventAt('Firstthird', out[0], d(24), clock), first),
    ).toBeLessThan(1);
    // Midnight on the 25th's row falls in an evening, so it is tonight's
    // (25→26), as every reader puts it — not last night's an hour off.
    const mid = markOf(clock, d(25), '16:37', d(26), '04:44', 1 / 2);
    expect(
      minutesOff(eventAt('Midnight', out[1], d(25), clock), mid),
    ).toBeLessThan(1);
  });

  it('the night the clocks go forward (New York, 8 March 2026)', () => {
    const clock = 'America/New_York';
    const d = (n: number) => new Date(2026, 2, n);
    const week = [
      { Fajr: '05:35', Maghrib: '17:55' },
      { Fajr: '06:33', Maghrib: '19:56' },
    ];
    const out = injectNightTimes(week, d(7), clock);
    const last = markOf(clock, d(7), '17:55', d(8), '06:33', 2 / 3);
    expect(
      minutesOff(eventAt('Lastthird', out[1], d(8), clock), last),
    ).toBeLessThan(1);
  });

  it('on an ordinary night writes what the clock faces do, to the minute', () => {
    const week = [
      { Fajr: '03:00', Maghrib: '22:00' },
      { Fajr: '03:02', Maghrib: '22:02' },
      { Fajr: '03:04', Maghrib: '22:04' },
    ];
    const byFace = injectNightTimes(week);
    const byInstant = injectNightTimes(week, new Date(2026, 5, 10));
    expect(byInstant[1]).toEqual(byFace[1]);
  });
});

describe('filterOptionalTimes (toggle gating / Sunrise kill-switch)', () => {
  const base: TimingsMap = {
    Fajr: '03:00',
    Sunrise: '05:00',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib: '22:00',
    Isha: '21:00',
    Midnight: '00:30',
    Lastthird: '01:20',
  };

  it('keeps everything when all toggles are on', () => {
    const out = filterOptionalTimes(base, {
      Sunrise: true,
      Midnight: true,
      Lastthird: true,
      Firstthird: true,
    });
    expect(out).toBe(base); // same reference — no copy when nothing removed
  });

  it('drops Sunrise when the kill-switch is off', () => {
    const out = filterOptionalTimes(base, {
      Sunrise: false,
      Midnight: true,
      Lastthird: true,
      Firstthird: true,
    });
    expect(out.Sunrise).toBeUndefined();
    expect(out.Midnight).toBe('00:30');
    expect(out.Fajr).toBe('03:00');
  });

  it('drops the night times when their toggles are off (defaults)', () => {
    const out = filterOptionalTimes(base, {
      Sunrise: true,
      Midnight: false,
      Lastthird: false,
      Firstthird: false,
    });
    expect(out.Midnight).toBeUndefined();
    expect(out.Lastthird).toBeUndefined();
    expect(out.Sunrise).toBe('05:00');
  });
});

/**
 * The First Third belongs to the night that BEGINS on the card, not the one
 * that ends on it — issue #14. It is the only one of the three that is still
 * ahead of the reader when they look at the day, which is the whole reason
 * for asking about it: it is where Ishāʾ leaves its preferred window.
 */
describe('the first third takes the night ahead, not the night behind', () => {
  const day = (Maghrib: string, Fajr: string): TimingsMap => ({
    Fajr,
    Sunrise: '05:00',
    Dhuhr: '12:00',
    Asr: '15:00',
    Maghrib,
    Isha: '21:00',
  });

  it('uses this day Maghrib with the NEXT day Fajr', () => {
    const week = [day('22:00', '03:00'), day('22:02', '03:02')];
    const out = injectNightTimes(week);
    // Day 0: Maghrib 22:00 → day 1's Fajr 03:02 = 302m; +100.67 ≈ 23:41.
    expect(out[0].Firstthird).toBe('23:41');
    // Day 1 is the last in the window, so it falls back to its own Fajr:
    // 22:02 → 03:02 = 300m; +100 = 23:42.
    expect(out[1].Firstthird).toBe('23:42');
  });

  it('falls after Isha, where the other two fall before Fajr', () => {
    const out = injectNightTimes([day('19:59', '05:33')])[0];
    expect(out.Firstthird! > out.Isha!).toBe(true);
    expect(out.Midnight! < out.Fajr!).toBe(true);
    expect(out.Lastthird! < out.Fajr!).toBe(true);
  });

  it('is absent when the day has no Maghrib to start it', () => {
    const out = injectNightTimes([{ Fajr: '03:00', Maghrib: '' }])[0];
    expect(out.Firstthird).toBeUndefined();
  });

  it('drops out when its toggle is off', () => {
    const out = filterOptionalTimes(
      { Isha: '21:00', Firstthird: '23:40', Midnight: '00:30' },
      { Sunrise: true, Midnight: true, Lastthird: true, Firstthird: false },
    );
    expect(out.Firstthird).toBeUndefined();
    expect(out.Midnight).toBe('00:30');
  });
});
