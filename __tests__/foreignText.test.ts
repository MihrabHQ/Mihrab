/**
 * Text that does not run the way the layout does.
 *
 * The one combination this is for is a reader in Urdu — mirrored layout —
 * looking at Latin script, which is what a dua's pronunciation always is
 * and what its meaning and a release note are for every language with no
 * translation of its own. Seen on a device before any of this was
 * written: the paragraph hugged the right edge with a ragged left one and
 * its full stop came out at the start of the line.
 *
 * The value that needs a test more than the others is the alignment. It
 * is `right`, for LEFT-to-right text, and every instinct says `left` —
 * so the reasoning lives in the module's header and the answer is pinned
 * here, in both directions.
 */
import {
  ALIGN_TO_OWN_SIDE,
  foreignText,
  LRI,
  PDI,
  RLI,
} from '../src/i18n/foreignText';

describe('when the text and the layout agree', () => {
  it('does nothing at all', () => {
    for (const [text, reader] of [
      ['en', 'en'],
      ['en', 'sv'],
      ['sv', 'de'],
      ['ar', 'ur'],
      ['ur', 'ar'],
    ]) {
      const f = foreignText(text, reader);
      expect(f).toEqual({
        mismatched: false,
        style: null,
        open: '',
        close: '',
      });
    }
  });

  it('compares directions, not languages', () => {
    // An English note read in Swedish is not foreign in the sense that
    // matters here, and giving it an isolate would be noise in the tree.
    expect(foreignText('en', 'fr').mismatched).toBe(false);
  });
});

describe('when they disagree', () => {
  const englishInUrdu = foreignText('en', 'ur');
  const arabicInEnglish = foreignText('ar', 'en');

  it('says so', () => {
    expect(englishInUrdu.mismatched).toBe(true);
    expect(arabicInEnglish.mismatched).toBe(true);
  });

  it('sets the direction the TEXT runs, not the layout', () => {
    expect(englishInUrdu.style?.writingDirection).toBe('ltr');
    expect(arabicInEnglish.style?.writingDirection).toBe('rtl');
  });

  it('aligns to `right` — both ways round', () => {
    // Not a typo, and not symmetric-looking by accident. Neither
    // platform treats left/right as physical once a layout is mirrored;
    // iOS mirrors the word against the layout, Android against the text
    // when the two disagree, and in THIS case both send `right` to the
    // text's own starting edge. `left` goes the other way on both.
    expect(ALIGN_TO_OWN_SIDE).toBe('right');
    expect(englishInUrdu.style?.textAlign).toBe('right');
    expect(arabicInEnglish.style?.textAlign).toBe('right');
  });

  it('isolates the run in its own direction', () => {
    expect(englishInUrdu.open).toBe(LRI);
    expect(arabicInEnglish.open).toBe(RLI);
    expect(englishInUrdu.close).toBe(PDI);
    expect(arabicInEnglish.close).toBe(PDI);
  });

  it('uses the isolate characters and not the embedding ones', () => {
    // LRE/RLE (202A/202B) leak into the surrounding paragraph; the
    // isolates do not, which is the whole reason to prefer them.
    expect(LRI.charCodeAt(0)).toBe(0x2066);
    expect(RLI.charCodeAt(0)).toBe(0x2067);
    expect(PDI.charCodeAt(0)).toBe(0x2069);
  });
});

describe('nonsense in', () => {
  it('is treated as left-to-right, like the rest of the app', () => {
    expect(foreignText(undefined, undefined).mismatched).toBe(false);
    expect(foreignText('', 'en').mismatched).toBe(false);
    expect(foreignText('en', null).mismatched).toBe(false);
    expect(foreignText(null, 'ur').mismatched).toBe(true);
  });

  it('reads a regional code by its language', () => {
    expect(foreignText('en-US', 'ur-PK').mismatched).toBe(true);
    expect(foreignText('en-GB', 'en-US').mismatched).toBe(false);
  });
});

describe('on the web (the browser and the Windows/Linux app)', () => {
  // A browser takes left and right as the physical edges whatever the
  // direction, so `right` put a transliteration under an ayah against the
  // wrong edge in Arabic (seen 2026-11-24): there the text's own side is
  // named as it is.
  const onWeb = () => {
    let f: typeof foreignText = foreignText;
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
      f = require('../src/i18n/foreignText').foreignText;
    });
    jest.dontMock('react-native');
    return f;
  };

  it('aligns Latin under a mirrored layout to the left, and Arabic under an unmirrored one to the right', () => {
    const f = onWeb();
    expect(f('en', 'ar').style?.textAlign).toBe('left');
    expect(f('en', 'ur').style?.textAlign).toBe('left');
    expect(f('ar', 'en').style?.textAlign).toBe('right');
    expect(f('en', 'ar').open).toBe(LRI);
    expect(f('en', 'sv').mismatched).toBe(false);
  });

  it('leaves the phones as they were', () => {
    expect(foreignText('en', 'ar').style?.textAlign).toBe('right');
  });
});

describe('ownSideAlign: a line against its own edge, whichever way the layout runs', () => {
  // Under a mirrored layout iOS and Android mirror `left` and `right` too:
  // an Arabic ayah set `right` in the Arabic app sat on the LEFT edge of
  // the verse-by-verse reader on both (2026-11-24).
  it('on the phones: `left` where text and layout agree, `right` where they do not', () => {
    const { ownSideAlign } = require('../src/i18n/foreignText');
    expect(ownSideAlign(true, true)).toBe('left'); // Arabic in the Arabic app → the right edge
    expect(ownSideAlign(false, false)).toBe('left'); // English in the English app
    expect(ownSideAlign(true, false)).toBe('right'); // Arabic in the English app
    expect(ownSideAlign(false, true)).toBe('right'); // Latin in the Arabic app → the left edge
  });

  it('on the web: the physical edge, as a browser reads it', () => {
    let f: (a: boolean, b: boolean) => string = () => '';
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
      f = require('../src/i18n/foreignText').ownSideAlign;
    });
    jest.dontMock('react-native');
    expect(f(true, true)).toBe('right');
    expect(f(true, false)).toBe('right');
    expect(f(false, true)).toBe('left');
    expect(f(false, false)).toBe('left');
  });

  it('the verse-by-verse reader sets its Arabic, translation and tafsir by it', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../src/screens/quran/TranslationSurahScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/ownSideAlign\(true, layoutRtl\)/);
    expect(src).toMatch(/textAlign: ownSideAlign\(rtl, layoutRtl\)/);
    expect(src).toMatch(/foreignText\(findTranslationEdition\(edition\)\?\.rtl \? 'ar' : 'en', i18n\.language\)/);
    // No fixed alignment left on the ayah's Arabic.
    const ayahArabic = src.slice(src.indexOf('  ayahArabic: {'), src.indexOf('  ayahTranslation:'));
    expect(ayahArabic).not.toMatch(/textAlign: '/);
  });
});
