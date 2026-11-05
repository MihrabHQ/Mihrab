/**
 * Quran translation registry — task #96.
 *
 * Multiple Tanzil-derived translation editions ship with the app so the
 * user can pick the one that matches their preferred language. Default
 * follows the active app locale (see `defaultEditionForLocale`).
 *
 * They ship as ASSETS, not inside the JS bundle. The fourteen editions
 * are ~17 MB, and `index.android.bundle` is STORED in the APK — Android
 * does not compress a `.bundle`, so every one of those megabytes was
 * paid at full price on every download. As ordinary assets they
 * compress like the JSON they are: the APK went from 50.1 MB to 37.3.
 * They are still inside the app, so nothing about reading offline
 * changes — only where the bytes sit and what it costs to send them.
 *
 * Each edition's text lives at `assets/quran/translations/{id}.json` as a
 * chapter-keyed object: `{ "1": { "1": "In the name…", … }, … }`.
 * Metro requires literal require paths so we enumerate explicitly.
 *
 * Source: alquran.cloud (Tanzil corpus). License notes:
 *   - Sahih International: public domain
 *   - Pickthall: public domain
 *   - Tanzil-distributed editions: respective translator licenses,
 *     redistributed under CC BY 3.0 by Tanzil.
 */

import ReactNativeBlobUtil from 'react-native-blob-util';
import { bundledAssetPath } from './bundledAsset';
import {
  deleteEdition,
  deleteStore,
  downloadEdition,
  editionStats,
  hasSurah,
  loadAyah,
  loadSurah,
  storeDiskUsage,
  STORE_SURAHS,
  type StoredEdition,
} from './surahStore';
import type { TextSourceId } from './textSources';
import type {
  MushafDownloadHandle,
  MushafDownloadProgress,
} from './mushafDownload';

export type QuranTranslationEdition = {
  /** Stable id, also the data file name. */
  id: string;
  /** Translator / edition name. */
  label: string;
  /** ISO-style language label. */
  language: string;
  /** App locale code (en/ar/…) — used for default selection. */
  locale: string;
  /**
   * Absent: the edition ships inside the app as an asset. Present: it is a
   * download, kept a surah at a time by `surahStore.ts` exactly as a
   * tafsir is — read on demand under an open sheet, downloadable whole
   * from the ayah sheet or the Quran downloads screen. `sourceId` is what
   * the source knows it by; `approxBytes` what the whole edition comes to.
   */
  source?: TextSourceId;
  sourceId?: string;
  approxBytes?: number;
  /** Right-to-left script (Urdu). */
  rtl?: boolean;
};

