/**
 * The tab bar's press, drawn — a glossy bubble that lives INSIDE the bar.
 *
 * Rendered as the bar's `tabBarBackground`, so it sits behind the icons
 * and labels and is clipped by the bar's own rounded silhouette: whatever
 * it does, it cannot leave the pill. (The halo it replaces was drawn on
 * the icon, sized by the icon, and spilled over the bar's top edge.)
 *
 * It reads the press from `tabBarPress`:
 *   • tap        — springs in under the tab, fades as the finger lifts;
 *   • hold       — lifts a little, then follows the finger along the bar;
 *   • lift       — glides to the tab it was released over, then fades.
 *
 * Its size is the tab's, less a small inset on every side, with corners
 * concentric to the bar's — a pill that hugs one icon and its label.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type HostInstance, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAppPalette } from '../hooks/useAppPalette';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { resolveSpring } from '../theme/motion';
import { tabFrame, useTabBarPress } from './tabBarPress';

/** Air between the bubble and the bar's edges, and between it and the next tab. */
const INSET_X = 4;
const INSET_Y = 4;
/** How much a held bubble lifts. */
const LIFT = 1.06;
/** A finger-following spring: tight enough to keep up, soft enough to glide. */
const FOLLOW = { stiffness: 520, damping: 34, mass: 0.7 };

export function TabBarBubble({ radius }: { radius: number }) {
  const { palette } = useAppPalette();
  const reduceMotion = useReduceMotion();
  const press = useTabBarPress();
  const ref = useRef<HostInstance>(null);
  const [bar, setBar] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const barRef = useRef(bar);
  barRef.current = bar;

  const x = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
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
  const w = Math.max(0, tabW - INSET_X * 2);
  // The tab's own box, not the bar's: an in-flow bar also holds the
  // gesture-nav inset under the tabs, and the bubble belongs to the tabs.
  const tabTop = frame?.y != null ? Math.max(0, frame.y - bar.y) : 0;
  const tabH = frame?.height ?? bar.height;
  const h = Math.max(0, Math.min(tabH, bar.height - tabTop) - INSET_Y * 2);

  /** The bubble's left edge, in bar coordinates, centred on a window x. */
  const leftFor = useCallback(
    (windowCentre: number) => {
      const b = barRef.current;
      const left = windowCentre - b.x - w / 2;
      return Math.min(Math.max(left, INSET_X), Math.max(INSET_X, b.width - w - INSET_X));
    },
    [w],
  );

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
      const target =
        press.held && press.fingerX != null ? press.fingerX : centreOf(press.hovered);
      if (target == null) return;
      const left = leftFor(target);
      if (!placed.current) {
        // Appears where the finger is; it does not fly in from elsewhere.
        x.setValue(left);
        placed.current = true;
      } else {
        Animated.spring(x, {
          toValue: left,
          ...(press.held && !reduceMotion ? FOLLOW : spatial),
          useNativeDriver: true,
        }).start();
      }
      Animated.spring(shown, { toValue: 1, ...spatial }).start();
      Animated.spring(scale, { toValue: press.held ? LIFT : 1, ...spatial }).start();
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
      if (finished) scale.setValue(0.85);
    });
  }, [press, leftFor, reduceMotion, scale, shown, x]);

  const accent = palette.accentSolid;
  // Concentric with a rounded bar; a soft pill in a square one.
  const r = Math.max(0, Math.min(h / 2, radius > INSET_Y ? radius - INSET_Y : 16));
  return (
    <View ref={ref} onLayout={onLayout} pointerEvents="none" style={[styles.fill, { borderRadius: radius }]}>
      {w > 0 && h > 0 ? (
        <Animated.View
          testID="tab-bar-bubble"
          style={[
            styles.bubble,
            {
              top: tabTop + INSET_Y,
              width: w,
              height: h,
              borderRadius: r,
              opacity: shown,
              transform: [{ translateX: x }, { scale }],
            },
          ]}>
          <Svg width={w} height={h}>
            <Defs>
              <LinearGradient id="bubbleBody" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={accent} stopOpacity={0.16} />
                <Stop offset="1" stopColor={accent} stopOpacity={0.3} />
              </LinearGradient>
              {/* The gloss: a sheen across the upper half, gone by the middle. */}
              <LinearGradient id="bubbleSheen" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0.34} />
                <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.06} />
                <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill="url(#bubbleBody)" />
            <Rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill="url(#bubbleSheen)" />
            <Rect
              x={0.5}
              y={0.5}
              width={w - 1}
              height={h - 1}
              rx={Math.max(0, r - 0.5)}
              ry={Math.max(0, r - 0.5)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.28}
              strokeWidth={1}
            />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  // `left: 0` + translateX in bar coordinates. Window x does not mirror,
  // so neither does this — in an RTL layout the frames are already where
  // the tabs are drawn.
  bubble: { position: 'absolute', left: 0, overflow: 'hidden' },
});
