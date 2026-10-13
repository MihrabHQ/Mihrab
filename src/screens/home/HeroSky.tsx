import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { SkyFrame } from './skyModel';
import { SUN_GLOW_PEAK } from './skyLight';

/**
 * How wide the halo reaches, as a percentage of the sky, at no light and
 * at the most there is. A new moon barely disturbs the sky around it; the
 * noon sun washes a third of it.
 */
const HALO_MIN_R = 14;
const HALO_MAX_R = 38;

/** The moon's canvas, dp. */
export const MOON = 22;
/** The sun's radius, dp. */
export const SUN_R = 9;
/**
 * The sun near the horizon is drawn larger — up to this much more than
 * at noon — as it looks: the air magnifies and reddens it as it rises
 * and sets. `skyModel` puts it at y 0.26 on the horizon and 0.08 at noon.
 */
export const SUN_HORIZON_GROWTH = 0.6;
export function sunScaleAt(y: number): number {
  const horizon = Math.max(0, Math.min(1, (y - 0.08) / (0.26 - 0.08)));
  return 1 + SUN_HORIZON_GROWTH * horizon;
}
/**
 * Below this much open sky, no body is drawn: a moon (22dp) in a 40dp
 * band already touches both edges. The gradient alone says the hour.
 */
export const SKY_CRAMPED_BELOW = 40;

/**
 * Where a body drawn at model fraction `f` (0–0.3 of a short card — see
 * skyModel's Y_LOW/Y_HIGH) lands inside the sky, in dp from its top.
 *
 * The model was drawn for a short card whose top third was the sky. Given
 * a band of its own — everything between the status bar + top row and the
 * countdown block — the drawing uses the band: the model's 0.08–0.3
 * becomes the whole of the room less half a moon at each edge, so the
 * sun at its lowest sits just above the countdown (the horizon) and the
 * moon crosses the middle of the open sky rather than hugging the
 * location chip, and no body ever touches either edge.
 *
 * Pure, so the geometry can be tested for every phone height and every
 * table length without a layout engine.
 */
export function skyScene({
  height,
  sceneTop,
  sceneBottom,
}: {
  /** The sky's measured height, dp (0 before layout). */
  height: number;
  sceneTop: number;
  sceneBottom: number;
}): {
  banded: boolean;
  room: number;
  cramped: boolean;
  /** dp from the sky's top for a model fraction. */
  y: (fraction: number) => number;
} {
  const banded = sceneTop > 0 || sceneBottom > 0;
  const room = height - sceneTop - sceneBottom;
  // When the table has taken the room — extra times and the Mālikī
  // boundaries all on — the band can close to a sliver. A moon drawn
  // there would sit half behind the countdown; the gradient alone says
  // the hour well enough until the room comes back.
  const cramped = banded && height > 0 && room < SKY_CRAMPED_BELOW;
  // The model's body centres run 0.08 (the sun at noon) to 0.3 (a body at
  // the horizon). That range becomes the room, less half a moon at each
  // edge, so the largest body drawn at either extreme still clears the
  // top row above and the countdown below — on a 40dp band as on a
  // tablet's 600.
  const margin = MOON / 2;
  const inner = Math.max(0, room - 2 * margin);
  const spread = (fraction: number) => Math.max(0, Math.min(1, (fraction - 0.08) / 0.22));
  return {
    banded,
    room,
    cramped,
    y: (fraction: number) => sceneTop + margin + spread(fraction) * inner,
  };
}

/**
 * The drawn sky behind today's hero — see skyModel.ts for the passages,
 * the keyframes, and why it is painted at full strength whatever the theme.
 *
 * Everything is in percentages of the card, so the same drawing fits the
 * phone's hero and the iPad's expanded one. It sits under the hero's
 * content (absoluteFill, no pointer events); the content takes its ink
 * from the sky (`skyInkAt`), not from the theme.
 */
/**
 * A launch run's sky, drawn off the JS thread — see `SkyRunLayers`.
 * `frames` are the sky at evenly spaced points of the run, the first at
 * its start and the last at now; `progress` is the run's eased progress,
 * 0…1, a native-driven value the hero sets once a frame.
 */
export type SkyRun = { frames: SkyFrame[]; progress: Animated.Value };

