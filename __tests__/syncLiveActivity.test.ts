/**
 * syncLiveActivity orchestrator coverage.
 *
 *  1. The progress bar's start anchor (the previous prayer at/before now,
 *     `widgetPrevious` on the shared payload's days), including the
 *     before-Fajr / after-midnight fall-back to the prior day's Isha.
 *  2. The iOS content build — verifies the ActivityKit payload carries
 *     prevEpochSeconds + accentHex and the correct next prayer, via a mocked
 *     native module.
 */

import { Platform } from 'react-native';

jest.mock('../src/native/PrayerLiveActivity', () => ({
  getPrayerLiveActivityModule: jest.fn(),
}));
jest.mock('../src/native/MihrabLiveActivity', () => ({
  getMihrabLiveActivityModule: jest.fn(() => null),
}));

import { syncLiveActivity } from '../src/liveActivity/syncLiveActivity';
import {
  widgetMoment,
  widgetPrevious,
} from '../src/widget/widgetPayloadV2';
import { minutesFromHHmm } from '../src/widget/wallClock';
import type { TimingsMap } from '../src/types/prayer';
import { getPrayerLiveActivityModule } from '../src/native/PrayerLiveActivity';

const today = {
  Fajr: '05:00',
  Sunrise: '06:30',
  Dhuhr: '12:00',
  Asr: '15:00',
  Maghrib: '18:00',
  Isha: '20:00',
};

describe('the previous prayer — the progress bar starts there', () => {
  const at = (h: number, m: number) => new Date(2026, 5, 14, h, m, 0, 0);
  /** Minutes from today's midnight of the prayer last passed, or null. */
  const prevAt = (timings: TimingsMap, when: Date): number | null => {
    const rows = Object.entries(timings).map(([key, time]) => ({
      key,
      minutes: minutesFromHHmm(time),
    }));
    const moment = widgetMoment(
      [{ dateKey: '2026-06-14', prayers: rows, extras: [] }],
      { todayKey: '2026-06-14', nowMinutes: when.getHours() * 60 + when.getMinutes() },
    );
    const prev = moment && widgetPrevious(moment);
    return prev ? prev.at : null;
  };

  test('returns the most recent prayer earlier today (mid-afternoon)', () => {
    expect(prevAt(today, at(14, 0))).toBe(12 * 60); // Dhuhr
  });

  test('returns Fajr shortly after Fajr', () => {
    expect(prevAt(today, at(5, 30))).toBe(5 * 60);
  });

  test('returns Isha after Isha', () => {
    expect(prevAt(today, at(21, 0))).toBe(20 * 60);
  });

  test("before Fajr → the previous day's Isha", () => {
    expect(prevAt(today, at(4, 0))).toBe(20 * 60 - 1440);
  });

  test("just after midnight → the previous day's Isha", () => {
    expect(prevAt(today, at(0, 30))).toBe(20 * 60 - 1440);
  });

  test('returns null when no timings are usable', () => {
    expect(prevAt({}, at(14, 0))).toBeNull();
  });
});

describe('syncLiveActivity → iOS content', () => {
  const ORIGINAL_OS = Platform.OS;
  let startMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    startMock = jest.fn(() => Promise.resolve());
    (getPrayerLiveActivityModule as jest.Mock).mockReturnValue({
      start: startMock,
      update: jest.fn(() => Promise.resolve()),
      stop: jest.fn(() => Promise.resolve()),
      isAvailable: jest.fn(() => Promise.resolve(true)),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => ORIGINAL_OS });
    jest.clearAllMocks();
  });

  test('sends prevEpochSeconds, accentHex and the correct next prayer', async () => {
    const now = new Date(2026, 5, 14, 14, 0, 0, 0); // 14:00 → next is Asr 15:00
    const p = syncLiveActivity({
      options: { enabled: true },
      today,
      now,
      accentHex: '#2563eb',
    });
    await jest.advanceTimersByTimeAsync(900); // flush the 800ms debounce
    await p;

    expect(startMock).toHaveBeenCalledTimes(1);
    const content = JSON.parse(startMock.mock.calls[0][0]);
    expect(content.accentHex).toBe('#2563eb');
    expect(content.nextKey).toBe('Asr');
    expect(content.nextTime).toBe('15:00');
    // next = Asr 15:00, prev = Dhuhr 12:00
    expect(content.nextEpochSeconds).toBe(
      new Date(2026, 5, 14, 15, 0, 0, 0).getTime() / 1000,
    );
    expect(content.prevEpochSeconds).toBe(
      new Date(2026, 5, 14, 12, 0, 0, 0).getTime() / 1000,
    );
    // Brand-accent path → not system tinted.
    expect(content.systemTinted).toBe(false);
  });

  /**
   * THE KEY THAT WAS NEVER SENT — found on a simulator, 2026-09-18.
   *
   * `Row.display` is a Swift non-Optional with a default, and synthesized
   * `Decodable` throws on a missing key rather than using that default.
   * The payload builder only emits `display` when it differs from `time`,
   * so on a 24-hour clock (like the `today` fixture here) the key was
   * absent, `JSON.stringify` dropped it, the ContentState failed to
   * decode, and `start` rejected into a caught promise — no Live Activity
   * was ever created, for anyone, silently.
   *
   * Every row the Activity is handed must therefore carry a string.
   */
  test('every row carries a display string, even on a 24-hour clock', async () => {
    const now = new Date(2026, 5, 14, 14, 0, 0, 0);
    const p = syncLiveActivity({
      options: { enabled: true },
      today,
      now,
      accentHex: '#2563eb',
    });
    await jest.advanceTimersByTimeAsync(900);
    await p;

    const content = JSON.parse(startMock.mock.calls[0][0]);
    expect(content.rows.length).toBeGreaterThan(0);
    for (const row of content.rows) {
      expect(typeof row.display).toBe('string');
      expect(row.display.length).toBeGreaterThan(0);
    }
    for (const row of content.extraRows ?? []) {
      expect(typeof row.display).toBe('string');
    }
    if (content.sunriseRow) {
      expect(typeof content.sunriseRow.display).toBe('string');
    }
  });

  test('systemTinted flag is forwarded to the iOS content', async () => {
    const now = new Date(2026, 5, 14, 14, 0, 0, 0);
    const p = syncLiveActivity({
      options: { enabled: true },
      today,
      now,
      accentHex: '#22c55e',
      systemTinted: true,
    });
    await jest.advanceTimersByTimeAsync(900);
    await p;

    const content = JSON.parse(startMock.mock.calls[0][0]);
    expect(content.systemTinted).toBe(true);
  });

  test('disabled → ends the activity, does not start one', async () => {
    const stopMock = jest.fn(() => Promise.resolve());
    (getPrayerLiveActivityModule as jest.Mock).mockReturnValue({
      start: startMock,
      update: jest.fn(() => Promise.resolve()),
      stop: stopMock,
      isAvailable: jest.fn(() => Promise.resolve(true)),
    });
    const p = syncLiveActivity({
      options: { enabled: false },
      today,
      now: new Date(2026, 5, 14, 14, 0, 0, 0),
    });
    await jest.advanceTimersByTimeAsync(900);
    await p;

    expect(startMock).not.toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalled();
  });
});
