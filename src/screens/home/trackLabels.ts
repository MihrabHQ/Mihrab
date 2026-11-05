/**
 * Where the Track's names go when the band is tapped (TrackExplainer).
 *
 * The chart is not one picture but many: a low November arc and a summer
 * one that fills the band, a tent to the zenith at the equator, a whole
 * circle under the midnight sun, nothing above the line at all in the
 * polar night or on a moonless night, a ring at the arc's top at Dhuhr or
 * on the line at Fajr, a band of 44 dp on a short phone and 96 on a desk,
 * names in thirteen languages at any text size. So the names are not
 * pinned to fixed offsets; each has a few places it may stand, tried in
 * order, and takes the first that is inside the band, above the line,
 * clear of the screen's edges, and clear of the body, the ring and the
 * names already placed. A name with no such place is left out rather
 * than drawn over something — the band's tap still reads the whole
 * sentence to a screen reader.
 *
 * In order of what matters: the path (what the curve is), then the
 * horizon (what the line is), then the prayer at its ring. When nothing of
 * the track is above the line (the polar night, a moon that is down all
 * night) the first name says so instead — "Sun below the horizon" — and
 * stands over the body's place on the line.
 *
 * Pure: the drawing and the tests place the same names the same way.
 */
import type { TrackBase, TrackFrame } from './trackModel';

export type LabelKey = 'path' | 'horizon' | 'prayer';

export type PlacedLabel = {
  key: LabelKey;
  text: string;
  /** Box, dp from the sky's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  align: 'left' | 'center' | 'right';
};

export type LabelGeometry = {
  width: number;
  /** The band's top: names stay under it. */
  bandTop: number;
  /** The hairline: names stay above it. */
  horizon: number;
  /**
   * The chart's floor, when it goes on under the line (HeroTrack's
   * `depth`): names may stand under the line too, down to it — a ring at
   * Fajr is under it — but never across it.
   */
  bottom?: number;
  /** A point on the chart to dp. */
  X: (p: TrackBase) => number;
  Y: (p: TrackBase) => number;
};

export type LabelTexts = {
  /** "Sun's path" / "Moon's path". */
  path: string;
  /** "Sun below the horizon" / "Moon below the horizon": the path's name when none of it is up. */
  below: string;
  horizon: string;
  /** The next prayer's name. */
  prayer: string;
};

/** The names' type: caption, as styled in HeroTrack. */
export const LABEL_FONT = 11;
export const LABEL_LINE = 14;
/** Text sizes past this are not followed by the names (they would not fit a band). */
export const LABEL_MAX_SCALE = 1.3;
/** Off the screen's edge, as the page's own margin. */
export const LABEL_INSET = 24;
/** Between a name and what it names. */
const GAP = 6;
/** Around the body and the ring, which a name must not cover. */
const BODY_R = 12;
const RING_R = 6;

/**
 * A name's width, estimated: the names are drawn on one line and placed
 * before they are laid out. Generous rather than tight — a box too wide
 * only costs a candidate place; one too narrow lets two names touch.
 */
