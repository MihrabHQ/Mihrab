// hover-ok: compact chip on the hero's sky; the pressed opacity is the
// right affordance here, as on the other home chips.
/**
 * The way into Settings → About → Help Mihrab, from the Today hero.
 *
 * A small clear circle with a heart, on the trailing end of the "Fajr in"
 * line above the countdown — the side of the hero with nothing else on
 * it. After a few seconds it opens into a line — "Help Mihrab grow" —
 * unrolling back toward the eyebrow while the heart stays where it was,
 * so it is noticed without being the first thing on the screen: the
 * prayer time is what the page opens for, and it gets the first look.
 * Fifteen seconds later it folds back into the circle (`SHOWN_FOR_MS`).
 *
 * Drawn in the sky's own ink (`skyModel`), like the location and Qibla
 * chips in the row above it, with no card of its own: a hairline ring
 * and a faint wash of the same ink, so it reads as part of the sky at
 * dawn and at midnight alike.
 *
 * Reduce Motion: it is simply open, no growing, and simply closes.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { typeStyle } from '../../theme/typography';
import type { SkyInkColors } from './skyModel';

/** The circle, closed. */
const SIZE = 30;
/** Slack past the measured line (which carries its own leading padding). */
const LINE_PAD = 2;
/** How long the circle stays a circle before it opens. */
export const EXPAND_AFTER_MS = 2500;
const EXPAND_MS = 450;
/**
 * How long the line stays open before folding back into the circle. It
 * is an invitation, not a fixture: after this the heart is enough to
 * find it again, and the hero is the countdown's.
 */
export const SHOWN_FOR_MS = 15000;

/** `#RRGGBB` at an opacity; anything else is passed back as it is. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function Heart({ color }: { color: string }) {
  return (
    <Svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no">
      <Path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function HelpMihrabChipImpl({
  ink,
  onPress,
}: {
  ink: SkyInkColors;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const label = t('home.helpMihrabChip', 'Help Mihrab grow');
  // The line's width, measured off-screen, so the circle knows how far
  // to open — in every language, at every text size.
  const [lineW, setLineW] = useState(0);
  const open = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lineW === 0) return undefined;
    if (reduceMotion) {
      // No growing: open at once, and back to the circle when the time
      // is up, without the slide either way.
      open.setValue(1);
      const id = setTimeout(() => open.setValue(0), SHOWN_FOR_MS);
      return () => clearTimeout(id);
    }
    const timing = (toValue: number, delay: number) =>
      Animated.timing(open, {
        toValue,
        delay,
        duration: EXPAND_MS,
        easing: Easing.out(Easing.cubic),
        // Width is a layout property: the JS driver, for two short runs.
        useNativeDriver: false,
      });
    const anim = Animated.sequence([
      timing(1, EXPAND_AFTER_MS),
      timing(0, SHOWN_FOR_MS),
    ]);
    anim.start();
    return () => anim.stop();
  }, [lineW, reduceMotion, open]);

  const width = open.interpolate({
    inputRange: [0, 1],
    outputRange: [SIZE, SIZE + lineW + LINE_PAD],
  });
  // The words arrive once there is room for them, not squeezed in early.
  const lineOpacity = open.interpolate({
    inputRange: [0.55, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.wrap}>
      <View
        style={styles.measure}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Text
          style={[typeStyle('caption'), styles.label]}
          numberOfLines={1}
          onLayout={e => setLineW(Math.ceil(e.nativeEvent.layout.width))}>
          {label}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t(
          'settings.helpMihrabBlurb',
          'Rate it, tell people about it, share a month of prayer times.',
        )}
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => pressed && styles.pressed}>
        <Animated.View
          style={[
            styles.pill,
            {
              width,
              borderColor: withAlpha(ink.text, 0.35),
              backgroundColor: withAlpha(ink.text, 0.08),
            },
          ]}>
          <View style={styles.icon}>
            <Heart color={ink.text} />
          </View>
          <Animated.Text
            style={[
              typeStyle('caption'),
              styles.label,
              { color: ink.text, opacity: lineOpacity },
            ]}
            numberOfLines={1}>
            {label}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export const HelpMihrabChip = memo(HelpMihrabChipImpl);

const styles = StyleSheet.create({
  // Taller than the eyebrow it shares a line with; the negative margin
  // keeps that line — and the countdown under it — where it was.
  wrap: { marginVertical: -6 },
  // Heart at the trailing end, so it holds still while the pill opens
  // toward the leading side.
  pill: {
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // The circle's own square, so the heart stays centred in it while the
  // line opens beside it.
  icon: {
    width: SIZE - StyleSheet.hairlineWidth * 4,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '600', paddingStart: 12 },
  // Laid out for its width and never seen. A box far wider than any
  // label, so the text sizes to itself rather than to the closed circle.
  measure: {
    position: 'absolute',
    opacity: 0,
    start: 0,
    top: 0,
    width: 2000,
    alignItems: 'flex-start',
  },
  pressed: { opacity: 0.6 },
});
