/**
 * The cut that `lineInkPadding` does not reach: the page's OWN top and
 * bottom edge.
 *
 * A line's ink overshoots its box and the line view lets it, by padding
 * the text and pulling the padding back with a negative margin. Inside a
 * page that is free — the room borrowed is the neighbouring line's box,
 * and a line box is transparent. The FIRST line has no neighbour above it
 * and the LAST none below, so they borrow from outside the page, and
 * whatever contains the page clips them there. The landscape column is a
 * ScrollView, and a ScrollView on Android always clips its content.
 *
 * Reported 2026-09-04: in the landscape reader the line at the top of the
 * viewport keeps every letter and loses the marks above it — which reads
 * as a broken font rather than a clip. It shows on every scroll, not only
 * at the top of a page, because the recitation's follow-scroll comes to
 * rest exactly on a line box.
 */
import {
  fitLinesWithInk,
  mushafPageColumnHeight,
  pageEdgeInk,
} from '../src/quran/MushafTextPageSurface';
import { MUSHAF_LINE_HEIGHT_EM } from '../src/quran/MushafTextPage';
import {
  MUSHAF_FONT_ASCENT_EM,
  MUSHAF_FONT_DESCENT_EM,
  lineInkPadding,
} from '../src/quran/mushafLayout';

const LINES = 15;

describe('fitLinesWithInk', () => {
  it('reserves room above the first line and below the last', () => {
    const fs = 25;
    const box = 640;
    const fit = fitLinesWithInk(fs, box, LINES);
    expect(fit.top).toBeGreaterThan(0);
    expect(fit.bottom).toBeGreaterThan(0);
  });

  it('spends the reserve out of the box, not on top of it', () => {
    // The page still occupies exactly the box it was given — the lines get
    // shorter instead. A page that grew by its reserve would push the
    // medallion off the bottom of a column that has nothing to scroll.
    const fs = 25;
    const box = 640;
    const fit = fitLinesWithInk(fs, box, LINES);
    expect(fit.lineHeight * LINES + fit.top + fit.bottom).toBeCloseTo(box, 5);
    expect(fit.lineHeight).toBeLessThan(box / LINES);
  });

  it('reserves what the line it settles on actually needs', () => {
    // The reserve is a fixed point, not a formula: a shorter line has less
    // leading and so needs a hair more room. Whatever height it lands on,
    // the reserve must cover that height's ink — reserving for the taller
    // starting line would leave the real one a dp short.
    const fs = 25;
    const fit = fitLinesWithInk(fs, 640, LINES);
    const needed = lineInkPadding(fs, fit.lineHeight);
    expect(fit.top).toBeGreaterThanOrEqual(needed.top - 1);
    expect(fit.bottom).toBeGreaterThanOrEqual(needed.bottom - 1);
  });

  it('puts the edge lines\' ink at the edges when told how far it reaches', () => {
    // Page 571's first line reaches 1.198 em up and its last 0.46 em
    // down. Tight, the first line's box is pulled above the block by
    // exactly the blank its own ink would leave — the half-leading plus
    // the font's ascent past the ink — and the last below it likewise,
    // so the ink starts and ends a hair inside the block, and the block
    // is still the box.
    const fs = 25;
    const box = 760;
    const edge = { above: 1.198, below: 0.4596 };
    const loose = fitLinesWithInk(fs, box, LINES);
    const tight = fitLinesWithInk(fs, box, LINES, edge);
    const p = tight.lineHeight;
    expect(p).toBeGreaterThan(loose.lineHeight);
    // Room above the first baseline is ascent + half the leading; what
    // is left past the ink is the shift.
    const leading = p - (MUSHAF_FONT_ASCENT_EM + MUSHAF_FONT_DESCENT_EM) * fs;
    const roomAbove = MUSHAF_FONT_ASCENT_EM * fs + leading / 2;
    const roomBelow = MUSHAF_FONT_DESCENT_EM * fs + leading / 2;
    expect(tight.shiftTop).toBeCloseTo(roomAbove - edge.above * fs, 5);
    expect(tight.shiftBottom).toBeCloseTo(roomBelow - edge.below * fs, 5);
    expect(
      p * LINES - tight.shiftTop - tight.shiftBottom + tight.top + tight.bottom,
    ).toBeCloseTo(box, 5);
    expect(tight.top).toBeGreaterThan(0);
    expect(tight.top).toBeLessThan(loose.top);
  });

  it('reserves room instead when an edge line reaches past its box', () => {
    // Page 556's kind of first line: ink 1.64 em up, past the ascent and
    // the half-leading. The shift goes negative — a positive margin, which
    // is the reserve the loose fit would have made, sized to this page.
    const fs = 25;
    const tight = fitLinesWithInk(fs, 760, LINES, { above: 1.64, below: 0.3 });
    expect(tight.shiftTop).toBeLessThan(0);
    expect(tight.shiftBottom).toBeGreaterThan(0);
  });

  it('leaves a band or basmalah edge row where it is', () => {
    const fs = 25;
    const tight = fitLinesWithInk(fs, 760, LINES, { above: null, below: 0.46 });
    expect(tight.shiftTop).toBe(0);
    expect(tight.shiftBottom).toBeGreaterThan(0);
  });

  it('falls back to the loose fit in a box shorter than the natural pitch', () => {
    // Squeezed lines have negative leading, where the platforms disagree
    // on where the ink lands; the reserve is the safe page there.
    const fs = 25;
    const box = 600;
    const tight = fitLinesWithInk(fs, box, LINES, { above: 1.2, below: 0.46 });
    expect(tight).toEqual(fitLinesWithInk(fs, box, LINES));
    expect(tight.shiftTop).toBe(0);
  });

  it('knows each page\'s own reach, for both glyph sets', () => {
    const v2 = pageEdgeInk(571, 'v2');
    expect(v2).not.toBeNull();
    expect(v2!.above).toBeGreaterThan(1);
    expect(v2!.above).toBeLessThan(1.64);
    expect(pageEdgeInk(571, 'tajweed-light')!.below).toBeGreaterThan(0);
    // Page 1 opens with the surah band: no text ink on its first line.
    expect(pageEdgeInk(1, 'v2')!.above).toBeNull();
  });

  it('keeps the lines rather than collapsing them in an impossible box', () => {
    // A box smaller than the ink needs is a bad layout, not a crash. The
    // page draws squeezed; it never draws at a negative line height.
    const fit = fitLinesWithInk(200, 40, LINES);
    expect(fit.lineHeight).toBeGreaterThan(0);
  });

  it('does nothing without a font size to measure the ink against', () => {
    const fit = fitLinesWithInk(0, 640, LINES);
    expect(fit).toEqual({
      lineHeight: 640 / LINES,
      top: 0,
      bottom: 0,
      shiftTop: 0,
      shiftBottom: 0,
    });
  });
});

