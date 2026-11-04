/**
 * The words for a hifz portion — shared by the Qur'an tab's row, the Hifz
 * page and the ayah sheet, so a portion is called the same thing wherever
 * it is met.
 */
import type { TFunction } from 'i18next';
import { findSurah } from './quran';
import { surahName as localName } from './surahName';
import { daysBetween, portionSpan, type HifzPortion } from './hifz';

/** The surah's name as the app writes it in the reader's language: Arabic script for Arabic, Urdu…, else transliterated. */
export function hifzSurahName(n: number): string {
  const meta = findSurah(n);
  return meta ? localName(meta) : String(n);
}
const surahName = hifzSurahName;

/** "An-Naba", "An-Naba 1–20", or "Al-Mulk 1 – Al-Qalam 10". */
export function hifzPortionName(p: HifzPortion, t: TFunction): string {
  const span = portionSpan(p);
  if (span.wholeSurah) return surahName(span.surah);
  if (span.surah === span.endSurah) {
    return t('hifz.range', {
      defaultValue: '{{surah}} {{from}}–{{to}}',
      surah: surahName(span.surah),
      from: span.from,
      to: span.to,
    });
  }
  return t('hifz.rangeAcross', {
    defaultValue: '{{from}} – {{to}}',
    from: `${surahName(span.surah)} ${span.from}`,
    to: `${surahName(span.endSurah)} ${span.to}`,
  });
}

/** When the portion is next due, as a short note: today, tomorrow, in N days, N days overdue. */
export function hifzDueLabel(p: HifzPortion, today: string, t: TFunction): string {
  const days = daysBetween(today, p.due);
  if (days < 0) return t('hifz.overdue', { defaultValue: '{{count}} days overdue', count: -days });
  if (days === 0) return t('hifz.dueToday', 'Due today');
  if (days === 1) return t('hifz.dueTomorrow', 'Tomorrow');
  return t('hifz.dueIn', { defaultValue: 'In {{count}} days', count: days });
}

/** "37 surahs · 666 ayahs by heart" — two counted halves, so each takes its own plural form. */
export function hifzStockLine(stock: { surahs: number; ayahs: number }, t: TFunction): string {
  const surahs = t('hifz.stockSurahs', { defaultValue: '{{count}} surahs', count: stock.surahs });
  const ayahs = t('hifz.stockAyahs', { defaultValue: '{{count}} ayahs by heart', count: stock.ayahs });
  // Only a stretch of a surah held: "0 surahs" says nothing worth saying.
  return stock.surahs > 0 ? `${surahs} · ${ayahs}` : ayahs;
}
