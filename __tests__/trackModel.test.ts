import {
  chartAzimuth,
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
  const now = new Date('2026-11-05T22:10:00Z');
  const night = { maghrib: new Date('2026-11-05T14:54:00Z'), sunrise: new Date('2026-11-06T06:23:00Z') };
  it('follows the moon through the night', () => {
    const w = trackWindow('night', now, night);
    expect(w.kind).toBe('moon');
    expect(w.from).toBe(night.maghrib);
    expect(w.to).toBe(night.sunrise);
  });
  it('follows the sun through the day and the twilights, over the local day', () => {
    for (const passage of ['dawn', 'day', 'sunset', 'dusk'] as const) {
      const w = trackWindow(passage, now, night);
      expect(w.kind).toBe('sun');
      expect(w.to.getTime() - w.from.getTime()).toBe(24 * 3600_000);
    }
  });
  it('falls back to the sun when the night has no bounds', () => {
    expect(trackWindow('night', now, null).kind).toBe('sun');
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