describe('mushafPageColumnHeight', () => {
  const textWidth = 560;

  it('asks the scrolling column for the reserve on top of the line boxes', () => {
    // Landscape takes it the other way round from portrait: the column can
    // scroll, so it grows by the reserve rather than shrinking the text.
    // The surface then takes the same reserve back out of the height it is
    // handed, which is what leaves the reading zoom exactly where it was.
    const scrolled = mushafPageColumnHeight({
      page: 332,
      textWidth,
      viewportHeight: 300,
      scrolling: true,
    });
    const fit = fitLinesWithInk(
      // Whatever the page's own line count and drawn em turn out to be,
      // the identity has to hold: fitting the returned height must give
      // back a line height at the print's natural leading.
      textWidth / 14,
      scrolled,
      LINES,
    );
    expect(fit.lineHeight).toBeGreaterThan(0);
    expect(scrolled).toBeGreaterThan(300);
  });

  it('leaves a page with nothing to scroll at exactly its viewport', () => {
    // Portrait is height-fitted: the column IS the viewport, and padding
    // it pushed the medallion off the bottom of the page.
    expect(
      mushafPageColumnHeight({
        page: 332,
        textWidth,
        viewportHeight: 620,
        scrolling: false,
      }),
    ).toBe(620);
  });

  it('never returns less than the viewport', () => {
    for (const page of [1, 2, 100, 332, 604]) {
      expect(
        mushafPageColumnHeight({
          page,
          textWidth,
          viewportHeight: 900,
          scrolling: true,
        }),
      ).toBeGreaterThanOrEqual(900);
    }
  });
});

describe('the reserve is what the landscape column was missing', () => {
  it('covers the harakat band above a line at the natural leading', () => {
    // The print's leading (1.7183 em) is SHORTER than ascent + descent
    // (1.8 em), so a line at its natural height starts already short of
    // its own metrics — before the ink overshoots them by another 0.44 em.
    // That deficit is the band the marks live in, and it is what the top
    // line of the viewport was losing.
    const fs = 40;
    const ink = lineInkPadding(fs, fs * MUSHAF_LINE_HEIGHT_EM);
    expect(ink.top).toBeGreaterThan(fs * 0.5);
  });
});
