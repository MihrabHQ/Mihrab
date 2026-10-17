/**
 * One place, one clock.
 *
 * A saved Rabat on a phone in Stockholm: the ministry's table is written on
 * Morocco's clock (GMT), and every reader used to take the strings as the
 * phone's — Fajr counted down to, and alerted at, 05:xx Stockholm time for
 * the ministry's 05:xx GMT, two hours early in October. Each answer now says
 * which clock it is on, and the instant is made on that clock.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.unmock('adhan');

import { getHabousDatasetTimes } from '../src/providers/habousDataset';
import { getIslamiskaForbundetDatasetTimes } from '../src/providers/islamiskaForbundetDataset';
import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import type { PrayerTimesResult } from '../src/providers/types';
import {
  addDays,
  buildUpcomingSalahEvents,
  combineLocalDateAndTime,
  computeNextSalah,
  daysOnDeviceClock,
  DEVICE_CLOCK,
  eventAt,
  onClock,
  readZone,
} from '../src/utils/prayerTimes';
import {
  civilInZone,
  deviceZone,
  instantOnZoneClock,
  zoneOffsetMinutes,
} from '../src/utils/zoneClock';
import { rawWindow } from '../src/widget/republishWidgetPayload';

const RABAT = { latitude: 34.0209, longitude: -6.8416 };
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const day = new Date(2026, 9, 16); // 16 October, the phone's midnight

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** "HH:mm" of an instant on a zone's clock. */
const onZone = (at: Date, zone: string) => {
  const c = civilInZone(at, zone, true)!;
  return `${String(c.h).padStart(2, '0')}:${String(c.min).padStart(2, '0')}`;
};
/** The same instant, or one a whole number of days from it. */
const sameMinuteOfDay = (a: Date, b: Date) =>
  (a.getTime() - b.getTime()) % 86_400_000 === 0;
/** The phone's offset from GMT that day, minutes east. */
const phoneOffset = -new Date(2026, 9, 16, 12).getTimezoneOffset();

/**
 * A saved place on another clock than the phone's: Rabat (the ministry's
 * GMT) wherever the phone is not on GMT that day — Stockholm, as in the
 * report — and Stockholm (Islamiska Förbundet's table) on a phone that is.
 */
async function savedPlace(): Promise<{
  res: PrayerTimesResult;
  zone: string;
  params: {
    provider: 'habous' | 'islamiska_forbundet';
    latitude: number;
    longitude: number;
  };
}> {
  const rabat = await getHabousDatasetTimes({ ...RABAT, date: day });
  if (phoneOffset !== 0 && readZone(rabat.clock)) {
    return {
      res: rabat,
      zone: rabat.clock!,
      params: { provider: 'habous', ...RABAT },
    };
  }
  const sthlm = await getIslamiskaForbundetDatasetTimes({
    ...STOCKHOLM,
    date: day,
  });
  return {
    res: sthlm,
    zone: sthlm.clock!,
    params: { provider: 'islamiska_forbundet', ...STOCKHOLM },
  };
}

