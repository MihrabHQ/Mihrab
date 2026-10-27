import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';
import { InnerScreen, ScreenContext, type ScreenProps } from 'react-native-screens';

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
 *
 * The provider is always there, with the library's own screen as its
 * value on the full page, so the navigator stands at the same place in
 * the tree whichever face is on: left out when Minimal was off, the
 * turn of the switch moved the navigator under a new parent, and React
 * is free to build a moved subtree again from nothing — every tab's
 * state with it. (Checked on the simulator: the tab survived either
 * way, the navigator keeping its state in its parent's; this makes
 * that not depend on it.)
 */
const PlainScreen = forwardRef<HostInstance, ScreenProps>(function PlainScreen(
  { style, children, ...rest },
  ref,
) {
  // The screen's own props (activityState, freezeOnBlur, the sheet
  // options…) mean nothing to a View and are left out of it.
  const { pointerEvents, testID, collapsable, activityState } = rest as {
    pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
    testID?: string;
    collapsable?: boolean;
    activityState?: 0 | 1 | 2;
  };
  // A page not on show is drawn, a width aside, but is not read: the
  // library's screen hides an inactive page from the screen reader with
  // the rest of it, and a plain view would let a reader swipe on from
  // Today's last line into the Quran's list beside it.
  const inactive = activityState === 0;
  // Not the navigator's `zIndex: -1` for a page not on show: on Android a
  // negative one draws the page behind its container's ground, and the
  // page beside the one on show was a page's width of nothing. The pages
  // never overlap — each stands its own width aside — so none needs to be
  // over another.
  return (
    <View
      ref={ref}
      style={[style, styles.level]}
      // The navigator's: a page not on show takes no touches. Each scene
      // is the whole screen and only the page INSIDE it stands aside, so
      // a scene that took touches lay over every page before it — the
      // Tasbih page did not answer a tap, the Duas scene above it took it.
      pointerEvents={pointerEvents}
      testID={testID}
      collapsable={collapsable}
      accessibilityElementsHidden={inactive}
      importantForAccessibility={inactive ? 'no-hide-descendants' : 'auto'}>
      {children as ReactNode}
    </View>
  );
});

export function MinimalScreens({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return (
    <ScreenContext.Provider value={(enabled ? PlainScreen : InnerScreen) as never}>{children}</ScreenContext.Provider>
  );
}

const styles = StyleSheet.create({ level: { zIndex: 0 } });
