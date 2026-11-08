import {
  chartAzimuth,
  clearTrackCache,
  TRACK_FLOOR,
  TRACK_MIN_TOP,
  trackFrame,
  trackSpan,
  trackWindow,
  type TrackFrame,
} from '../src/screens/home/trackModel';
import { sunPosition } from '../src/screens/home/moon';

/** A day's window around `now`, free of the test machine's time zone. */
const day = (now: Date) => ({ from: new Date(now.getTime() - 12 * 3600_000), to: new Date(now.getTime() + 12 * 3600_000) });

const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
const SYDNEY = { latitude: -33.87, longitude: 151.21 };
const TROMSO = { latitude: 69.65, longitude: 18.96 };
const NAIROBI = { latitude: -1.29, longitude: 36.82 };

function sunFrame(now: Date, where: { latitude: number; longitude: number }, nextAt: Date | null = null): TrackFrame {
  return trackFrame({ kind: 'sun', now, nextAt, ...where, ...day(now) });
}

describe('trackFrame — Stockholm, 5 November', () => {
  // 13:40 CET.
  const now = new Date('2026-11-05T12:40:00Z');
  // Maghrib 15:54 CET.
  const maghrib = new Date('2026-11-05T14:54:00Z');
  const f = sunFrame(now, STOCKHOLM, maghrib);

  it('peaks low, and the chart top holds at the minimum', () => {
    expect(f.peak).toBeGreaterThan(10);
    expect(f.peak).toBeLessThan(16);
    expect(f.top).toBe(TRACK_MIN_TOP);
    expect(f.circumpolar).toBe(false);
    expect(f.byHour).toBe(false);
  });

  it('runs left to right through the day, east on the left', () => {
    const up = f.points.filter(p => !p.under);
    for (let i = 1; i < up.length; i++) expect(up[i].x).toBeGreaterThanOrEqual(up[i - 1].x);
    expect(up[0].x).toBeLessThan(0.5);
    expect(up[up.length - 1].x).toBeGreaterThan(0.5);
  });

  it('places the body on the track above the horizon, a third of the way up at most', () => {
    expect(f.body).not.toBeNull();
    expect(f.body!.under).toBe(false);
    expect(f.body!.y).toBeGreaterThan(0.6);
    expect(f.body!.y).toBeLessThan(1);
    expect(f.body!.x).toBeGreaterThan(0.5);
  });

  it('puts the Maghrib ring where the track meets the horizon', () => {
    expect(f.ring).not.toBeNull();
    // Within a couple of degrees: the sketch's 15:54 is a timetable's
    // Maghrib, which refraction and the disc's own width put a few
    // minutes after the geometric sun's.
    expect(Math.abs(f.ring!.altitude)).toBeLessThan(2.5);
    expect(f.ring!.y).toBeGreaterThan(0.95);
  });

  it('marks only the stretch from now to the next prayer as remaining', () => {
    const rem = f.points.filter(p => p.remaining);
    expect(rem.length).toBeGreaterThan(0);
    for (const p of rem) {
      expect(p.at).toBeGreaterThanOrEqual(now.getTime());
      expect(p.at).toBeLessThanOrEqual(maghrib.getTime());
    }
    expect(f.points.some(p => !p.remaining)).toBe(true);
  });

  it('keeps only samples on the chart', () => {
    for (const p of f.points) expect(p.altitude).toBeGreaterThanOrEqual(TRACK_FLOOR);
  });
});

describe('trackFrame — a next prayer under the horizon', () => {
  // 16:50 CET, Isha 17:52 CET.
  const now = new Date('2026-11-05T15:50:00Z');
  const isha = new Date('2026-11-05T16:52:00Z');
  const f = sunFrame(now, STOCKHOLM, isha);
  it('sits the body and the ring on the line', () => {
    expect(f.body!.under).toBe(true);
    expect(f.body!.y).toBe(1);
    expect(f.ring!.under).toBe(true);
    expect(f.ring!.y).toBe(1);
    expect(f.ring!.x).toBeGreaterThan(f.body!.x);
  });
});

