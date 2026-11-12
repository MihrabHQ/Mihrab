/**
 * "Back to today" in the times sheet (TodayTimesSheet.tsx).
 *
 * Off today, the sheet had the way back on a line of its own between the
 * day and the rows — so the sheet grew by a line the moment a swipe left
 * today and shrank when it came back. The rows have room for it: a name at
 * the start, a time at the end, and nothing between. It stands there, in
 * the middle of the first row, and the sheet is the same height on every
 * day.
 *
 * The middle is not always wide enough: a narrow phone, large text, a long
 * first name ("Morgengebet"). So it takes the form that fits, best first:
 * the words, the words a size smaller, or a glyph alone.
 */
export type BackToTodayForm = 'full' | 'small' | 'icon';

/** What the pill adds to its words each side, and the glyph's own width. */
export const BACK_PILL_PAD = 10;
export const BACK_ICON_SIZE = 28;
/** The air the pill keeps from the name and from the time. */
export const BACK_CLEAR = 8;

/**
 * The widest thing that fits in the middle of a row `rowW` wide, centred,
 * between what stands at its start (`startW`: the check, its gap and the
 * name's ink) and at its end (`endW`: the time's ink). Centred, it is the
 * wider of the two sides that sets the room — on both sides.
 *
 * `fullW` and `smallW` are the words' measured widths at the two sizes.
 * Null until everything has been measured: nothing is drawn on a guess.
 */
export function backToTodayForm(m: {
  rowW: number;
  startW: number;
  endW: number;
  fullW: number;
  smallW: number;
}): BackToTodayForm | null {
  if (!(m.rowW > 0 && m.startW > 0 && m.endW > 0 && m.fullW > 0 && m.smallW > 0)) return null;
  const side = Math.max(m.startW, m.endW) + BACK_CLEAR;
  const room = m.rowW - 2 * side;
  if (m.fullW + 2 * BACK_PILL_PAD <= room) return 'full';
  if (m.smallW + 2 * BACK_PILL_PAD <= room) return 'small';
  return 'icon';
}
