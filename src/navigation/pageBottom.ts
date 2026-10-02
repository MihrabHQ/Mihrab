import { useContext } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/**
 * Bottom spacing for pushed pages that run to the screen's edge.
 *
 * The native stack's default `contentStyle` reserves the bottom safe area
 * for every pushed page, and paints it the page colour: a band across the
 * bottom of the screen that a scrolling page slides under and vanishes
 * behind. The pages opt out of it in RootNavigator (`EDGE_TO_EDGE`) and
 * pad their own end with these instead.
 *
 * Read through the context rather than `useSafeAreaInsets`, which throws
 * without a provider — several of these screens are rendered bare in
 * tests.
 */
export function useBottomInset(): number {
  return useContext(SafeAreaInsetsContext)?.bottom ?? 0;
}

/**
 * For a scroll view with `contentInsetAdjustmentBehavior="automatic"`:
 * iOS already insets the content for the bottom safe area, so adding it
 * again would double it. Android has no such adjustment.
 */
export function useScrollBottomInset(): number {
  const bottom = useBottomInset();
  return Platform.OS === 'android' ? bottom : 0;
}