export const QURAN_TRANSLATIONS: ReadonlyArray<QuranTranslationEdition> = [
  { id: 'en.sahih', label: 'Sahih International', language: 'English', locale: 'en' },
  { id: 'en.pickthall', label: 'Pickthall', language: 'English', locale: 'en' },
  // NOTE (v2.7.40): 'ar.muyassar' (al-Tafsir al-Muyassar) was removed from
  // this registry — it is an Arabic TAFSIR, not a translation (the Quran is
  // Arabic; Tanzil ships it in the translation corpus slot, which is how it
  // snuck in). It remains available as 'ar-tafsir-muyassar' in the tafsir
  // registry. A stored 'ar.muyassar' pick falls back to the locale default.
  { id: 'sv.bernstrom', label: 'Bernström', language: 'Swedish', locale: 'sv' },
  { id: 'bn.bengali', label: 'Mujibur Rahman', language: 'Bengali', locale: 'bn' },
  { id: 'ur.jalandhry', label: 'Fateh Muhammad Jalandhry', language: 'Urdu', locale: 'ur', rtl: true },
  { id: 'hi.hindi', label: 'Suhel Farooq Khan', language: 'Hindi', locale: 'hi' },
  { id: 'fr.hamidullah', label: 'Hamidullah', language: 'French', locale: 'fr' },
  { id: 'es.cortes', label: 'Cortés', language: 'Spanish', locale: 'es' },
  // Issue #37. Cortés stays FIRST of the two, and that ordering is load
  // bearing: `defaultEditionForLocale` takes the first edition whose
  // locale matches, so a Spanish reader who has never opened the picker
  // still opens the edition they have always opened. García is offered
  // beside it, not in place of it. Provenance in docs/data-sources.md.
  { id: 'es.garcia', label: 'Isa García', language: 'Spanish', locale: 'es' },
  { id: 'de.bubenheim', label: 'Bubenheim & Elyas', language: 'German', locale: 'de' },
  { id: 'tr.diyanet', label: 'Diyanet İşleri', language: 'Turkish', locale: 'tr' },
  { id: 'id.indonesian', label: 'Indonesian Ministry', language: 'Indonesian', locale: 'id' },
  { id: 'ru.kuliev', label: 'Kuliev', language: 'Russian', locale: 'ru' },
  { id: 'zh.jian', label: 'Ma Jian', language: 'Chinese', locale: 'zh' },

  // ── Downloads (2026-11-05) ─────────────────────────────────────────────
  //
  // Fifteen more, none of them inside the app: as assets they would have
  // put twenty megabytes on every install for editions most readers never
  // open. (Abu Bakr Zakaria's Bengali, the King Fahd Complex's, answers at
  // QuranEnc but is not in its published list, so it is not read from
  // there; the same text is in the tafsir registry from the Quran.com
  // corpus, footnotes and all.) Each comes after its language's bundled editions, so no default
  // moves. Two sources, both already in use elsewhere in the app: Tanzil
  // through alquran.cloud (the bundled editions' own origin, CC BY 3.0) and
  // the Encyclopedia of the Noble Quran, quranenc.com (the word meanings'
  // origin; its text is shown verbatim, footnotes and all, and credited in
  // Settings → About with the version read). Sizes: all 6,236 ayahs in the
  // compact file this app writes, measured on 2026-11-05. Provenance and
  // the choosing in docs/data-sources.md.
  { id: 'en.hilali', label: 'Hilali & Khan', language: 'English', locale: 'en', source: 'tanzil', sourceId: 'en.hilali', approxBytes: 1170000 },
  { id: 'english_rwwad', label: 'Rowwad Translation Center', language: 'English', locale: 'en', source: 'quranenc', sourceId: 'english_rwwad', approxBytes: 1150000 },
  { id: 'swedish_rwwad', label: 'Rowwad Translation Center', language: 'Swedish', locale: 'sv', source: 'quranenc', sourceId: 'swedish_rwwad', approxBytes: 910000 },
  { id: 'ur.junagarhi', label: 'Muhammad Junagarhi', language: 'Urdu', locale: 'ur', rtl: true, source: 'tanzil', sourceId: 'ur.junagarhi', approxBytes: 1470000 },
  { id: 'hindi_omari', label: 'Azizul Haq al-Omari', language: 'Hindi', locale: 'hi', source: 'quranenc', sourceId: 'hindi_omari', approxBytes: 3240000 },
  { id: 'french_rashid', label: 'Rachid Maach', language: 'French', locale: 'fr', source: 'quranenc', sourceId: 'french_rashid', approxBytes: 1250000 },
  { id: 'spanish_montada_eu', label: 'Noor International', language: 'Spanish', locale: 'es', source: 'quranenc', sourceId: 'spanish_montada_eu', approxBytes: 1420000 },
  { id: 'german_rwwad', label: 'Rowwad Translation Center', language: 'German', locale: 'de', source: 'quranenc', sourceId: 'german_rwwad', approxBytes: 1060000 },
  { id: 'tr.vakfi', label: 'Diyanet Vakfı', language: 'Turkish', locale: 'tr', source: 'tanzil', sourceId: 'tr.vakfi', approxBytes: 960000 },
  { id: 'tr.yazir', label: 'Elmalılı Hamdi Yazır', language: 'Turkish', locale: 'tr', source: 'tanzil', sourceId: 'tr.yazir', approxBytes: 970000 },
  { id: 'indonesian_affairs', label: 'Kementerian Agama (2019)', language: 'Indonesian', locale: 'id', source: 'quranenc', sourceId: 'indonesian_affairs', approxBytes: 1300000 },
  { id: 'indonesian_complex', label: 'King Fahd Complex', language: 'Indonesian', locale: 'id', source: 'quranenc', sourceId: 'indonesian_complex', approxBytes: 1470000 },
  { id: 'ru.abuadel', label: 'Abu Adel', language: 'Russian', locale: 'ru', source: 'tanzil', sourceId: 'ru.abuadel', approxBytes: 2830000 },
  { id: 'chinese_makin', label: 'Muhammad Makin', language: 'Chinese', locale: 'zh', source: 'quranenc', sourceId: 'chinese_makin', approxBytes: 800000 },
  // A language the app itself does not speak yet: offered under its own
  // heading, never a default.
  { id: 'ms.basmeih', label: 'Abdullah Basmeih', language: 'Malay', locale: 'ms', source: 'tanzil', sourceId: 'ms.basmeih', approxBytes: 1510000 },
] as const;