function HeroSkyImpl({
  frame,
  run,
  denseStars = false,
  bleed,
  sceneTop = 0,
  sceneBottom = 0,
}: {
  frame: SkyFrame;
  /** While a launch run draws: the sky as native layers, not `frame`. */
  run?: SkyRun;
  /** The fuller field of stars (the Sky theme's night). */
  denseStars?: boolean;
  /**
   * How far past its parent's box to draw, so a sky mounted inside the
   * padded hero still reaches the card's edges.
   */
  bleed?: { horizontal: number; top: number; bottom: number };
  /**
   * A band at the top of the sky, dp, that the gradient paints but the
   * sun, moon and stars keep out of. On the phone the sky runs up under
   * the status bar; the bodies are laid out in the sky BELOW it, or the
   * moon lands between the clock and the battery and reads as one more
   * status icon.
   */
  sceneTop?: number;
  /**
   * The same at the foot: the countdown block, which the bodies must not
   * pass behind. The gradient still paints it.
   */
  sceneBottom?: number;
}) {
  const { top, bottom, glow, stars, body } = frame;

  // The scene's height in dp, once laid out, so a fraction of the scene
  // can be turned into a position under `sceneTop`. Until then — and
  // wherever there is no band — the plain percentage of the whole sky.
  //
  // The SVG takes the SAME measured size in dp rather than "100%": a
  // percentage-sized Svg did not follow its parent when the hero grew or
  // shrank later — the countdown turning over to the next prayer, the
  // extra-times toggle — and the gradient stopped short of the hero's
  // foot, leaving the date line on a band of the page colour.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const height = size.height;
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize(prev =>
      Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - h) < 0.5
        ? prev
        : { width, height: h },
    );
  }, []);
  // One scene per layout, not per render: the stars below are memoised on
  // it, and a fresh object every render would redraw them every frame of
  // a launch run for nothing.
  const scene = useMemo(() => skyScene({ height, sceneTop, sceneBottom }), [height, sceneTop, sceneBottom]);
  const { cramped } = scene;
  const sceneY = (fraction: number) => sceneYOf(scene, fraction);

  // The run's sky is the layers', once the sky has a size to lay them in.
  const running = run && size.width > 0 && size.height > 0;

  const bodyXY = body.kind === 'none' || cramped ? null : { x: body.x, y: body.y };
  /**
   * The light this body gives off — its colour where the reader is
   * standing, and how hard it glows. The sun's is worked out from its
   * real altitude and so changes all day; the moon's from how much of it
   * is lit. See skyLight.ts. `glow` is the stars' colour and only theirs.
   */
  const light =
    body.kind === 'none'
      ? null
      : { hex: body.light, halo: body.halo * (body.kind === 'sun' ? body.alpha : 1) };
  const drawStars = stars > 0 && !cramped;

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[
        styles.fill,
        bleed && {
          top: -bleed.top,
          bottom: -bleed.bottom,
          start: -bleed.horizontal,
          end: -bleed.horizontal,
        },
      ]}>
      {running ? (
        <SkyRunLayers run={run} width={Math.ceil(size.width)} height={Math.ceil(size.height)} scene={scene} denseStars={denseStars} />
      ) : null}
      {running ? null : (
      <Svg
        // ROUNDED UP, NOT AS MEASURED. A layout width is a fraction of a
        // dp — a 1280px screen at 3x measures 426.667 — and the surface
        // is laid out on whole dp, so the sky was painted 426dp wide and
        // the last TWO device pixels of the screen stayed the page's
        // colour: a dark hairline down the right edge of the hero,
        // measured on a Pixel 10 Pro. A whole dp over is at most a pixel
        // of overdraw, and the wrap clips it (heroWrapBleed, overflow
        // hidden), so the sky reaches the edge on any density.
        width={size.width > 0 ? Math.ceil(size.width) : '100%'}
        height={size.height > 0 ? Math.ceil(size.height) : '100%'}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            {(frame.mid && frame.midAt != null
              ? [
                  <Stop key="t" offset="0" stopColor={top} />,
                  <Stop key="m" offset={frame.midAt} stopColor={frame.mid} />,
                  <Stop key="b" offset="1" stopColor={bottom} />,
                ]
              : [<Stop key="t" offset="0" stopColor={top} />, <Stop key="b" offset="1" stopColor={bottom} />])}
          </LinearGradient>
          {bodyXY && light ? (
            <RadialGradient
              id="glow"
              cx={`${bodyXY.x * 100}%`}
              // A PERCENTAGE, always. The gradient is in the box's own
              // units (objectBoundingBox, the default), where a bare
              // number is a fraction of the height: the dp a banded sky
              // gives (`sceneY` on the phone) put the halo's centre some
              // eighty skies below the card, and the phone's sun shone
              // only for the launch run's native layers, which place it
              // in dp. The tablet, unbanded, always had its percentage.
              cy={glowCy(sceneY(bodyXY.y), height)}
              // The halo grows with the light, not just brightens: a new
              // moon has almost none, a full one a soft ring, the noon
              // sun a wide wash. A fixed radius at varying opacity reads
              // as the same lamp turned down.
              //
              // By the SQUARE ROOT of the strength, because brightness
              // falls off with the square of the distance: halve the
              // light and the point at which it fades into the sky comes
              // in by about a third, not by half. Taken linearly the
              // setting sun lost its glow altogether, which is backwards
              // — low sun, thick air, and the light spreads WIDER.
              r={`${HALO_MIN_R + (HALO_MAX_R - HALO_MIN_R) * Math.sqrt(light.halo / SUN_GLOW_PEAK)}%`}>
              <Stop offset="0" stopColor={light.hex} stopOpacity={light.halo} />
              <Stop offset="1" stopColor={light.hex} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sky)" />
        {bodyXY ? <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" /> : null}
        {drawStars ? <Stars scene={scene} glow={glow} stars={stars} dense={denseStars} /> : null}
        {body.kind === 'sun' && !cramped ? (
          <Circle
            cx={`${body.x * 100}%`}
            cy={sceneY(body.y)}
            r={SUN_R * sunScaleAt(body.y)}
            fill={body.light}
            fillOpacity={body.alpha}
          />
        ) : null}
      </Svg>
      )}
      {!running && drawStars && denseStars ? (
        <Twinkle scene={scene} glow={glow} stars={stars} width={size.width} height={size.height} />
      ) : null}
      {!running && body.kind === 'moon' && !cramped ? (
        <View style={[styles.moon, { start: `${body.x * 100}%`, top: sceneY(body.y) }]}>
          <Moon
            illuminated={body.illuminated}
            tilt={body.tilt}
            lit={body.light}
            shadow={top}
          />
        </View>
      ) : null}
    </View>
  );
}

