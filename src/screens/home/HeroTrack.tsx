import { memo, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { MOON, Moon, moonLitPath, NEW_MOON_BELOW, SUN_R } from './HeroSky';
import { type SkyFrame } from './skyModel';
import { SUN_SURFACE, tintedBy } from './skyLight';
import { type TrackFrame, type TrackPoint } from './trackModel';

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
}: {
  track: TrackFrame;
  frame: SkyFrame;
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
  const height = Math.ceil(horizon + UNDER_R + 2);
  const X = (p: TrackPoint) => p.x * width;
  const Y = (p: TrackPoint) => (p.under ? horizon : roomTop + p.y * room);

  const drawn = useMemo(() => {
    const above: { d: string; stroke: string }[] = [];
    const stretch: string[] = [];
    const alongLine: { x1: number; x2: number }[] = [];
    const pts = track.points;
    let run: TrackPoint[] = [];
    const flush = () => {
      if (run.length > 1) {
        const mid = run[Math.floor(run.length / 2)];
        const stroke = track.kind === 'sun' ? tintedBy(SUN_SURFACE, mid.altitude) : (body.kind === 'moon' ? body.light : ink);
        above.push({ d: run.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)} ${Y(p).toFixed(1)}`).join(' '), stroke });
      }
      run = [];
    };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      // The seam of a circumpolar circle, and the horizon: a run ends.
      const seam = prev && Math.abs(p.x - prev.x) > 0.5;
      if (p.under || seam || (prev && prev.under)) flush();
      if (!p.under) {
        run.push(p);
        if (run.length >= TINT_RUN + 1) {
          flush();
          run = [p];
        }
      }
      if (prev && p.remaining && prev.remaining) {
        if (!p.under && !prev.under && !seam) {
          stretch.push(`M${X(prev).toFixed(1)} ${Y(prev).toFixed(1)} L${X(p).toFixed(1)} ${Y(p).toFixed(1)}`);
        } else if (p.under && prev.under && !seam) {
          alongLine.push({ x1: X(prev), x2: X(p) });
        }
      }
    }
    flush();
    return { above, stretch: stretch.join(' '), alongLine };
    // X and Y are closures over the layout numbers, which the deps carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, width, roomTop, room, horizon, ink, body]);

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
      <View style={{ position: 'absolute', left: 0, top: 0, width, height: Math.max(0, horizon), overflow: 'hidden' }} pointerEvents="none">
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
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
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={styles.svg} pointerEvents="none">
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
  if (!ride) return svg;
  // The run: the chart, then the end's stretch and outline fading in,
  // then the body riding.
  return (
    <>
      {svg}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: ride.end }]} pointerEvents="none">
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={styles.svg} pointerEvents="none">
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
  svg: { position: 'absolute', left: 0, top: 0 },
});
