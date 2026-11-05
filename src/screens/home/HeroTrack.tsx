import { memo, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { TYPE } from '../../theme/typography';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { MOON, Moon, moonLitPath, NEW_MOON_BELOW, SUN_R } from './HeroSky';
import { type SkyFrame } from './skyModel';
import { SUN_SURFACE, tintedBy } from './skyLight';
import { type TrackBase, type TrackFrame } from './trackModel';

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
  horizon: string;
  /** The next prayer, beside its ring. */
  prayer: string;
};
/** The names' width, dp: wide enough for a word or two, centred on their place. */
const LABEL_W = 120;
/** The names keep off the screen's edge by the page's own margin, dp. */
const LABEL_INSET = 24;

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
  horizon,
  ink,
  run,
  labels,
}: {
  track: TrackFrame;
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
  /** The hairline's y, dp from the sky's top. */
  horizon: number;
  /** The hero's ink at the band, hex. */
  ink: string;
}) {
  const body = frame.body;
  const margin = MOON / 2;
  const roomTop = bandTop + margin;
  const room = Math.max(0, horizon - roomTop);
  /**
   * THE BITMAP IS THE BAND'S. On Android every <Svg> is an ARGB bitmap the
   * size of its view (HeroSky draws the sky as views for that reason), and
   * this one ran from the sky's top — under the status bar and the chrome
   * row, where nothing of the chart is ever drawn. It now starts at the
   * band: a third to a half less on a phone, the same drawing, the
   * coordinates kept by the viewBox's offset.
   */
  const svgTop = Math.max(0, Math.floor(bandTop - 2));
  const height = Math.max(1, Math.ceil(horizon + UNDER_R + 2) - svgTop);
  const X = (p: TrackBase) => p.x * width;
  const Y = (p: TrackBase) => (p.under ? horizon : roomTop + p.y * room);

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
  const drawn = useMemo(() => {
    const stretch: string[] = [];
    const alongLine: { x1: number; x2: number }[] = [];
    const pts = track.points;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      if (!p.remaining || !prev.remaining) continue;
      if (Math.abs(p.x - prev.x) > 0.5) continue;
      if (!p.under && !prev.under) {
        stretch.push(`M${X(prev).toFixed(1)} ${Y(prev).toFixed(1)} L${X(p).toFixed(1)} ${Y(p).toFixed(1)}`);
      } else if (p.under && prev.under) {
        alongLine.push({ x1: X(prev), x2: X(p) });
      }
    }
    return { above, stretch: stretch.join(' '), alongLine };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [above, track.points, width, roomTop, room, horizon]);

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
  }, [run, width, roomTop, room, horizon]);
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
            <View style={{ marginLeft: -sunR, marginTop: -sunR, width: sunR * 2, height: sunR * 2, borderRadius: sunR, backgroundColor: body.light }} />
          ) : (
            <View style={{ marginLeft: -MOON / 2, marginTop: -MOON / 2, width: MOON, height: MOON }}>
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
      {running
        ? null
        : drawn.alongLine.map((l, i) => (
            <Line key={`u${i}`} x1={l.x1} y1={horizon} x2={l.x2} y2={horizon} stroke={ink} strokeWidth={1.25} strokeOpacity={0.6} strokeDasharray="1 3" />
          ))}
      {drawn.stretch && !running ? (
        <Path d={drawn.stretch} stroke={ink} strokeWidth={STRETCH_W} strokeOpacity={0.6} strokeLinecap="round" fill="none" />
      ) : null}
      <Line x1={0} y1={horizon} x2={width} y2={horizon} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.5} />
      {!running && at && !at.under && body.kind === 'sun' ? (
        <G clipPath={`url(#${clipId})`}>
          <Circle cx={X(at)} cy={Y(at) + 2 * body.below * sunR} r={sunR} fill={body.light} fillOpacity={body.alpha} />
        </G>
      ) : null}
      {!running && at && !at.under && body.kind === 'moon' ? (
        <MoonDisc cx={X(at)} cy={Y(at)} illuminated={body.illuminated} tilt={body.tilt} lit={body.light} alpha={body.alpha} />
      ) : null}
      {!running && at && at.under ? (
        <Circle cx={X(at)} cy={horizon} r={UNDER_R} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.8} fill="none" />
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
    let peak: TrackBase | null = null;
    for (const p of track.base) if (!p.under && (!peak || p.y < peak.y)) peak = p;
    const ringX = ring ? X(ring) : null;
    const ringY = ring ? Y(ring) : null;
    const ringOnRight = ringX != null && ringX > width - LABEL_W - 16;
    // The horizon is named at the line's start, or at its end when the
    // ring's name would sit on it there.
    const horizonRight = ringX != null && ringX < LABEL_W + 2 * LABEL_INSET;
    return (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: labels.opacity }]} pointerEvents="none">
        {peak ? (
          <Text
            numberOfLines={1}
            style={[styles.label, styles.centre, { color: ink, left: X(peak) - LABEL_W / 2, top: Y(peak) - 18 }]}>
            {labels.path}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            horizonRight ? styles.end : null,
            { color: ink, top: horizon - 16, left: horizonRight ? width - LABEL_W - LABEL_INSET : LABEL_INSET },
          ]}>
          {labels.horizon}
        </Text>
        {ringX != null && ringY != null ? (
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              ringOnRight ? styles.end : null,
              { color: ink, top: ringY - 16, left: ringOnRight ? ringX - LABEL_W - 6 : ringX + 6 },
            ]}>
            {labels.prayer}
          </Text>
        ) : null}
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
          {at && at.under ? (
            <Circle cx={X(at)} cy={horizon} r={UNDER_R} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.8} fill="none" />
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
    width: LABEL_W,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
    opacity: 0.75,
  },
  centre: { textAlign: 'center' },
  end: { textAlign: 'right' },
  svg: { position: 'absolute', left: 0, top: 0 },
  clip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  origin: { position: 'absolute', left: 0, top: 0 },
});
