/**
 * The minimal Today's sheet: how the day's times come up over the page.
 *
 * The page has one move in it, and this is it, so it is drawn by hand
 * rather than left to the platform's modal. The platform slid the whole
 * window up — the dimming came up with the card as one black plane and
 * landed with a thud — and dimmed the page flat, so the sky, the one
 * thing the minimal page keeps, went dull under a sheet of soot.
 *
 * Here the two move apart. The page RECEDES: it eases back a few percent
 * and darkens through a veil that is lighter over the sky than down by
 * the sheet — a shadow the sheet casts, not a lid. The sheet comes up on
 * its own spring, settling without a bounce, and goes down the same way;
 * a drag down on it follows the finger and lets go past a threshold.
 * One value, `progress`, drives all of it, so the page's retreat and the
 * sheet's rise are one motion — and the page's owner may drive the same
 * value from a finger on the page, so a drag up starts the retreat
 * before the sheet is even there (TodayCard's `swipeUp`).
 *
 * Under Reduce Motion nothing scales or slides: the veil and the sheet
 * fade.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { RADIUS, SPACING } from '../../theme/tokens';

/** How far the page eases back under the sheet. */
export const MINIMAL_SHEET_PAGE_SCALE = 0.94;
/** The veil over the sky, and the veil down by the sheet. */
const VEIL_TOP = 0.22;
const VEIL_FOOT = 0.58;
/** A drag down this far, or this fast, lets the sheet go. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
/** The sheet's height before it has been measured: off the screen. */
const UNMEASURED = 1200;

export const MINIMAL_SHEET_OPEN = { damping: 30, stiffness: 300, mass: 1 } as const;
export const MINIMAL_SHEET_CLOSE_MS = 220;

/**
 * The transform the page takes from the sheet's `progress`: back by a
 * few percent, in place, under Reduce Motion none at all.
 */
export function pageRecess(progress: Animated.Value, reduceMotion: boolean) {
  if (reduceMotion) return [];
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, MINIMAL_SHEET_PAGE_SCALE],
    extrapolate: 'clamp',
  });
  return [{ scale }];
}

export function MinimalSheet({
  visible,
  onClose,
  progress,
  children,
  closeLabel = 'Close',
}: {
  visible: boolean;
  onClose: () => void;
  /** 0 the page alone, 1 the sheet up; owned by the page so it can recede with it. */
  progress: Animated.Value;
  children: ReactNode;
  closeLabel?: string;
}) {
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();
  // The modal stays up through the close so the sheet can go down.
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(0);
  const drag = useRef(new Animated.Value(0)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const rise = useCallback(() => {
    progress.stopAnimation();
    const up = reduceMotion
      ? Animated.timing(progress, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true })
      : Animated.spring(progress, { toValue: 1, ...MINIMAL_SHEET_OPEN, useNativeDriver: true });
    up.start();
    running.current = up;
  }, [progress, reduceMotion]);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      if (mounted) {
        // Opened again while going down: up from where it is.
        rise();
      } else {
        // The rise waits for the window: a modal is a frame or two
        // coming, and a spring started now would be part way up by its
        // first frame — the sheet would appear rather than arrive.
        setMounted(true);
      }
      return () => running.current?.stop();
    }
    if (!mounted) return undefined;
    progress.stopAnimation();
    const down = Animated.timing(progress, {
      toValue: 0,
      duration: MINIMAL_SHEET_CLOSE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    down.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => down.stop();
    // `mounted` is read, not a reason to run: the close runs once, when
    // `visible` drops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, progress, rise]);

  const onLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    setSheetHeight(Math.round(e.nativeEvent.layout.height));
  }, []);

  // A drag down on the sheet: it follows, and past the threshold goes.
  const pull = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-16, 16])
    .runOnJS(true)
    .onUpdate(e => {
      drag.setValue(Math.max(0, e.translationY));
    })
    .onEnd(e => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        // Hand the rest of the way to the close: the sheet is already
        // part way down, so the close starts from there.
        const h = sheetHeight || UNMEASURED;
        progress.setValue(Math.max(0, 1 - e.translationY / h));
        drag.setValue(0);
        onClose();
      } else {
        Animated.spring(drag, { toValue: 0, damping: 24, stiffness: 320, mass: 1, useNativeDriver: true }).start();
      }
    });

  if (!mounted) return null;

  const climb = reduceMotion
    ? 0
    : progress.interpolate({
        inputRange: [0, 1],
        outputRange: [sheetHeight || UNMEASURED, 0],
        extrapolate: 'clamp',
      });
  const lift = reduceMotion ? drag : Animated.add(climb, drag);
  const veil = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const fade = reduceMotion ? veil : 1;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={rise} onRequestClose={onClose}>
      {/* Its own gesture root: on Android a modal is a window of its own,
          and the handlers in it need one. */}
      <GestureHandlerRootView style={styles.fill}>
        {/* The veil: a shadow the sheet casts up the page — light over the
            sky, deep at the sheet's edge. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: veil }]} pointerEvents="none">
          <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
            <Defs>
              <LinearGradient id="minimalVeil" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000" stopOpacity={VEIL_TOP} />
                <Stop offset="0.55" stopColor="#000" stopOpacity={(VEIL_TOP + VEIL_FOOT) / 2} />
                <Stop offset="1" stopColor="#000" stopOpacity={VEIL_FOOT} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="1" height="1" fill="url(#minimalVeil)" />
          </Svg>
        </Animated.View>
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={StyleSheet.absoluteFill} />
        <GestureDetector gesture={pull}>
          <Animated.View
            onLayout={onLayout}
            style={[
              styles.card,
              {
                backgroundColor: palette.card,
                paddingBottom: insets.bottom + SPACING.md,
                maxHeight: windowHeight * 0.92,
                opacity: fade,
                transform: [{ translateY: lift }],
              },
            ]}>
            <View style={[styles.grip, { backgroundColor: palette.muted }]} />
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  card: {
    width: '100%',
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopLeftRadius: RADIUS.lg, // rtl-safe: top corners are symmetric across LTR/RTL
    borderTopRightRadius: RADIUS.lg, // rtl-safe: top corners are symmetric across LTR/RTL
  },
  // The handle: the sheet says it can be pulled.
  grip: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
    marginBottom: SPACING.sm,
  },
});
