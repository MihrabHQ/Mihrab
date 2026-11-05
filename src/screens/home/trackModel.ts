/**
 * The Track look: the hero's sky band as a chart of the sky.
 *
 * ── WHAT IT DRAWS ─────────────────────────────────────────────────────
 *
 * The current hero already has the structure: a band of sky above the
 * countdown where the sun travels, an invisible horizon at the band's
 * foot that a rising or setting sun is cut by (skyModel's SUN_HORIZON_Y),
 * and the text under it. The Track look makes that structure visible
 * and takes the band. It draws, and nothing else:
 *
 *   the horizon      a hairline at the band's foot — altitude 0°
 *   the track        today's path of the sun (by night: tonight's path
 *                    of the moon), altitude over azimuth, TO SCALE, from
 *                    the reader's own coordinates
 *   the body         the sun or the moon where it is on that track —
 *                    clipped by the horizon when it is going under, an
 *                    outline ON the line when it is under
 *   the ring         where the body will be at the next prayer: Dhuhr is
 *                    the top of the arc, Maghrib where the track meets
 *                    the horizon; Fajr, Isha and sunrise are under, so a
 *                    ring on the line
 *   the stretch      the part of the track from the body to the ring,
 *                    drawn stronger: the time left, to scale
 *
 * ── THE SCALE ─────────────────────────────────────────────────────────
 *
 * Vertical: one scale for the day, from the horizon (y = 1) to today's
 * peak altitude (y = 0), never less than TRACK_MIN_TOP degrees so a
 * winter arc stays low and does not fill the band like a summer one. A
 * Stockholm November arc peaks at 13° a third of the way up; a Nairobi
 * equinox fills it. Under the horizon nothing is drawn on the page: a
 * body or a ring that is under sits ON the line (`under`), where it is
 * in azimuth.
 *
 * Across: today's own span — the azimuths where the track enters and
 * leaves the chart, with a margin — not fixed east and west, so a June
 * sun that rises at 40° and a November one at 123° both fill the width.
 * South of the equator the reader faces north and azimuth is measured
 * from north, so east is on the right (as the engine already mirrors
 * the moon). Within TRACK_ZENITH_ABOVE of the zenith the azimuth flips
 * at transit and the body is placed across by its hour instead, which
 * is the current hero's `daylight` fraction.
 *
 * Circumpolar (the midnight sun): the track never meets the chart's
 * floor, so the whole circle is drawn, midnight at the edges and noon
 * in the middle. The polar night: the track is wholly under, so only
 * the horizon, the outline and the ring are seen.
 *
 * Pure functions throughout; `HeroTrack` only draws what `trackFrame`
 * returns. See docs/design (the "Hero: Track" plan) for the sketch.
 */
import { moonPosition, sunPosition, type SkyPosition } from './moon';

/** The chart's top is at least this high, degrees, so winter arcs stay low. */
export const TRACK_MIN_TOP = 45;
/** Peaks past this are placed across by the hour: the azimuth is degenerate at transit. */
export const TRACK_ZENITH_ABOVE = 75;
/** The chart's floor, degrees under the horizon: a body deeper is off the chart. */
export const TRACK_FLOOR = -20;
/** Degrees of margin beyond today's rising and setting azimuths. */
const SPAN_MARGIN = 10;
/** Minutes between samples of the track. */
export const TRACK_STEP_MINUTES = 5;

export type TrackKind = 'sun' | 'moon';

export type TrackPoint = {
  /** Across the band, 0–1. */
  x: number;
  /** Down the band, 0 at today's peak, 1 at the horizon; under the horizon it is 1. */
  y: number;
  /** Degrees above the horizon (negative under it). */
  altitude: number;
  /** True under the horizon: drawn on the line, dotted. */
  under: boolean;
  /** True between now and the next prayer: the stretch drawn stronger. */
  remaining: boolean;
  /** The sample's time, ms. */
  at: number;
};

/** A track point without the per-minute flag: the part that is the day's. */
export type TrackBase = Omit<TrackPoint, 'remaining'>;

