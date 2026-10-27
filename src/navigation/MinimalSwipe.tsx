import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, I18nManager, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { hapticScrubTick } from '../polish/haptics';
import {
  pagerDrag,
  pagerPosition,
  setPagerEngaged,
  settlePagerBase,
  settlePagerDrag,
  springPagerDrag,
  usePagerBlockers,
} from './minimalPager';

/**
 * Under Minimal (settings.minimalUi) the tabs are pages: the page moves
 * with the finger, and a drag far or fast enough turns to the next one,
 * the way the dots at the foot say it will (`MinimalTabBar`). Wrapped
 * round every tab's screen by the navigator.
 *
 * The page follows the finger from the first few points across — early,
 * so a row under the finger lets go of its press as soon as the drag is
 * plainly sideways rather than holding it lit to the end — and a drag
 * that is plainly down a list fails first and goes on as the list's
 * scroll. The pages that used to turn sideways themselves (the Quran's
 * three lists, the Log's days) stand that down under Minimal rather than
 * fight it. At either end of the row the page gives a little and comes
 * back. Mirrored in a right-to-left language: the next page is on the
 * left.
 */
const TURN_FRACTION = 0.3;
const TURN_VELOCITY = 600;
/** How much of the finger the page follows past the last tab. */
const EDGE_GIVE = 0.22;

export function MinimalSwipe({
  enabled,
  routeKey,
  children,
}: {
  enabled: boolean;
  /** The tab this wraps — its place on the strip is its place in the row. */
  routeKey: string;
  children: ReactNode;
}) {
  const navigation = useNavigation();
  const routes = useNavigationState(s => s.routes);
  const index = useNavigationState(s => s.index);
  const myIndex = routes.findIndex(r => r.key === routeKey);
  const { width } = useWindowDimensions();
  // Read in the gesture's callbacks without rebuilding the gesture on
  // every tab change: a gesture rebuilt mid-drag is a drag cut short.
  const live = useRef({ routes, index, width });
  live.current = { routes, index, width };
  const busy = useRef(false);
  // The graphs that scroll sideways themselves: the swipe waits for them.
  const blockers = usePagerBlockers();

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .requireExternalGestureToFail(...blockers)
        .activeOffsetX([-10, 10])
        .failOffsetY([-12, 12])
        .runOnJS(true)
        .onStart(() => {
          if (busy.current) return;
          setPagerEngaged(true);
        })
        .onUpdate(e => {
          if (busy.current) return;
          const { routes: rs, index: i, width: w } = live.current;
          let step = e.translationX < 0 ? 1 : -1;
          if (I18nManager.isRTL) step = -step;
          const give = rs[i + step] ? 1 : EDGE_GIVE;
          pagerDrag.setValue(Math.max(-w, Math.min(w, e.translationX * give)));
        })
        .onEnd(e => {
          if (busy.current) return;
          const { routes: rs, index: i, width: w } = live.current;
          const far = Math.abs(e.translationX) >= w * TURN_FRACTION || Math.abs(e.velocityX) >= TURN_VELOCITY;
          // A flick back the way the page came is not a turn.
          const sameWay = e.velocityX === 0 || Math.sign(e.velocityX) === Math.sign(e.translationX);
          let step = e.translationX < 0 ? 1 : -1;
          if (I18nManager.isRTL) step = -step;
          const next = far && sameWay ? rs[i + step] : undefined;
          busy.current = true;
          const done = () => {
            busy.current = false;
            setPagerEngaged(false);
          };
          if (!next) {
            springPagerDrag(done);
            return;
          }
          // A faint tick, not a knock: a page turning is not a count.
          hapticScrubTick(true);
          // The settled tab slides to the next while the drag runs back to
          // zero: the position, and so every page, carries on from where
          // the finger left it (minimalPager.ts).
          settlePagerBase(i + step);
          navigation.navigate(next.name as never);
          settlePagerDrag(done);
        })
        .onFinalize((_e, success) => {
          if (!success && !busy.current) springPagerDrag(() => setPagerEngaged(false));
        }),
    [enabled, navigation, blockers],
  );
  // This page's place on the strip: as many page-widths aside as it is
  // tabs from the position — the one number the dots read too, so the
  // pages and the dots can never disagree, and a page two tabs away is
  // two pages away, under a finger and through a turn alike.
  // This page's place on the strip: as many page-widths aside as it is
  // tabs from the position — the one number the dots read too, so the
  // pages and the dots can never disagree, and a page two tabs away is
  // two pages away, under a finger and through a turn alike.
  const offset = useMemo(
    () =>
      Animated.multiply(
        Animated.subtract(myIndex, pagerPosition(width)),
        I18nManager.isRTL ? -width : width,
      ),
    [myIndex, width],
  );
  // The full page: no strip, no offset — the navigator places the one
  // page on show, and a page stood a width aside here would be a blank
  // tab. (The dots, which settle the position, are not even mounted.)
  if (!enabled) return <View style={styles.fill}>{children}</View>;
  return (
    <GestureDetector gesture={gesture}>
      {/* One native view for the detector, and the page's offset on it. */}
      <Animated.View
        style={[styles.fill, { transform: [{ translateX: offset }] }]}
        collapsable={false}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
