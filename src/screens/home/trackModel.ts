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

export type TrackFrame = {
  kind: TrackKind;
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
 * Today's track, sampled through `from`–`to`, and where the body and the
 * next prayer sit on it. Everything in the band's unit square.
 */
export function trackFrame(input: TrackInput): TrackFrame {
  const { kind, now, latitude, longitude, from, to, nextAt } = input;
  const step = TRACK_STEP_MINUTES * 60_000;
  const t0 = from.getTime();
  const t1 = Math.max(t0, to.getTime());
  const raw: Array<{ at: number; altitude: number; azimuth: number }> = [];
  for (let at = t0; at <= t1 + 1; at += step) {
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
  const points = raw.filter(p => p.altitude >= TRACK_FLOOR).map(point);
  const here = positionOf(kind, now, latitude, longitude);
  const hereAz = chartAzimuth(here.azimuth, latitude);
  const body =
    here.altitude >= TRACK_FLOOR
      ? { ...point({ at: nowMs, altitude: here.altitude, azimuth: hereAz }), azimuth: here.azimuth }
      : null;
  let ring: TrackPoint | null = null;
  if (nextAt) {
    const n = positionOf(kind, nextAt, latitude, longitude);
    if (n.altitude >= TRACK_FLOOR) {
      ring = point({ at: nextAt.getTime(), altitude: n.altitude, azimuth: chartAzimuth(n.azimuth, latitude) });
    }
  }
  return { kind, points, body, ring, peak, top, circumpolar, byHour };
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
