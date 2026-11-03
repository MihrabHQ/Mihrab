/**
 * react-native-safe-area-context with a desktop top inset.
 *
 * A phone's screens clear the status bar by its safe-area inset, and on the
 * Mac the Catalyst title bar gives one too, so no screen starts against the
 * top edge. A Windows/Linux window has its frame above the page and an inset
 * of 0, which put Settings, the Log's figures and the Tasbih's heading flush
 * against the edge (the Log's row half under it). The app's screens read the
 * inset through useSafeAreaInsets(), so the inset is supplied here once,
 * rather than each screen learning about the desktop.
 */
import React from 'react';
import {
  SafeAreaProvider as BaseProvider,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context/lib/module/index';

export * from 'react-native-safe-area-context/lib/module/index';

export const DESKTOP_TOP_INSET = 16;

export function SafeAreaProvider({ children, ...props }) {
  return React.createElement(
    BaseProvider,
    props,
    React.createElement(SafeAreaInsetsContext.Consumer, null, insets =>
      React.createElement(
        SafeAreaInsetsContext.Provider,
        { value: insets ? { ...insets, top: Math.max(insets.top, DESKTOP_TOP_INSET) } : insets },
        children,
      ),
    ),
  );
}
