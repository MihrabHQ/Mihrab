/**
 * Real tafsir — v2.7.28.
 *
 * Classical tafsir texts fetched per-ayah on demand and cached on disk,
 * shown in the ayah action sheet next to the translation. Source:
 * spa5k/tafsir_api (github.com/spa5k/tafsir_api), a public mirror of
 * Quran.com's tafsir corpus served via the jsDelivr CDN — the same
 * texts Quran.com displays. Every edition is attributed in
 * Settings → About (religious-content rule, CLAUDE.md §4).
 *
 * Cache layout: <Documents>/quran/tafsir/{editionId}/{surah}/{ayah}.json
 * (inside the managed `quran/` store so it is excluded from Android
 * Auto Backup and cleaned by the Manage-downloads screen).
 */
import {
  deleteEdition,
  deleteStore,
  downloadEdition,
  editionStats,
  hasSurah,
  loadAyah,
  resetStoreMemory,
  storeDir,
  storeDiskUsage,
  STORE_SURAHS,
  type StoredEdition,
} from './surahStore';
import { TEXT_SOURCES, type TextSourceId } from './textSources';
import type {
  MushafDownloadHandle,
  MushafDownloadProgress,
} from './mushafDownload';

export type TafsirEdition = {
  id: string;
  /** Display label (proper noun — not translated). */
  label: string;
  /**
   * Where the text comes from (`textSources.ts`). Absent: the Quran.com
   * corpus, under `id`. The three Tanzil editions name `tanzil` and the id
   * alquran.cloud knows them by.
   */
  source?: TextSourceId;
  sourceId?: string;
  /** App locale this edition serves. */
  locale: string;
  /** RTL text? */
  rtl: boolean;
  /** Display name of the edition's language (for the selector subtitle). */
  language: string;
  /**
   * What the whole edition comes to on disk, in bytes — the 114 surah files
   * summed from the CDN on 2026-10-05. Only so the offer can say what it
   * costs BEFORE the reader agrees; the downloads screen reports the real
   * figure once it is there. Rounded; upstream is missing a few surahs.
   */
  approxBytes: number;
};

/**
 * Verified live against the CDN on 2026-07-05 (HTTP 200 for 1:1).
 * Locales without a native edition fall back to Ibn Kathir (English).
 */
