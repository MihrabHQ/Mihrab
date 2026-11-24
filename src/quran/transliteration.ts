/**
 * The ayah in Latin letters, beside the Arabic — for a reader who is still
 * learning to read it (asked for in a Play review, 2026-11-24: "like the
 * pronunciation in the du'a and tasbih menu").
 *
 * ── WHAT IT IS, AND IS NOT ─────────────────────────────────────────────
 *
 * An aid. Latin letters cannot write the lengths, the heavy and light
 * letters or the rules of tajwīd, and the Qur'an is recited from the
 * Arabic; so it is OFF until asked for (`prefs.transliteration`), sits
 * under the Arabic rather than in its place, and the switch says so.
 *
 * ── ONE READING, FOUR SPELLINGS ────────────────────────────────────────
 *
 * There is no one way to write Arabic in Latin letters: an Indonesian
 * reader was taught żālika and syai', an English one dhaalika and shay',
 * a Turkish one ẕâlike and şey'. A line in the wrong convention is harder
 * to read than none, so the spelling follows the app's language to begin
 * with (`transliterationForLocale`) and the reader may choose another
 * (`prefs.transliterationStyle`). The editions are `QURAN_TRANSLITERATIONS`
 * in `translations.ts`. For the languages with no convention of their own
 * on offer — none was found with a licence, for Bengali, Hindi, Russian or
 * Chinese script — the plain English spelling where English is the usual
 * second script, and the scholarly one elsewhere.
 *
 * ── ḤAFṢ ONLY ──────────────────────────────────────────────────────────
 *
 * Every edition spells the Ḥafṣ reading. Under Warsh, Qālūn or Shuʿbah it
 * would spell words that are not the ones on the page (mālik / malik, and
 * hundreds like it), so it is shown only where the Arabic above it is a
 * Ḥafṣ text — `transliterationFits` — and nowhere else, whatever the
 * switch says. The same rule as everything else on screen: it follows the
 * riwayah shown, not a preference.
 *
 * ── WHERE IT COMES FROM ────────────────────────────────────────────────
 *
 * A surah at a time while the reader is online, or the whole edition
 * downloaded once (0.7 MB) and read from the device after that — the
 * store the fetched translations use, unchanged.
 */
import { useEffect, useState } from 'react';
import { riwayahById, type RiwayahId } from './riwayat';
import { loadAyah, loadSurah } from './surahStore';
import {
  QURAN_TRANSLITERATIONS,
  TRANSLATION_SURAHS,
  storedTranslationEdition,
  translationEditionStats,
  type QuranTranslationEdition,
} from './translations';

/** A word or two in each spelling: what its choice shows, in any language. */
export const TRANSLITERATION_SAMPLES: Readonly<Record<string, string>> = {
  'translit.en-simple': 'raheem · dhaalika',
  'translit.en': 'raḥīm · dhālika',
  'translit.id-skb': 'raḥīm · żālika',
  'tr.transliteration': 'raḥîm · ẕâlike',
};

/** The spelling a reader in this app language starts with. */
const BY_LOCALE: Readonly<Record<string, string>> = {
  en: 'translit.en-simple',
  // English is the second script of the subcontinent: "aa, ee, oo".
  bn: 'translit.en-simple',
  hi: 'translit.en-simple',
  ur: 'translit.en-simple',
  id: 'translit.id-skb',
  tr: 'tr.transliteration',
};
/** Everyone else: the scholarly spelling, which belongs to no one language. */
const NEUTRAL = 'translit.en';

const byId = (id: string) => QURAN_TRANSLITERATIONS.find(e => e.id === id);

export function transliterationForLocale(locale: string): QuranTranslationEdition {
  return byId(BY_LOCALE[locale.slice(0, 2)] ?? NEUTRAL) ?? QURAN_TRANSLITERATIONS[0];
}

/** The reader's spelling: their choice if it is still offered, else their language's. */
export function resolveTransliteration(
  style: string | null | undefined,
  locale: string,
): QuranTranslationEdition {
  return (style ? byId(style) : undefined) ?? transliterationForLocale(locale);
}

/** Is the Arabic this riwayah shows the reading the transliterations spell? */
export function transliterationFits(riwayah: RiwayahId): boolean {
  return riwayahById(riwayah).reading === 'hafs';
}

/** One ayah; empty when nothing answers (offline and not on the device). */
export async function getAyahTransliteration(
  edition: QuranTranslationEdition,
  surah: number,
  ayah: number,
): Promise<string> {
  return (await loadAyah('translation', storedTranslationEdition(edition), surah, ayah)) ?? '';
}

/** A surah, by ayah number; empty when nothing answers. */
export async function getSurahTransliteration(
  edition: QuranTranslationEdition,
  surah: number,
): Promise<Record<string, string>> {
  return (await loadSurah('translation', storedTranslationEdition(edition), surah)) ?? {};
}

/** Is the whole of this edition on this device? */
export async function hasWholeTransliteration(edition: QuranTranslationEdition): Promise<boolean> {
  return (await translationEditionStats(edition.id)).surahs >= TRANSLATION_SURAHS;
}

/**
 * One ayah's line for a sheet: '' until it arrives, and '' when `on` is
 * false — the switch off, or an Arabic above it that is not Ḥafṣ.
 */
export function useAyahTransliteration(
  on: boolean,
  edition: QuranTranslationEdition,
  surah: number,
  ayah: number,
): string {
  const [text, setText] = useState('');
  useEffect(() => {
    setText('');
    if (!on) return;
    let cancelled = false;
    getAyahTransliteration(edition, surah, ayah)
      .then(t => {
        if (!cancelled) setText(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [on, edition, surah, ayah]);
  return text;
}

/** A surah's lines for the verse-by-verse reader, by ayah number. */
export function useSurahTransliteration(
  on: boolean,
  edition: QuranTranslationEdition,
  surah: number,
): Record<string, string> | null {
  const [rows, setRows] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    setRows(null);
    if (!on) return;
    let cancelled = false;
    // After the first paint, as the translation under it is read.
    const timer = setTimeout(() => {
      getSurahTransliteration(edition, surah)
        .then(r => {
          if (!cancelled) setRows(r);
        })
        .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [on, edition, surah]);
  return rows;
}
