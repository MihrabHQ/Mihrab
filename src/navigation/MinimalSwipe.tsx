import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, I18nManager, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { hapticTick } from '../polish/haptics';
import { pagerDrag, pagerHold, setPagerEngaged, settlePagerDrag, springPagerDrag } from './minimalPager';

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

export function MinimalSwipe({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const navigation = useNavigation();
  const routes = useNavigationState(s => s.routes);
  const index = useNavigationState(s => s.index);
  const { width } = useWindowDimensions();
  // Read in the gesture's callbacks without rebuilding the gesture on
  // every tab change: a gesture rebuilt mid-drag is a drag cut short.
  const live = useRef({ routes, index, width });
  live.current = { routes, index, width };
  const busy = useRef(false);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
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
          void hapticTick();
          // The navigator slides both pages a page's width; the drag runs
          // back to zero under them over the same time (minimalPager.ts).
          navigation.navigate(next.name as never);
          settlePagerDrag(done);
        })
        .onFinalize((_e, success) => {
          if (!success && !busy.current) springPagerDrag(() => setPagerEngaged(false));
        }),
    [enabled, navigation],
  );
  // The page's offset: the finger's drag, or — a finger held on the dots
  // — a page's width for every tab it has slid: the whole strip of pages
  // moves under it, the way the finger on the page moves it.
  const offset = useMemo(
    () => Animated.add(pagerDrag, Animated.multiply(pagerHold, I18nManager.isRTL ? width : -width)),
    [width],
  );
  return (
    <GestureDetector gesture={gesture}>
      {/* One native view for the detector, and the page's offset on it. */}
      <Animated.View style={[styles.fill, { transform: [{ translateX: offset }] }]} collapsable={false}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