export function labelWidth(text: string, fontScale = 1): number {
  const scale = Math.min(LABEL_MAX_SCALE, Math.max(1, fontScale));
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      (c >= 0x2e80 && c <= 0x9fff) ||
      (c >= 0xac00 && c <= 0xd7af) ||
      (c >= 0xff00 && c <= 0xffef)
    )
      em += 1.0;
    else if (c >= 0x0900 && c <= 0x0dff) em += 0.62; // Devanagari, Bengali
    else if (c >= 0x0600 && c <= 0x06ff) em += 0.5; // Arabic, Urdu
    else if (ch === ' ') em += 0.28;
    else em += 0.58;
  }
  return Math.ceil(em * LABEL_FONT * scale) + 4;
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function placeTrackLabels(
  track: TrackFrame,
  g: LabelGeometry,
  texts: LabelTexts,
  fontScale = 1,
): PlacedLabel[] {
  const h = Math.ceil(
    LABEL_LINE * Math.min(LABEL_MAX_SCALE, Math.max(1, fontScale)),
  );
  const minX = LABEL_INSET;
  const maxX = g.width - LABEL_INSET;
  const minY = g.bandTop + 2;
  const maxY = (g.bottom ?? g.horizon) - 2;
  const crosses = (b: Box) => b.y < g.horizon + 2 && b.y + b.h > g.horizon - 2;
  const fits = (b: Box) =>
    b.x >= minX && b.x + b.w <= maxX && b.y >= minY && b.y + b.h <= maxY && !crosses(b);
  const attempt = (horizonFirst: boolean): PlacedLabel[] => {
    // What a name must not cover: the body, the ring.
    const taken: Box[] = [];
    const around = (cx: number, cy: number, r: number): Box => ({
      x: cx - r,
      y: cy - r,
      w: 2 * r,
      h: 2 * r,
    });
    if (track.body)
      taken.push(around(g.X(track.body), g.Y(track.body), BODY_R));
    if (track.ring)
      taken.push(around(g.X(track.ring), g.Y(track.ring), RING_R));
    const placed: PlacedLabel[] = [];
    const tryPlace = (
      key: LabelKey,
      text: string,
      candidates: Array<Omit<PlacedLabel, 'key' | 'text' | 'h'>>,
    ) => {
      for (const c of candidates) {
        const box = { x: c.x, y: c.y, w: c.w, h };
        if (!fits(box)) continue;
        if (taken.some(t => overlaps(t, box))) continue;
        placed.push({ key, text, ...c, h });
        taken.push(box);
        return;
      }
    };
    const centred = (cx: number, y: number, w: number) => ({
      x: cx - w / 2,
      y,
      w,
      align: 'center' as const,
    });

    // The horizon, on its line: at an end, then anywhere along it, a step
    // at a time, for a line whose ends hold the body, the ring or a name.
    const placeHorizon = () => {
      const w = labelWidth(texts.horizon, fontScale);
      const y = g.horizon - 2 - h;
      const along: Array<Omit<PlacedLabel, 'key' | 'text' | 'h'>> = [];
      for (let x = minX + 16; x + w <= maxX - 16; x += 16)
        along.push({ x, y, w, align: 'left' });
      tryPlace('horizon', texts.horizon, [
        { x: minX, y, w, align: 'left' },
        { x: maxX - w, y, w, align: 'right' },
        ...along,
      ]);
    };

    // 1. The path, or that it is below. With nothing of it up the line is
    // all there is, so it is named first and the "below" goes over it.
    const up = track.base.filter(p => !p.under);
    const lineFirst = horizonFirst || up.length <= 1;
    if (lineFirst) placeHorizon();
    if (up.length > 1) {
      const w = labelWidth(texts.path, fontScale);
      let peak: TrackBase = up[0];
      for (const p of up) if (p.y < peak.y) peak = p;
      const px = g.X(peak);
      const py = g.Y(peak);
      // Beside the curve halfway up a side: the point a third of the way
      // from the side's foot to the peak.
      const side = (from: TrackBase) => {
        const fx = g.X(from);
        const fy = g.Y(from);
        return { x: fx + (px - fx) * 0.4, y: fy + (py - fy) * 0.6 };
      };
      const rise = side(up[0]);
      const set = side(up[up.length - 1]);
      tryPlace('path', texts.path, [
        // Over the arc's top.
        centred(px, py - GAP - h, w),
        // Under it, inside the arc (a summer arc or a zenith fills the band).
        centred(px, py + GAP, w),
        // Beside the rising side, outward; then the setting side.
        { x: rise.x - GAP - w, y: rise.y - h / 2, w, align: 'right' },
        { x: set.x + GAP, y: set.y - h / 2, w, align: 'left' },
        // Beside the sides, inward.
        { x: rise.x + GAP, y: rise.y - h / 2, w, align: 'left' },
        { x: set.x - GAP - w, y: set.y - h / 2, w, align: 'right' },
      ]);
    } else {
      // Nothing of it up: the polar night, a moon down all night. Over the
      // body's place on the line, or the middle of the line if it is off
      // the chart.
      const w = labelWidth(texts.below, fontScale);
      const bx = track.body ? g.X(track.body) : g.width / 2;
      const y = g.horizon - GAP - h;
      // Over the body; beside it; then a line higher, for a short band
      // whose line holds the ring there too.
      tryPlace('path', texts.below, [
        centred(bx, y, w),
        { x: bx + BODY_R, y, w, align: 'left' },
        { x: bx - BODY_R - w, y, w, align: 'right' },
        centred(bx, y - h, w),
        centred(g.width / 2, y, w),
        centred(g.width / 2, y - h, w),
      ]);
    }

    // 2. The horizon, when there is an arc to name first.
    if (!lineFirst) placeHorizon();

    // 3. The prayer at its ring: beside it, then over, then under.
    if (track.ring) {
      const w = labelWidth(texts.prayer, fontScale);
      const rx = g.X(track.ring);
      const ry = g.Y(track.ring);
      const mid = ry - h / 2;
      tryPlace('prayer', texts.prayer, [
        { x: rx + RING_R + GAP / 2, y: mid, w, align: 'left' },
        { x: rx - RING_R - GAP / 2 - w, y: mid, w, align: 'right' },
        centred(rx, ry - RING_R - 2 - h, w),
        centred(rx, ry + RING_R + 2, w),
        // A ring on the line: up and to a side.
        { x: rx + RING_R, y: ry - RING_R - h, w, align: 'left' },
        { x: rx - RING_R - w, y: ry - RING_R - h, w, align: 'right' },
      ]);
    }
    return placed;
  };

  // The path's best place can take the line's only free stretch — a low
  // arc at dawn or dusk in a short band. The line is what the chart stands
  // on, so then the horizon is named first and the path takes what is left.
  const first = attempt(false);
  if (first.some(l => l.key === 'horizon')) return first;
  const second = attempt(true);
  return second.some(l => l.key === 'horizon') ? second : first;
}