export type QuranTranslationId = (typeof QURAN_TRANSLATIONS)[number]['id'];

/** Pick the best default edition for an app locale. Falls back to en.sahih. */
export function defaultEditionForLocale(locale: string): QuranTranslationId {
  const exact = QURAN_TRANSLATIONS.find(e => e.locale === locale);
  if (exact) return exact.id as QuranTranslationId;
  return 'en.sahih';
}

/**
 * Is this saved edition id one we still ship? (v2.7.40)
 *
 * An EXPLICIT user pick is honoured regardless of the app language — the
 * selector deliberately lists every edition (a German speaker may want the
 * English Sahih text), so reverting cross-language picks silently was a
 * bug, not a feature. The app-locale default only applies when nothing
 * valid is stored (fresh installs, removed editions like 'ar.muyassar').
 */
export function isKnownEdition(
  edition: string | undefined | null,
): edition is QuranTranslationId {
  if (!edition) return false;
  return QURAN_TRANSLATIONS.some(e => e.id === edition);
}

/** Back-compat shim for older call sites: "usable" now simply means the
 *  edition exists — explicit picks survive app-language changes. */
export function editionMatchesLocale(
  edition: string | undefined | null,
  _locale: string,
): boolean {
  return isKnownEdition(edition);
}

type ChapterMap = { [chapter: string]: { [ayah: string]: string } };

/** What an unknown or unreadable edition falls back to. */
const FALLBACK_EDITION: QuranTranslationId = 'en.sahih';

/**
 * All 6,236 ayahs of one edition, as a lookup map.
 *
 * ── WHY THIS IS ASYNC WHEN ITS BODY IS NOT ──────────────────────────
 *
 * The body still returns a bundled `require`, synchronously, and this
 * still resolves on the first tick. The signature has moved ahead of it
 * on purpose, because the thirteen editions are about to stop being part
 * of the JS bundle.
 *
 * They are ~18 MB of the bundle's 26, and `assets/index.android.bundle`
 * is STORED in the APK — zero compression, because Android does not
 * compress a `.bundle`. The same JSON as an ordinary asset gzips to
 * about 4.5 MB. Moving it is roughly thirteen megabytes off a fifty
 * megabyte download, and it costs nothing anybody can see: the files
 * still ship inside the app, so nothing about reading the Qur'an
 * offline changes.
 *
 * Reading a file is asynchronous, and three of the call sites read a
 * translation in a component's render body — where a promise cannot go.
 * So the signature changes first, on its own, with the body untouched:
 * every caller is moved and proven while the data is still coming from
 * the same place it always did. `loadSurah` in `quran.ts` has had
 * exactly this shape for a while — an async façade over a sync require
 * switch — which is what makes this a small step rather than a leap.
 */
/**
 * One edition at a time, and the read that is fetching it.
 *
 * Metro's require cache used to do this for free — that is the only
 * reason `getAyahTranslation` could sit in a render body and cost
 * nothing after the first ayah. A read from disk has no such cache, and
 * the render-path callers would have re-read a megabyte per render
 * without one.
 *
 * The in-flight promise is held as well as the result, so a screen that
 * mounts three components asking for the same edition at once does one
 * read rather than three. Same shape as `ensureSearchCorpus`.
 *
 * Bounded to ONE edition. A reader has a translation, not a library of
 * them, and the whole point of this move is to stop carrying editions
 * nobody asked for.
 */
let cached: { edition: QuranTranslationId; map: ChapterMap } | null = null;
let loading: { edition: QuranTranslationId; work: Promise<ChapterMap> } | null =
  null;

/** Test seam, and what a low-memory warning would call. */
export function _clearTranslationCache(): void {
  cached = null;
  loading = null;
}

export async function loadTranslation(
  edition: QuranTranslationId,
): Promise<ChapterMap> {
  if (cached?.edition === edition) return cached.map;
  if (loading?.edition === edition) return loading.work;
  const work = readEdition(edition).then(map => {
    cached = { edition, map };
    if (loading?.edition === edition) loading = null;
    return map;
  });
  loading = { edition, work };
  return work;
}

/**
 * The file this edition lives in, per platform.
 *
 * Android reads its assets through a `bundle-assets://` URI; iOS reads
 * them out of the main bundle directory. `android/app/build.gradle`
 * adds the repo's `assets/` folder to the Android asset roots and the
 * Xcode project copies the same folder into the iOS bundle, so one set
 * of files answers both.
 */
