/**
 * A khatmah across the night the clocks go back.
 *
 * That night is 25 hours long, so a date reached by adding multiples of 24
 * hours to a midnight lands at 23:00 the day before. Three places counted
 * days that way (found 2026-09-29, rewrite plan P2.1): the date each day of
 * a plan is due, the "day one" a re-paced plan is measured from, and the
 * "tomorrow" a synced cut may be dated. All three now step the calendar.
 *
 * These pin fixed dates either side of 25 October 2026. In a zone without
 * daylight saving (the UTC CI runner) they pass trivially; the second CI
 * job runs the suite in Europe/Stockholm, where they would not have.
 */
import { coerceQuranState } from '../src/quran/quranState';
import type { KhatmahPlan } from '../src/quran/quranTypes';
import { ayahsThroughPage } from '../src/quran/khatmahProgress';
import { khatmahDayAnchor } from '../src/quran/khatmahSchedule';
import { khatmahDay } from '../src/quran/khatmahStatus';
import { daysAway, khatmahDayWhen } from '../src/quran/khatmahDayWhen';

const local = (m: number, d: number, h = 12, min = 0) =>
  new Date(2026, m - 1, d, h, min, 0, 0).getTime();

const dateOf = (at: number | Date) => {
  const d = new Date(at);
  return [d.getMonth() + 1, d.getDate()];
};

describe('the date each day of a plan is due', () => {
  it('stays on the calendar past the night the clocks go back', () => {
    // Begun 1 October: day 30 is 30 October, whatever the clocks did.
    const when = khatmahDayWhen(local(10, 1, 0, 30), 30, local(10, 1));
    expect(when.kind).toBe('date');
    expect(dateOf((when as { at: Date }).at)).toEqual([10, 30]);
  });

  it('calls the next day tomorrow on either side of that night', () => {
    const begun = local(10, 1, 7, 0);
    // 24 October → 25 October (the short night is between them).
    expect(khatmahDayWhen(begun, 25, local(10, 24, 21)).kind).toBe('tomorrow');
    // 25 October → 26 October.
    expect(khatmahDayWhen(begun, 26, local(10, 25, 0, 30)).kind).toBe(
      'tomorrow',
    );
    expect(khatmahDayWhen(begun, 25, local(10, 25, 0, 30)).kind).toBe('today');
  });

  it('counts whole days across it', () => {
    expect(daysAway(local(10, 26, 0, 10), local(10, 24, 23, 50))).toBe(2);
    expect(daysAway(local(10, 24, 23, 50), local(10, 26, 0, 10))).toBe(-2);
  });
});

describe('the day one a re-paced plan is measured from', () => {
  it('is a calendar date, even for a re-pace made just before midnight', () => {
    // Re-paced at 23:30 on 26 October from page 101 of a thirty-day plan:
    // that is several portions in, so day one lies back across the long
    // night, and must still be a whole number of calendar days back.
    const pacedAt = local(10, 26, 23, 30);
    const plan = {
      id: 'p',
      startedAt: local(9, 1),
      targetDays: 30,
      pagesRead: 101,
      completedAt: null,
      done: [],
      ayahsRead: ayahsThroughPage(101, 'hafs'),
      pacedAt,
      pacedFrom: 101,
    } as KhatmahPlan;
    const day = khatmahDay(plan, pacedAt).portion.day;
    expect(day).toBeGreaterThanOrEqual(3);
    const anchor = khatmahDayAnchor(plan);
    expect(dateOf(anchor)).toEqual(dateOf(local(10, 26 - (day - 1))));
    // So the portion the reader is on is today's, and the next tomorrow's.
    expect(khatmahDayWhen(anchor, day, pacedAt).kind).toBe('today');
    expect(khatmahDayWhen(anchor, day + 1, pacedAt).kind).toBe('tomorrow');
  });
});

describe('a synced cut dated tomorrow', () => {
  const raw = (day: string) => ({
    version: 1,
    khatmah: [
      {
        id: 'k',
        startedAt: local(10, 1),
        targetDays: 30,
        pagesRead: 0,
        completedAt: null,
        done: [],
        ayahsRead: 0,
        deadline: '2026-11-15',
        pacedAt: local(10, 1),
        pace: { day, from: 1, to: 200 },
      },
    ],
  });

  beforeEach(() => {
    jest.useFakeTimers({
      now: local(10, 25, 0, 30),
      doNotFake: ['performance'],
    });
  });
  afterEach(() => jest.useRealTimers());

  it('is kept in the first hour of the long night', () => {
    // 00:30 on 25 October plus 24 hours is still 25 October; tomorrow is
    // the 26th, and a device an hour ahead may already have cut for it.
    const plan = coerceQuranState(raw('2026-10-26')).khatmah[0];
    expect(plan.pace?.day).toBe('2026-10-26');
  });

  it('is dropped when it is further off than tomorrow', () => {
    const plan = coerceQuranState(raw('2026-10-27')).khatmah[0];
    expect(plan.pace).toBeUndefined();
  });
});
