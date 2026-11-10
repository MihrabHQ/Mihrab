/**
 * Which weeks of the record the strip actually draws (PracticeStrip).
 *
 * ── WHY ──────────────────────────────────────────────────────────────
 * The strip is a row of day columns in a sideways scroll view, each a
 * handful of small views, and it drew every day it was given: half a year
 * of them once the record had grown to fill its card, more with every
 * drag into the past — over a thousand views on a phone that had been
 * logging for a month. They are not expensive to look at; they are
 * expensive to HAVE. Every arrival on the Log re-attaches the whole
 * screen, and with the strip in it that frame took 65 ms on a Pixel 10
 * Pro (2026-11-10) against under 15 without it — the one tab that opened
 * with a visible catch.
 *
 * So the strip draws the weeks on show and a few either side, and stands
 * a blank the same width in for each of the rest: the row is as long as
 * it was, the scroll logic (`useHistoryScroll`) sees the same content,
 * and the views are only those a finger can reach before the next look
 * at where the scroll is.
 *
 * ── THE ARITHMETIC ───────────────────────────────────────────────────
 * Days come oldest first and a week is seven of them, Monday to Sunday,
 * so week `w` is the same width as every other and sits `w` widths from
 * the OLDEST edge. `contentOffset.x` is from the left in both writing
 * directions (heatmapScroll.ts), and the oldest edge is the left one in
 * a left-to-right language and the right one otherwise — so the distance
 * from the oldest edge is the offset itself, or the content's width less
 * the offset and the viewport.
 *
 * The window is kept as weeks counted back FROM THE NEWEST, because older
 * weeks are added at the front: counted from there, a window holds still
 * while the record grows under it.
 */

/** Weeks drawn beyond the ones on show, each side. */
export const STRIP_PAD_WEEKS = 3;
/** How close to the window's edge the weeks on show may come before it moves. */
export const STRIP_SLACK_WEEKS = 1;
/** The weeks assumed on show before the strip has been measured. */
export const STRIP_OPENING_WEEKS = 4;

/** A run of weeks, each counted back from the newest (0), inclusive. */
export type StripWindow = { near: number; far: number };

/** The window a strip opens with: parked on today, nothing measured yet. */
export function openingWindow(): StripWindow {
  return { near: 0, far: STRIP_OPENING_WEEKS + STRIP_PAD_WEEKS };
}

/**
 * The weeks on show, counted back from the newest — or null before the
 * strip has a size (the opening window stands until then).
 */
export function weeksOnShow({
  rtl,
  offset,
  viewportWidth,
  contentWidth,
  weekWidth,
  weeks,
}: {
  rtl: boolean;
  offset: number;
  viewportWidth: number;
  contentWidth: number;
  weekWidth: number;
  weeks: number;
}): StripWindow | null {
  if (!(viewportWidth > 0) || !(contentWidth > 0) || !(weekWidth > 0) || weeks <= 0) return null;
  // From the oldest edge.
  const start = rtl ? contentWidth - (offset + viewportWidth) : offset;
  const end = start + viewportWidth;
  const clamp = (w: number) => Math.max(0, Math.min(weeks - 1, w));
  const oldest = clamp(Math.floor(start / weekWidth));
  const newest = clamp(Math.floor(end / weekWidth));
  return { near: weeks - 1 - newest, far: weeks - 1 - oldest };
}

/**
 * The window to draw given the weeks on show: the one already drawn while
 * they are comfortably inside it, else a new one padded round them. The
 * same object back when nothing moves, so a scroll inside the window
 * renders nothing.
 */
export function nextWindow(drawn: StripWindow, shown: StripWindow | null, weeks: number): StripWindow {
  if (!shown) return drawn;
  const last = Math.max(0, weeks - 1);
  const nearOk = drawn.near === 0 || shown.near - STRIP_SLACK_WEEKS >= drawn.near;
  const farOk = drawn.far >= last || shown.far + STRIP_SLACK_WEEKS <= drawn.far;
  if (nearOk && farOk) return drawn;
  return {
    near: Math.max(0, shown.near - STRIP_PAD_WEEKS),
    far: Math.min(last, shown.far + STRIP_PAD_WEEKS),
  };
}

/** Whether week `w` (counted from the OLDEST, as the days are) is drawn. */
export function weekIsDrawn(window: StripWindow, w: number, weeks: number): boolean {
  const fromNewest = weeks - 1 - w;
  return fromNewest >= window.near && fromNewest <= window.far;
}
