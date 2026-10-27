import { useMemo, type ReactNode } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { hapticTick } from '../polish/haptics';

/**
 * Under Minimal (settings.minimalUi) the tabs are pages: a swipe across
 * one turns to the next, the way the dots at the foot say it will
 * (`MinimalTabBar`). Wrapped round every tab's screen by the navigator.
 *
 * Only a clearly sideways drag — the pan has to move 28pt across before
 * it moves 20pt down — so a list's own scroll is never taken, and the
 * pages that used to turn sideways themselves (the Quran's three lists,
 * the Log's days) stand that down under Minimal rather than fight it.
 * Mirrored in a right-to-left language: the next page is on the left.
 */
const TURN_DISTANCE = 56;
const TURN_VELOCITY = 500;

export function MinimalSwipe({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const navigation = useNavigation();
  const routes = useNavigationState(s => s.routes);
  const index = useNavigationState(s => s.index);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-28, 28])
        .failOffsetY([-20, 20])
        .runOnJS(true)
        .onEnd(e => {
          const far = Math.abs(e.translationX) >= TURN_DISTANCE || Math.abs(e.velocityX) >= TURN_VELOCITY;
          if (!far) return;
          // A drag to the left reveals the page on the right.
          let step = e.translationX < 0 ? 1 : -1;
          if (I18nManager.isRTL) step = -step;
          const next = routes[index + step];
          if (!next) return;
          void hapticTick();
          navigation.navigate(next.name as never);
        }),
    [enabled, routes, index, navigation],
  );
  return (
    <GestureDetector gesture={gesture}>
      {/* A plain view: the detector needs one native child to attach to. */}
      <GestureHost>{children}</GestureHost>
    </GestureDetector>
  );
}

function GestureHost({ children }: { children: ReactNode }) {
  return (
    <View style={styles.fill} collapsable={false}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
