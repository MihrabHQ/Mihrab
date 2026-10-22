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
 * iOS is left exactly as it was: the iPad and the Mac have their own
 * layouts for these, and nothing here reaches them.
 */
import { Platform } from 'react-native';
import { useAppRtl, useFoldPosture } from '../native/FoldPosture';
import { useWindowSize } from './windowSize';

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
}): SheetSides {
  const { android, width, rtl, book } = input;
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
  return sheetSides({
    android: Platform.OS === 'android',
    width,
    rtl,
    book: posture?.kind === 'book' ? posture.hinge : null,
  });
}
