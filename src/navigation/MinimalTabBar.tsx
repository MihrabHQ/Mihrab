import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAppPalette } from '../hooks/useAppPalette';
import { MINIMAL_TAB_BAR_HEIGHT, useTabBarBottom } from './tabBarInset';
import { useTabBarHidden } from './tabBarVisibility';
import { scrimColor } from './TabBarScrim';
import { PAGER_TRANSITION_MS, pagerDrag, pagerEasing, pagerEngaged, setPagerEngaged } from './minimalPager';

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
 * dots. No labels: six words along the foot were the one line of chrome
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
  const base = useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    Animated.timing(base, {
      toValue: state.index,
      duration: PAGER_TRANSITION_MS,
      easing: pagerEasing,
      useNativeDriver: true,
    }).start();
  }, [base, state.index]);
  const position = useMemo(
    () => Animated.add(base, Animated.divide(pagerDrag, -Math.max(1, width))),
    [base, width],
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
        <View pointerEvents="none" style={[styles.fade, { height: MINIMAL_TAB_BAR_HEIGHT + bottom + FADE_REACH }]}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="minimalTabFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fade} stopOpacity={0} />
                <Stop offset="0.6" stopColor={fade} stopOpacity={0.92} />
                <Stop offset="1" stopColor={fade} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#minimalTabFade)" />
          </Svg>
        </View>
      ) : null}
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
  // A dot is six points; the thing under the thumb is forty-four.
  hit: { width: HIT, height: MINIMAL_TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  // Over the dot, in the same spot: one or the other shows.
  icon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
