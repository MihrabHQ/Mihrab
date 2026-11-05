import { memo, useMemo } from 'react';
import { Animated, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { LABEL_FONT, LABEL_LINE, LABEL_MAX_SCALE, placeTrackLabels } from './trackLabels';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { MOON, Moon, moonLitPath, NEW_MOON_BELOW, SUN_R } from './HeroSky';
import { type SkyFrame } from './skyModel';
import { SUN_SURFACE, tintedBy } from './skyLight';
import { acrossNight, TRACK_FLOOR, TRACK_STEP_MINUTES, type TrackBase, type TrackFrame } from './trackModel';

/**
 * The Track look's drawing — see trackModel.ts for what it is and why.
 *
 * One SVG the size of the sky band and nothing taller: react-native-svg
 * backs every <Svg> with a bitmap of its own size on Android (HeroSky's
 * reason for drawing the sky as views), and a band's worth is a few
 * hundred kilobytes rather than a screen's fourteen megabytes. Redrawn
 * once a minute with the frame, as the sky is; nothing animates.
 *
 * The lines are the countdown's ink at low opacity, so they flip with
 * the sky as the text does and can never be louder than the figures.
 * The track above the horizon is coloured by the body's own light along
 * its length — pale at the top, orange at both ends, from the same
 * `tintedBy` the sun's disc is coloured with — so the one coloured line
 * is computed, not chosen.
 */
/** The chart's parts named, shown on a tap of the band (TrackExplainer). */
export type TrackLabels = {
  /** Asked for: drawn only then. */
  open: boolean;
  /** Their fade in, native-driven. */
  opacity: Animated.Value;
  /** "Sun's path" or "Moon's path". */
  path: string;
  /** "Sun below the horizon" or "Moon below the horizon": when none of the track is up. */
  below: string;
  horizon: string;
  /** The next prayer, beside its ring. */
  prayer: string;
};

/** The track's weight, dp, and the stretch's. */
const TRACK_W = 0.75;
const STRETCH_W = 1.25;
/** How many samples share one tint: a tint every twenty minutes is one no eye can see change. */
const TINT_RUN = 4;
/** The ring's radius, dp; the outline's, for a body under the line. */
const RING_R = 3.5;
const UNDER_R = 4;

function HeroTrackImpl({
  track,
  frame,
  width,
  bandTop,
  horizon: given,
  ink,
  run,
  labels,
  depth = false,
}: {
  track: TrackFrame;
  /**
   * THE DEPTH UNDER THE LINE (Minimal under the Track). The chart goes on
   * under the horizon to its floor, to the same scale as above it: the
   * sun's path down into the twilights and up out of them, the ring at
   * Fajr or Isha where the sun will be then — the depth those prayers
   * are reckoned by — and a sun past the floor (the night's deep)
   * standing on the floor. `horizon` is then the floor's y; the line is
   * placed above it so that a degree is the same height either side.
   */
  depth?: boolean;
  frame: SkyFrame;
  labels?: TrackLabels;
  /**
   * A launch run (HeroSky's SkyRun): the chart, the horizon and the ring
   * are drawn as they will be at the run's end, and the body rides the
   * run's native progress along the track through the keyframes'
   * places, as the painted sky's body rides its layers. The stretch —
   * from the body to the ring — fades in over the run's last part, since
   * it is the end's. When the run ends the live drawing takes over at
   * the same place.
   */
  run?: { tracks: Array<TrackFrame | null>; progress: Animated.Value };
  width: number;
  /** The band's top, dp from the sky's top: the foot of the chrome row. */
  bandTop: number;
  /** The hairline's y, dp from the sky's top — or, with `depth`, the floor's. */
  horizon: number;
  /** The hero's ink at the band, hex. */
  ink: string;
}) {
  const body = frame.body;
  const margin = MOON / 2;
  const roomTop = bandTop + margin;
  // With the depth, the band is the chart from its top to its floor, and
  // the line divides it in the ratio of the degrees either side.
  const floor = given;
  const below = -TRACK_FLOOR;
  const horizon = depth ? roomTop + Math.max(0, floor - roomTop) * (track.top / (track.top + below)) : given;
  const room = Math.max(0, horizon - roomTop);
  const deepRoom = Math.max(0, floor - horizon);
  /**
   * THE BITMAP IS THE BAND'S. On Android every <Svg> is an ARGB bitmap the
   * size of its view (HeroSky draws the sky as views for that reason), and
   * this one ran from the sky's top — under the status bar and the chrome
   * row, where nothing of the chart is ever drawn. It now starts at the
   * band: a third to a half less on a phone, the same drawing, the
   * coordinates kept by the viewBox's offset.
   */
  const svgTop = Math.max(0, Math.floor(bandTop - 2));
  const height = Math.max(1, Math.ceil(floor + UNDER_R + 2) - svgTop);
  const X = (p: TrackBase) => p.x * width;
  const Y = (p: TrackBase) =>
    !p.under
      ? roomTop + p.y * room
      : depth
        ? horizon + Math.min(1, -p.altitude / below) * deepRoom
        : horizon;

  /**
   * THE DAY'S LINES ARE BUILT ONCE. The tinted track is the window's
   * (`track.base` is the same object all day, trackModel's cache), so its
   * paths are built when the day or the layout changes, not once a
   * minute; only the stretch — now to the ring — is the minute's.
   */
  const moonLight = body.kind === 'moon' ? body.light : null;
  const above = useMemo(() => {
    const out: { d: string; stroke: string }[] = [];
    const pts = track.base;
    let seg: typeof pts = [];
    const flush = () => {
      if (seg.length > 1) {
        const mid = seg[Math.floor(seg.length / 2)];
        const stroke = track.kind === 'sun' ? tintedBy(SUN_SURFACE, mid.altitude) : (moonLight ?? ink);
        out.push({ d: seg.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)} ${Y(p).toFixed(1)}`).join(' '), stroke });
      }
      seg = [];
    };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      // The seam of a circumpolar circle, and the horizon: a run ends.
      const seam = prev && Math.abs(p.x - prev.x) > 0.5;
      if (p.under || seam || (prev && prev.under)) flush();
      if (!p.under) {
        seg.push(p);
        if (seg.length >= TINT_RUN + 1) {
          flush();
          seg = [p];
        }
      }
    }
    flush();
    return out;
    // X and Y are closures over the layout numbers, which the deps carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.base, track.kind, width, roomTop, room, horizon, ink, moonLight]);
  /**
   * Under the line, with the depth: the track on down to the floor, in the
   * ink, fainter than the sky's part — the sun is not seen there, only
   * reckoned. A run breaks where the track leaves the chart (past the
   * floor, a gap in the samples) and at a circumpolar seam.
   */
  const step = TRACK_STEP_MINUTES * 60_000;
  const breaks = (p: TrackBase, prev: TrackBase) => Math.abs(p.x - prev.x) > 0.5 || p.at - prev.at > step * 1.5;
  const under = useMemo(() => {
    if (!depth) return '';
    const pts = track.base;
    const parts: string[] = [];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      if ((!p.under && !prev.under) || breaks(p, prev)) continue;
      parts.push(`M${X(prev).toFixed(1)} ${Y(prev).toFixed(1)} L${X(p).toFixed(1)} ${Y(p).toFixed(1)}`);
    }
    return parts.join(' ');
    // X, Y and breaks are closures over the layout numbers, which the deps carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth, track.base, width, roomTop, room, horizon, deepRoom]);
  const drawn = useMemo(() => {
    const stretch: string[] = [];
    const alongLine: { x1: number; x2: number }[] = [];
    const pts = track.points;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      if (!p.remaining || !prev.remaining) continue;
      if (Math.abs(p.x - prev.x) > 0.5) continue;
      if (depth) {
        // To the floor and back: the stretch follows the track either side of the line.
        if (!breaks(p, prev)) stretch.push(`M${X(prev).toFixed(1)} ${Y(prev).toFixed(1)} L${X(p).toFixed(1)} ${Y(p).toFixed(1)}`);
      } else if (!p.under && !prev.under) {
        stretch.push(`M${X(prev).toFixed(1)} ${Y(prev).toFixed(1)} L${X(p).toFixed(1)} ${Y(p).toFixed(1)}`);
      } else if (p.under && prev.under) {
        alongLine.push({ x1: X(prev), x2: X(p) });
      }
    }
    // Across the floor, only while the body is on it: the night from where
    // the track left the chart to where it comes back, and of it the part
    // still to go — from the body to the next prayer, or to where the body
    // comes back up when the prayer is past that.
    const night = depth && track.deep != null ? track.night : null;
    const floorLine = night ? { x1: night.x1 * width, x2: night.x2 * width } : null;
    let floorStretch: { x1: number; x2: number } | null = null;
    if (night && track.deep != null && track.nextAt != null) {
      floorStretch = { x1: track.deep * width, x2: acrossNight(night, Math.min(track.nextAt, night.at2)) * width };
    }
    return { above, stretch: stretch.join(' '), alongLine, floorLine, floorStretch };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [above, track.points, track.deep, track.night, track.nextAt, width, roomTop, room, horizon, depth, deepRoom]);

  const ring = track.ring;
  const at = track.body;
  const sunR = SUN_R;
  const clipId = 'track-horizon';
  const running = !!run;
  /**
   * The run's body: its place at each keyframe, held where the chart has
   * none, and seen only where it is up — interpolated through the run's
   * progress, native-driven, as HeroSky's run bodies are.
   */
  const ride = useMemo(() => {
    if (!run) return null;
    const K = run.tracks.length;
    const es = run.tracks.map((_, i) => (K <= 1 ? 1 : i / (K - 1)));
    const places = run.tracks.map(t => (t && t.body ? { x: X(t.body), y: Y(t.body), up: !t.body.under } : null));
    let held = places.find(p => p != null) ?? { x: 0, y: horizon, up: false };
    const xs = places.map(p => (held = p ?? held).x);
    held = places.find(p => p != null) ?? { x: 0, y: horizon, up: false };
    const ys = places.map(p => (held = p ?? held).y);
    const ups = places.map(p => (p && p.up ? 1 : 0));
    const through = (values: number[]) =>
      K <= 1
        ? run.progress.interpolate({ inputRange: [0, 1], outputRange: [values[0], values[0]] })
        : run.progress.interpolate({ inputRange: es, outputRange: values, extrapolate: 'clamp' });
    return {
      tx: through(xs),
      ty: through(ys),
      up: through(ups),
      // The end's stretch and its under-the-line outline come in over the last third.
      end: run.progress.interpolate({ inputRange: [0.66, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    };
    // X and Y are closures over the layout numbers, which the deps carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, width, roomTop, room, horizon, deepRoom]);
  const bodyView =
    ride && body.kind !== 'none' ? (
      <View style={[styles.clip, { width, height: Math.max(0, horizon) }]} pointerEvents="none">
        <Animated.View
          style={{
            ...styles.origin,
            opacity: Animated.multiply(ride.up, body.alpha),
            transform: [{ translateX: ride.tx }, { translateY: ride.ty }],
          }}>
          {body.kind === 'sun' ? (
            <View style={{ transform: [{ translateX: -sunR }, { translateY: -sunR }], width: sunR * 2, height: sunR * 2, borderRadius: sunR, backgroundColor: body.light }} />
          ) : (
            <View style={{ transform: [{ translateX: -MOON / 2 }, { translateY: -MOON / 2 }], width: MOON, height: MOON }}>
              <Moon illuminated={body.illuminated} tilt={body.tilt} lit={body.light} />
            </View>
          )}
        </Animated.View>
      </View>
    ) : null;
  const svg = (
    <Svg width={width} height={height} viewBox={`0 ${svgTop} ${width} ${height}`} style={[styles.svg, { top: svgTop }]} pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={width} height={Math.max(0, horizon)} />
        </ClipPath>
      </Defs>
      {drawn.above.map((seg, i) => (
        <Path key={i} d={seg.d} stroke={seg.stroke} strokeWidth={TRACK_W} strokeOpacity={0.55} strokeLinecap="round" fill="none" />
      ))}
      {under ? <Path d={under} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.3} strokeLinecap="round" fill="none" /> : null}
      {/* The night's dotted crossing only while the sun is on it: out of
          the night the floor is empty, and the line at the edges reads as
          the track leaving the chart and coming back. */}
      {drawn.floorLine ? (
        <Line x1={drawn.floorLine.x1} y1={floor} x2={drawn.floorLine.x2} y2={floor} stroke={ink} strokeWidth={1.25} strokeOpacity={0.35} strokeDasharray="1 3" />
      ) : null}
      {!running && drawn.floorStretch ? (
        <Line x1={drawn.floorStretch.x1} y1={floor} x2={drawn.floorStretch.x2} y2={floor} stroke={ink} strokeWidth={1.25} strokeOpacity={0.75} strokeDasharray="1 3" />
      ) : null}
      {depth && track.start ? (
        // The interval's prayer — Isha through the night — where it was: the
        // other end of what the countdown measures, quieter than the ring.
        <Circle cx={X(track.start)} cy={Y(track.start)} r={RING_R - 1} stroke={ink} strokeWidth={1} strokeOpacity={0.55} fill="none" />
      ) : null}
      {running
        ? null
        : drawn.alongLine.map((l, i) => (
            <Line key={`u${i}`} x1={l.x1} y1={horizon} x2={l.x2} y2={horizon} stroke={ink} strokeWidth={1.25} strokeOpacity={0.6} strokeDasharray="1 3" />
          ))}
      {drawn.stretch && !running ? (
        <Path d={drawn.stretch} stroke={ink} strokeWidth={STRETCH_W} strokeOpacity={0.6} strokeLinecap="round" fill="none" />
      ) : null}
      <Line x1={0} y1={horizon} x2={width} y2={horizon} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.5} />
      {!running && at && !at.under && body.kind === 'sun' && track.kind === 'sun' ? (
        <G clipPath={`url(#${clipId})`}>
          <Circle cx={X(at)} cy={Y(at) + 2 * body.below * sunR} r={sunR} fill={body.light} fillOpacity={body.alpha} />
        </G>
      ) : null}
      {!running && at && !at.under && body.kind === 'moon' && track.kind === 'moon' ? (
        <MoonDisc cx={X(at)} cy={Y(at)} illuminated={body.illuminated} tilt={body.tilt} lit={body.light} alpha={body.alpha} />
      ) : null}
      {!running && at && at.under ? (
        <Circle cx={X(at)} cy={Y(at)} r={UNDER_R} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.8} fill="none" />
      ) : null}
      {!running && depth && !at && track.deep != null ? (
        // Past the floor: standing on it, where it will come up from.
        <Circle cx={track.deep * width} cy={floor} r={UNDER_R} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.8} fill="none" />
      ) : null}
      {ring ? (
        <Circle cx={X(ring)} cy={Y(ring)} r={RING_R} stroke={ink} strokeWidth={1} strokeOpacity={0.95} fill="none" />
      ) : null}
    </Svg>
  );
  /**
   * THE NAMES, WHERE THE PARTS ARE. Three words in the eyebrow's muted
   * ink, small: the path over the arc's highest point, the horizon at the
   * line's start, the prayer beside its ring (on the side with room). No
   * box, no rule, no arrow: the chart is the diagram. They are drawn only
   * while asked for, and take no touches, so the band stays the tap.
   */
  const named = (() => {
    if (!labels || !labels.open) return null;
    const placed = placeTrackLabels(
      track,
      { width, bandTop, horizon, bottom: depth ? floor : undefined, X, Y },
      { path: labels.path, below: labels.below, horizon: labels.horizon, prayer: labels.prayer },
      PixelRatio.getFontScale(),
    );
    return (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: labels.opacity }]} pointerEvents="none">
        {placed.map(l => (
          <Text
            key={l.key}
            numberOfLines={1}
            maxFontSizeMultiplier={LABEL_MAX_SCALE}
            style={[styles.label, { color: ink, left: l.x, top: l.y, width: l.w, textAlign: l.align }]}>
            {l.text}
          </Text>
        ))}
      </Animated.View>
    );
  })();
  if (!ride) {
    return named ? (
      <>
        {svg}
        {named}
      </>
    ) : (
      svg
    );
  }
  // The run: the chart, then the end's stretch and outline fading in,
  // then the body riding.
  return (
    <>
      {svg}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: ride.end }]} pointerEvents="none">
        <Svg width={width} height={height} viewBox={`0 ${svgTop} ${width} ${height}`} style={[styles.svg, { top: svgTop }]} pointerEvents="none">
          {drawn.alongLine.map((l, i) => (
            <Line key={`u${i}`} x1={l.x1} y1={horizon} x2={l.x2} y2={horizon} stroke={ink} strokeWidth={1.25} strokeOpacity={0.6} strokeDasharray="1 3" />
          ))}
          {drawn.stretch ? (
            <Path d={drawn.stretch} stroke={ink} strokeWidth={STRETCH_W} strokeOpacity={0.6} strokeLinecap="round" fill="none" />
          ) : null}
          {drawn.floorStretch ? (
            <Line x1={drawn.floorStretch.x1} y1={floor} x2={drawn.floorStretch.x2} y2={floor} stroke={ink} strokeWidth={1.25} strokeOpacity={0.75} strokeDasharray="1 3" />
          ) : null}
          {at && at.under ? (
            <Circle cx={X(at)} cy={Y(at)} r={UNDER_R} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.8} fill="none" />
          ) : null}
        </Svg>
      </Animated.View>
      {bodyView}
      {named}
    </>
  );
}

