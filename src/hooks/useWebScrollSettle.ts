/**
 * `onMomentumScrollEnd`, for a browser.
 *
 * The day pagers (Today's table, Minimal's times sheet) learn which day a
 * swipe landed on from `onMomentumScrollEnd` — an event react-native-web
 * never sends. In the browser (Mihrab Web, and the desktop app) a swipe
 * moved the rows to another day while the bar above them kept naming the
 * old one, and the days the bar had not asked for were drawn empty
 * (reported on a phone, in Minimal, 2026-11-04).
 *
 * So in a browser the scroll itself is watched: once it has been still for
 * a moment — the snap has finished — the same handler is called with the
 * offset it came to rest at. Native platforms get nothing from this hook
 * and keep the real event.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

/** Still for this long, and the snap has landed. */
const SETTLE_MS = 140;

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

export function useWebScrollSettle(
  onSettled: (e: ScrollEvent) => void,
): { onScroll?: (e: ScrollEvent) => void; scrollEventThrottle?: number } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onSettled);
  latest.current = onSettled;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onScroll = useCallback((e: ScrollEvent) => {
    // The event is pooled by React: keep the numbers, not the event.
    const contentOffset = { ...e.nativeEvent.contentOffset };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current({ nativeEvent: { contentOffset } } as ScrollEvent);
    }, SETTLE_MS);
  }, []);
  return Platform.OS === 'web' ? { onScroll, scrollEventThrottle: 32 } : {};
}
