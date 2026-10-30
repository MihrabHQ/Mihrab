/**
 * Zones that keep one offset all year now, on phones whose zone data still
 * moves the clock (#117: Jordan, whose phones went back to UTC+2 on the
 * last Friday of October 2026, four years after Jordan stopped doing so).
 *
 * The phone's zone is mocked (`resolvedOptions`); a stale phone is Intl
 * answering a fixed UTC+2 for Asia/Amman, a current one Node's own data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { _resetClockSkewForTests, noteServerDate } from '../src/providers/clockSkew';
import {
  _resetZoneDataMemoForTests,
  clockFor,
  deviceZoneClock,
  FIXED_ZONES,
  fixedZoneName,
  formatInZone,
  phoneClockRunsOnStaleZone,
  phoneClockSetByHand,
  zoneDataLagMinutes,
  zoneOffsetMinutes,
} from '../src/providers/locationClock';
import { placeZoneFor } from '../src/providers/placeZone';
import { utcOffsetLabel, zoneDataNotice, zoneDataNoticeKey } from '../src/prayer/zoneDataNotice';
import { fixedOffsetMinutes } from '../src/utils/zoneClock';
import { formatLocalTime } from '../src/utils/prayerTimes';
import { clampOffset, MAX_OFFSET_MAGNITUDE } from '../src/settings/prayerOffsets';

const NODE_DTF = Intl.DateTimeFormat;
const AMMAN = { latitude: 31.95, longitude: 35.93 };
/** Dhuhr in Amman on 30 October 2026: 09:20 UTC, 12:20 on Jordan's clock. */
const DHUHR = new Date(Date.UTC(2026, 9, 30, 9, 20));
const nowS = () => Math.floor(Date.now() / 1000) * 1000;
const serverAt = (ms: number) => ({
  headers: { get: (n: string) => (n.toLowerCase() === 'date' ? new Date(ms).toUTCString() : null) },
});
/** A t() that shows what it was asked. */
const t = ((key: string, opts?: Record<string, unknown>) => `${key} ${JSON.stringify(opts ?? {})}`) as never;

let zoneSpy: jest.SpyInstance;
let staleSpy: jest.SpyInstance | null = null;
function phoneIn(zone: string) {
  zoneSpy.mockReturnValue({ timeZone: zone } as Intl.ResolvedDateTimeFormatOptions);
}
/** A phone whose zone data still puts Jordan back to UTC+2. */
function staleJordan() {
  const Real = NODE_DTF;
  staleSpy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(((
    locale?: string | string[],
    opts?: Intl.DateTimeFormatOptions,
  ) => new Real(locale, opts?.timeZone === 'Asia/Amman' ? { ...opts, timeZone: 'Etc/GMT-2' } : opts)) as never);
}

beforeEach(async () => {
  _resetClockSkewForTests();
  _resetZoneDataMemoForTests();
  await AsyncStorage.clear();
  zoneSpy = jest.spyOn(NODE_DTF.prototype, 'resolvedOptions');
  phoneIn('Asia/Amman');
});
afterEach(() => {
  zoneSpy.mockRestore();
  staleSpy?.mockRestore();
  staleSpy = null;
});

describe('the zones', () => {
  it('each keeps its offset every month of two years, by current zone data', () => {
    for (const [zone, { offsetMinutes }] of Object.entries(FIXED_ZONES)) {
      for (let m = 0; m < 24; m++) {
        const at = new Date(Date.UTC(2026 + Math.floor(m / 12), m % 12, 15, 12));
        expect([zone, zoneOffsetMinutes(zone, at)]).toEqual([zone, offsetMinutes]);
      }
    }
  });

  it('are written on a fixed offset read by arithmetic, half hours included', () => {
    for (const m of [180, 210, 300, 120, -360, -180, 780, 240]) {
      expect(fixedOffsetMinutes(fixedZoneName(m))).toBe(m);
    }
    expect(fixedZoneName(210)).toBe('Etc/GMT-3:30');
    expect(formatInZone(DHUHR, 'Etc/GMT-3:30')).toBe('12:50');
    expect(utcOffsetLabel(210)).toBe('UTC+3:30');
    expect(utcOffsetLabel(-360)).toBe('UTC−6');
  });
});

describe('a phone in Jordan', () => {
  it('with current zone data: the phone’s clock, nothing to say', () => {
    const now = nowS();
    noteServerDate(serverAt(now - 3600_000), now);
    const clock = deviceZoneClock();
    expect(clock?.fixedOffsetMinutes).toBe(180);
    expect(zoneDataLagMinutes(clock)).toBe(0);
    expect(phoneClockSetByHand(clock)).toBe(false);
    expect(clockFor(clock).format).toBe(formatLocalTime);
    expect(zoneDataNotice(t, 'home')).toBeNull();
  });

  it('with stale zone data on network time: the phone’s clock, and Today says why it is an hour out', () => {
    staleJordan();
    const now = nowS();
    noteServerDate(serverAt(now + 2_000), now);
    const clock = deviceZoneClock();
    expect(zoneDataLagMinutes(clock)).toBe(-60);
    expect(phoneClockRunsOnStaleZone(clock)).toBe(true);
    expect(clockFor(clock).format).toBe(formatLocalTime);
    expect(zoneDataNoticeKey()).toBe('Asia/Amman:-60');
    const note = zoneDataNotice(t, 'home') as string;
    expect(note).toContain('home.zoneDataStaleFixedNotice');
    expect(note).toContain('"offset":"UTC+3"');
    expect(note).toContain('"since":2022');
    expect(note).toContain('"minutes":60');
  });

  it('with stale zone data and the clock set by hand to the wall clocks: Jordan’s UTC+3, read on the phone’s clock', () => {
    staleJordan();
    const now = nowS();
    // Set forward by hand on UTC+2 data, the phone's instants run an hour
    // (and the few minutes a hand-set clock is off) ahead of the server's.
    noteServerDate(serverAt(now - 3600_000 + 3 * 60_000), now);
    const clock = placeZoneFor(AMMAN.latitude, AMMAN.longitude, new Date(2026, 9, 30));
    expect(clock?.away).toBe('Etc/GMT-3');
    expect(phoneClockSetByHand(clock)).toBe(true);
    expect(phoneClockRunsOnStaleZone(clock)).toBe(false);
    const { format, zone } = clockFor(clock);
    expect(format(DHUHR)).toBe('12:20');
    expect(zone).toBe('device');
    expect(zoneDataNotice(t, 'home')).toBeNull();
  });
});

describe('Amman saved on a phone elsewhere', () => {
  it('is written on UTC+3 even where the phone’s data still moves Jordan’s clock', () => {
    staleJordan();
    phoneIn('Europe/Stockholm');
    const clock = placeZoneFor(AMMAN.latitude, AMMAN.longitude, new Date(2026, 10, 15));
    expect(clockFor(clock).format(DHUHR)).toBe('12:20');
    expect(zoneDataNotice(t, 'settings')).toBeNull();
  });
});

describe('per-prayer offsets', () => {
  it('reach two hours either way (#117)', () => {
    expect(MAX_OFFSET_MAGNITUDE).toBe(120);
    expect(clampOffset(60)).toBe(60);
    expect(clampOffset(-90)).toBe(-90);
    expect(clampOffset(500)).toBe(120);
  });
});
