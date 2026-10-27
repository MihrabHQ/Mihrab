import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, I18nManager, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useVerticalBar } from '../../native/VerticalBar';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { linearDown, radialGlow, withAlpha } from './skyPaint';
import { skyColorAt, SUN_HORIZON_Y, type SkyFrame } from './skyModel';
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
  /** The band's top: the foot of the chips' row, dp from the sky's top. */
  top: number;
  /** dp from the sky's top for a model fraction. */
  y: (fraction: number) => number;
  /** dp from the sky's top for a star's card fraction — see `STAR_FIELD`. */
  starY: (fraction: number) => number;
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
  // The stars are written on the card, 6–44 % of it (`STAR_FIELD`), and
  // keep that spread over the whole band — no moon's margin, a star has
  // no size to clear — rather than the bodies' 8–30 %. Through the
  // bodies' mapping a third of the field clamped to the band's floor and
  // two stars to its ceiling: two straight rows of dots, at the moon's
  // height and under the chips (2.33).
  const starSpread = (fraction: number) => Math.max(0, Math.min(1, (fraction - STAR_FIELD_TOP) / (STAR_FIELD_BOTTOM - STAR_FIELD_TOP)));
  return {
    banded,
    room,
    cramped,
    top: sceneTop,
    y: (fraction: number) => sceneTop + margin + spread(fraction) * inner,
    starY: (fraction: number) => sceneTop + starSpread(fraction) * Math.max(0, room),
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
  still = false,
  bleed,
  sceneTop = 0,
  sceneBottom = 0,
}: {
  frame: SkyFrame;
  /** While a launch run draws: the sky as native layers, not `frame`. */
  run?: SkyRun;
  /**
   * A sky nobody watches — the posed twin's, drawn only to be captured
   * (boot/poseHero.ts) — or one that has been watched long enough
   * (hooks/useLively): no twinkle, no native loops breathing all night
   * for a hero under the real one, or for a page standing still.
   */
  still?: boolean;
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
   * ── THE HORIZON ──────────────────────────────────────────────────────
   * The line the sun rises over and sets under: where the model puts a
   * body "at the horizon" (SUN_HORIZON_Y), plus a sun's radius, so a sun
   * with nothing under it stands ON the line. A sun partly `below` is
   * drawn that much lower and clipped at the line — the disc comes up out
   * of the horizon at sunrise and goes down into it at Maghrib, rather
   * than standing whole on it for the length of the twilight (2.33).
   * Only once the sky has a height: before layout nothing is clipped.
   */
  const yDp = (fraction: number) => (scene.banded && scene.room > 0 ? scene.y(fraction) : fraction * height);
  const horizon = height > 0 ? yDp(SUN_HORIZON_Y) + SUN_R * sunScaleAt(SUN_HORIZON_Y) : null;
  const sunR = body.kind === 'sun' ? SUN_R * sunScaleAt(body.y) : 0;
  const sunCy: number | `${number}%` =
    body.kind === 'sun' ? (horizon != null ? yDp(body.y) + 2 * body.below * sunR : sceneY(body.y)) : 0;
  const sunClipped = body.kind === 'sun' && body.below > 0 && horizon != null;
  /**
   * The light this body gives off — its colour where the reader is
   * standing, and how hard it glows. The sun's is worked out from its
   * real altitude and so changes all day; the moon's from how much of it
   * is lit. See skyLight.ts. `glow` is the stars' colour and only theirs.
   * A body fading in or out takes its halo with it.
   */
  const light = body.kind === 'none' ? null : { hex: body.light, halo: body.halo * body.alpha };
  /**
   * ── NOTHING SHINES UNDER THE STATUS BAR ──────────────────────────────
   * The halo reaches 38 % of the sky, and a body at the top of its band
   * — a full moon at the night's middle, the noon sun — put it under the
   * clock and the battery, and under the Qibla chip: a torch on the
   * status bar rather than a glow in the sky. The sky's own gradient is
   * painted back over the halo from the top edge down to the band's top,
   * fading in from solid to nothing, in the colours the gradient has
   * there — so the sky looks exactly as it did and the halo alone is held
   * back from the chrome. The status bar's ink, read from the gradient,
   * then matches what is under it too.
   */
  const topFade =
    scene.top > 0 && height > 0 ? { to: skyColorAt(frame, Math.min(1, scene.top / height)), h: scene.top } : null;
  const drawStars = stars > 0 && !cramped;
  // iPhone Duo: the sky — and only the sky — runs on under the vertical
  // bar's column, which the page keeps clear of (src/native/VerticalBar.ts).
  // Only where it already bleeds to the screen's edges (the phone's hero).
  const vbar = useVerticalBar();
  const endSide = I18nManager.isRTL ? 'left' : 'right';
  const extraEnd = bleed && vbar && vbar.side === endSide ? vbar.width : 0;
  const extraStart = bleed && vbar && vbar.side !== endSide ? vbar.width : 0;

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[
        styles.fill,
        bleed && {
          top: -bleed.top,
          bottom: -bleed.bottom,
          start: -bleed.horizontal - extraStart,
          end: -bleed.horizontal - extraEnd,
        },
      ]}>
      {running ? (
        <SkyRunLayers run={run} width={Math.ceil(size.width)} height={Math.ceil(size.height)} scene={scene} denseStars={denseStars} />
      ) : null}
      {running ? null : (
        // ── VIEWS, NOT A BITMAP ──────────────────────────────────────────
        // The sky was one <Svg>, and react-native-svg on Android paints
        // every <Svg> into an ARGB bitmap the size of the view and keeps
        // it: 14.6 MB for a full-screen sky on a 1280×2856 phone, held for
        // as long as Today is mounted, for two gradients and a few dots.
        // The gradients are now the views' own backgrounds, which React
        // Native draws with a shader and no bitmap (skyPaint.ts); the
        // stars and the sun are plain round views. Nothing here holds a
        // picture of itself.
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage: linearDown(
                  frame.mid && frame.midAt != null
                    ? [[top, 0], [frame.mid, frame.midAt], [bottom, 1]]
                    : [[top, 0], [bottom, 1]],
                ),
              },
            ]}
          />
          {bodyXY && light && size.width > 0 && height > 0
            ? (() => {
                // A circle in dp, wherever the sky's sides are: the radius
                // is the percentage of the sides' geometric mean (2.33). A
                // square view the glow's size, centred on the body — the
                // one radial form React Native reads right (skyPaint.ts).
                const r =
                  ((HALO_MIN_R + (HALO_MAX_R - HALO_MIN_R) * Math.sqrt(light.halo / SUN_GLOW_PEAK)) / 100) *
                  Math.sqrt(size.width * height);
                const cx = bodyXY.x * size.width;
                const cy = body.kind === 'sun' && typeof sunCy === 'number' ? sunCy : yDp(bodyXY.y);
                return (
                  <View
                    style={{
                      position: 'absolute',
                      left: cx - r,
                      top: cy - r,
                      width: r * 2,
                      height: r * 2,
                      backgroundImage: radialGlow(light.hex, Math.min(1, light.halo)),
                    }}
                  />
                );
              })()
            : null}
          {bodyXY && topFade ? (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: topFade.h,
                backgroundImage: linearDown([
                  [top, 0],
                  [withAlpha(topFade.to, 0), 1],
                ]),
              }}
            />
          ) : null}
          {drawStars && size.width > 0 && height > 0 ? (
            <StarField scene={scene} glow={glow} stars={stars} dense={denseStars} width={size.width} height={height} />
          ) : null}
          {body.kind === 'sun' && !cramped && typeof sunCy === 'number' && size.width > 0 ? (
            // Clipped at the horizon when it is going under it.
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: sunClipped && horizon != null ? Math.max(0, horizon) : '100%',
                overflow: 'hidden',
              }}>
              <View
                style={{
                  position: 'absolute',
                  left: body.x * size.width - sunR,
                  top: sunCy - sunR,
                  width: sunR * 2,
                  height: sunR * 2,
                  borderRadius: sunR,
                  backgroundColor: body.light,
                  opacity: body.alpha,
                }}
              />
            </View>
          ) : null}
        </View>
      )}
      {!running && !still && drawStars && denseStars ? (
        <Twinkle scene={scene} glow={glow} stars={stars} width={size.width} height={size.height} />
      ) : null}
      {!running && body.kind === 'moon' && !cramped ? (
        <View style={[styles.moon, { start: `${body.x * 100}%`, top: sceneY(body.y), opacity: body.alpha }]}>
          <Moon illuminated={body.illuminated} tilt={body.tilt} lit={body.light} />
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
    /** The sun's centre, dp: that much of a radius under the horizon when it is `below` it. */
    const sunY = (b: Extract<SkyFrame['body'], { kind: 'sun' }>) => yPx(b.y) + 2 * b.below * SUN_R * sunScaleAt(b.y);
    const positions = (kind: 'sun' | 'moon') => {
      const raw = frames.map(f => (f.body.kind === kind ? { x: f.body.x * width, y: f.body.kind === 'sun' ? sunY(f.body) : yPx(f.body.y) } : null));
      const first = raw.find(p => p != null);
      if (!first) return null;
      let last = first;
      return raw.map(p => (last = p ?? last));
    };
    const body = frames.map(f => (f.body.kind === 'none' || scene.cramped ? null : f.body));
    const bodyPos = frames.map(f => (f.body.kind === 'none' ? null : { x: f.body.x * width, y: f.body.kind === 'sun' ? sunY(f.body) : yPx(f.body.y) }));
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
    const haloOpacity = through(body.map(b => (b ? b.halo * b.alpha : 0)));
    const starsPeak = frames.reduce((m, f) => (f.stars > m.stars ? f : m), frames[0]);
    const starsOpacity = through(frames.map(f => (scene.cramped ? 0 : f.stars)));
    const moonFrame = frames.find(f => f.body.kind === 'moon');
    const moonOpacity = through(frames.map(f => (f.body.kind === 'moon' && !scene.cramped ? f.body.alpha : 0)));
    const moonPos = positions('moon');
    // The horizon the suns are clipped at, and the fade over the status
    // bar — the same two things the live sky draws, see HeroSkyImpl.
    const horizon = yPx(SUN_HORIZON_Y) + SUN_R * sunScaleAt(SUN_HORIZON_Y);
    const topFadeH = scene.top > 0 && height > 0 ? scene.top : 0;
    return {
      gradients: frames.map((f, i) => ({
        top: f.top,
        mid: f.mid,
        midAt: f.midAt,
        bottom: f.bottom,
        fadeTo: topFadeH > 0 ? skyColorAt(f, Math.min(1, topFadeH / height)) : null,
        opacity: layerOpacity(i, 1),
      })),
      horizon,
      topFadeH,
      halo: haloPeak ? { light: haloPeak.light, opacity: haloOpacity } : null,
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
              opacity: moonOpacity,
              tx: through(moonPos.map(p => p.x)),
              ty: through(moonPos.map(p => p.y)),
            }
          : null,
    };
  }, [frames, progress, K, width, height, scene]);

  // The halo's own square: twice the widest it ever reaches, centred on
  // the body and scaled down to the keyframe's reach.
  const haloR = (HALO_MAX_R / 100) * Math.sqrt(width * height);

  return (
    <>
      {built.gradients.map((g, i) => (
        // Native gradients (skyPaint.ts): a keyframe is a view with a
        // background, at the sky's own size, and no bitmap behind it.
        <Animated.View
          key={`g${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height,
            opacity: g.opacity,
            backgroundImage: linearDown(
              g.mid && g.midAt != null
                ? [[g.top, 0], [g.mid, g.midAt], [g.bottom, 1]]
                : [[g.top, 0], [g.bottom, 1]],
            ),
          }}
        />
      ))}
      {built.anyBody && built.halo ? (
        <Animated.View
          style={{
            position: 'absolute',
            left: -haloR,
            top: -haloR,
            width: haloR * 2,
            height: haloR * 2,
            opacity: built.halo.opacity,
            backgroundImage: radialGlow(built.halo.light, 1),
            transform: [{ translateX: built.bodyTx }, { translateY: built.bodyTy }, { scale: built.haloScale }],
          }}
        />
      ) : null}
      {built.anyBody && built.halo && built.topFadeH > 0
        ? built.gradients.map((g, i) =>
            g.fadeTo ? (
              <Animated.View
                key={`f${i}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width,
                  height: built.topFadeH,
                  opacity: g.opacity,
                  backgroundImage: linearDown([
                    [g.top, 0],
                    [withAlpha(g.fadeTo, 0), 1],
                  ]),
                }}
              />
            ) : null,
          )
        : null}
      {built.stars ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: built.stars.opacity }]} pointerEvents="none">
          <StarField scene={scene} glow={built.stars.glow} stars={1} dense={denseStars} width={width} height={height} />
        </Animated.View>
      ) : null}
      {built.anyBody ? (
        // Clipped at the horizon: a sun under it is not drawn.
        <View style={{ position: 'absolute', left: 0, top: 0, width, height: Math.max(0, built.horizon), overflow: 'hidden' }} pointerEvents="none">
          {built.suns.map((s, i) =>
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
          )}
        </View>
      ) : null}
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
          <Moon illuminated={built.moon.illuminated} tilt={built.moon.tilt} lit={built.moon.lit} />
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
/** The field's reach on the card, as fractions — what `skyScene.starY` spreads over the band. */
export const STAR_FIELD_TOP = 0.04;
export const STAR_FIELD_BOTTOM = 0.46;
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
const StarField = memo(function StarField({
  scene,
  glow,
  stars,
  dense = false,
  width,
  height,
}: {
  scene: Scene;
  glow: string;
  stars: number;
  dense?: boolean;
  width: number;
  height: number;
}) {
  const field = dense ? STAR_FIELD_DENSE : STAR_FIELD;
  return (
    <>
      {field.map(([x, y, r, a], i) => {
        const cx = (x / 100) * width;
        const cy = scene.banded && scene.room > 0 ? scene.starY(y / 100) : (y / 100) * height;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: cx - r,
              top: cy - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              backgroundColor: glow,
              opacity: (a ?? 0.85) * stars,
            }}
          />
        );
      })}
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
        const yPx = scene.banded && scene.room > 0 ? scene.starY(y / 100) : (y / 100) * height;
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
 * Only the lit part is drawn. The dark part of the moon is sky, as it is
 * — and it is whatever sky is behind the moon: the gradient at the moon's
 * own height, with the moon's own halo on it. It used to be a disc drawn
 * whole with the shadow laid over it in the sky's TOP colour; the moon
 * is never at the top (`skyScene` keeps it in the band below the chips,
 * where the gradient has lightened and the halo lightens it more), so on
 * every night but the full moon's the dark limb was a black hole in the
 * sky with a sliver of light on it (2.33).
 */