type Scene = ReturnType<typeof skyScene>;

/**
 * ── THE RUN'S SKY, OFF THE JS THREAD ─────────────────────────────────
 *
 * A launch run sweeps the sky from the picture's hour to now in under a
 * second, and drawing that by re-rendering the SVG above every frame cost
 * 8 ms of JS a frame on a Pixel 10 Pro — the whole of a 120 Hz frame —
 * and stuttered with everything else the launch does on that thread.
 *
 * So while the run draws, the sky is not re-rendered at all. It is built
 * ONCE as a stack of still layers — the gradient at each of a few
 * keyframes of the sweep (one an hour of sky, at most nine), each
 * keyframe's halo, the stars, the sun and the moon — and every layer's
 * opacity and place is an interpolation of ONE native-driven value, the
 * run's progress. The hero sets that value once a frame, a single call
 * into native; the UI thread does the rest. The keyframes crossfade one
 * into the next, which is what the sky model does between its own keys
 * (skyModel.ts, `keyed`: colours mixed linearly), so the run through the
 * dawn passes through the dawn's pinks, not from night straight to day.
 *
 * A layer is dropped (opacity 0, which Android and iOS do not draw) once
 * the one above it is fully in, so at any moment two layers are drawn.
 * The bodies ride shared transforms through the keyframes' positions.
 *
 * The gradient and halo layers are drawn at a quarter of the sky's size
 * and scaled up by the UI thread: react-native-svg backs each SVG view
 * with a bitmap of its own size, and a dozen full-size ones cost the UI
 * thread half a second to make — which the JS thread then waited for,
 * right where the run was due. A gradient loses nothing to the scaling.
 * The stars, small and sharp, are drawn at full size; the sun is a plain
 * view; the moon its own small SVG.
 */
const EPS = 1e-3;
const LAYER_DOWNSCALE = 4;