describe('a saved place’s day from its authority’s table, on a phone in another zone', () => {
  it('is written on the place’s clock and says so', async () => {
    const rabat = await getHabousDatasetTimes({ ...RABAT, date: day });
    // The ministry's GMT, unless the phone is in Morocco itself.
    if (deviceZone() !== 'Africa/Casablanca')
      expect(rabat.clock).toBe('Etc/GMT');
    const { zone } = await savedPlace();
    expect(readZone(zone)).toBe(zone);
  });

  it('is read on that clock: Fajr at the authority’s instant, not at the same digits on the phone’s', async () => {
    const { res, zone } = await savedPlace();
    const at = eventAt('Fajr', res.timings, day, res.clock);
    // The printed minute, on the place's clock.
    expect(onZone(at, zone)).toBe(res.timings.Fajr);
    // And not the old reading — the same digits on the phone's clock, which
    // for Rabat on a Stockholm phone in October is two hours early.
    const asPhone = eventAt('Fajr', res.timings, day);
    const placeOffset = zoneOffsetMinutes(zone, at)!;
    // (Across the date line the place's day is the phone's day before.)
    expect(
      ((((at.getTime() - asPhone.getTime()) / 60_000) % 1440) + 1440) % 1440,
    ).toBe((((phoneOffset - placeOffset) % 1440) + 1440) % 1440);
    expect(at.getTime()).not.toBe(asPhone.getTime());
  });

  it('counts down and schedules on that clock', async () => {
    const { res, zone } = await savedPlace();
    const fajr = eventAt('Fajr', res.timings, day, res.clock);
    // A phone across the date line from the place (Kiritimati, for Rabat)
    // has the place's Fajr on its previous date; the countdown reads today.
    if (fajr.getTime() < day.getTime() + 30 * 60_000) return;
    // Half an hour before the place's Fajr: it is next.
    const now = new Date(fajr.getTime() - 30 * 60_000);
    const next = computeNextSalah(res.timings, now, res.clock);
    expect(next?.name).toBe('Fajr');
    expect(next!.at.getTime()).toBe(fajr.getTime());

    const events = buildUpcomingSalahEvents(
      res.timings,
      undefined,
      now,
      day,
      [],
      res.clock,
    );
    const maghrib = events.find(e => e.name === 'Maghrib')!;
    expect(onZone(maghrib.at, zone)).toBe(res.timings.Maghrib);
  });

  it('rewritten on the phone’s clock, names the same instants', async () => {
    const { res, zone } = await savedPlace();
    const phone = onClock(res.timings, day, res.clock, DEVICE_CLOCK);
    for (const key of ['Fajr', 'Dhuhr', 'Maghrib', 'Isha']) {
      // The same instant — to the day where the two clocks are far enough
      // apart for a time to fall on the phone's next or previous date, which
      // an "HH:mm" cannot say (see `onClock`).
      expect(
        sameMinuteOfDay(
          combineLocalDateAndTime(day, phone[key]),
          eventAt(key, res.timings, day, res.clock),
        ),
      ).toBe(true);
    }
    const placeOffset = zoneOffsetMinutes(zone, new Date(2026, 9, 16, 12))!;
    expect(
      (((minutesOf(phone.Dhuhr) - minutesOf(res.timings.Dhuhr)) % 1440) +
        1440) %
        1440,
    ).toBe((((phoneOffset - placeOffset) % 1440) + 1440) % 1440);
  });
});

describe('a day on the phone’s clock', () => {
  it('is tagged device and read exactly as before', () => {
    const res = computeLocalAdhanTimes({
      ...RABAT,
      date: day,
      calculationMethod: 3,
      school: 0,
    });
    expect(res.clock).toBe(DEVICE_CLOCK);
    for (const key of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      expect(eventAt(key, res.timings, day, res.clock).getTime()).toBe(
        eventAt(key, res.timings, day).getTime(),
      );
    }
    expect(onClock(res.timings, day, res.clock, DEVICE_CLOCK)).toBe(
      res.timings,
    );
    expect(daysOnDeviceClock([res.timings], day, res.clock)[0]).toBe(
      res.timings,
    );
  });

  it('untagged — a day stored before tags existed — is the phone’s', () => {
    const timings = { Fajr: '05:10', Dhuhr: '12:40', Maghrib: '18:30' };
    expect(readZone(undefined)).toBeNull();
    expect(eventAt('Fajr', timings, day, undefined).getTime()).toBe(
      new Date(2026, 9, 16, 5, 10).getTime(),
    );
  });

  it('a tag naming the phone’s own zone is the phone’s clock', () => {
    const timings = { Fajr: '05:10' };
    const own = deviceZone()!;
    expect(readZone(own)).toBeNull();
    expect(eventAt('Fajr', timings, day, own).getTime()).toBe(
      new Date(2026, 9, 16, 5, 10).getTime(),
    );
  });

  it('an unknown zone falls back to the phone’s clock', () => {
    const timings = { Fajr: '05:10' };
    expect(eventAt('Fajr', timings, day, 'Not/AZone').getTime()).toBe(
      new Date(2026, 9, 16, 5, 10).getTime(),
    );
  });
});