export const TAFSIR_EDITIONS: ReadonlyArray<TafsirEdition> = [
  {
    id: 'en-tafisr-ibn-kathir', // (sic — upstream id carries the typo)
    label: 'Ibn Kathir (abridged)',
    locale: 'en',
    rtl: false,
    language: 'English',
    approxBytes: 44600000,
  },
  {
    id: 'en-tafsir-maarif-ul-quran',
    label: 'Maarif-ul-Quran',
    locale: 'en',
    rtl: false,
    language: 'English',
    approxBytes: 17000000,
  },
  {
    id: 'ar-tafsir-muyassar',
    label: 'التفسير الميسر',
    locale: 'ar',
    rtl: true,
    language: 'Arabic',
    approxBytes: 3100000,
  },
  {
    id: 'ar-tafsir-ibn-kathir',
    label: 'تفسير ابن كثير',
    locale: 'ar',
    rtl: true,
    language: 'Arabic',
    approxBytes: 84100000,
  },
  {
    id: 'ur-tafseer-ibn-e-kaseer',
    label: 'تفسیر ابن کثیر (اردو)',
    locale: 'ur',
    rtl: true,
    language: 'Urdu',
    approxBytes: 34800000,
  },
  {
    id: 'bn-tafseer-ibn-e-kaseer',
    label: 'তাফসীর ইবনে কাসীর',
    locale: 'bn',
    rtl: false,
    language: 'Bengali',
    approxBytes: 52700000,
  },
  // Issue #125 (2026-11-05): tafsir in Bahasa Indonesia, and the other
  // editions of the same corpus that are COMPLETE in an app language — all
  // 114 surahs and 6,236 ayahs present, checked against the CDN surah by
  // surah. As-Sa'di (Indonesian) is the one exception: surahs 22, 25 and
  // 79 are missing upstream, which Ibn Kathir above already lives with.
  // Each new one comes after its language's existing editions, so nobody's
  // default changes. Not added: the corpus's Indonesian Jalalayn, whose
  // every file is an empty list.
  {
    id: 'indonesian-mokhtasar',
    label: 'Tafsir Al-Mukhtashar',
    locale: 'id',
    rtl: false,
    language: 'Indonesian',
    approxBytes: 2500000,
  },
  {
    id: 'id-tafsir-as-saadi',
    label: "Tafsir As-Sa'di",
    locale: 'id',
    rtl: false,
    language: 'Indonesian',
    approxBytes: 62200000,
  },
  {
    id: 'ar-tafsir-al-mukhtasar',
    label: 'المختصر في التفسير',
    locale: 'ar',
    rtl: true,
    language: 'Arabic',
    approxBytes: 2300000,
  },
  {
    id: 'bengali-mokhtasar',
    label: 'আল-মুখতাসার',
    locale: 'bn',
    rtl: false,
    language: 'Bengali',
    approxBytes: 4800000,
  },
  {
    id: 'bn-tafsir-ahsanul-bayaan',
    label: 'তাফসীর আহসানুল বায়ান',
    locale: 'bn',
    rtl: false,
    language: 'Bengali',
    approxBytes: 9600000,
  },
  {
    id: 'russian-mokhtasar',
    label: 'Аль-Мухтасар',
    locale: 'ru',
    rtl: false,
    language: 'Russian',
    approxBytes: 3300000,
  },
  // The second round (2026-11-05), after the first was out: the rest of the
  // corpus that is complete or a surah or two short in an app language, and
  // three editions Tanzil files as translations that are tafsir — Jalalayn
  // and al-Muntakhab in Indonesian (the corpus's own Indonesian Jalalayn is
  // empty), and Kuliev's translation with as-Sa'di's commentary in Russian.
  // Sizes are the surah files summed, or the compact file this app writes.
  // Not added: the corpus's "Turkish Ibn Kathir", which is the ayah's
  // meaning alone and not a tafsir.
  {
    id: 'id-tafsir-jalalayn',
    label: 'Tafsir Jalalain',
    source: 'tanzil',
    sourceId: 'id.jalalayn',
    locale: 'id',
    rtl: false,
    language: 'Indonesian',
    approxBytes: 2800000,
  },
  {
    id: 'id-tafsir-muntakhab',
    label: 'Al-Muntakhab (Quraish Shihab)',
    source: 'tanzil',
    sourceId: 'id.muntakhab',
    locale: 'id',
    rtl: false,
    language: 'Indonesian',
    approxBytes: 2600000,
  },
  {
    id: 'ar-tafseer-al-saddi',
    label: 'تفسير السعدي',
    locale: 'ar',
    rtl: true,
    language: 'Arabic',
    approxBytes: 6300000,
  },
  {
    id: 'ur-tafsir-bayan-ul-quran',
    label: 'بیان القرآن (ڈاکٹر اسرار احمد)',
    locale: 'ur',
    rtl: true,
    language: 'Urdu',
    approxBytes: 9900000,
  },
  {
    id: 'bn-tafsir-abu-bakr-zakaria',
    label: 'তাফসীর আবু বকর যাকারিয়া',
    locale: 'bn',
    rtl: false,
    language: 'Bengali',
    approxBytes: 13900000,
  },
  {
    id: 'ru-tafsir-kuliev-alsaadi',
    label: 'Кулиев + ас-Саади',
    source: 'tanzil',
    sourceId: 'ru.kuliev-alsaadi',
    locale: 'ru',
    rtl: false,
    language: 'Russian',
    approxBytes: 10500000,
  },
  {
    id: 'ru-tafsir-ibne-kahtir',
    label: 'Тафсир Ибн Касира',
    locale: 'ru',
    rtl: false,
    language: 'Russian',
    approxBytes: 16000000,
  },
  {
    id: 'en-tafsir-al-mukhtasar',
    label: 'Al-Mukhtasar',
    locale: 'en',
    rtl: false,
    language: 'English',
    approxBytes: 2000000,
  },
  {
    id: 'turkish-mokhtasar',
    label: 'El-Muhtasar',
    locale: 'tr',
    rtl: false,
    language: 'Turkish',
    approxBytes: 2200000,
  },
  {
    id: 'french-mokhtasar',
    label: 'Al-Mukhtasar',
    locale: 'fr',
    rtl: false,
    language: 'French',
    approxBytes: 2200000,
  },
  {
    id: 'spanish-mokhtasar',
    label: 'Al-Mukhtasar',
    locale: 'es',
    rtl: false,
    language: 'Spanish',
    approxBytes: 2000000,
  },
  {
    id: 'chinese-mokhtasar',
    label: '古兰经简明注释',
    locale: 'zh',
    rtl: false,
    language: 'Chinese',
    approxBytes: 1600000,
  },
  {
    id: 'hindi-mokhtasar',
    label: 'अल-मुख़्तसर',
    locale: 'hi',
    rtl: false,
    language: 'Hindi',
    approxBytes: 4600000,
  },
] as const;

/** Editions offered for an app locale: native ones first, then English. */
export function tafsirEditionsForLocale(locale: string): TafsirEdition[] {
  const native = TAFSIR_EDITIONS.filter(e => e.locale === locale);
  const english = TAFSIR_EDITIONS.filter(e => e.locale === 'en');
  return locale === 'en' ? english : [...native, ...english];
}

