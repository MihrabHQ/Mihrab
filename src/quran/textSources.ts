/**
 * Where a translation or tafsir edition's text comes from.
 *
 * Three hosts answer the same two questions — one surah of an edition, or
 * one ayah of it — in three shapes. An edition names its source and the id
 * that source knows it by, and the store (`surahStore.ts`) asks through
 * this table, so a new host is a new entry here and nowhere else.
 *
 * The app's own mirror (`config/mirrors`) holds a surah file per edition
 * byte for byte as the source answered it, so the same `surahRows` reads
 * the mirror's copy and the host's own.
 *
 *   quran.com   spa5k/tafsir_api — a public mirror of the Quran.com tafsir
 *               corpus on jsDelivr. Rows are `{ ayah, text }`, mostly in a
 *               bare array; one edition wraps them as `{ ayahs: [...] }`.
 *   tanzil      Tanzil's translation corpus through alquran.cloud, the
 *               same place the bundled editions came from (CC BY 3.0,
 *               verbatim). A surah is `{ data: { ayahs: [{ numberInSurah,
 *               text }] } }`, an ayah `{ data: { text } }`.
 *   quranenc    The Encyclopedia of the Noble Quran (quranenc.com), already
 *               the source of the Arabic word meanings. A surah is
 *               `{ result: [{ aya, translation, footnotes }] }`, an ayah
 *               `{ result: { translation, footnotes } }`. Its footnotes are
 *               part of the text — the markers in the translation point
 *               at them — so they follow it, after a blank line.
 */

export type TextSourceId = 'quran.com' | 'tanzil' | 'quranenc';

export type SurahRow = { ayah: number; text: string };

export type TextSource = {
  /** The whole surah, for a download or the mirror. */
  surahUrl: (sourceId: string, surah: number) => string;
  /** One ayah, for an open sheet when nothing else answers. */
  ayahUrl: (sourceId: string, surah: number, ayah: number) => string;
  /** A surah answer's rows; null when the body is not that answer. */
  surahRows: (json: unknown) => SurahRow[] | null;
  /** An ayah answer's text; null when the body is not that answer. */
  ayahText: (json: unknown) => string | null;
  /** Shown beside the edition in Settings → About. */
  attribution: string;
  homepage: string;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** QuranEnc keeps the notes apart from the text; the reader wants both. */
function withFootnotes(translation: unknown, footnotes: unknown): string {
  const t = str(translation);
  const f = str(footnotes);
  return t && f ? `${t}\n\n${f}` : t;
}

export const TEXT_SOURCES: Record<TextSourceId, TextSource> = {
  'quran.com': {
    surahUrl: (id, surah) =>
      `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${id}/${surah}.json`,
    ayahUrl: (id, surah, ayah) =>
      `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${id}/${surah}/${ayah}.json`,
    surahRows: json => {
      const inner = Array.isArray(json)
        ? json
        : (json as { ayahs?: unknown } | null)?.ayahs;
      if (!Array.isArray(inner)) return null;
      return inner.map(r => ({
        ayah: Number((r as { ayah?: unknown })?.ayah),
        text: str((r as { text?: unknown })?.text),
      }));
    },
    ayahText: json => {
      const t = str((json as { text?: unknown } | null)?.text);
      return t || null;
    },
    attribution: 'spa5k/tafsir_api · Quran.com tafsir corpus',
    homepage: 'https://github.com/spa5k/tafsir_api',
  },
  tanzil: {
    surahUrl: (id, surah) => `https://api.alquran.cloud/v1/surah/${surah}/${id}`,
    ayahUrl: (id, surah, ayah) =>
      `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/${id}`,
    surahRows: json => {
      const inner = (json as { data?: { ayahs?: unknown } } | null)?.data?.ayahs;
      if (!Array.isArray(inner)) return null;
      return inner.map(r => ({
        ayah: Number((r as { numberInSurah?: unknown })?.numberInSurah),
        text: str((r as { text?: unknown })?.text),
      }));
    },
    ayahText: json => {
      const t = str((json as { data?: { text?: unknown } } | null)?.data?.text);
      return t || null;
    },
    attribution: 'alquran.cloud · Tanzil-derived · CC BY 3.0',
    homepage: 'https://alquran.cloud/',
  },
  quranenc: {
    surahUrl: (id, surah) =>
      `https://quranenc.com/api/v1/translation/sura/${id}/${surah}`,
    ayahUrl: (id, surah, ayah) =>
      `https://quranenc.com/api/v1/translation/aya/${id}/${surah}/${ayah}`,
    surahRows: json => {
      const inner = (json as { result?: unknown } | null)?.result;
      if (!Array.isArray(inner)) return null;
      return inner.map(r => {
        const row = r as { aya?: unknown; translation?: unknown; footnotes?: unknown };
        return { ayah: Number(row?.aya), text: withFootnotes(row?.translation, row?.footnotes) };
      });
    },
    ayahText: json => {
      const row = (json as { result?: { translation?: unknown; footnotes?: unknown } } | null)
        ?.result;
      const t = withFootnotes(row?.translation, row?.footnotes);
      return t || null;
    },
    attribution: 'Encyclopedia of the Noble Quran · QuranEnc.com',
    homepage: 'https://quranenc.com/',
  },
};
