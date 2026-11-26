/**
 * The Hadith pages in Arabic over an app in another language
 * (hadith/HadithUiScope.tsx).
 */
import { readFileSync } from 'fs';
import path from 'path';
import i18n from '../src/i18n';
import { arabicI18n, hadithUiIsArabic } from '../src/hadith/HadithUiScope';

const read = (f: string) => readFileSync(path.join(__dirname, '..', f), 'utf-8');

describe('the Hadith tab follows the hadith language when that is Arabic', () => {
  it('only Arabic, and only when the app is not Arabic already', () => {
    expect(hadithUiIsArabic('ar', 'en')).toBe(true);
    expect(hadithUiIsArabic('ar', 'sv')).toBe(true);
    expect(hadithUiIsArabic('ar', 'ur')).toBe(true);
    expect(hadithUiIsArabic('ar', 'ar')).toBe(false);
    expect(hadithUiIsArabic('auto', 'en')).toBe(false);
    expect(hadithUiIsArabic('en', 'sv')).toBe(false);
  });

  it('its i18n speaks Arabic at once and leaves the app in its own language', () => {
    const before = i18n.language;
    const ar = arabicI18n();
    expect(ar.language).toBe('ar');
    expect(ar.t('nav.hadith')).toBe(require('../src/i18n/locales/ar.json').nav.hadith);
    expect(i18n.language).toBe(before);
    expect(i18n.t('nav.hadith')).toBe(require('../src/i18n/locales/en.json').nav.hadith);
    expect(arabicI18n()).toBe(ar);
  });

  it('every Hadith screen is inside the scope', () => {
    for (const [file, name] of [
      ['src/screens/HadithScreen.tsx', 'HadithScreen'],
      ['src/screens/hadith/HadithReaderScreen.tsx', 'HadithReaderScreen'],
      ['src/screens/hadith/HadithListScreen.tsx', 'HadithListScreen'],
      ['src/screens/hadith/LibraryBookScreen.tsx', 'LibraryBookScreen'],
    ]) {
      expect(read(file)).toContain(`export const ${name} = withHadithUi(${name}Page, '${name}');`);
    }
  });

  it('the compiler of al-Wabil as-Sayyib is named in full, as the Library names him', () => {
    const ar = require('../src/i18n/locales/ar.json');
    expect(JSON.stringify(ar)).not.toContain('ابن القيم');
    expect(read('src/hadith/libraryBooks.json')).toContain('ابن قيّم الجوزية');
  });
});