export type TrackFrame = {
  kind: TrackKind;
  /**
   * The day's track, the same object for every minute of the same window
   * at the same place (`sampleTrack` keeps it): the drawing builds its
   * paths from this once, not once a minute. `points` is this with the
   * minute's `remaining` flags.
   */
  base: TrackBase[];
  /** The sampled track, in time order, only the samples on the chart (above TRACK_FLOOR). */
  points: TrackPoint[];
  /** The body now, or null when it is off the chart. */
  body: (TrackPoint & { azimuth: number }) | null;
  /** The next prayer, where the body will be then, or null when off the chart. */
  ring: TrackPoint | null;
  /** Today's peak altitude, degrees. */
  peak: number;
  /** The chart's top, degrees (TRACK_MIN_TOP or the peak). */
  top: number;
  /** True when the track never crosses the floor (the midnight sun). */
  circumpolar: boolean;
  /** True when placed across by the hour rather than the azimuth. */
  byHour: boolean;
  /**
   * Where across the body is when it is under the chart's floor (the
   * night's deep, past the twilights), 0–1, or null when it is on the
   * chart. The drawing that shows the depth (HeroTrack's `depth`) stands
   * it on the floor there.
   */
  deep: number | null;
};

export type TrackInput = {
  kind: TrackKind;
  now: Date;
  latitude: number;
  longitude: number;
  /** The window the track is drawn over: the local day for the sun, sunset to sunrise for the moon. */
  from: Date;
  to: Date;
  /** The next prayer's time (the ring), or null. */
  nextAt: Date | null;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function positionOf(kind: TrackKind, at: Date, latitude: number, longitude: number): SkyPosition {
  return kind === 'sun' ? sunPosition(at, latitude, longitude) : moonPosition(at, latitude, longitude);
}

/**
 * Azimuth as the chart reads it: from south-facing (north of the
 * equator) or north-facing (south of it), so the path through the
 * meridian is continuous.
 */
export function chartAzimuth(azimuth: number, latitude: number): number {
  return latitude >= 0 ? azimuth : (azimuth + 180) % 360;
}

/**
 * Where the track enters and leaves the chart, in chart azimuth —
 * the day's span. Null when it never crosses the floor (circumpolar,
 * or wholly under).
 */
export function trackSpan(
  samples: Array<{ altitude: number; azimuth: number }>,
): { from: number; to: number } | null {
  let rise: number | null = null;
  let set: number | null = null;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (prev.altitude < TRACK_FLOOR && cur.altitude >= TRACK_FLOOR) rise = cur.azimuth;
    if (prev.altitude >= TRACK_FLOOR && cur.altitude < TRACK_FLOOR) set = prev.azimuth;
  }
  if (rise == null || set == null) return null;
  return { from: rise, to: set };
}

/**
 * THE DAY'S TRACK IS SAMPLED ONCE.
 *
 * A track is 289 positions of the sun (a day at five minutes) or a night's
 * worth of the moon's, each a page of trigonometry — 1.6 ms on a laptop's
 * JIT, ten times that under Hermes on a phone — and it was sampled afresh
 * every minute, and once per keyframe of a launch run, up to nine times in
 * the run's first render. The track is the window's and the place's, not
 * the minute's: it is sampled once per (body, window, place) and kept;
 * the minute only places the body, the ring and the stretch on it.
 * A handful of windows are kept — today's sun and tonight's moon, and a
 * run's across midnight — and the oldest goes first.
 */
type Sampled = {
  raw: Array<{ at: number; altitude: number; azimuth: number }>;
  peak: number;
  top: number;
  byHour: boolean;
  circumpolar: boolean;
  across: (p: { at: number; azimuth: number }) => number;
  base: TrackBase[];
  /** The span sampled: the window, or the moon's pass. */
  from: number;
  to: number;
};
const SAMPLED_KEEP = 4;
/** How far, in samples, the moon's pass is followed past the night's window: half a day. */
const MOON_PASS_REACH = (12 * 60) / TRACK_STEP_MINUTES;
const sampledCache = new Map<string, Sampled>();
/** Coordinates to ~100 m: a reader's GPS jitter is not a new track. */
const placeKey = (v: number) => v.toFixed(3);

