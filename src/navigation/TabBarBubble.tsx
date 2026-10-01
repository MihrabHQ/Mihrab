/**
 * The tab bar's press, drawn — a slim indicator pill around the icon.
 *
 * Rendered as the bar's `tabBarBackground`, so it sits behind the icons
 * and is clipped by the bar: whatever it does, it cannot leave it.
 *
 * Deliberately plain: one flat wash of the accent, a fixed capsule centred
 * on the ICON (not the whole tab, label and all), no gradient, no edge.
 * It reads the press from `tabBarPress`:
 *   • tap   — grows in around the icon, fades as the finger lifts;
 *   • hold  — follows the finger along the bar, on the native value;
 *   • lift  — glides to the tab it was released over, then fades.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type HostInstance, type LayoutChangeEvent } from 'react-native';
import { useAppPalette } from '../hooks/useAppPalette';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { resolveSpring } from '../theme/motion';
import { withAlpha } from '../quran/ayahMarks';
import { iconBand, onFinger, tabFrame, useTabBarPress } from './tabBarPress';

/** Air between the pill and the bar's ends. */
const INSET_X = 4;
/** The pill: a capsule around a glyph, the size Material's indicator uses. */
const PILL_W = 60;
const PILL_H = 32;
/** A held pill stretches a touch sideways — it is being carried. */
const STRETCH = 1.12;

export function TabBarBubble({ radius }: { radius: number }) {
  const { palette, isDark } = useAppPalette();
  const reduceMotion = useReduceMotion();
  const press = useTabBarPress();
  const ref = useRef<HostInstance>(null);
  const [bar, setBar] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const barRef = useRef(bar);
  barRef.current = bar;

  const x = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  // Horizontal only: the pill grows out from the icon's centre, as
  // Material's indicator does, and stretches while carried.
  const scale = useRef(new Animated.Value(0.6)).current;
  const placed = useRef(false);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((wx, wy, width, height) => {
      setBar(b =>
        b.x === wx && b.y === wy && b.width === width && b.height === height
          ? b
          : { x: wx, y: wy, width, height },
      );
    });
  }, []);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setBar(b => ({ ...b, width, height }));
      measure();
    },
    [measure],
  );

  // Every tab is the same width; take the one under the finger, or any.
  const name = press.hovered ?? press.settled;
  const frame = name ? tabFrame(name) : undefined;
  const tabW = frame?.width ?? 0;
  const w = tabW > 0 ? Math.min(PILL_W, tabW - INSET_X * 2) : 0;
  const h = PILL_H;
  // Centred on the icons' own band (the icons report where they are);
  // until they have, a fair guess from the tab's box.
  const band = iconBand();
  const centreY =
    band != null
      ? band.y + band.height / 2 - bar.y
      : (frame?.y != null ? frame.y - bar.y : 0) + (frame?.height ?? bar.height) * 0.36;
  const top = Math.max(0, Math.min(bar.height - h, centreY - h / 2));

  /** The bubble's left edge, in bar coordinates, centred on a window x. */
  const leftFor = useCallback(
    (windowCentre: number) => {
      const b = barRef.current;
      const left = windowCentre - b.x - w / 2;
      return Math.min(Math.max(left, INSET_X), Math.max(INSET_X, b.width - w - INSET_X));
    },
    [w],
  );

  // A held finger, straight to the native value: no render, no spring —
  // the bubble is under the finger, not chasing it.
  useEffect(() => {
    onFinger(pageX => {
      x.stopAnimation();
      x.setValue(leftFor(pageX));
    });
    return () => onFinger(null);
  }, [leftFor, x]);

  // A new press: the bar may have moved since it was laid out.
  useEffect(() => {
    if (press.hovered && !press.held) measure();
  }, [press.hovered, press.held, measure]);

  useEffect(() => {
    const spatial = { ...resolveSpring('spatial', reduceMotion), useNativeDriver: true };
    const centreOf = (n: string | null) => {
      const f = n ? tabFrame(n) : undefined;
      return f ? f.x + f.width / 2 : null;
    };

    if (press.hovered) {
      // Held, the finger places it (`onFinger`); this only places it
      // under the tab a press began on.
      const target = centreOf(press.hovered);
      if (!placed.current && target != null) {
        // Appears where the finger is; it does not fly in from elsewhere.
        x.setValue(leftFor(target));
        placed.current = true;
      }
      Animated.spring(shown, { toValue: 1, ...spatial }).start();
      Animated.spring(scale, { toValue: press.held ? STRETCH : 1, ...spatial }).start();
      return;
    }

    // Lifted: glide home to the tab it landed on, then fade.
    placed.current = false;
    const home = centreOf(press.settled);
    if (home != null) Animated.spring(x, { toValue: leftFor(home), ...spatial }).start();
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, ...spatial }),
      Animated.timing(shown, {
        toValue: 0,
        duration: reduceMotion ? 0 : 260,
        delay: reduceMotion ? 0 : 140,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) scale.setValue(0.6);
    });
  }, [press, leftFor, reduceMotion, scale, shown, x]);

  const wash = withAlpha(palette.accentSolid, isDark ? 0.24 : 0.16);
  return (
    <View ref={ref} onLayout={onLayout} pointerEvents="none" style={[styles.fill, { borderRadius: radius }]}>
      {w > 0 ? (
        <Animated.View
          testID="tab-bar-bubble"
          style={[
            styles.pill,
            {
              top,
              width: w,
              height: h,
              backgroundColor: wash,
              opacity: shown,
              transform: [{ translateX: x }, { scaleX: scale }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  // `left: 0` + translateX in bar coordinates. Window x does not mirror,
  // so neither does this — in an RTL layout the frames are already where
  // the tabs are drawn.
  pill: { position: 'absolute', left: 0, borderRadius: PILL_H / 2 },
});