describe('trackFrame — the world', () => {
  it('Sydney faces north: a morning sun is on the right', () => {
    // 10:00 AEDT.
    const f = sunFrame(new Date('2026-03-20T23:00:00Z'), SYDNEY);
    expect(f.body!.under).toBe(false);
    expect(f.body!.x).toBeGreaterThan(0.5);
    expect(chartAzimuth(90, -33)).toBe(270);
    expect(chartAzimuth(90, 59)).toBe(90);
  });

  it('Tromsø in June is circumpolar: the whole circle, nothing under', () => {
    // 23:10 CEST.
    const f = sunFrame(new Date('2026-06-21T21:10:00Z'), TROMSO);
    expect(f.circumpolar).toBe(true);
    expect(f.points.every(p => !p.under)).toBe(true);
    expect(f.body!.under).toBe(false);
    expect(f.body!.altitude).toBeGreaterThan(0);
    expect(f.body!.altitude).toBeLessThan(6);
  });

  it('Tromsø in December is the polar night: wholly under, the body on the line', () => {
    // 12:00 CET.
    const f = sunFrame(new Date('2026-12-21T11:00:00Z'), TROMSO);
    expect(f.points.every(p => p.under)).toBe(true);
    expect(f.body!.under).toBe(true);
    expect(f.body!.altitude).toBeLessThan(0);
    expect(f.body!.altitude).toBeGreaterThan(-6);
    expect(f.body!.x).toBeGreaterThan(0.3);
    expect(f.body!.x).toBeLessThan(0.7);
  });

  it('Nairobi at the equinox goes to the zenith and is placed by the hour', () => {
    // 12:30 EAT.
    const f = sunFrame(new Date('2026-03-21T09:30:00Z'), NAIROBI);
    expect(f.peak).toBeGreaterThan(80);
    expect(f.byHour).toBe(true);
    expect(f.top).toBeGreaterThan(80);
    const up = f.points.filter(p => !p.under);
    for (let i = 1; i < up.length; i++) expect(up[i].x).toBeGreaterThanOrEqual(up[i - 1].x);
    expect(f.body!.y).toBeLessThan(0.1);
  });

  it('the moon is drawn where it is, and absent when it is off the chart', () => {
    // 23:10 CET, 5 November: a waning crescent that rises after three.
    const now = new Date('2026-11-05T22:10:00Z');
    const f = trackFrame({
      kind: 'moon',
      now,
      nextAt: new Date('2026-11-06T03:55:00Z'),
      ...STOCKHOLM,
      from: new Date('2026-11-05T14:54:00Z'),
      to: new Date('2026-11-06T06:23:00Z'),
    });
    expect(f.kind).toBe('moon');
    expect(f.body == null || f.body.under).toBe(true);
    expect(f.ring).not.toBeNull();
    expect(f.ring!.under).toBe(false);
  });
});

describe('trackFrame — the moon over a night that cuts its pass', () => {
  // Stockholm, the night of 5–6 November 2026: a waning crescent that
  // rises after midnight and is still high at sunrise. Maghrib 15:51 CET,
  // sunrise 07:12 CET; now 03:00.
  const f = trackFrame({
    kind: 'moon',
    now: new Date('2026-11-06T02:00:00Z'),
    nextAt: new Date('2026-11-06T03:57:00Z'),
    ...STOCKHOLM,
    from: new Date('2026-11-05T14:51:00Z'),
    to: new Date('2026-11-06T06:12:00Z'),
  });

  it('draws the whole pass across the width, not a piece of the circle', () => {
    const up = f.base.filter(p => !p.under);
    const xs = up.map(p => p.x);
    expect(Math.min(...xs)).toBeLessThan(0.3);
    expect(Math.max(...xs)).toBeGreaterThan(0.7);
    // It rises and sets on the chart: both ends meet the line.
    expect(f.base[0].under).toBe(true);
    expect(f.base[f.base.length - 1].under).toBe(true);
    expect(f.circumpolar).toBe(false);
  });

  it('keeps the body and the Fajr ring on it', () => {
    expect(f.body).not.toBeNull();
    expect(f.ring).not.toBeNull();
    expect(f.points.some(p => p.remaining)).toBe(true);
  });
});

describe('trackSpan', () => {
  it('finds where the track enters and leaves the chart', () => {
    const s = trackSpan([
      { altitude: -30, azimuth: 60 },
      { altitude: -10, azimuth: 80 },
      { altitude: 10, azimuth: 100 },
      { altitude: 10, azimuth: 260 },
      { altitude: -10, azimuth: 280 },
      { altitude: -30, azimuth: 300 },
    ]);
    expect(s).toEqual({ from: 80, to: 280 });
  });
  it('is null when the track never crosses the floor', () => {
    expect(trackSpan([{ altitude: 3, azimuth: 0 }, { altitude: 40, azimuth: 180 }, { altitude: 3, azimuth: 359 }])).toBeNull();
  });
});