function SkyRunLayersImpl({
  run,
  width,
  height,
  scene,
  denseStars = false,
}: {
  run: SkyRun;
  width: number;
  height: number;
  scene: Scene;
  denseStars?: boolean;
}) {
  const { frames, progress } = run;
  const K = frames.length;
  const built = useMemo(() => {
    const es = frames.map((_, i) => (K <= 1 ? 1 : i / (K - 1)));
    const yPx = (fraction: number) => (scene.banded && scene.room > 0 ? scene.y(fraction) : fraction * height);
    /** In at its keyframe, held until the next is in, then dropped. */
    const layerOpacity = (i: number, peak: number) => {
      if (K <= 1) return progress.interpolate({ inputRange: [0, 1], outputRange: [peak, peak] });
      if (i === 0) {
        return progress.interpolate({ inputRange: [0, es[1], es[1] + EPS], outputRange: [peak, peak, 0], extrapolate: 'clamp' });
      }
      if (i === K - 1) return progress.interpolate({ inputRange: [es[i - 1], 1], outputRange: [0, peak], extrapolate: 'clamp' });
      return progress.interpolate({
        inputRange: [es[i - 1], es[i], es[i + 1], es[i + 1] + EPS],
        outputRange: [0, peak, peak, 0],
        extrapolate: 'clamp',
      });
    };
    /** A value per keyframe, followed through the run. */
    const through = (values: number[]) =>
      K <= 1
        ? progress.interpolate({ inputRange: [0, 1], outputRange: [values[0], values[0]] })
        : progress.interpolate({ inputRange: es, outputRange: values, extrapolate: 'clamp' });
    /** Where a body is at each keyframe — held where it is not there. */
    const positions = (kind: 'sun' | 'moon') => {
      const raw = frames.map(f => (f.body.kind === kind ? { x: f.body.x * width, y: yPx(f.body.y) } : null));
      const first = raw.find(p => p != null);
      if (!first) return null;
      let last = first;
      return raw.map(p => (last = p ?? last));
    };
    const body = frames.map(f => (f.body.kind === 'none' || scene.cramped ? null : f.body));
    const bodyPos = frames.map(f => (f.body.kind === 'none' ? null : { x: f.body.x * width, y: yPx(f.body.y) }));
    const anyBody = body.some(b => b != null);
    let held = bodyPos.find(p => p != null) ?? { x: 0, y: 0 };
    const bodyXs = bodyPos.map(p => (held = p ?? held).x);
    held = bodyPos.find(p => p != null) ?? { x: 0, y: 0 };
    const bodyYs = bodyPos.map(p => (held = p ?? held).y);
    const bodyTx = through(bodyXs);
    const bodyTy = through(bodyYs);
    // One halo, in the colour of the keyframe that glows the most (the
    // tint hardly moves across a run; the strength and the place do).
    const haloScale = through(
      body.map(b => (b ? (HALO_MIN_R + (HALO_MAX_R - HALO_MIN_R) * Math.sqrt(b.halo / SUN_GLOW_PEAK)) / HALO_MAX_R : 0.01)),
    );
    const haloPeak = body.reduce<(typeof body)[number]>((m, b) => (b && (!m || b.halo > m.halo) ? b : m), null);
    const haloOpacity = through(body.map(b => (b ? b.halo : 0)));
    const starsPeak = frames.reduce((m, f) => (f.stars > m.stars ? f : m), frames[0]);
    const starsOpacity = through(frames.map(f => (scene.cramped ? 0 : f.stars)));
    const moonFrame = frames.find(f => f.body.kind === 'moon');
    const moonOpacity = through(frames.map(f => (f.body.kind === 'moon' && !scene.cramped ? 1 : 0)));
    const moonPos = positions('moon');
    return {
      gradients: frames.map((f, i) => ({ top: f.top, mid: f.mid, midAt: f.midAt, bottom: f.bottom, opacity: layerOpacity(i, 1) })),
      halo: haloPeak ? { light: haloPeak.light, opacity: haloOpacity } : null,
      haloScaleUp: Animated.multiply(haloScale, LAYER_DOWNSCALE),
      suns: body.map((b, i) => (b && b.kind === 'sun' ? { light: b.light, opacity: layerOpacity(i, b.alpha) } : null)),
      sunScale: through(body.map(b => (b && b.kind === 'sun' ? sunScaleAt(b.y) : 1))),
      anyBody,
      bodyTx,
      bodyTy,
      haloScale,
      stars: starsPeak.stars > 0 && !scene.cramped ? { glow: starsPeak.glow, opacity: starsOpacity } : null,
      moon:
        moonFrame && moonFrame.body.kind === 'moon' && moonPos
          ? {
              illuminated: moonFrame.body.illuminated,
              tilt: moonFrame.body.tilt,
              lit: moonFrame.body.light,
              shadow: moonFrame.top,
              opacity: moonOpacity,
              tx: through(moonPos.map(p => p.x)),
              ty: through(moonPos.map(p => p.y)),
            }
          : null,
    };
  }, [frames, progress, K, width, height, scene]);

  // The small canvas the gradient and the halo are drawn on, scaled up
  // about its centre to cover the sky.
  const lw = Math.ceil(width / LAYER_DOWNSCALE);
  const lh = Math.ceil(height / LAYER_DOWNSCALE);
  const small = { width: lw, height: lh } as const;

  return (
    <>
      {built.gradients.map((g, i) => (
        <Animated.View
          key={`g${i}`}
          style={{
            position: 'absolute',
            left: (width - lw) / 2,
            top: (height - lh) / 2,
            ...small,
            opacity: g.opacity,
            transform: [{ scale: LAYER_DOWNSCALE }],
          }}>
          <Svg width={lw} height={lh}>
            <Defs>
              <LinearGradient id={`skyrun${i}`} x1="0" y1="0" x2="0" y2="1">
                {(g.mid && g.midAt != null
                  ? [
                      <Stop key="t" offset="0" stopColor={g.top} />,
                      <Stop key="m" offset={g.midAt} stopColor={g.mid} />,
                      <Stop key="b" offset="1" stopColor={g.bottom} />,
                    ]
                  : [<Stop key="t" offset="0" stopColor={g.top} />, <Stop key="b" offset="1" stopColor={g.bottom} />])}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#skyrun${i})`} />
          </Svg>
        </Animated.View>
      ))}
      {built.anyBody && built.halo ? (
        <Animated.View
          style={{
            position: 'absolute',
            left: -lw / 2,
            top: -lh / 2,
            ...small,
            opacity: built.halo.opacity,
            transform: [{ translateX: built.bodyTx }, { translateY: built.bodyTy }, { scale: built.haloScaleUp }],
          }}>
          <Svg width={lw} height={lh}>
            <Defs>
              <RadialGradient id="halorun" cx="50%" cy="50%" r={`${HALO_MAX_R}%`}>
                <Stop offset="0" stopColor={built.halo.light} stopOpacity={1} />
                <Stop offset="1" stopColor={built.halo.light} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#halorun)" />
          </Svg>
        </Animated.View>
      ) : null}
      {built.stars ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: built.stars.opacity }]}>
          <Svg width={width} height={height}>
            <Stars scene={scene} glow={built.stars.glow} stars={1} dense={denseStars} />
          </Svg>
        </Animated.View>
      ) : null}
      {built.anyBody
        ? built.suns.map((s, i) =>
            s ? (
              <Animated.View
                key={`s${i}`}
                style={{
                  position: 'absolute',
                  left: -SUN_R,
                  top: -SUN_R,
                  width: SUN_R * 2,
                  height: SUN_R * 2,
                  borderRadius: SUN_R,
                  backgroundColor: s.light,
                  opacity: s.opacity,
                  transform: [{ translateX: built.bodyTx }, { translateY: built.bodyTy }, { scale: built.sunScale }],
                }}
              />
            ) : null,
          )
        : null}
      {built.moon ? (
        <Animated.View
          style={[
            styles.moon,
            {
              left: 0,
              top: 0,
              opacity: built.moon.opacity,
              transform: [
                { translateX: built.moon.tx },
                { translateY: built.moon.ty },
                { translateX: -MOON / 2 },
                { translateY: -MOON / 2 },
              ],
            },
          ]}>
          <Moon illuminated={built.moon.illuminated} tilt={built.moon.tilt} lit={built.moon.lit} shadow={built.moon.shadow} />
        </Animated.View>
      ) : null}
    </>
  );
}

