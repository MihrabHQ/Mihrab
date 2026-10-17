/**
 * The tight fit of the printed (Warsh, Qālūn, Shuʿbah) pages: the edge
 * rows' ink at the edges of the box, from each page's measured reach.
 */
import {
  fitPrintedRows,
  printedEdgeInk,
  UNICODE_LINE_HEIGHT_EM,
} from '../src/quran/MushafUnicodePage';

const ROWS = 15;

describe('printedEdgeInk', () => {
  it('knows each page, and Qālūn reads the Warsh table', () => {
    const warsh = printedEdgeInk('warsh', 571)!;
    expect(warsh.above).toBeGreaterThan(1);
    expect(warsh.above).toBeLessThan(1.815);
    expect(warsh.below).toBeGreaterThan(0.4);
    expect(printedEdgeInk('qalun', 571)).toEqual(warsh);
    expect(printedEdgeInk('shubah', 571)).not.toBeNull();
  });

  it('has no reach for an edge row that is a surah band', () => {
    // Page 572 opens with the band for al-Jinn.
    expect(printedEdgeInk('warsh', 572)!.above).toBeNull();
    // The plates, 1 and 2, reflow and are not in the printed table.
    expect(printedEdgeInk('warsh', 1)).toBeNull();
    expect(printedEdgeInk('warsh', 3)).not.toBeNull();
  });
});

describe('fitPrintedRows', () => {
  const fs = 21.6;
  const box = 724;

  it('loose: rows divide the box, nothing is shifted', () => {
    const fit = fitPrintedRows(fs, box, ROWS, null);
    expect(fit.rowHeight).toBeCloseTo(box / ROWS, 5);
    expect(fit).toMatchObject({ margin: 0, shiftTop: 0, shiftBottom: 0 });
  });

  it('tight: the ink at the edges, the rows still exactly the box', () => {
    const edge = { above: 1.44, below: 0.711 };
    const loose = fitPrintedRows(fs, box, ROWS, null);
    const fit = fitPrintedRows(fs, box, ROWS, edge);
    expect(fit.shiftTop).toBeGreaterThan(0);
    expect(fit.rowHeight).toBeGreaterThan(loose.rowHeight);
    expect(fit.rowHeight * ROWS - fit.shiftTop - fit.shiftBottom).toBeCloseTo(
      box,
      2,
    );
    // Where the ink reaches past the row's room there is nothing to pull:
    // the row clips its own ink, and a reserve would be the void back.
    expect(fit.shiftBottom).toBeGreaterThanOrEqual(0);
  });

  it('tight: a page whose ink fills its rows is left as the loose fit', () => {
    const fit = fitPrintedRows(fs, box, ROWS, { above: 1.815, below: 0.97 });
    expect(fit).toEqual(fitPrintedRows(fs, box, ROWS, null));
  });

  it('tight: a band on the edge row is left where it is', () => {
    const fit = fitPrintedRows(fs, box, ROWS, { above: null, below: 0.2 });
    expect(fit.shiftTop).toBe(0);
    expect(fit.shiftBottom).toBeGreaterThan(0);
  });

  it('keeps the leading cap, and centres what the cap leaves', () => {
    // A box far taller than the type can use: the rows stop at the cap
    // and the rest is margin, tight or not.
    const tall = fs * UNICODE_LINE_HEIGHT_EM * 1.3 * ROWS + 200;
    const fit = fitPrintedRows(fs, tall, ROWS, { above: 1.44, below: 0.7 });
    expect(fit.margin).toBeCloseTo(100, 0);
    expect(fit.shiftTop).toBe(0);
  });
});
