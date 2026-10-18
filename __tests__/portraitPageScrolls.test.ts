/**
 * A portrait page too tall for the screen at its readable size scrolls,
 * rather than having its lines squeezed until they collide or are cut.
 */
import {
  fitLinesWithInk,
  mushafPageColumnHeight,
  pageFontSize,
  portraitPageScrolls,
} from '../src/quran/MushafTextPageSurface';
import { MUSHAF_LINE_HEIGHT_EM } from '../src/quran/MushafTextPage';
import { getPageLayout } from '../src/quran/mushafLayout';

const WIDTH = 392;
const natural = (page: number, riwayah?: 'hafs' | 'warsh') =>
  mushafPageColumnHeight({
    page,
    riwayah,
    textWidth: WIDTH,
    viewportHeight: 0,
    scrolling: true,
  });

describe('portraitPageScrolls', () => {
  it('fits a page on a tall phone', () => {
    expect(
      portraitPageScrolls({ page: 571, textWidth: WIDTH, viewportHeight: 760 }),
    ).toBe(false);
  });

  it('scrolls a page on a short screen, keeping its height', () => {
    const h = natural(571);
    expect(
      portraitPageScrolls({
        page: 571,
        textWidth: WIDTH,
        viewportHeight: h - 40,
      }),
    ).toBe(true);
    // The column it then gets is the page's own height, not the viewport.
    expect(
      mushafPageColumnHeight({
        page: 571,
        textWidth: WIDTH,
        viewportHeight: h - 40,
        scrolling: true,
      }),
    ).toBe(h);
  });

  it('starts scrolling exactly where fitting would squeeze the lines', () => {
    // At the threshold the fitted pitch is the print's; a point shorter
    // and it would be less.
    const page = 571;
    const layout = getPageLayout(page)!;
    const h = natural(page);
    const fs = pageFontSize(page, WIDTH, layout);
    const atFloor = fitLinesWithInk(fs, h, layout.lines.length);
    expect(atFloor.lineHeight).toBeGreaterThanOrEqual(
      fs * MUSHAF_LINE_HEIGHT_EM - 0.5,
    );
    expect(
      portraitPageScrolls({ page, textWidth: WIDTH, viewportHeight: h }),
    ).toBe(false);
    expect(
      portraitPageScrolls({ page, textWidth: WIDTH, viewportHeight: h - 2 }),
    ).toBe(true);
  });

  it('does the same for the printed (Warsh) pages, at their book aspect', () => {
    const h = natural(571, 'warsh');
    expect(
      portraitPageScrolls({
        page: 571,
        riwayah: 'warsh',
        textWidth: WIDTH,
        viewportHeight: h + 10,
      }),
    ).toBe(false);
    expect(
      portraitPageScrolls({
        page: 571,
        riwayah: 'warsh',
        textWidth: WIDTH,
        viewportHeight: h - 10,
      }),
    ).toBe(true);
  });

  it('says nothing before the screen is measured', () => {
    expect(
      portraitPageScrolls({ page: 571, textWidth: WIDTH, viewportHeight: 0 }),
    ).toBe(false);
  });
});
