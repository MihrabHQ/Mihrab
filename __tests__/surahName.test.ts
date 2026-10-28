/**
 * Surah names follow the app language (v2.8.4).
 *
 * The reader header, its fullscreen label and the screen title all showed
 * the English name unconditionally — an Arabic UI got "Al-Fatihah" (and, in
 * fullscreen, "The Opening") over a page of Arabic script.
 */
import { mushafSurahName, surahName, usesArabicScript } from '../src/quran/surahName';
import { MUSHAF_SURAHS } from '../src/quran/pages';
import { SURAHS } from '../src/quran/quran';

const mushafMeta = { name: 'الفاتحة', englishName: 'Al-Faatiha' };
const catalogMeta = { arabic: 'الفاتحة', romanized: 'Al-Fatihah' };

describe('usesArabicScript', () => {
  it('is true for the Arabic-script UI languages we ship', () => {
    expect(usesArabicScript('ar')).toBe(true);
    expect(usesArabicScript('ur')).toBe(true);
    expect(usesArabicScript('ar-EG')).toBe(true);
  });

  it('is false for the Latin/Indic/CJK ones', () => {
    for (const lang of ['en', 'sv', 'fr', 'de', 'tr', 'id', 'ru', 'zh', 'hi', 'bn']) {
      expect(usesArabicScript(lang)).toBe(false);
    }
  });
});

describe('surah names', () => {
  it('gives the Arabic name to an Arabic-script UI', () => {
    expect(mushafSurahName(mushafMeta, 'ar')).toBe('الفاتحة');
    expect(surahName(catalogMeta, 'ur')).toBe('الفاتحة');
  });

  it('gives the Latin name to everyone else', () => {
    expect(mushafSurahName(mushafMeta, 'sv')).toBe('Al-Faatiha');
    expect(surahName(catalogMeta, 'en')).toBe('Al-Fatihah');
    expect(surahName(catalogMeta, 'zh')).toBe('Al-Fatihah');
  });

  it('spells a mushaf surah the way the index does, not the way the page table does', () => {
    // The page table spells 64 surahs its own way; the reader's header
    // took that spelling the moment a page turned ("Aal-i-Imran" in the
    // index and the sheet, "Aal-i-Imraan" over the page).
    const fromTable = { number: 3, name: 'آل عمران', englishName: 'Aal-i-Imraan' };
    expect(mushafSurahName(fromTable, 'en')).toBe('Aal-i-Imran');
    expect(mushafSurahName(fromTable, 'ar')).toBe('آل عمران');
    for (const meta of MUSHAF_SURAHS) {
      expect(mushafSurahName(meta, 'en')).toBe(SURAHS[meta.number - 1].romanized);
    }
    // A number the index does not know keeps the table's own name.
    expect(mushafSurahName({ number: 115, name: 'x', englishName: 'Table' }, 'en')).toBe('Table');
  });
});
