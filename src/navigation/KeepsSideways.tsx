import { useRef, type ReactNode } from 'react';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { usePagerBlocker } from './minimalPager';

/**
 * Round a view that scrolls SIDEWAYS itself — the Log's graphs, which run
 * back through the months — so that under Minimal a drag across it
 * scrolls it rather than turning the page: the page's swipe
 * (MinimalSwipe) waits for this one to decline the touch first, and a
 * sideways drag on the graph is one it takes. Nothing changes on the
 * full page, where the swipe is off. One native child: the scroll view.
 */
export function KeepsSideways({ children }: { children: ReactNode }) {
  const ref = useRef(null);
  usePagerBlocker(ref);
  return (
    <NativeViewGestureHandler ref={ref} disallowInterruption shouldCancelWhenOutside={false}>
      {children}
    </NativeViewGestureHandler>
  );
}