const Moon = memo(function Moon({
  illuminated,
  tilt,
  lit,
}: {
  illuminated: number;
  tilt: number;
  lit: string;
}) {
  const r = 9;
  const c = MOON / 2;
  const litPath = useMemo(() => moonLitPath(illuminated, c, c, r), [illuminated, c]);
  return (
    <Svg width={MOON} height={MOON} viewBox={`0 0 ${MOON} ${MOON}`}>
      <G rotation={tilt} origin={`${c}, ${c}`}>
        {litPath ? (
          <Path d={litPath} fill={lit} />
        ) : (
          // The whole disc: full, or a new moon's ghost.
          <Circle cx={c} cy={c} r={r} fill={lit} fillOpacity={illuminated <= NEW_MOON_BELOW ? 0.18 : 1} />
        )}
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

/**
 * The lit part of the same disc: the complement of `moonShadowPath` — the
 * lit limb's semicircle (the right one) closed by the same terminator,
 * traversed the same way so the two paths share one curve exactly. Null
 * when the whole disc is drawn instead: full (no terminator) or new (the
 * ghost).
 */
export function moonLitPath(
  illuminated: number,
  cx: number,
  cy: number,
  r: number,
): string | null {
  const k = Math.max(0, Math.min(1, illuminated));
  if (k >= FULL_MOON_ABOVE || k <= NEW_MOON_BELOW) return null;
  const rx = Math.round(Math.abs(1 - 2 * k) * r * 1000) / 1000;
  const termSweep = k < 0.5 ? 0 : 1;
  return [
    `M ${cx} ${cy - r}`,
    // Down the lit limb, which is the right one.
    `A ${r} ${r} 0 0 1 ${cx} ${cy + r}`,
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