const SkyRunLayers = memo(SkyRunLayersImpl);

function sceneYOf(scene: Scene, fraction: number): number | `${number}%` {
  return scene.banded && scene.room > 0 ? scene.y(fraction) : `${fraction * 100}%`;
}

/**
 * A body's height for the glow's radial gradient, which is in
 * objectBoundingBox units: dp from the sky's top become a percentage of
 * the sky's height. A percentage passes through as it is.
 */
export function glowCy(y: number | `${number}%`, height: number): `${number}%` {
  if (typeof y !== 'number') return y;
  return `${height > 0 ? (y / height) * 100 : 0}%`;
}

// A fixed, sparse field in the top strip: the same stars every night, so
// the card does not twinkle from one render to the next, and none of
// them behind the countdown.
const STAR_FIELD: ReadonlyArray<readonly [number, number, number, number?]> = [
  [6, 30, 1.2],
  [16, 12, 0.9],
  [27, 34, 1.0],
  [44, 8, 1.1],
  [56, 26, 0.9],
  [66, 40, 1.2],
  [78, 14, 0.8],
];

/**
 * The Sky theme's night: the same seven, and a dozen fainter ones between
 * them — a field, not a scatter — with their own opacity (the fourth
 * value) so the sky has depth: the bright few in front, the faint many
 * behind. Still none behind the countdown.
 */
