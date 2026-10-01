/**
 * Tab-bar icons (design review 2e).
 *
 * Thin wrappers over the app's existing icon set so `MainTabs` can pass
 * them straight to `tabBarIcon` — which hands back `{ color, size }` and
 * expects an element. Defined at module scope, not inline in the navigator's
 * options: an arrow function there is a new component type on every render,
 * which throws away the icon's own state each time the tab bar re-renders.
 *
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { withAlpha } from '../quran/ayahMarks';
import { resolveSpring } from '../theme/motion';
import { RADIUS } from '../theme/tokens';
import { useTabHovered } from './tabBarPress';
import {
  DuaHandsIcon,
  MihrabLogoIcon,
  PenIcon,
  QuranBookIcon,
  SettingsGearIcon,
  TasbihIcon,
} from '../theme/icons';
import { desktopSize } from '../responsive/desktop';

type TabIconProps = { color: string; size: number };

/** The halo's diameter, in icon sizes: the glyph with a finger's worth of air around it. */
const HALO_SCALE = 2.1;

/**
 * THE PRESS, DRAWN ON THE ICON.
 *
 * A disc behind the glyph, centred on it and sized by it, that grows in
 * while this tab is under a finger (`tabBarPress`) and fades out when the
 * finger lifts or slides on. It replaces Android's borderless ripple,
 * which was centred on the button's box and sized by it — a grey circle
 * beside the icon rather than around it. One component for all six, so
 * they cannot drift apart.
 */
function Halo({
  name,
  size,
  color,
  children,
}: {
  name: string;
  size: number;
  /** The icon's own tint: the halo is that colour, faint. */
  color: string;
  children: ReactNode;
}) {
  const on = useTabHovered(name);
  const reduceMotion = useReduceMotion();
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(value, {
      toValue: on ? 1 : 0,
      ...resolveSpring('spatial', reduceMotion),
    }).start();
  }, [on, reduceMotion, value]);
  const d = Math.round(size * HALO_SCALE);
  return (
    <View style={styles.slot}>
      {/* Centred by a centring box over the glyph, not by an offset, so
          the maths is the same in a mirrored layout. */}
      <View pointerEvents="none" style={styles.centre}>
        <Animated.View
          style={[
            styles.halo,
            {
              width: d,
              height: d,
              backgroundColor: withAlpha(color, 0.18),
              opacity: value,
              transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
  centre: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center' },
  halo: { borderRadius: RADIUS.full },
});

/**
 * The navigator hands down a size tuned for a touch target. On Mac
 * Catalyst that arrives ~23% smaller than drawn (responsive/desktop.ts),
 * which is what made the bar read as a strip of specks.
 */
const iconSize = (size: number) => desktopSize(size);

/**
 * The wordmark's own logo, not the plain arch. The header says "⌂ Mihrab"
 * with one mark and the tab said "Today" with a different one, so the two
 * places that name the same screen disagreed about what it looks like.
 */
export const TabHomeIcon = ({ color, size }: TabIconProps) => (
  <Halo name="TodayTab" size={iconSize(size)} color={color}>
    <MihrabLogoIcon color={color} size={iconSize(size)} />
  </Halo>
);

export const TabBookIcon = ({ color, size }: TabIconProps) => (
  <Halo name="QuranTab" size={iconSize(size)} color={color}>
    <QuranBookIcon color={color} size={iconSize(size)} />
  </Halo>
);

export const TabTasbihIcon = ({ color, size }: TabIconProps) => (
  <Halo name="TasbihTab" size={iconSize(size)} color={color}>
    <TasbihIcon color={color} size={iconSize(size)} />
  </Halo>
);

export const TabDuasIcon = ({ color, size }: TabIconProps) => (
  <Halo name="DuasTab" size={iconSize(size)} color={color}>
    <DuaHandsIcon color={color} size={iconSize(size)} />
  </Halo>
);

export const TabLogIcon = ({ color, size }: TabIconProps) => (
  <Halo name="LogTab" size={iconSize(size)} color={color}>
    <PenIcon color={color} size={iconSize(size)} />
  </Halo>
);

/**
 * The same cog the Home header used to carry. The tab previously drew a
 * ring with eight radial ticks, which at 22pt reads as a sun or a
 * brightness control before it reads as settings — and it no longer had a
 * gear anywhere else in the app to be consistent with.
 *
 * Stroke 1.8 rather than the icon's own 2: the tab bar sets these smaller
 * than the header chip did, and a 2pt stroke fills the cog's teeth in.
 */
export const TabSettingsIcon = ({ color, size }: TabIconProps) => (
  <Halo name="SettingsTab" size={iconSize(size)} color={color}>
    <SettingsGearIcon color={color} size={iconSize(size)} strokeWidth={1.8} />
  </Halo>
);
