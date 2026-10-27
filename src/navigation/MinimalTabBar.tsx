import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scrimColor } from './TabBarScrim';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAppPalette } from '../hooks/useAppPalette';
import { MINIMAL_TAB_BAR_HEIGHT, useTabBarBottom } from './tabBarInset';
import { useTabBarHidden } from './tabBarVisibility';

/**
 * The tab bar under Minimal (settings.minimalUi): a row of dots, one a
 * tab, the current one lit — the page indicator of a pager, which is
 * what the tabs are under Minimal: a swipe across the page turns to the
 * next one (`MinimalSwipe`), and a dot is the way to any of them at
 * once. Laid over the page rather than in flow, so Today's sky runs
 * under it; the pages keep clear of it by `useTabBarInset`.
 *
 * No labels and no glyphs: six words along the foot were the one line
 * of chrome Minimal still had, and a dot says "there are six pages and
 * this is the second" with none of them. Each dot still answers to a
 * screen reader with the tab's name.
 */
const DOT = 6;
const FADE_REACH = 20;
const HIT = 44;

export function MinimalTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { palette } = useAppPalette();
  const bottom = useTabBarBottom();
  const hidden = useTabBarHidden();
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
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.hit}>
            <View
              style={[
                styles.dot,
                { backgroundColor: palette.textSolid },
                focused ? styles.dotOn : styles.dotOff,
              ]}
            />
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
  dotOn: { opacity: 0.9 },
  dotOff: { opacity: 0.28 },
});