const STAR_FIELD_DENSE: ReadonlyArray<readonly [number, number, number, number?]> = [
  ...STAR_FIELD,
  [3, 10, 0.6, 0.5],
  [11, 42, 0.7, 0.45],
  [21, 22, 0.6, 0.5],
  [33, 16, 0.7, 0.4],
  [38, 38, 0.6, 0.5],
  [50, 44, 0.8, 0.4],
  [61, 6, 0.6, 0.5],
  [71, 28, 0.7, 0.45],
  [84, 36, 0.6, 0.5],
  [90, 8, 0.9, 0.55],
  [94, 24, 0.6, 0.4],
  [48, 18, 0.5, 0.35],
];

/**
 * The stars: seven elements that change only as night comes or goes, kept
 * out of the sky's every redraw — a launch run redraws the sky dozens of
 * times in a second, and these were a third of each redraw's work.
 */
const Stars = memo(function Stars({
  scene,
  glow,
  stars,
  dense = false,
}: {
  scene: Scene;
  glow: string;
  stars: number;
  dense?: boolean;
}) {
  const field = dense ? STAR_FIELD_DENSE : STAR_FIELD;
  return (
    <>
      {field.map(([x, y, r, a], i) => (
        <Circle key={i} cx={`${x}%`} cy={sceneYOf(scene, y / 100)} r={r} fill={glow} fillOpacity={(a ?? 0.85) * stars} />
      ))}
    </>
  );
});

/**
 * Three of the night's stars breathing — a slow brightening and dimming,
 * each on its own period, so the field is alive without ever drawing the
 * eye. Native-driven opacity on three small views laid over the drawn
 * stars; nothing on the JS thread after the loops start. Still under
 * Reduce Motion, and gone with the stars by day.
 */
const TWINKLERS: ReadonlyArray<{ star: number; period: number; delay: number }> = [
  { star: 1, period: 2600, delay: 0 },
  { star: 5, period: 3400, delay: 900 },
  { star: 10, period: 3000, delay: 1700 },
];

