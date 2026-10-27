import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';
import { ScreenContext, type ScreenProps } from 'react-native-screens';

/**
 * Minimal's pages are all on the strip, drawn (settings.minimalUi).
 *
 * The tab navigator keeps every tab mounted, but a tab not on show is an
 * INACTIVE screen, and react-native-screens draws an inactive screen as
 * `display: none` — detached or not. So a page beside the one on show,
 * stood a page's width aside by MainTabs' interpolator, was a page's
 * width of nothing: the finger moved the page and the room next to it
 * stayed empty until the turn was over.
 *
 * react-native-screens lets the screen component be swapped by context
 * for an "enhanced implementation"; this one is the opposite, a plain
 * view that draws whatever it is given, active or not. The tab
 * navigator still says which page takes touches (`pointerEvents`) and
 * which is on top (`zIndex`); only the hiding is set aside. Round the
 * tab navigator alone: the stack's own screens keep their native ones.
 */
const PlainScreen = forwardRef<HostInstance, ScreenProps>(function PlainScreen(
  { style, children, ...rest },
  ref,
) {
  // The screen's own props (activityState, freezeOnBlur, the sheet
  // options…) mean nothing to a View and are left out of it.
  const { pointerEvents, testID, collapsable } = rest as {
    pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
    testID?: string;
    collapsable?: boolean;
  };
  // Not the navigator's `zIndex: -1` for a page not on show: on Android a
  // negative one draws the page behind its container's ground, and the
  // page beside the one on show was a page's width of nothing. The pages
  // never overlap — each stands its own width aside — so none needs to be
  // over another.
  return (
    <View
      ref={ref}
      style={[style, styles.level]}
      pointerEvents={pointerEvents}
      testID={testID}
      collapsable={collapsable}>
      {children as ReactNode}
    </View>
  );
});

export function MinimalScreens({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <ScreenContext.Provider value={PlainScreen as never}>{children}</ScreenContext.Provider>;
}

const styles = StyleSheet.create({ level: { zIndex: 0 } });