/** The moon in its phase and tilt, drawn in the track's own SVG (HeroSky's Moon is a view of its own). */
const MoonDisc = memo(function TrackMoon({
  cx,
  cy,
  illuminated,
  tilt,
  lit,
  alpha,
}: {
  cx: number;
  cy: number;
  illuminated: number;
  tilt: number;
  lit: string;
  alpha: number;
}) {
  const r = 9;
  const litPath = useMemo(() => moonLitPath(illuminated, cx, cy, r), [illuminated, cx, cy]);
  return (
    <G rotation={tilt} origin={`${cx}, ${cy}`} opacity={alpha}>
      {litPath ? (
        <Path d={litPath} fill={lit} />
      ) : (
        <Circle cx={cx} cy={cy} r={r} fill={lit} fillOpacity={illuminated <= NEW_MOON_BELOW ? 0.18 : 1} />
      )}
    </G>
  );
});

export const HeroTrack = memo(HeroTrackImpl);

const styles = StyleSheet.create({
  // The chart's names: the footnote's little sibling, muted, untracked.
  label: {
    position: 'absolute',
    fontSize: LABEL_FONT,
    lineHeight: LABEL_LINE,
    opacity: 0.75,
  },
  svg: { position: 'absolute', left: 0, top: 0 },
  clip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  origin: { position: 'absolute', left: 0, top: 0 },
});