function TwinkleImpl({
  scene,
  glow,
  stars,
  width,
  height,
}: {
  scene: Scene;
  glow: string;
  stars: number;
  width: number;
  height: number;
}) {
  const reduceMotion = useReduceMotion();
  const values = useRef(TWINKLERS.map(() => new Animated.Value(0, { useNativeDriver: true }))).current;
  useEffect(() => {
    if (reduceMotion) return undefined;
    const loops = TWINKLERS.map((tw, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(tw.delay),
          Animated.timing(values[i], { toValue: 1, duration: tw.period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(values[i], { toValue: 0, duration: tw.period / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [reduceMotion, values]);
  if (reduceMotion || width <= 0 || height <= 0) return null;
  return (
    <>
      {TWINKLERS.map((tw, i) => {
        const [x, y, r] = STAR_FIELD_DENSE[tw.star];
        const yPx = scene.banded && scene.room > 0 ? scene.y(y / 100) : (y / 100) * height;
        const size = (r + 0.8) * 2;
        return (
          <Animated.View
            key={tw.star}
            style={{
              position: 'absolute',
              left: (x / 100) * width - size / 2,
              top: yPx - size / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: glow,
              opacity: Animated.multiply(values[i], 0.75 * stars),
            }}
          />
        );
      })}
    </>
  );
}
const Twinkle = memo(TwinkleImpl);

/**
 * A moon barely wider than a word, in tonight's real phase and turned the
 * way tonight's real moon is turned where the reader is standing.
 *
 * The disc is drawn once, lit on the RIGHT, and then rotated — see
 * moon.ts for where the angle comes from. Waxing and waning are not two
 * cases here: waning is the same shape turned about half a turn, which
 * is what it physically is, and a southern reader's moon is a northern
 * one turned over.
 *
 * The lit disc is drawn whole and the shadow laid over it in the sky's
 * own top colour, so the dark part of the moon is sky, as it is.
 */
const Moon = memo(function Moon({
  illuminated,
  tilt,
  lit,
  shadow,
}: {
  illuminated: number;
  tilt: number;
  lit: string;
  shadow: string;
}) {
  const r = 9;
  const c = MOON / 2;
  const shadowPath = useMemo(() => moonShadowPath(illuminated, c, c, r), [illuminated, c]);
  return (
    <Svg width={MOON} height={MOON} viewBox={`0 0 ${MOON} ${MOON}`}>
      <G rotation={tilt} origin={`${c}, ${c}`}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          fill={lit}
          fillOpacity={illuminated <= NEW_MOON_BELOW ? 0.18 : 1}
        />
        {shadowPath ? <Path d={shadowPath} fill={shadow} /> : null}
      </G>
    </Svg>
  );
});

/** Below this much light the disc is drawn as a ghost, not a sliver. */
export const NEW_MOON_BELOW = 0.02;
/** Above this the terminator is inside the anti-aliasing; draw none. */
export const FULL_MOON_ABOVE = 0.995;

/**
 * The shadow over a disc that is `illuminated` (0–1) and lit on its RIGHT.
 *
 * Always the right: which way the real limb faces is a rotation applied
 * to the whole disc, not a second shape. That is not only tidier — it is
 * the physical account. A waning moon is not a mirrored waxing one, it is
 * the same lit hemisphere seen with the sun on the other side, and a
 * southern reader is not looking at a mirrored sky but at the same sky
 * upside down.
 *
 * The terminator is a half-ellipse whose horizontal radius is
 * r·|1 − 2·illuminated|: a straight line at half, bowing toward the lit
 * side below half (so the shadow is more than the disc's half) and into
 * the shadow above it. The shadow is the dark limb's semicircle closed by
 * that terminator.
 *
 * Null when there is effectively no shadow left to draw; a whole disc
 * when there is effectively no light, which the caller pairs with a
 * faint fill so a new moon is a ghost rather than a hole.
 */
export function moonShadowPath(
  illuminated: number,
  cx: number,
  cy: number,
  r: number,
): string | null {
  const k = Math.max(0, Math.min(1, illuminated));
  if (k >= FULL_MOON_ABOVE) return null;
  if (k <= NEW_MOON_BELOW) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const rx = Math.round(Math.abs(1 - 2 * k) * r * 1000) / 1000;
  // Sweep 0 from bottom to top bows the terminator RIGHT, into the lit
  // side, which is the crescent; sweep 1 bows it left into the shadow,
  // which is the gibbous.
  const termSweep = k < 0.5 ? 0 : 1;
  return [
    `M ${cx} ${cy - r}`,
    // Down the dark limb, which is the left one.
    `A ${r} ${r} 0 0 0 ${cx} ${cy + r}`,
    `A ${rx} ${r} 0 0 ${termSweep} ${cx} ${cy - r}`,
    'Z',
  ].join(' ');
}

export const HeroSky = memo(HeroSkyImpl);


const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    // THE SKY DOES NOT MIRROR. The app lays itself out right-to-left for
    // Arabic with a Yoga `direction` on its root, and the moon is placed
    // with `start`, which that flips — while the sun is an SVG `cx`, which
    // nothing flips. So in Arabic the moon crossed the night right to left
    // and the sun crossed the day left to right. The sun rises where it
    // rises; this subtree reads left to right whatever the app does.
    direction: 'ltr',
  },
  moon: {
    position: 'absolute',
    width: MOON,
    height: MOON,
    // Centred on its point with a transform, not a negative margin: the
    // sky is physical (the sun rises where it rises), and a transform
    // says so without touching the Left/Right margins the RTL rule bans.
    transform: [{ translateX: -MOON / 2 }, { translateY: -MOON / 2 }],
  },
});
