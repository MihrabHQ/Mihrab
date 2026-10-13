/**
 * The reading lock's badge — issue #75.
 *
 * While the page is locked in fullscreen, a small padlock sits in the
 * status band beside the page number — the one strip of the screen that
 * carries no text — in the band's own ink, translucent so it reads as a
 * state and not a control. It is the way out: HOLD it and a disc grows
 * under the padlock for `HOLD_MS`, then the page unlocks with a tick.
 * Out of fullscreen the page bar's lock button does the same job. A tap, or a
 * hold let go early, does not unlock — it asks the reader for the hint
 * instead, the same note a blocked swipe shows — so a brush of the thumb
 * against the corner cannot undo the lock a deliberate hold set.
 *
 * Why a hold and not a tap: the lock exists for the hand that holds the
 * phone, and that hand is nearest the corner the badge sits in.
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { hapticTick } from '../polish/haptics';

/** How long the badge must be held to unlock. */
export const HOLD_MS = 1500;
const SIZE = 32;
const GLYPH = 17;

type Props = {
  /** The page's ink — the glyph, and the disc that fills under it. */
  ink: string;
  /** The page's colour — the badge's ground. */
  ground: string;
  onUnlock: () => void;
  /** A tap, or a hold let go early: show why the page is locked. */
  onHint: () => void;
  testID?: string;
};

/**
 * The hold itself, shared with the page bar's lock button: `begin` on
 * press-in starts the clock and the disc; `end` on press-out before the
 * clock runs out is a tap, not a hold, and asks for the hint. The disc is
 * the badge's; a caller without one can ignore `fill`.
 */
export function useHoldToUnlock(onUnlock: () => void, onHint: () => void) {
  const fill = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    fill.stopAnimation();
  }, [fill]);

  const cancel = useCallback(() => {
    clear();
    Animated.timing(fill, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [clear, fill]);

  const begin = useCallback(() => {
    done.current = false;
    fill.setValue(0);
    Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
    timer.current = setTimeout(() => {
      timer.current = null;
      done.current = true;
      void hapticTick();
      onUnlock();
    }, HOLD_MS);
  }, [fill, onUnlock]);

  const end = useCallback(() => {
    if (done.current) return;
    cancel();
    onHint();
  }, [cancel, onHint]);

  useEffect(() => () => clear(), [clear]);

  return { fill, begin, end };
}

function ReadingLockBadgeImpl({ ink, ground, onUnlock, onHint, testID }: Props) {
  const { t } = useTranslation();
  const { fill, begin, end } = useHoldToUnlock(onUnlock, onHint);

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={t('quran.touchLockBadge', 'Page locked. Hold to unlock.')}
        hitSlop={10}
        onPressIn={begin}
        onPressOut={end}
        style={[styles.badge, { backgroundColor: ground, borderColor: ink }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.disc,
            {
              backgroundColor: ink,
              transform: [{ scale: fill }],
            },
          ]}
        />
        <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" fill="none">
          {/* The shackle, then the body. */}
          <Path
            d="M7 11V8a5 5 0 0 1 10 0v3"
            stroke={ink}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Rect x="5" y="11" width="14" height="10" rx="2.5" fill={ink} />
          {/* The keyhole, in the ground colour, so the body reads as a lock. */}
          <Rect x="11" y="14" width="2" height="4" rx="1" fill={ground} />
        </Svg>
      </Pressable>
    </View>
  );
}

export const ReadingLockBadge = memo(ReadingLockBadgeImpl);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.72,
    overflow: 'hidden',
  },
  disc: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    opacity: 0.22,
  },
});