describe('a zone across its own clock change', () => {
  // 1 November 2026, New York leaves EDT (-4) for EST (-5) at 02:00;
  // 8 March 2026 it skips 02:00–03:00.
  it('reads a wall time on that zone’s clock, either side of the change', () => {
    expect(
      instantOnZoneClock('America/New_York', 2026, 10, 1, 6, 0)?.toISOString(),
    ).toBe('2026-11-01T11:00:00.000Z');
    expect(
      instantOnZoneClock('America/New_York', 2026, 9, 31, 6, 0)?.toISOString(),
    ).toBe('2026-10-31T10:00:00.000Z');
  });
  it('takes the earlier of the hour it shows twice, and moves past the hour it skips', () => {
    expect(
      instantOnZoneClock('America/New_York', 2026, 10, 1, 1, 30)?.toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
    // 02:30 does not occur: read on the offset before the skip, 03:30 EDT.
    expect(
      instantOnZoneClock('America/New_York', 2026, 2, 8, 2, 30)?.toISOString(),
    ).toBe('2026-03-08T07:30:00.000Z');
  });
});

describe('the widget’s window for a saved Rabat', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.reject(new TypeError('offline')),
    );
  });

  it('carries the authority’s instants, written on the phone’s clock the widgets read', async () => {
    const now = new Date(2026, 9, 16, 9);
    const { res, params } = await savedPlace();
    const window = await rawWindow(
      { ...params, calculationMethod: 3, school: 0 },
      now,
    );
    expect(window.length).toBeGreaterThan(1);
    // The widget reads "HH:mm" on the phone's clock (WallClock.kt / .swift);
    // that reading is the authority's instant.
    for (const key of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      expect(
        sameMinuteOfDay(
          combineLocalDateAndTime(day, window[0][key]),
          eventAt(key, res.timings, day, res.clock),
        ),
      ).toBe(true);
    }
  });
});

describe('the days of one load, on one clock', () => {
  // Imported here: the hook's module pulls in the app's native shims.
  const { clockOfDays, daysOnClock } = require('../src/hooks/usePrayerDay');

  it('takes today’s clock and puts every other day on it', async () => {
    const { res, zone } = await savedPlace();
    const phoneDay = computeLocalAdhanTimes({
      ...RABAT,
      date: addDays(day, 1),
      calculationMethod: 3,
      school: 0,
    });
    const days = [
      { timings: res.timings, clock: res.clock },
      { timings: phoneDay.timings, clock: phoneDay.clock },
    ];
    const clock = clockOfDays(days);
    expect(clock).toBe(zone);
    const [today, tomorrow] = daysOnClock(days, day, clock);
    expect(today).toBe(res.timings);
    // Tomorrow's stand-in, rewritten on the place's clock: the same instants.
    for (const key of ['Fajr', 'Dhuhr', 'Maghrib']) {
      expect(
        sameMinuteOfDay(
          eventAt(key, tomorrow, addDays(day, 1), clock),
          eventAt(key, phoneDay.timings, addDays(day, 1)),
        ),
      ).toBe(true);
    }
  });

  it('keeps the phone’s clock when today is on it — an older slot stays as it was', () => {
    const old = { timings: { Fajr: '05:12' }, clock: DEVICE_CLOCK };
    const tagged = { timings: { Fajr: '05:13' }, clock: 'Etc/GMT' };
    expect(clockOfDays([old, tagged])).toBe(DEVICE_CLOCK);
    const [first] = daysOnClock([old, tagged], day, DEVICE_CLOCK);
    expect(first).toBe(old.timings);
  });
});
