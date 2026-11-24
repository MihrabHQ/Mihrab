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
 * ── ḤAFṢ ONLY ──────────────────────────────────────────────────────────
 *
 * The text spells the Ḥafṣ reading. Under Warsh, Qālūn or Shuʿbah it would
 * spell words that are not the ones on the page (mālik / malik, and
 * hundreds like it), so it is shown only where the Arabic above it is a
 * Ḥafṣ text — `transliterationFits` — and nowhere else, whatever the
 * switch says. The same rule as everything else on screen: it follows the
 * riwayah shown, not a preference.
 *
 * ── WHERE IT COMES FROM ────────────────────────────────────────────────
 *
 * `QURAN_TRANSLITERATION` in `translations.ts`: an ayah at a time while
 * the reader is online, cached as it goes, or the whole of it downloaded
 * once (0.7 MB) and read from the device after that — the store the
 * fetched translations use, unchanged.
 */
import { useEffect, useState } from 'react';
import { riwayahById, type RiwayahId } from './riwayat';
import { loadAyah, loadSurah } from './surahStore';
import {
  QURAN_TRANSLITERATION,
  TRANSLATION_SURAHS,
  storedTranslationEdition,
  translationEditionStats,
} from './translations';

export const TRANSLITERATION_ID = QURAN_TRANSLITERATION.id;

const EDITION = storedTranslationEdition(QURAN_TRANSLITERATION);

/** Is the Arabic this riwayah shows the reading the transliteration spells? */
export function transliterationFits(riwayah: RiwayahId): boolean {
  return riwayahById(riwayah).reading === 'hafs';
}

/** One ayah; empty when nothing answers (offline and not on the device). */
export async function getAyahTransliteration(surah: number, ayah: number): Promise<string> {
  return (await loadAyah('translation', EDITION, surah, ayah)) ?? '';
}

/** A surah, by ayah number; empty when nothing answers. */
export async function getSurahTransliteration(surah: number): Promise<Record<string, string>> {
  return (await loadSurah('translation', EDITION, surah)) ?? {};
}

/** Is the whole of it on this device? */
export async function hasWholeTransliteration(): Promise<boolean> {
  return (await translationEditionStats(TRANSLITERATION_ID)).surahs >= TRANSLATION_SURAHS;
}

/**
 * One ayah's line for a sheet: '' until it arrives, and '' when `on` is
 * false — the switch off, or an Arabic above it that is not Ḥafṣ.
 */
export function useAyahTransliteration(on: boolean, surah: number, ayah: number): string {
  const [text, setText] = useState('');
  useEffect(() => {
    setText('');
    if (!on) return;
    let cancelled = false;
    getAyahTransliteration(surah, ayah)
      .then(t => {
        if (!cancelled) setText(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [on, surah, ayah]);
  return text;
}

/** A surah's lines for the verse-by-verse reader, by ayah number. */
export function useSurahTransliteration(on: boolean, surah: number): Record<string, string> | null {
  const [rows, setRows] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    setRows(null);
    if (!on) return;
    let cancelled = false;
    // After the first paint, as the translation under it is read.
    const timer = setTimeout(() => {
      getSurahTransliteration(surah)
        .then(r => {
          if (!cancelled) setRows(r);
        })
        .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [on, surah]);
  return rows;
}
