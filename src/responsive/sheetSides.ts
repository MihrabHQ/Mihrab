/**
 * Where a bottom sheet's edges go — on Android's wide screens.
 *
 * The app's own sheets (the ayah sheet, the reciter picker, the time
 * picker, …) run edge to edge, which is right on a phone. Unfolded, a
 * foldable is 850dp across and nearly square, and the same sheet stretched
 * the full width: bookmark colours a hand-span apart, play buttons the size
 * of the page. So on a wide Android window the sheet keeps to a phone's
 * width in the middle, and half open as a book it keeps to one page
 * (`FoldPosture.ts`) rather than lying across the crease.
 *
 * iOS is left as it was, with one exception: an iPhone with a vertical bar
 * (iPhone Duo, iOS 27.1). There every sheet, dialog and picker stops at
 * the bar, as the pages do — the bar is the system's, and a card that ran
 * under it lost its edge to the clock. The dimmed backdrop still covers the
 * whole window; only what is on it keeps clear. The iPad, the Mac and every
 * other iPhone read no bar and get nothing.
 */
import { Platform } from 'react-native';
import { useAppRtl, useFoldPosture } from '../native/FoldPosture';
import { useWindowSize } from './windowSize';
import { useVerticalBar } from '../native/VerticalBar';

/** Wider than this, an Android sheet stops growing. */
export const SHEET_WIDE_FROM = 700;
/** …and is this wide, centred. */
export const SHEET_MAX_WIDTH = 640;

export type SheetSides = { left: number; right: number }; // rtl-safe: physical edges of a centred sheet

export function sheetSides(input: {
  android: boolean;
  width: number;
  rtl: boolean;
  book: { left: number; right: number } | null; // rtl-safe: the hinge's physical edges
  /** An iPhone's vertical bar: the side it is on and its width, or none. */
  bar?: { side: 'left' | 'right'; width: number } | null; // rtl-safe: the vertical bar is on a physical side
}): SheetSides {
  const { android, width, rtl, book, bar } = input;
  if (bar && bar.width > 0) {
    // rtl-safe: the vertical bar is on a physical side
    return bar.side === 'left' ? { left: bar.width, right: 0 } : { left: 0, right: bar.width };
  }
  if (!android || !(width > 0)) return { left: 0, right: 0 }; // rtl-safe: physical edges
  if (book) {
    return rtl
      ? { left: Math.max(0, book.right), right: 0 } // rtl-safe: physical edges
      : { left: 0, right: Math.max(0, width - book.left) }; // rtl-safe: physical edges
  }
  if (width < SHEET_WIDE_FROM) return { left: 0, right: 0 }; // rtl-safe: physical edges
  const side = Math.round((width - SHEET_MAX_WIDTH) / 2);
  return { left: side, right: side }; // rtl-safe: physical edges
}

export function useSheetSides(): SheetSides {
  const { width } = useWindowSize();
  const posture = useFoldPosture();
  const rtl = useAppRtl();
  const vbar = useVerticalBar();
  return sheetSides({
    android: Platform.OS === 'android',
    width,
    rtl,
    book: posture?.kind === 'book' ? posture.hinge : null,
    bar: vbar ? { side: vbar.side, width: vbar.width } : null,
  });
}

/**
 * The same edges as padding, for the settings sheets that lay out as a
 * column (`modalStyles.root`): the dimmed backdrop still covers the whole
 * window — it is absolutely filled — while the sheet keeps to the middle,
 * or to one page of the book.
 */
export function useSheetPadding(): { paddingLeft: number; paddingRight: number } { // rtl-safe: physical edges
  const { left, right } = useSheetSides(); // rtl-safe: physical edges
  return { paddingLeft: left, paddingRight: right }; // rtl-safe: physical edges
}
