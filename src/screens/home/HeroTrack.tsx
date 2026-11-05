import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { MOON, moonLitPath, NEW_MOON_BELOW, SUN_R } from './HeroSky';
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
}: {
  track: TrackFrame;
  frame: SkyFrame;
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
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={styles.svg} pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={width} height={Math.max(0, horizon)} />
        </ClipPath>
      </Defs>
      {drawn.above.map((seg, i) => (
        <Path key={i} d={seg.d} stroke={seg.stroke} strokeWidth={TRACK_W} strokeOpacity={0.55} strokeLinecap="round" fill="none" />
      ))}
      {drawn.alongLine.map((l, i) => (
        <Line key={`u${i}`} x1={l.x1} y1={horizon} x2={l.x2} y2={horizon} stroke={ink} strokeWidth={1.25} strokeOpacity={0.6} strokeDasharray="1 3" />
      ))}
      {drawn.stretch ? (
        <Path d={drawn.stretch} stroke={ink} strokeWidth={STRETCH_W} strokeOpacity={0.6} strokeLinecap="round" fill="none" />
      ) : null}
      <Line x1={0} y1={horizon} x2={width} y2={horizon} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.5} />
      {at && !at.under && body.kind === 'sun' ? (
        <G clipPath={`url(#${clipId})`}>
          <Circle cx={X(at)} cy={Y(at) + 2 * body.below * sunR} r={sunR} fill={body.light} fillOpacity={body.alpha} />
        </G>
      ) : null}
      {at && !at.under && body.kind === 'moon' ? (
        <MoonDisc cx={X(at)} cy={Y(at)} illuminated={body.illuminated} tilt={body.tilt} lit={body.light} alpha={body.alpha} />
      ) : null}
      {at && at.under ? (
        <Circle cx={X(at)} cy={horizon} r={UNDER_R} stroke={ink} strokeWidth={TRACK_W} strokeOpacity={0.8} fill="none" />
      ) : null}
      {ring ? (
        <Circle cx={X(ring)} cy={Y(ring)} r={RING_R} stroke={ink} strokeWidth={1} strokeOpacity={0.95} fill="none" />
      ) : null}
    </Svg>
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