function sampleTrack(kind: TrackKind, t0: number, t1: number, latitude: number, longitude: number): Sampled {
  const key = `${kind}|${t0}|${t1}|${placeKey(latitude)}|${placeKey(longitude)}`;
  const kept = sampledCache.get(key);
  if (kept) {
    // Most recent last, so the oldest is the first the map iterates.
    sampledCache.delete(key);
    sampledCache.set(key, kept);
    return kept;
  }
  const step = TRACK_STEP_MINUTES * 60_000;
  // THE MOON'S WHOLE PASS. The night's window (Maghrib to sunrise) cuts a
  // moon that rises in the night and is still up at dawn — a waning one —
  // or one already up at Maghrib: the window held a rising with no
  // setting, the span came out null, and the chart fell back to the whole
  // circle, so the moon's path was drawn in a quarter of the width. The
  // window only says when the band follows the moon; its path is the pass
  // the night is about — of the passes the window touches, the one with
  // most of it above the horizon in the window (not the tail of
  // yesterday's, still near the line at Maghrib) — followed either side
  // until the moon is off the chart, or half a day has gone.
  let from = t0;
  let to = t1;
  if (kind === 'moon') {
    const on = (at: number) => positionOf(kind, new Date(at), latitude, longitude).altitude >= TRACK_FLOOR;
    let best: { a: number; b: number; up: number } | null = null;
    let run: { a: number; b: number; up: number } | null = null;
    for (let at = t0; at <= t1 + 1; at += step) {
      const alt = positionOf(kind, new Date(at), latitude, longitude).altitude;
      if (alt >= TRACK_FLOOR) {
        const up = alt >= 0 ? 1 : 0;
        run = run != null ? { a: run.a, b: at, up: run.up + up } : { a: at, b: at, up };
        if (!best || run.up >= best.up) best = run;
      } else {
        run = null;
      }
    }
    if (best) {
      from = best.a;
      to = best.b;
      for (let n = 0; n < MOON_PASS_REACH && on(from - step); n++) from -= step;
      for (let n = 0; n < MOON_PASS_REACH && on(to + step); n++) to += step;
      // One sample off the chart either side, so the pass meets the floor.
      from -= step;
      to += step;
    }
  }
  const raw: Array<{ at: number; altitude: number; azimuth: number }> = [];
  for (let at = from; at <= to + 1; at += step) {
    const p = positionOf(kind, new Date(at), latitude, longitude);
    raw.push({ at, altitude: p.altitude, azimuth: chartAzimuth(p.azimuth, latitude) });
  }
  const peak = raw.reduce((m, p) => Math.max(m, p.altitude), -90);
  const top = Math.max(TRACK_MIN_TOP, peak);
  const byHour = peak > TRACK_ZENITH_ABOVE;
  const span = trackSpan(raw);
  const circumpolar = span == null && raw.every(p => p.altitude >= TRACK_FLOOR);
  let across: (p: { at: number; azimuth: number }) => number;
  if (byHour) {
    // Entering and leaving the chart, by the clock.
    const on = raw.filter(p => p.altitude >= TRACK_FLOOR);
    const a = on.length ? on[0].at : t0;
    const b = on.length ? on[on.length - 1].at : t1;
    across = p => (b > a ? clamp01((p.at - a) / (b - a)) : 0.5);
  } else {
    let a: number;
    let b: number;
    if (span) {
      a = span.from - SPAN_MARGIN;
      b = span.to + SPAN_MARGIN;
    } else {
      // Circumpolar, or wholly under: the whole circle. The chart azimuth
      // has noon at 180 and midnight at 0/360, so noon lands in the
      // middle and midnight at the edges, where the seam is.
      a = 0;
      b = 360;
    }
    // A span that runs backwards (a setting azimuth smaller than the
    // rising one, which the chart azimuth avoids but a strange day may
    // not) is read as the circle too.
    if (b <= a) {
      a = 0;
      b = 360;
    }
    across = p => clamp01((p.azimuth - a) / (b - a));
  }
  const base: TrackBase[] = raw
    .filter(p => p.altitude >= TRACK_FLOOR)
    .map(p => ({
      x: across(p),
      y: p.altitude >= 0 ? 1 - clamp01(p.altitude / top) : 1,
      altitude: p.altitude,
      under: p.altitude < 0,
      at: p.at,
    }));
  const sampled: Sampled = { raw, peak, top, byHour, circumpolar, across, base, from, to };
  sampledCache.set(key, sampled);
  while (sampledCache.size > SAMPLED_KEEP) {
    const oldest = sampledCache.keys().next().value;
    if (oldest === undefined) break;
    sampledCache.delete(oldest);
  }
  return sampled;
}

