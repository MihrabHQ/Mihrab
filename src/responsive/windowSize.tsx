/**
 * The window's size, measured — because on Mac Catalyst the system's
 * answer is not to be trusted.
 *
 * `useWindowDimensions` reports what React Native last heard from UIKit,
 * and on Catalyst it often hears late or not at all: a window restored at
 * launch, resized, or moved to another display goes on reporting a stale
 * size until some unrelated change (a trait change, a rotation event that
 * never comes on a Mac) makes it look again. The Today screen then laid a
 * narrow window out as the wide two-column dashboard, squeezed and centred
 * in the middle of the window, until the number caught up — on launch that
 * could take minutes. The Mushaf readers met the same thing and measured
 * their own boxes (`spreadPageGeometry.ts`); this does it once, for the
 * whole app.
 *
 * On Catalyst the app's root view reports its own size through `onLayout`,
 * which the layout engine knows exactly on every frame, and `useWindowSize`
 * answers with that. Until the first layout it falls back to the system's
 * number, so the first frame is never empty. Everywhere else the system's
 * answer is right and is used as it is.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ScaledSize,
} from 'react-native';
import { isMacCatalyst } from './breakpoints';

// A plain object: `breakpoints` imports this, and several test mocks of
// react-native have no StyleSheet.
const FILL = { flex: 1 } as const;

const MeasuredWindow = createContext<{ width: number; height: number } | null>(null);

/** Wrap the app's root. A plain pass-through except on Mac Catalyst. */
export function WindowSizeProvider({ children }: { children: ReactNode }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    // Sub-point jitter would re-render the whole app for nothing.
    setSize(prev =>
      prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height },
    );
  }, []);
  if (!isMacCatalyst) return <>{children}</>;
  return (
    <MeasuredWindow.Provider value={size}>
      <View style={FILL} onLayout={onLayout}>
        {children}
      </View>
    </MeasuredWindow.Provider>
  );
}

/**
 * The window's size: measured on Mac Catalyst, the system's elsewhere.
 * A drop-in for `useWindowDimensions`.
 */
export function useWindowSize(): ScaledSize {
  const system = useWindowDimensions();
  const measured = useContext(MeasuredWindow);
  return useMemo(
    () => (measured ? { ...system, width: measured.width, height: measured.height } : system),
    [system, measured],
  );
}

