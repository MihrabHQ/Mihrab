/**
 * Morocco's times on a phone in Morocco (#82).
 *
 * Morocco left GMT+1 on 2026-09-20. Three phones there:
 *   • zone data up to date: Africa/Casablanca is GMT — the phone's clock;
 *   • zone data from before 2026, on network time: the phone runs at +1 and
 *     its instants are right — the phone's clock, which the times must agree
 *     with;
 *   • zone data from before 2026, clock set back by hand to the wall clocks:
 *     its instants are an hour behind the server's — the ministry's GMT, so
 *     the times read as the wall clocks do.
 *
 * The phone's zone is Africa/Casablanca (`resolvedOptions` mocked). Node's
 * own zone data is from before the change (it gives +1 for December 2026),
 * which is the stale phone; the up-to-date one is Intl answering GMT for the
 * zone. "The phone's clock" is `formatLocalTime`, whatever the process's
 * zone makes of it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  _resetClockSkewForTests,
  CLOCK_SKEW_MAX_AGE_MS,
  deviceClockSkewSeconds,
  hydrateClockSkew,
  noteServerDate,
} from '../src/providers/clockSkew';
import { formatLocalTime } from '../src/utils/prayerTimes';
import {
  _resetZoneDataMemoForTests,
  civilInZone,
  clockFormatter,
  formatInZone,
  MOROCCO_CLOCK,
  phoneClockRunsOnStaleZone,
  phoneClockSetByHand,
  phoneZoneDataStale,
  zoneOffsetMinutes,
} from '../src/providers/locationClock';

const FAJR = new Date(Date.UTC(2026, 9, 16, 5, 5)); // 05:05 GMT, the ministry's printed time
const local = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0',
  )}`;
const response = (date: string | null) => ({
  headers: { get: (n: string) => (n.toLowerCase() === 'date' ? date : null) },
});
/** The phone's clock, to the second (a `Date` header has no milliseconds). */
const nowS = () => Math.floor(Date.now() / 1000) * 1000;
const serverAhead = (now: number, ms: number) =>
  response(new Date(now + ms).toUTCString());

/** A phone whose zone data knows Morocco is GMT. */
function upToDateZoneData(): () => void {
  const Real = Intl.DateTimeFormat;
  const spy = jest
    .spyOn(Intl, 'DateTimeFormat')
    .mockImplementation(
      ((locale?: string | string[], opts?: Intl.DateTimeFormatOptions) =>
        new Real(
          locale,
          opts?.timeZone === 'Africa/Casablanca'
            ? { ...opts, timeZone: 'Etc/GMT' }
            : opts,
        )) as never,
    );
  return () => spy.mockRestore();
}

let zoneSpy: jest.SpyInstance;
beforeEach(async () => {
  _resetClockSkewForTests();
  _resetZoneDataMemoForTests();
  await AsyncStorage.clear();
  zoneSpy = jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({
      timeZone: 'Africa/Casablanca',
    } as Intl.ResolvedDateTimeFormatOptions);
});
afterEach(() => zoneSpy.mockRestore());