/**
 * An edition's name for a chip: the words kept together.
 *
 * Android lays a Text out in a width taken from Yoga's measurement, and for
 * Arabic script the drawn line can come out a fraction of a pixel wider
 * than that measurement. A name with ordinary spaces then WRAPS — and the
 * chip is one line high, so everything after the first word is cut off:
 * "تفسير ابن كثير" showing as "تفسير ابن" (seen on a Pixel, 2026-10-05; and
 * "التفسير الميسر" as "التفسير" in September). Giving the chip more width
 * does not help, the box was never too small; the line just must not be
 * allowed to break. Non-breaking spaces make it one unbreakable run, so a
 * hair of overflow is a hair, not a missing word.
 */
export function tafsirChipLabel(label: string): string {
  return label.replace(/ /g, '\u00A0');
}

/**
 * An edition's name set into a sentence of another script. Without the
 * isolate, the Arabic name pulls the "17%" that follows it to the wrong
 * side — "Downloading 17 · التفسير الميسر%" — because the sentence is left
 * to right and the name is not. U+2068 … U+2069 keep the name a unit.
 */
export function tafsirNameInSentence(label: string): string {
  return `\u2068${label}\u2069`;
}

/** "3.1 MB", "84 MB" — what a whole edition comes to, for the offer. */
export function tafsirSizeLabel(bytes: number): string {
  const mb = bytes / 1_000_000;
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

export function findTafsirEdition(id: string): TafsirEdition | undefined {
  return TAFSIR_EDITIONS.find(e => e.id === id);
}

/**
 * Resolve the tafsir edition to show for a stored preference + app locale.
 * An EXPLICIT stored pick is honoured for ANY edition we ship — the
 * selector lists all of them (v2.7.40), so a cross-language pick must not
 * silently revert. The locale only chooses the DEFAULT when nothing valid
 * is stored (fresh installs, unknown/blank ids).
 */
export function resolveTafsirEdition(
  storedId: string,
  locale: string,
): TafsirEdition {
  return (
    TAFSIR_EDITIONS.find(e => e.id === storedId) ??
    tafsirEditionsForLocale(locale)[0]
  );
}

// ─── The store ─────────────────────────────────────────────────────────
//
// Everything below is `surahStore.ts` with the kind filled in: a tafsir is
// kept a surah at a time, fetched on demand under an open sheet and
// downloadable whole (`kind: 'tafsir'` in the download manager). The
// layout and the mirror asset names are the ones this file had before the
// store was shared with the translations (2026-11); nothing on a phone's
// disk moved.

/** What the store needs of an edition; an id it has never heard of is
 *  taken as a Quran.com edition of that name, as every one once was. */
function stored(edition: string): StoredEdition {
  const ed = findTafsirEdition(edition);
  return {
    id: edition,
    source: ed?.source ?? 'quran.com',
    sourceId: ed?.sourceId ?? edition,
    approxBytes: ed?.approxBytes ?? Infinity,
  };
}

export const TAFSIR_SURAHS = STORE_SURAHS;

export function tafsirCacheDir(): string {
  return storeDir('tafsir');
}

export function resetTafsirMemory(): void {
  resetStoreMemory('tafsir');
}

/**
 * Fetch (or read from cache) one ayah's tafsir text. Resolves null on
 * any failure — the UI shows a quiet "unavailable offline" note.
 */
export function loadTafsir(
  edition: string,
  surah: number,
  ayah: number,
): Promise<string | null> {
  return loadAyah('tafsir', stored(edition), surah, ayah);
}

/** Is this surah of the edition on disk as part of a whole-edition download? */
export function hasTafsirSurah(edition: string, surah: number): Promise<boolean> {
  return hasSurah('tafsir', edition, surah);
}

/** How much of one edition is on disk, for the downloads screen. */
export function tafsirEditionStats(edition: string): Promise<{ bytes: number; surahs: number }> {
  return editionStats('tafsir', edition);
}

/** Delete one edition — the whole download and anything cached ayah by ayah. */
export function deleteTafsirEdition(edition: string): Promise<void> {
  return deleteEdition('tafsir', edition);
}

/**
 * A Quran.com surah file's rows: a bare array, or `{ ayahs: [...] }` as the
 * Urdu Ibn Kathir has it. The mirror builder checks files with this.
 */
export function surahRows(json: unknown): Array<{ ayah: number; text: string }> | null {
  return TEXT_SOURCES['quran.com'].surahRows(json);
}

/** Fetch every surah of an edition, skipping the ones already on disk. */
export function downloadTafsirEdition(
  edition: string,
  opts: { onProgress?: (p: MushafDownloadProgress) => void },
): MushafDownloadHandle {
  return downloadEdition('tafsir', stored(edition), opts);
}

/** Bytes on disk in the tafsir cache (Manage-downloads screen). */
export function tafsirDiskUsage(): Promise<number> {
  return storeDiskUsage('tafsir');
}

/** Delete the whole tafsir cache. */
export function deleteTafsirCache(): Promise<void> {
  return deleteStore('tafsir');
}

export const TAFSIR_ATTRIBUTION =
  'Tafsir texts (Ibn Kathir, Maarif-ul-Quran, al-Muyassar) via the ' +
  'spa5k/tafsir_api mirror of the Quran.com tafsir corpus.';