/** Forget the kept tracks (tests). */
export function clearTrackCache(): void {
  sampledCache.clear();
}

/**
 * Today's track, sampled through `from`–`to`, and where the body and the
 * next prayer sit on it. Everything in the band's unit square.
 */
export function trackFrame(input: TrackInput): TrackFrame {
  const { kind, now, latitude, longitude, from, to, nextAt } = input;
  const t0 = from.getTime();
  const t1 = Math.max(t0, to.getTime());
  const { peak, top, byHour, circumpolar, across, base, from: passFrom, to: passTo } = sampleTrack(kind, t0, t1, latitude, longitude);
  // On the pass drawn, or not at all: a moon on another pass (yesterday's,
  // setting at Maghrib) has no place on this one.
  const onPass = (at: number) => at >= passFrom && at <= passTo;
  const nextMs = nextAt ? nextAt.getTime() : null;
  const nowMs = now.getTime();
  const point = (p: { at: number; altitude: number; azimuth: number }): TrackPoint => ({
    x: across(p),
    y: p.altitude >= 0 ? 1 - clamp01(p.altitude / top) : 1,
    altitude: p.altitude,
    under: p.altitude < 0,
    remaining: nextMs != null && p.at >= nowMs && p.at <= nextMs,
    at: p.at,
  });
  const points = base.map(p => ({ ...p, remaining: nextMs != null && p.at >= nowMs && p.at <= nextMs }));
  const here = positionOf(kind, now, latitude, longitude);
  const hereAz = chartAzimuth(here.azimuth, latitude);
  const body =
    here.altitude >= TRACK_FLOOR && onPass(nowMs)
      ? { ...point({ at: nowMs, altitude: here.altitude, azimuth: hereAz }), azimuth: here.azimuth }
      : null;
  let ring: TrackPoint | null = null;
  if (nextAt) {
    const n = positionOf(kind, nextAt, latitude, longitude);
    if (n.altitude >= TRACK_FLOOR && onPass(nextAt.getTime())) {
      ring = point({ at: nextAt.getTime(), altitude: n.altitude, azimuth: chartAzimuth(n.azimuth, latitude) });
    }
  }
  const deep = body == null && onPass(nowMs) ? across({ at: nowMs, azimuth: hereAz }) : null;
  return { kind, base, points, body, ring, peak, top, circumpolar, byHour, deep };
}

/**
 * Which body the band follows: the sun by day and through the
 * twilights, the moon through the night — the body that is actually the
 * hour's. The sun's window is the local day; the moon's the night, from
 * the evening's Maghrib to the morning's sunrise.
 */
export function trackWindow(
  passage: 'night' | 'dawn' | 'day' | 'sunset' | 'dusk',
  now: Date,
  night: { maghrib: Date; sunrise: Date } | null,
): { kind: TrackKind; from: Date; to: Date } {
  if (passage === 'night' && night && night.sunrise.getTime() > night.maghrib.getTime()) {
    return { kind: 'moon', from: night.maghrib, to: night.sunrise };
  }
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { kind: 'sun', from, to };
}
