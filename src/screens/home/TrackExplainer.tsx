/**
 * Tap the Track to have it explained.
 *
 * The Track (trackModel.ts) draws a chart with no labels on it, on
 * purpose: a legend on the hero would be read every time to tell you what
 * you learned the first time. So the band itself is the way to ask. A tap
 * on it puts one short card over the chart — what the curve is, what the
 * straight line is, what the ring and the bold stretch are — in the
 * night's terms when the chart is the moon's; a second tap, or a few
 * seconds, takes it away. Nothing else on the hero moves.
 *
 * The band is the tap target, not the chart's lines: they are a hairline
 * and a dot, and a band the height of the sky is a target a thumb finds.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import type { TrackKind } from './trackModel';

/** How long the card stays if nobody taps it away, ms. */
const EXPLAIN_MS = 7000;

function TrackExplainerImpl({
  kind,
  prayer,
  ink,
  style,
}: {
  kind: TrackKind;
  /** The next prayer's name, as the eyebrow says it. */
  prayer: string;
  /** The hero's ink at the band, '#FFFFFF' or '#000000' (skyInkAt). */
  ink: string;
  /** The band's own box: the spacer it stands in for. */
  style: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (reduceMotion) {
      fade.setValue(0);
      setOpen(false);
      return;
    }
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setOpen(false));
  }, [fade, reduceMotion]);

  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    if (reduceMotion) fade.setValue(1);
    else Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timer.current = setTimeout(close, EXPLAIN_MS);
  }, [open, close, fade, reduceMotion]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const text =
    kind === 'moon'
      ? t('home.trackExplainMoon', {
          defaultValue:
            "The curve is the moon's path across tonight's sky, to scale where you are; the straight line is the horizon. The ring is where it will be at {{prayer}}, and the bold stretch is the time until then.",
          prayer,
        })
      : t('home.trackExplainSun', {
          defaultValue:
            "The curve is the sun's path across today's sky, to scale where you are; the straight line is the horizon. The ring is where it will be at {{prayer}}, and the bold stretch is the time until then.",
          prayer,
        });
  // A card that reads on either sky: the ink's opposite, most of the way.
  const light = ink.toUpperCase() !== '#FFFFFF';
  return (
    <Pressable
      style={style}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={t('home.trackExplainA11y', 'What the line shows')}
      accessibilityHint={open ? undefined : text}>
      {open ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.card, light ? styles.cardLight : styles.cardDark, { opacity: fade }]}>
          <Text style={[styles.text, { color: ink }]}>{text}</Text>
        </Animated.View>
      ) : (
        <View />
      )}
    </Pressable>
  );
}

export const TrackExplainer = memo(TrackExplainerImpl);

const styles = StyleSheet.create({
  // Over the band's foot and up from there: it covers the chart it
  // explains and never the figures under it, which are drawn after.
  card: {
    position: 'absolute',
    bottom: SPACING.sm,
    start: 0,
    end: 0,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  // tokens-ok-line: a veil over a sky the theme does not paint
  cardDark: { backgroundColor: 'rgba(0,0,0,0.72)' },
  // tokens-ok-line: a veil over a sky the theme does not paint
  cardLight: { backgroundColor: 'rgba(255,255,255,0.88)' },
  text: { fontSize: TYPE.footnote.fontSize, lineHeight: TYPE.footnote.lineHeight },
});
