/**
 * Tap the Track to have it explained — on the chart itself.
 *
 * The Track (trackModel.ts) carries no labels, on purpose: a legend on the
 * hero would be read every time to say what was learned the first time.
 * So the band is the way to ask. A tap names the chart's parts where they
 * are drawn — the path over its arc, the horizon on its line, the next
 * prayer beside its ring — in small muted type, and a second tap, or a few
 * seconds, takes the names away (HeroTrack draws them; this is the tap and
 * the clock). A screen reader hears the band as a button whose hint is the
 * whole sentence.
 *
 * The band is the target, not the chart's lines: they are a hairline and
 * a dot, and a band the height of the sky is a target a thumb finds.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import type { TrackKind } from './trackModel';

/** How long the names stay if nobody taps them away, ms. */
const EXPLAIN_MS = 6000;

/**
 * The names' opacity, 0 when hidden, and the tap that shows or hides them.
 * One value for the hero, read by HeroTrack's labels.
 */
export function useTrackExplain(): { opacity: Animated.Value; toggle: () => void; open: boolean } {
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (reduceMotion) {
      opacity.setValue(0);
      setOpen(false);
      return;
    }
    // Faded out, then not drawn at all.
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setOpen(false));
  }, [opacity, reduceMotion]);
  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    opacity.setValue(0);
    setOpen(true);
    if (reduceMotion) opacity.setValue(1);
    else Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    timer.current = setTimeout(close, EXPLAIN_MS);
  }, [open, close, opacity, reduceMotion]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { opacity, toggle, open };
}

function TrackExplainerImpl({
  kind,
  prayer,
  onPress,
  style,
}: {
  kind: TrackKind;
  /** The next prayer's name, as the eyebrow says it. */
  prayer: string;
  onPress: () => void;
  /** The band's own box: the spacer it stands in for. */
  style: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const sentence =
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
  return (
    <Pressable
      style={style}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.trackExplainA11y', 'What the line shows')}
      accessibilityHint={sentence}
    />
  );
}

export const TrackExplainer = memo(TrackExplainerImpl);