describe('trackWindow', () => {
  it('follows the sun over the local day', () => {
    const w = trackWindow(new Date('2026-11-05T22:10:00Z'));
    expect(w.kind).toBe('sun');
    expect(w.to.getTime() - w.from.getTime()).toBe(24 * 3600_000);
  });
});

/**
 * THE NIGHT FOLLOWS THE SUN. Stockholm, 7–8 November 2026: the moon a
 * day from new, rising at 06:50, half an hour before the sun. Followed
 * by the moon, the night drew its daytime path over an empty band, with
 * no mark for now from Isha until four. The night's window is the 24
 * hours to the next prayer (TodayCard's), Isha behind and Fajr ahead.
 */
describe('a night near the new moon, Stockholm', () => {
  const STO = { latitude: 59.3293, longitude: 18.0686 };
  const isha = new Date('2026-11-07T17:48:00+01:00');
  const fajr = new Date('2026-11-08T05:01:00+01:00');
  const night = (now: Date) =>
    trackFrame({
      kind: 'sun',
      now,
      ...STO,
      from: new Date(fajr.getTime() - 24 * 3600_000),
      to: fajr,
      nextAt: fajr,
      prevAt: isha,
    });
  it('marks now along the line, from Isha on the right to Fajr on the left', () => {
    const late = night(new Date('2026-11-07T22:30:00+01:00'));
    const early = night(new Date('2026-11-08T02:30:00+01:00'));
    expect(late.body).toBeNull();
    expect(late.deep).not.toBeNull();
    expect(early.deep).not.toBeNull();
    expect(late.start).not.toBeNull();
    expect(late.ring).not.toBeNull();
    const ishaX = late.start!.x;
    const fajrX = late.ring!.x;
    expect(ishaX).toBeGreaterThan(fajrX);
    // Through the night, right to left as the hours go.
    expect(late.deep!).toBeLessThanOrEqual(ishaX);
    expect(early.deep!).toBeLessThan(late.deep!);
    expect(early.deep!).toBeGreaterThanOrEqual(fajrX);
  });
  it('draws no moon while the moon is down, and the moon where it is once it is up', () => {
    expect(night(new Date('2026-11-07T22:30:00+01:00')).moon).toBeNull();
    const morning = trackFrame({
      now: new Date('2026-11-08T10:00:00+01:00'),
      ...STO,
      ...trackWindow(new Date('2026-11-08T10:00:00+01:00')),
      nextAt: new Date('2026-11-08T11:37:00+01:00'),
    });
    expect(morning.moon).not.toBeNull();
    expect(morning.moon!.altitude).toBeGreaterThan(0);
    expect(morning.moon!.x).toBeGreaterThan(0);
    expect(morning.moon!.x).toBeLessThan(1);
    expect(morning.moon!.y).toBeLessThan(1);
  });
});

describe('the engine it reads', () => {
  it('sunPosition agrees with the chart: Stockholm noon in November is about thirteen degrees', () => {
    const p = sunPosition(new Date('2026-11-05T10:40:00Z'), STOCKHOLM.latitude, STOCKHOLM.longitude);
    expect(p.altitude).toBeGreaterThan(11);
    expect(p.altitude).toBeLessThan(16);
    expect(Math.abs(p.azimuth - 180)).toBeLessThan(10);
  });
});

describe('the day is sampled once', () => {
  const window = { from: new Date('2026-11-04T23:00:00Z'), to: new Date('2026-11-05T23:00:00Z') };
  const at = (iso: string, where = STOCKHOLM) =>
    trackFrame({ kind: 'sun', now: new Date(iso), nextAt: new Date('2026-11-05T14:54:00Z'), ...where, ...window });

  it('keeps the same track through the minutes of a window', () => {
    clearTrackCache();
    const a = at('2026-11-05T12:40:00Z');
    const b = at('2026-11-05T12:41:00Z');
    expect(b.base).toBe(a.base);
    // The minute still moves the body and the stretch.
    expect(b.body!.x).not.toBe(a.body!.x);
    expect(b.points.filter(p => p.remaining).length).toBeLessThanOrEqual(a.points.filter(p => p.remaining).length);
  });

  it('a few metres of GPS are the same place; another city is not', () => {
    clearTrackCache();
    const a = at('2026-11-05T12:40:00Z');
    expect(at('2026-11-05T12:40:00Z', { latitude: 59.3301, longitude: 18.0702 }).base).toBe(a.base);
    expect(at('2026-11-05T12:40:00Z', { latitude: 57.7, longitude: 11.97 }).base).not.toBe(a.base);
  });

  it('a minute after the first costs a small part of it', () => {
    clearTrackCache();
    const t0 = Date.now();
    at('2026-11-05T12:40:00Z');
    const first = Date.now() - t0;
    const t1 = Date.now();
    for (let m = 0; m < 60; m++) at(`2026-11-05T12:${String(m).padStart(2, '0')}:00Z`);
    const hour = Date.now() - t1;
    // An hour of minutes for not much more than one fresh sampling.
    expect(hour).toBeLessThan(Math.max(20, first * 8));
  });
});

