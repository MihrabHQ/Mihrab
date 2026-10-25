/**
 * What the printed-line renderer does differently for a muṣḥaf whose
 * lines are exact: a closing line is centred, never stretched; a page
 * whose font is not registered is not drawn; and the table decides the
 * bands.
 */
import { fitPrintedLine } from '../src/quran/MushafUnicodePage';
import { WORD_SPACE_EM, WORD_SPACE_MAX_EM } from '../src/quran/mushafLayout';
import {
  riwayahAvailable,
  riwayahById,
  riwayahFontFamily,
  riwayahTextFontFamily,
  readingOf,
  isGlyphRiwayah,
} from '../src/quran/riwayat';
import {
  _resetRiwayahDataCacheForTests,
  _setRiwayahDataForTests,
} from '../src/quran/riwayahData';
import { MUSHAF_PAGES, MUSHAF_SURAHS } from '../src/quran/pages';

describe('a closing line', () => {
  it('is never stretched to the measure, and keeps the nominal gap', () => {
    const short = fitPrintedLine(6, 3, 18.2, true);
    expect(short.scaleX).toBe(1);
    expect(short.spaceEm).toBe(WORD_SPACE_EM);
    expect(short.drawnEm).toBeLessThan(18.2);
    // The same line on an ordinary row opens its gaps and stretches.
    const full = fitPrintedLine(6, 3, 18.2, false);
    expect(full.spaceEm).toBe(WORD_SPACE_MAX_EM);
    expect(full.scaleX).toBeGreaterThan(1);
  });

  it('is still squeezed when it runs long', () => {
    const long = fitPrintedLine(20, 4, 18.2, true);
    expect(long.scaleX).toBeLessThan(1);
    expect(long.drawnEm).toBeCloseTo(18.2, 5);
  });
});

describe('the IndoPak row of the table', () => {
  afterEach(() => _resetRiwayahDataCacheForTests());

  it('is a Ḥafṣ print, not another reading', () => {
    expect(readingOf('indopak')).toBe('hafs');
    expect(isGlyphRiwayah('indopak')).toBe(false);
    expect(riwayahById('indopak').render).toBe('unicode-lines');
    expect(riwayahById('indopak').fontDownloaded).toBe(true);
  });

  it('is not available, and has no face, until its font is registered', () => {
    const dataset = {
      pages: MUSHAF_PAGES.slice(0, 1).map(p => ({ ...p, end: null })),
      surahs: [...MUSHAF_SURAHS],
      ayahCounts: MUSHAF_SURAHS.map(() => 1),
      text: { '1:1': 'x' },
    };
    _setRiwayahDataForTests('indopak', dataset);
    expect(riwayahAvailable('indopak')).toBe(false);
    expect(riwayahFontFamily(riwayahById('indopak'))).toBeNull();
    expect(riwayahTextFontFamily('indopak')).toBeNull();

    _setRiwayahDataForTests('indopak', dataset, 'DigitalKhatt IndoPak');
    expect(riwayahAvailable('indopak')).toBe(true);
    expect(riwayahFontFamily(riwayahById('indopak'))).toBe('DigitalKhatt IndoPak');
    expect(riwayahTextFontFamily('indopak')).toBe('DigitalKhatt IndoPak');
    // Warsh keeps its bundled fallback either way.
    expect(riwayahFontFamily(riwayahById('warsh'))).not.toBeNull();
    expect(riwayahTextFontFamily('warsh')).toBeNull();
  });
});
