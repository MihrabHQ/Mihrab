/**
 * Surah names that follow the app language (v2.8.4).
 *
 * The reader's header, its fullscreen label and the surah title all showed
 * the ENGLISH name unconditionally — so an app running in Arabic put
 * "Al-Fatihah" (or, in fullscreen, "The Opening") above a page of Arabic
 * script. The catalogue already carries both forms; this picks the one the
 * reader's language actually wants.
 *
 * Arabic script rather than "is RTL": Urdu and Persian readers know the
 * Arabic surah names, and that is the form printed in their mushafs too.
 */
import i18n from '../i18n';
import { SURAHS } from './quran';

const ARABIC_SCRIPT_LANGUAGES = ['ar', 'ur', 'fa', 'ps', 'sd', 'ckb'];

export function usesArabicScript(language?: string): boolean {
  const lang = (language ?? i18n.language ?? '').slice(0, 2).toLowerCase();
  return ARABIC_SCRIPT_LANGUAGES.includes(lang);
}

/**
 * Name for a `MUSHAF_SURAHS` entry (`pages.ts` shape).
 *
 * The romanized name is the app's own (`SURAHS`), not the page table's:
 * the table spells 64 of the 114 its own way ("Aal-i-Imraan", "Yaseen",
 * "An-Naas"), so the reader's header, the scrubber and the widget said
 * one name and the index, the ayah sheet and the listening page another —
 * and the header changed its spelling the moment a page turned. The
 * table's own name is the fallback for a number it does not know.
 */
export function mushafSurahName(
  meta: { number?: number; name: string; englishName: string },
  language?: string,
): string {
  if (usesArabicScript(language)) return meta.name;
  const own = meta.number == null ? undefined : SURAHS[meta.number - 1];
  return own && own.number === meta.number ? own.romanized : meta.englishName;
}

/** Name for a `SURAHS` entry (`quran.ts` shape). */
export function surahName(
  meta: { arabic: string; romanized: string },
  language?: string,
): string {
  return usesArabicScript(language) ? meta.arabic : meta.romanized;
}
