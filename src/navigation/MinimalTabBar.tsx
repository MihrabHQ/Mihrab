import { useEffect, useMemo, useRef } from 'react';
import { Animated, I18nManager, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { hapticScrubStart, hapticScrubTick } from '../polish/haptics';
import { linearDown, withAlpha } from '../screens/home/skyPaint';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAppPalette } from '../hooks/useAppPalette';
import { MINIMAL_TAB_BAR_HEIGHT, useTabBarBottom } from './tabBarInset';
import { useTabBarHidden } from './tabBarVisibility';
import { scrimColor } from './TabBarScrim';
import {
  PAGER_TRANSITION_MS,
  pagerEdges,
  pagerEngaged,
  pagerHold,
  pagerPosition,
  setPagerEngaged,
  settlePagerBase,
  settlePagerHold,
} from './minimalPager';

/**
 * The tab bar under Minimal (settings.minimalUi): a row of dots, one a
 * tab, the current one lit — the page indicator of a pager, which is
 * what the tabs are under Minimal: a swipe across the page turns to the
 * next one (`MinimalSwipe`), and a dot is the way to any of them at
 * once. Laid over the page rather than in flow, so Today's sky runs
 * under it; the pages keep clear of it by `useTabBarInset`.
 *
 * While a page is turning — under a finger, or sliding after a tap on a
 * dot — each dot shows its tab's icon instead, the current one a little
 * larger, and the lit one moves with the page: half way across, the two
 * icons are half lit each. As the turn settles the icons go back to
 * dots.
 *
 * A finger HELD on a dot and slid along the row does the same by hand:
 * the icons come up, the lit one follows the finger from dot to dot and
 * the page leans the way it is going, and the tab under the finger when
 * it lifts is the one opened — the full bar's hold-and-slide, on dots.
 *
 * No labels: six words along the foot were the one line of chrome
 * Minimal still had, and a dot says "there are six pages and this is the
 * second" with none of them. Each dot still answers to a screen reader
 * with the tab's name.
 */
const DOT = 6;
const ICON = 16;
const HIT = 44;
const FADE_REACH = 20;

export function MinimalTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { palette } = useAppPalette();
  const bottom = useTabBarBottom();
  const hidden = useTabBarHidden();
  const { width } = useWindowDimensions();
  /**
   * Where the page is, as a fraction of a tab: the tab the navigator is
   * on, slid to on a change over the navigator's own time, plus how far
   * the finger has it — so under a finger it runs ahead to the next tab,
   * and on a release that turns the two parts cross over without a jump.
   */
  const first = useRef(true);
  useEffect(() => {
    settlePagerBase(state.index, !first.current);
    first.current = false;
  }, [state.index]);
  // Built for the tab the pages are on (which neighbours exist), as the
  // pages build theirs: the same shaped drag, so the dots and the pages
  // never disagree.
  const position = useMemo(
    () => pagerPosition(width, pagerEdges(state.index, state.routes.length)),
    [width, state.index, state.routes.length],
  );
  // The hold-and-slide. Read in the gesture's callbacks without
  // rebuilding the gesture on every tab change.
  const live = useRef({ index: state.index, count: state.routes.length, width });
  live.current = { index: state.index, count: state.routes.length, width };
  const lastSlot = useRef(state.index);
  const slotAt = (x: number) => {
    const { count, width: w } = live.current;
    const start = (w - count * HIT) / 2;
    let fromLeft = (x - start) / HIT - 0.5;
    if (I18nManager.isRTL) fromLeft = count - 1 - fromLeft;
    return Math.max(0, Math.min(count - 1, fromLeft));
  };
  const hold = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(160)
        .runOnJS(true)
        .onStart(e => {
          setPagerEngaged(true);
          hapticScrubStart();
          lastSlot.current = Math.round(slotAt(e.x));
          pagerHold.setValue(slotAt(e.x) - live.current.index);
        })
        .onUpdate(e => {
          const pos = slotAt(e.x);
          const slot = Math.round(pos);
          if (slot !== lastSlot.current) {
            lastSlot.current = slot;
            hapticScrubTick(true);
          }
          pagerHold.setValue(pos - live.current.index);
        })
        .onEnd(e => {
          const target = Math.round(slotAt(e.x));
          const route = state.routes[target];
          if (route && target !== live.current.index) {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented) {
              settlePagerBase(target);
              navigation.navigate(route.name, route.params);
            }
          }
          settlePagerHold(() => setPagerEngaged(false));
        })
        .onFinalize((_e, success) => {
          if (!success) settlePagerHold(() => setPagerEngaged(false));
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigation, state.routes],
  );
  const dotsOpacity = useMemo(
    () => pagerEngaged.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [],
  );

  if (hidden) return null;
  // Under every page but Today a fade of the page's colour, so a list
  // scrolling under the dots does not run through them. Today's sky is
  // the ground the dots were drawn for.
  const onSky = state.routes[state.index]?.name === 'TodayTab';
  const fade = onSky ? null : scrimColor(palette.bg);
  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { height: MINIMAL_TAB_BAR_HEIGHT + bottom, paddingBottom: bottom }]}
      accessibilityRole="tablist">
      {fade ? (
        <View
          pointerEvents="none"
          style={[
            styles.fade,
            {
              height: MINIMAL_TAB_BAR_HEIGHT + bottom + FADE_REACH,
              backgroundImage: linearDown([
                [withAlpha(fade, 0), 0],
                [withAlpha(fade, 0.92), 0.6],
                [fade, 1],
              ]),
            },
          ]}
        />
      ) : null}
      <GestureDetector gesture={hold}>
      <View style={styles.row} collapsable={false}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;
        // How much this tab is the current one: 1 on it, 0 a tab away.
        const near = position.interpolate({
          inputRange: [index - 1, index, index + 1],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        });
        const Icon = options.tabBarIcon;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={options.tabBarButtonTestID}
            hitSlop={6}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (focused || event.defaultPrevented) return;
              // The icons show for the slide, as under a finger.
              setPagerEngaged(true);
              setTimeout(() => setPagerEngaged(false), PAGER_TRANSITION_MS + 60);
              settlePagerBase(index);
              navigation.navigate(route.name, route.params);
            }}
            style={styles.hit}>
            <Animated.View
              style={[
                styles.dot,
                {
                  backgroundColor: palette.textSolid,
                  opacity: Animated.multiply(
                    dotsOpacity,
                    near.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.9] }),
                  ),
                },
              ]}
            />
            {Icon ? (
              <Animated.View
                style={[
                  styles.icon,
                  {
                    opacity: Animated.multiply(
                      pagerEngaged,
                      near.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                    ),
                    transform: [{ scale: near.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] }) }],
                  },
                ]}>
                {Icon({ color: String(palette.textSolid), size: ICON, focused })}
              </Animated.View>
            ) : null}
          </Pressable>
        );
      })}
      </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // The dots' row, the width of the window, so a held finger's place in it
  // is its place along the window (`slotAt`).
  row: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  // A dot is six points; the thing under the thumb is forty-four.
  hit: { width: HIT, height: MINIMAL_TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  // Over the dot, in the same spot: one or the other shows.
  icon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