describe('the phone’s zone data', () => {
  it('is stale where Intl still gives Morocco +1 in December 2026', () => {
    expect(
      zoneOffsetMinutes('Africa/Casablanca', new Date('2026-12-01T12:00:00Z')),
    ).toBe(60);
    expect(phoneZoneDataStale(MOROCCO_CLOCK)).toBe(true);
  });

  it('is current when Intl answers GMT for the zone', () => {
    const restore = upToDateZoneData();
    try {
      expect(
        zoneOffsetMinutes(
          'Africa/Casablanca',
          new Date('2026-12-01T12:00:00Z'),
        ),
      ).toBe(0);
      expect(phoneZoneDataStale(MOROCCO_CLOCK)).toBe(false);
    } finally {
      restore();
    }
  });

  it('is not a question for a phone elsewhere', () => {
    zoneSpy.mockReturnValue({
      timeZone: 'Europe/Stockholm',
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(phoneZoneDataStale(MOROCCO_CLOCK)).toBe(false);
  });
});

describe('three phones in Morocco', () => {
  it('zone data up to date: the phone’s clock, whatever the server says', () => {
    const restore = upToDateZoneData();
    try {
      const now = nowS();
      noteServerDate(serverAhead(now, 3600_000), now);
      expect(phoneClockSetByHand(MOROCCO_CLOCK)).toBe(false);
      expect(phoneClockRunsOnStaleZone(MOROCCO_CLOCK)).toBe(false);
      expect(clockFormatter(MOROCCO_CLOCK)).toBe(formatLocalTime);
    } finally {
      restore();
    }
  });

  it('stale zone data on network time: the phone’s clock (+1), on which the instants are right', () => {
    const now = nowS();
    noteServerDate(serverAhead(now, 2_000), now); // two seconds of latency
    expect(deviceClockSkewSeconds(now)).toBe(2);
    expect(phoneClockSetByHand(MOROCCO_CLOCK)).toBe(false);
    expect(clockFormatter(MOROCCO_CLOCK)).toBe(formatLocalTime);
    // … and this is the phone whose owner is told, on Today, to set the
    // zone by hand (#82's reporter's own finding).
    expect(phoneClockRunsOnStaleZone(MOROCCO_CLOCK)).toBe(true);
  });

  it('stale zone data, clock set back by hand: the ministry’s GMT', () => {
    const now = nowS();
    // The server is an hour (and the few minutes a hand-set clock is off) ahead.
    noteServerDate(serverAhead(now, 3600_000 + 4 * 60_000), now);
    expect(phoneClockSetByHand(MOROCCO_CLOCK)).toBe(true);
    // Reads right already: nothing to tell.
    expect(phoneClockRunsOnStaleZone(MOROCCO_CLOCK)).toBe(false);
    expect(clockFormatter(MOROCCO_CLOCK)).not.toBe(formatLocalTime);
    expect(clockFormatter(MOROCCO_CLOCK)(FAJR)).toBe('05:05');
  });

  it('stale zone data, nothing known of the server: the phone’s clock, as before', () => {
    expect(deviceClockSkewSeconds()).toBe(0);
    expect(clockFormatter(MOROCCO_CLOCK)).toBe(formatLocalTime);
  });

  it('a skew far from an hour is not a clock set by hand to Morocco’s', () => {
    const now = nowS();
    noteServerDate(serverAhead(now, 2 * 3600_000), now);
    expect(phoneClockSetByHand(MOROCCO_CLOCK)).toBe(false);
    expect(clockFormatter(MOROCCO_CLOCK)).toBe(formatLocalTime);
  });
});

describe('the server’s time', () => {
  it('is kept, read back at start, and forgotten when old', async () => {
    const now = nowS();
    noteServerDate(serverAhead(now, 3600_000), now);
    expect(deviceClockSkewSeconds(now)).toBe(3600);
    await new Promise(r => setTimeout(r, 0));
    _resetClockSkewForTests();
    expect(deviceClockSkewSeconds(now)).toBe(0);
    await hydrateClockSkew();
    expect(deviceClockSkewSeconds(now)).toBe(3600);
    expect(deviceClockSkewSeconds(now + CLOCK_SKEW_MAX_AGE_MS + 1)).toBe(0);
  });

  it('ignores a response without a readable Date', () => {
    noteServerDate(response(null));
    noteServerDate(response('not a date'));
    noteServerDate({ headers: null });
    noteServerDate(undefined);
    expect(deviceClockSkewSeconds()).toBe(0);
  });
});

describe('writing on a zone', () => {
  it('falls back to the phone’s clock for a zone the phone cannot resolve', () => {
    expect(formatInZone(FAJR, 'Not/AZone')).toBe(local(FAJR));
    expect(formatInZone(FAJR, 'Etc/GMT')).toBe('05:05');
    expect(civilInZone(FAJR, 'Not/AZone')).toBeNull();
  });

  it('a saved Rabat on a phone elsewhere is on GMT, as before', () => {
    zoneSpy.mockReturnValue({
      timeZone: 'Europe/Stockholm',
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(clockFormatter(MOROCCO_CLOCK)(FAJR)).toBe('05:05');
  });
});