describe('trackFrame — the sun past the floor', () => {
  // Stockholm, 5 November, 22:00 CET: the sun is ~45° under, past the
  // chart's floor; the window is the 24 hours ending at tomorrow's Fajr.
  const fajr = new Date('2026-11-06T03:57:00Z');
  const f = trackFrame({
    kind: 'sun',
    now: new Date('2026-11-05T21:00:00Z'),
    nextAt: fajr,
    ...STOCKHOLM,
    from: new Date(fajr.getTime() - 24 * 3_600_000),
    to: fajr,
  });

  it('has no body on the chart, but says where across it stands on the floor', () => {
    expect(f.body).toBeNull();
    expect(f.deep).not.toBeNull();
    expect(f.deep!).toBeGreaterThanOrEqual(0);
    expect(f.deep!).toBeLessThanOrEqual(1);
  });

  it('crosses the floor by the clock, from where it left the chart to where it comes back', () => {
    const at = (iso: string) =>
      trackFrame({
        kind: 'sun',
        now: new Date(iso),
        nextAt: fajr,
        prevAt: new Date('2026-11-05T16:50:00Z'),
        ...STOCKHOLM,
        from: new Date(fajr.getTime() - 24 * 3_600_000),
        to: fajr,
      });
    const gapAt = (g: TrackFrame) => {
      for (let i = 1; i < g.base.length; i++) if (g.base[i].at - g.base[i - 1].at > 10 * 60_000) return [g.base[i - 1], g.base[i]];
      throw new Error('no gap');
    };
    const evening = at('2026-11-05T19:00:00Z');
    const midnight = at('2026-11-05T23:00:00Z');
    const late = at('2026-11-06T02:30:00Z');
    const [out, back] = gapAt(evening);
    // Out on the right after Isha, back on the left before Fajr.
    expect(out.x).toBeGreaterThan(0.8);
    expect(back.x).toBeLessThan(0.2);
    // Moving right to left with the hours, at its share of the time.
    expect(evening.deep!).toBeGreaterThan(midnight.deep!);
    expect(midnight.deep!).toBeGreaterThan(late.deep!);
    const share = (23 * 3_600_000 + Date.UTC(2026, 10, 5) - out.at) / (back.at - out.at);
    expect(midnight.deep!).toBeCloseTo(out.x + (back.x - out.x) * share, 3);
  });

  it('marks Isha, the prayer the interval runs from, where the sun was then', () => {
    const g = trackFrame({
      kind: 'sun',
      now: new Date('2026-11-05T21:00:00Z'),
      nextAt: fajr,
      prevAt: new Date('2026-11-05T16:50:00Z'),
      ...STOCKHOLM,
      from: new Date(fajr.getTime() - 24 * 3_600_000),
      to: fajr,
    });
    expect(g.start).not.toBeNull();
    expect(g.start!.under).toBe(true);
    expect(g.start!.x).toBeGreaterThan(0.7);
  });

  it('puts the Fajr ring under the line, at the depth Fajr is reckoned by', () => {
    expect(f.ring).not.toBeNull();
    expect(f.ring!.under).toBe(true);
    expect(f.ring!.altitude).toBeLessThan(-12);
    expect(f.ring!.altitude).toBeGreaterThan(TRACK_FLOOR);
  });

  it('is on the chart when the body is', () => {
    const day = trackFrame({ kind: 'sun', now: new Date('2026-11-05T11:00:00Z'), nextAt: null, ...STOCKHOLM, ...{ from: new Date('2026-11-04T23:00:00Z'), to: new Date('2026-11-05T23:00:00Z') } });
    expect(day.body).not.toBeNull();
    expect(day.deep).toBeNull();
  });
});
