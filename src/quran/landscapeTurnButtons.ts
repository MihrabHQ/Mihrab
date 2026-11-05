/**
 * WHERE THE PAGE-TURN BUTTONS GO ON A PHONE ON ITS SIDE, IN FULLSCREEN.
 *
 * The iPad, the Mac and the browser have had a ‹ and a › at the edges of
 * the spread since the desktop port. A phone on its side reads the page as
 * a zoomed column that scrolls up and down, with an empty margin either
 * side of it, and turning the page meant a sideways swipe across a column
 * that was also being scrolled. The buttons go in those margins: fixed to
 * the window, so they stay put while the column scrolls under them, and
 * each one centred in the space between the edge of the display and the
 * text.
 *
 * Two things can take that centre away:
 * - a camera cutout (or the system bar) at that edge: the reader pads it
 *   off (`padLeft`/`padRight`), and a button half under a lens cannot be
 *   pressed — so the centre moves inward just far enough to clear it;
 * - a margin too narrow for the button: then there is no button on that
 *   side, rather than one drawn over the words.
 *
 * Pure, and measured in the pager's own box (the window less the side
 * padding), which is where the buttons are drawn.
 */

/** The button, as the spread reader draws it. */
export const TURN_BUTTON_W = 40;
export const TURN_BUTTON_H = 48;
/** Air kept between the button and the text, and the button and a cutout. */
const AIR = 4;

export type TurnButtonPlacement = {
  /** Offset of the left button from the pager's left edge, or null. */
  left: number | null;
  /** Offset of the right button from the pager's right edge, or null. */
  right: number | null;
};

export function landscapeTurnButtons({
  padLeft,
  padRight,
  pageWidth,
  textWidth,
}: {
  /** The reader's left padding (cutout, vertical bar), physical. */
  padLeft: number;
  /** The reader's right padding, physical. */
  padRight: number;
  /** The pager's width — the window less both paddings. */
  pageWidth: number;
  /** The text column's width; it is centred in the pager. */
  textWidth: number;
}): TurnButtonPlacement {
  const margin = Math.max(0, (pageWidth - textWidth) / 2);
  const side = (pad: number): number | null => {
    // The text's edge, measured from the display's edge.
    const textEdge = pad + margin;
    const half = TURN_BUTTON_W / 2;
    // Clear of the cutout where there is one; clear of the text always.
    const lo = pad > 0 ? pad + half + AIR : half;
    const hi = textEdge - half - AIR;
    if (hi < lo) return null;
    const centre = Math.min(hi, Math.max(lo, textEdge / 2));
    // Back into the pager's box, as the offset of the button's outer side.
    return centre - half - pad;
  };
  return { left: side(padLeft), right: side(padRight) };
}
