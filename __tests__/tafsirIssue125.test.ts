/**
 * Issue #125: tafsir in Bahasa Indonesia, plus the complete editions of the
 * same corpus in Arabic, Bengali and Russian. Each joins after its
 * language's existing editions, so no reader's default moves.
 */
import {
  TAFSIR_EDITIONS,
  tafsirEditionsForLocale,
  resolveTafsirEdition,
} from '../src/quran/tafsir';

jest.mock('react-native-blob-util', () => ({ fs: { dirs: { DocumentDir: '/d' } } }));

const ids = (locale: string) => tafsirEditionsForLocale(locale).map(e => e.id);

describe('tafsir editions (#125)', () => {
  it('offers Indonesian tafsir to an Indonesian reader, ahead of English', () => {
    expect(ids('id').slice(0, 2)).toEqual(['indonesian-mokhtasar', 'id-tafsir-as-saadi']);
    expect(resolveTafsirEdition('', 'id').id).toBe('indonesian-mokhtasar');
  });

  it('keeps every existing default where it was', () => {
    expect(resolveTafsirEdition('', 'en').id).toBe('en-tafisr-ibn-kathir');
    expect(resolveTafsirEdition('', 'ar').id).toBe('ar-tafsir-muyassar');
    expect(resolveTafsirEdition('', 'ur').id).toBe('ur-tafseer-ibn-e-kaseer');
    expect(resolveTafsirEdition('', 'bn').id).toBe('bn-tafseer-ibn-e-kaseer');
  });

  it('gives Russian its own edition first', () => {
    expect(ids('ru')[0]).toBe('russian-mokhtasar');
  });

  it('adds the new Arabic and Bengali editions after the old ones', () => {
    expect(ids('ar').slice(0, 3)).toEqual([
      'ar-tafsir-muyassar',
      'ar-tafsir-ibn-kathir',
      'ar-tafsir-al-mukhtasar',
    ]);
    expect(ids('bn').slice(0, 3)).toEqual([
      'bn-tafseer-ibn-e-kaseer',
      'bengali-mokhtasar',
      'bn-tafsir-ahsanul-bayaan',
    ]);
  });

  it('has one entry per id, each with a size and a language', () => {
    const all = TAFSIR_EDITIONS.map(e => e.id);
    expect(new Set(all).size).toBe(all.length);
    for (const e of TAFSIR_EDITIONS) {
      expect(e.approxBytes).toBeGreaterThan(0);
      expect(e.language).toBeTruthy();
      expect(e.rtl).toBe(e.locale === 'ar' || e.locale === 'ur');
    }
  });

  it('leaves out the Indonesian Jalalayn, which is empty upstream', () => {
    expect(TAFSIR_EDITIONS.map(e => e.id)).not.toContain('in-tafsir-jalalayn');
  });
});
