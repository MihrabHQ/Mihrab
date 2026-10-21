/**
 * The tab bar, stood on its end in the vertical bar (iPhone Duo).
 *
 * Where the system puts the status bar in a column down one side, that
 * column is also where it means an app's bars to go — a native tab bar
 * moves there by itself (Settings' search button sits at its foot). Ours is
 * drawn by React Navigation, so it is placed there by hand: the six tabs as
 * icons spread down the whole column below the camera and the clock, on
 * the column itself (no pill of their own — the column is the bar), and
 * the page runs the full height beside it.
 *
 * Icons without labels: the column is ~55pt wide, and the six glyphs are the
 * ones the bottom bar shows over its labels. Each keeps its name for
 * VoiceOver. See src/native/VerticalBar.ts.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../hooks/useAppPalette';
import { SPACING } from '../theme/tokens';
import type { VerticalBar } from '../native/VerticalBar';
import { useTabBarHidden } from './tabBarVisibility';

const BUTTON = 44;

export function VerticalTabBar({
  bar,
  state,
  descriptors,
  navigation,
}: BottomTabBarProps & { bar: VerticalBar }) {
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  const hidden = useTabBarHidden();
  if (hidden) return null;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.column,
        bar.side === 'right' ? { right: 0 } : { left: 0 },
        {
          width: bar.width,
          // From under the clock to the home indicator, the six evenly
          // spread through it.
          top: bar.occludedTo + SPACING.md,
          bottom: Math.max(insets.bottom, SPACING.md),
        },
      ]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = String(focused ? palette.accentSolid : palette.mutedSolid);
          const label = typeof options.title === 'string' ? options.title : route.name;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityState={focused ? { selected: true } : {}}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              hitSlop={4}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              {options.tabBarIcon?.({ focused, color, size: 24 })}
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { position: 'absolute', alignItems: 'center', justifyContent: 'space-evenly' },
  button: { width: BUTTON, height: BUTTON, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
});