function assetPath(edition: QuranTranslationId): string {
  const file = `quran/translations/${edition}.json`;
  return bundledAssetPath(file);
}

/**
 * Read one edition off the disk.
 *
 * Falls back to the default edition rather than throwing, and then to an
 * empty map rather than recursing: a missing file should cost the reader
 * their translation, never the screen it was going to appear on. The
 * ayah and surah helpers below already treat an absent entry as an empty
 * string, so an empty map degrades to Arabic-only — which is a reading
 * of the Qur'an, and not a crash.
 */
async function readEdition(edition: QuranTranslationId): Promise<ChapterMap> {
  const wanted = isKnownEdition(edition) ? edition : FALLBACK_EDITION;
  try {
    const raw = await ReactNativeBlobUtil.fs.readFile(assetPath(wanted), 'utf8');
    return JSON.parse(String(raw)) as ChapterMap;
  } catch (e) {
    if (wanted !== FALLBACK_EDITION) return readEdition(FALLBACK_EDITION);
    console.warn('[translations] could not read', wanted, e);
    return {};
  }
}

// ─── Reading ────────────────────────────────────────────────────────────

/** Is this edition a download rather than an asset? */
export function isFetchedTranslation(edition: string): boolean {
  return QURAN_TRANSLATIONS.find(e => e.id === edition)?.source != null;
}

export function findTranslationEdition(id: string): QuranTranslationEdition | undefined {
  return QURAN_TRANSLATIONS.find(e => e.id === id);
}

/** What the store needs of a fetched edition. */
function stored(ed: QuranTranslationEdition): StoredEdition {
  return {
    id: ed.id,
    source: ed.source ?? 'tanzil',
    sourceId: ed.sourceId ?? ed.id,
    approxBytes: ed.approxBytes ?? Infinity,
  };
}

/** Fetch a single ayah's translation. Returns empty string if missing. */
export async function getAyahTranslation(
  edition: QuranTranslationId,
  surah: number,
  ayah: number,
): Promise<string> {
  const ed = findTranslationEdition(edition);
  if (ed?.source) {
    return (await loadAyah('translation', stored(ed), surah, ayah)) ?? '';
  }
  const map = await loadTranslation(edition);
  return map[String(surah)]?.[String(ayah)] ?? '';
}

/** Fetch the whole surah's translation as an ordered ayah array. */
export async function getSurahTranslation(
  edition: QuranTranslationId,
  surah: number,
): Promise<string[]> {
  const ed = findTranslationEdition(edition);
  const ayahs = ed?.source
    ? ((await loadSurah('translation', stored(ed), surah)) ?? {})
    : ((await loadTranslation(edition))[String(surah)] ?? {});
  const keys = Object.keys(ayahs)
    .map(k => Number(k))
    .sort((a, b) => a - b);
  return keys.map(k => ayahs[String(k)]);
}

// ─── Downloads ──────────────────────────────────────────────────────────
//
// A fetched edition can be downloaded whole, by the Quran download manager
// (`kind: 'translation'`): 114 surah files under
// <Documents>/quran/translations/<edition>/, read from disk after that.
// The store is shared with tafsir (`surahStore.ts`); these are its
// translation half, named for the callers that already know tafsir's.

export const TRANSLATION_SURAHS = STORE_SURAHS;

/** "1.2 MB", "14 MB" — what a whole edition comes to, for the offer. */
export function translationSizeLabel(bytes: number): string {
  const mb = bytes / 1_000_000;
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

export function hasTranslationSurah(edition: string, surah: number): Promise<boolean> {
  return hasSurah('translation', edition, surah);
}

export function translationEditionStats(
  edition: string,
): Promise<{ bytes: number; surahs: number }> {
  return editionStats('translation', edition);
}

export function deleteTranslationEdition(edition: string): Promise<void> {
  return deleteEdition('translation', edition);
}

export function downloadTranslationEdition(
  edition: string,
  opts: { onProgress?: (p: MushafDownloadProgress) => void },
): MushafDownloadHandle {
  const ed = findTranslationEdition(edition);
  return downloadEdition(
    'translation',
    ed ? stored(ed) : { id: edition, source: 'tanzil', sourceId: edition, approxBytes: Infinity },
    opts,
  );
}

/** Bytes on disk for the fetched translations (Manage-downloads screen). */
export function translationsDiskUsage(): Promise<number> {
  return storeDiskUsage('translation');
}

export function deleteTranslationsCache(): Promise<void> {
  return deleteStore('translation');
}
