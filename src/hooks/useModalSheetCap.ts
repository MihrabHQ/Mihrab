import { useCallback, useRef } from 'react';
import { Dimensions, Platform, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How tall a bottom sheet in a <Modal> may be, as a number that does not
 * move while the sheet is open.
 *
 * ── THE BUG THIS IS FOR ───────────────────────────────────────────────
 *
 * The ayah sheet was `maxHeight: '82%'` — of the Modal's own box. On
 * Android that box changes size after the sheet is already on screen.
 * React Native has to give a Modal a size before its window exists, so it
 * starts from an estimate: the screen WITHOUT the status and navigation
 * bars (`getEncodedScreenSizeWithoutVerticalInsets`). The window that then
 * opens is edge to edge, and reports its real, taller size
 * (`ReactModalHostView.onSizeChanged` → `updateState`). That correction is
 * applied when the JS thread next has a moment, and on opening it is busy
 * drawing the sheet.
 *
 * Recorded on a Pixel 10 Pro: the sheet slid up to 74% of the screen in
 * 120ms, stood there for 300–450ms (1.3s on the first opening after a
 * launch), then jumped to the 82% it was meant to have. A percentage
 * carries the estimate's error straight onto the screen.
 *
 * ── WHAT IT DOES INSTEAD ──────────────────────────────────────────────
 *
 * The cap is a fraction of the height the Modal's box ENDS at, known
 * before it gets there:
 *
 *  - the height its box reached the last time one was open at this window
 *    size, once any Modal has been (kept for the life of the process); and
 *    until then
 *  - a prediction: the window plus the bars the estimate left out, no
 *    more than the screen. On an edge-to-edge window that is the window
 *    itself.
 *
 * Whichever it is, it is read once when the sheet opens and held until it
 * closes or the window changes (a rotation, a fold). A wrong prediction is
 * therefore a sheet a little short or tall for one opening — never one
 * that moves under a thumb — and the next opening has the real number.
 *
 * iOS gives a Modal its real size from the start, and keeps the
 * percentage.
 */

/** The tallest the Modal's box has been, by window size ("412x915"). */
const reached = new Map<string, number>();

/** The height a Modal's box is expected to end at, before one has been measured. */
export function predictedModalHeight(windowHeight: number, screenHeight: number, insetTop: number, insetBottom: number): number {
  const withBars = windowHeight + Math.max(0, insetTop) + Math.max(0, insetBottom);
  // Never more than the display: in split screen the window is a part of it.
  return screenHeight > 0 ? Math.min(screenHeight, withBars) : withBars;
}

export function useModalSheetCap(
  fraction: number,
  visible: boolean,
): { maxHeight: number | `${number}%`; onContainerLayout: ((e: LayoutChangeEvent) => void) | undefined } {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const key = `${Math.round(win.width)}x${Math.round(win.height)}`;
  const held = useRef<{ key: string; open: boolean; base: number } | null>(null);
  const opening = visible && !(held.current?.open ?? false);
  if (!held.current || held.current.key !== key || opening) {
    held.current = {
      key,
      open: visible,
      base:
        reached.get(key) ??
        predictedModalHeight(win.height, Dimensions.get('screen').height, insets.top, insets.bottom),
    };
  }
  held.current.open = visible;
  const onContainerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      // The tallest it gets is where it ends: the first layout is the estimate.
      if (h > (reached.get(key) ?? 0)) reached.set(key, h);
    },
    [key],
  );
  if (Platform.OS !== 'android') {
    return { maxHeight: `${Math.round(fraction * 100)}%`, onContainerLayout: undefined };
  }
  return { maxHeight: Math.round(held.current.base * fraction), onContainerLayout };
}

/** For tests. */
export function _resetModalSheetCap(): void {
  reached.clear();
}
