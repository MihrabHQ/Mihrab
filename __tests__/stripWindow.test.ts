/**
 * The practice strip draws the weeks on show and a few either side
 * (practice/stripWindow.ts) — in both writing directions, and holding
 * still while older weeks are added at the front.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  STRIP_OPENING_WEEKS,
  STRIP_PAD_WEEKS,
  nextWindow,
  openingWindow,
  weekIsDrawn,
  weeksOnShow,
} from '../src/practice/stripWindow';

const W = 97; // a week of columns and its gap
const VIEW = 330;

describe('the weeks on show', () => {
  const weeks = 30;
  const content = weeks * W + 4;

  it('is nothing until the strip has a size', () => {
    expect(weeksOnShow({ rtl: false, offset: 0, viewportWidth: 0, contentWidth: content, weekWidth: W, weeks })).toBeNull();
    expect(weeksOnShow({ rtl: false, offset: 0, viewportWidth: VIEW, contentWidth: 0, weekWidth: W, weeks })).toBeNull();
  });

  it('left to right: parked at the end is the newest weeks, at 0 the oldest', () => {
    const parked = weeksOnShow({ rtl: false, offset: content - VIEW, viewportWidth: VIEW, contentWidth: content, weekWidth: W, weeks })!;
    expect(parked.near).toBe(0);
    expect(parked.far).toBe(Math.floor(VIEW / W)); // about three and a half weeks
    const oldest = weeksOnShow({ rtl: false, offset: 0, viewportWidth: VIEW, contentWidth: content, weekWidth: W, weeks })!;
    expect(oldest.far).toBe(weeks - 1);
    expect(oldest.near).toBe(weeks - 1 - Math.floor(VIEW / W));
  });

  it('right to left: the offset still counts from the left, where today is', () => {
    // Today parks at offset 0 (heatmapScroll.ts); the oldest week is at the far right.
    const parked = weeksOnShow({ rtl: true, offset: 0, viewportWidth: VIEW, contentWidth: content, weekWidth: W, weeks })!;
    expect(parked.near).toBe(0);
    const oldest = weeksOnShow({ rtl: true, offset: content - VIEW, viewportWidth: VIEW, contentWidth: content, weekWidth: W, weeks })!;
    expect(oldest.far).toBe(weeks - 1);
    // The same weeks, whichever way the row runs, the same distance from today.
    for (const back of [0, 150, 500, 1200]) {
      const ltr = weeksOnShow({ rtl: false, offset: content - VIEW - back, viewportWidth: VIEW, contentWidth: content, weekWidth: W, weeks })!;
      const rtl = weeksOnShow({ rtl: true, offset: back, viewportWidth: VIEW, contentWidth: content, weekWidth: W, weeks })!;
      expect(Math.abs(ltr.near - rtl.near)).toBeLessThanOrEqual(1);
      expect(Math.abs(ltr.far - rtl.far)).toBeLessThanOrEqual(1);
    }
  });
});

describe('the window drawn', () => {
  it('opens on the newest weeks, enough for a card and its padding', () => {
    const w = openingWindow();
    expect(w.near).toBe(0);
    expect(w.far).toBe(STRIP_OPENING_WEEKS + STRIP_PAD_WEEKS);
    // Week 29 of 30 (the newest) is drawn; week 0 (the oldest) is a blank.
    expect(weekIsDrawn(w, 29, 30)).toBe(true);
    expect(weekIsDrawn(w, 0, 30)).toBe(false);
  });

  it('holds still while the weeks on show are inside it, and the same object comes back', () => {
    const drawn = { near: 0, far: 10 };
    expect(nextWindow(drawn, { near: 0, far: 3 }, 30)).toBe(drawn);
    expect(nextWindow(drawn, { near: 4, far: 8 }, 30)).toBe(drawn);
    expect(nextWindow(drawn, null, 30)).toBe(drawn);
  });

  it('moves, padded, as the weeks on show near its edge — and never past either end', () => {
    const drawn = { near: 0, far: 10 };
    const moved = nextWindow(drawn, { near: 7, far: 10 }, 30);
    expect(moved).toEqual({ near: 7 - STRIP_PAD_WEEKS, far: 10 + STRIP_PAD_WEEKS });
    // At the oldest end there is nothing further to draw: no move for it.
    const atEnd = { near: 20, far: 29 };
    expect(nextWindow(atEnd, { near: 26, far: 29 }, 30)).toBe(atEnd);
    expect(nextWindow({ near: 5, far: 15 }, { near: 0, far: 3 }, 30)).toEqual({ near: 0, far: 3 + STRIP_PAD_WEEKS });
  });

  it('is counted from the newest, so it holds while older weeks are added at the front', () => {
    const drawn = { near: 2, far: 12 };
    // Week index 20 of 30 is 9 back from the newest; after 26 more weeks
    // arrive at the front the same week is index 46 of 56, still 9 back.
    expect(weekIsDrawn(drawn, 20, 30)).toBe(true);
    expect(weekIsDrawn(drawn, 46, 56)).toBe(true);
    expect(weekIsDrawn(drawn, 20, 56)).toBe(false);
  });
});

describe('the strip', () => {
  const strip = readFileSync(join(__dirname, '..', 'src/practice/PracticeStrip.tsx'), 'utf8');

  it('draws a blank of a week\'s width for a week not on show, so the row is as long as it was', () => {
    expect(strip).toMatch(/if \(!weekIsDrawn\(drawn, w, weekCount\)\) \{[\s\S]{0,200}styles\.blankWeek/);
    expect(strip).toMatch(/blankWeek: \{ width: WEEK \}/);
    expect(strip).toMatch(/const WEEK = 7 \* DAY \+ WEEK_GAP;/);
  });

  it('reads a scroll event against the row it describes, not the weeks just handed in', () => {
    // At the first growth the next event still carried the old width and
    // offset; read against the new count, the window leapt to weeks the
    // view was nowhere near and the strip went blank (seen on a phone).
    expect(strip).toMatch(/const measuredWeeks = Math\.max\(1, Math\.round\(at\.content \/ WEEK\)\);/);
    expect(strip).toMatch(/weeks: measuredWeeks,/);
    // The case itself: 27 weeks measured, the view at their oldest edge,
    // 53 weeks now handed in. Counted back from the newest it is weeks
    // 23–26 — not 49–52.
    const shown = weeksOnShow({ rtl: false, offset: 7.7, viewportWidth: 342, contentWidth: 2623, weekWidth: W, weeks: 27 })!;
    expect(shown).toEqual({ near: 23, far: 26 });
    expect(nextWindow({ near: 18, far: 26 }, shown, 53)).toEqual({ near: 20, far: 29 });
  });

  it('still hands every scroll event to the history hook', () => {
    expect(strip).toMatch(/look\(\);\s*scroll\.onScroll\(e\);/);
    expect(strip).toMatch(/scroll\.onLayout\(e\);/);
    expect(strip).toMatch(/scroll\.onContentSizeChange\(w\);/);
  });
});
