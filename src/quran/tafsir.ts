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
import ReactNativeBlobUtil from 'react-native-blob-util';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { fetchMirrored, mirrorUrl, MIRROR_TAGS } from '../config/mirrors';
import {
  CONTENT_DEADLINES,
  GIVE_UP_AFTER_CONSECUTIVE_FAILURES,
} from './contentNetwork';
import { mkdirDeep } from './mushafDownload';
import type {
  MushafDownloadHandle,
  MushafDownloadProgress,
} from './mushafDownload';

export type TafsirEdition = {
  id: string;
  /** Display label (proper noun — not translated). */
  label: string;
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

function tafsirUrl(edition: string, surah: number, ayah: number): string {
  return `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${edition}/${surah}/${ayah}.json`;
}

export function tafsirCacheDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/tafsir`;
}

function cachePath(edition: string, surah: number, ayah: number): string {
  return `${tafsirCacheDir()}/${edition}/${surah}/${ayah}.json`;
}

/**
 * Fetch (or read from cache) one ayah's tafsir text. Resolves null on
 * any failure — the UI shows a quiet "unavailable offline" note.
 */
export async function loadTafsir(
  edition: string,
  surah: number,
  ayah: number,
): Promise<string | null> {
  // A downloaded edition answers from disk, whatever the network is doing.
  const whole = await readSurahFile(edition, surah);
  const held = whole?.ayahs[String(ayah)];
  if (held) return held;
  const path = cachePath(edition, surah, ayah);
  try {
    if (await ReactNativeBlobUtil.fs.exists(path)) {
      const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
      const parsed = JSON.parse(String(raw)) as { text?: string };
      if (parsed.text) return parsed.text;
    }
  } catch {
    /* fall through to network */
  }
  try {
    // This repo's mirror first (a surah file, kept in memory), the original
    // host's one-ayah answer when the mirror cannot give it.
    let text: string | undefined = (
      await mirrorSurah(edition, surah)
    )?.ayahs[String(ayah)];
    if (!text) {
      // Two attempts, not four: a reader is looking at an open sheet, so a
      // CDN's transient 502 is worth exactly one more try and no more. The
      // deadline is what matters most here — before this, a stalled origin
      // left the sheet's spinner running with nothing to end it.
      const res = await fetchWithRetry(
        tafsirUrl(edition, surah, ayah),
        undefined,
        {
          maxAttempts: 2,
          baseDelayMs: 400,
          timeoutMs: CONTENT_DEADLINES.tafsir,
        },
      );
      if (!res.ok) return null;
      const parsed = (await res.json()) as { text?: string };
      text = parsed.text?.trim();
    }
    if (!text) return null;
    // Cache for offline re-reads (best effort).
    try {
      await mkdirDeep(`${tafsirCacheDir()}/${edition}/${surah}`);
      await ReactNativeBlobUtil.fs.writeFile(
        path,
        JSON.stringify({ text }),
        'utf8',
      );
    } catch {
      /* cache write is optional */
    }
    return text;
  } catch {
    return null;
  }
}

// ─── Whole editions ─────────────────────────────────────────────────────
//
// An edition can be downloaded WHOLE, by the Quran download manager
// (`kind: 'tafsir'`): one file per surah, 114 requests instead of 6,236,
// then read from disk. Until it is, an ayah is fetched on demand as before
// and cached on its own. Both live under `<tafsirCacheDir>/<edition>/`:
//   s/{surah}.json   → { v: 1, ayahs: { "<ayah>": "text" } }   (a download)
//   {surah}/{ayah}.json → { text }                              (on demand)

export const TAFSIR_SURAHS = 114;

/** Under this a whole edition is small enough to treat its files as small. */
const SMALL_EDITION_BYTES = 10_000_000;

function surahUrl(edition: string, surah: number): string {
  return `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${edition}/${surah}.json`;
}

/** The same surah file, from this repo's own mirror (see config/mirrors). */
function mirrorSurahUrl(edition: string, surah: number): string {
  return mirrorUrl(MIRROR_TAGS.tafsir, `${edition}__${surah}.json`);
}

function surahFilePath(edition: string, surah: number): string {
  return `${tafsirCacheDir()}/${edition}/s/${surah}.json`;
}

type TafsirSurahFile = { v: 1; ayahs: Record<string, string> };

/**
 * The last few surah files read, parsed. A big edition's surah is several
 * megabytes of JSON; reading ayah after ayah of one surah must not parse it
 * again each time. Few entries, because each one is large.
 */
const SURAH_MEMORY_LIMIT = 3;
const surahMemory = new Map<string, TafsirSurahFile>();

export function resetTafsirMemory(): void {
  surahMemory.clear();
}

function rememberSurah(key: string, file: TafsirSurahFile): void {
  surahMemory.set(key, file);
  while (surahMemory.size > SURAH_MEMORY_LIMIT) {
    const oldest = surahMemory.keys().next().value;
    if (oldest === undefined) break;
    surahMemory.delete(oldest);
  }
}

const mirrorInFlight = new Map<string, Promise<TafsirSurahFile | null>>();

/**
 * One ayah asked for under an open sheet, answered from the mirror.
 *
 * The mirror holds a surah per file, not an ayah per file, so the surah is
 * fetched once and kept in memory with the files read from disk: the next
 * ayah of the same surah is then immediate rather than another download.
 * Concurrent asks for one surah share a request. Bounded by its own
 * deadline — on a slow link the original host's one-ayah answer is the
 * quicker of the two, so null here simply hands over to it. Never written
 * to disk: a whole-edition download is the only thing that marks a surah
 * as held.
 */
async function mirrorSurah(
  edition: string,
  surah: number,
): Promise<TafsirSurahFile | null> {
  const key = `${edition}:${surah}`;
  const pending = mirrorInFlight.get(key);
  if (pending) return pending;
  const job = (async () => {
    try {
      const res = await fetchWithRetry(mirrorSurahUrl(edition, surah), undefined, {
        maxAttempts: 1,
        timeoutMs: CONTENT_DEADLINES.tafsirMirrorSurah,
      });
      if (!res.ok) return null;
      const rows = surahRows(await res.json());
      if (!rows) return null;
      const ayahs: Record<string, string> = {};
      for (const r of rows) {
        const t = typeof r?.text === 'string' ? r.text.trim() : '';
        if (t && r.ayah != null) ayahs[String(r.ayah)] = t;
      }
      const file: TafsirSurahFile = { v: 1, ayahs };
      rememberSurah(key, file);
      return file;
    } catch {
      return null;
    } finally {
      mirrorInFlight.delete(key);
    }
  })();
  mirrorInFlight.set(key, job);
  return job;
}

async function readSurahFile(
  edition: string,
  surah: number,
): Promise<TafsirSurahFile | null> {
  const key = `${edition}:${surah}`;
  const hit = surahMemory.get(key);
  if (hit) {
    surahMemory.delete(key); // refresh recency
    surahMemory.set(key, hit);
    return hit;
  }
  try {
    const path = surahFilePath(edition, surah);
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return null;
    const parsed = JSON.parse(
      String(await ReactNativeBlobUtil.fs.readFile(path, 'utf8')),
    ) as Partial<TafsirSurahFile>;
    if (parsed?.v !== 1 || !parsed.ayahs || typeof parsed.ayahs !== 'object') {
      return null;
    }
    const file = parsed as TafsirSurahFile;
    rememberSurah(key, file);
    return file;
  } catch {
    return null;
  }
}

/** Is this surah of the edition on disk as part of a whole-edition download? */
export async function hasTafsirSurah(
  edition: string,
  surah: number,
): Promise<boolean> {
  try {
    return await ReactNativeBlobUtil.fs.exists(surahFilePath(edition, surah));
  } catch {
    return false;
  }
}

/** How much of one edition is on disk, for the downloads screen. */
export async function tafsirEditionStats(edition: string): Promise<{
  bytes: number;
  surahs: number;
}> {
  const dir = `${tafsirCacheDir()}/${edition}`;
  const walk = async (d: string, countSurahFiles: boolean) => {
    let bytes = 0;
    let surahs = 0;
    let entries: Awaited<ReturnType<typeof ReactNativeBlobUtil.fs.lstat>> = [];
    try {
      entries = await ReactNativeBlobUtil.fs.lstat(d);
    } catch {
      return { bytes, surahs };
    }
    for (const e of entries) {
      if (e.type === 'directory') {
        const inner = await walk(`${d}/${e.filename}`, e.filename === 's');
        bytes += inner.bytes;
        surahs += inner.surahs;
      } else {
        bytes += Number(e.size) || 0;
        if (countSurahFiles && /^\d+\.json$/.test(String(e.filename))) surahs += 1;
      }
    }
    return { bytes, surahs };
  };
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(dir))) return { bytes: 0, surahs: 0 };
  } catch {
    return { bytes: 0, surahs: 0 };
  }
  return walk(dir, false);
}

/** Delete one edition — the whole download and anything cached ayah by ayah. */
export async function deleteTafsirEdition(edition: string): Promise<void> {
  surahMemory.clear();
  try {
    await ReactNativeBlobUtil.fs.unlink(`${tafsirCacheDir()}/${edition}`);
  } catch {
    /* already gone */
  }
}

type SurahArray = Array<{ ayah?: number | string; text?: string | null }>;

/**
 * A surah file's rows. Most editions are a bare array; the Urdu Ibn Kathir is
 * `{ "ayahs": [...] }`, which this used to refuse as "unexpected response" —
 * so that edition's whole-edition download could never finish.
 */
export function surahRows(json: unknown): SurahArray | null {
  if (Array.isArray(json)) return json as SurahArray;
  const inner = (json as { ayahs?: unknown } | null)?.ayahs;
  return Array.isArray(inner) ? (inner as SurahArray) : null;
}

/** One surah file → disk. A surah upstream has no file for is NOT a failure. */
async function fetchTafsirSurah(edition: string, surah: number): Promise<void> {
  // A small edition's surah is a few tens of kilobytes: a request that has
  // not answered in a dozen seconds is a stalled one, and waiting a minute
  // on it three at a time is what made the first run crawl on a phone
  // (≈3 surahs a minute). So: a short deadline and several tries. A big
  // edition's biggest surah is megabytes, which needs the long one.
  const small =
    (findTafsirEdition(edition)?.approxBytes ?? Infinity) < SMALL_EDITION_BYTES;
  const res = await fetchMirrored(mirrorSurahUrl(edition, surah), surahUrl(edition, surah), undefined, {
    maxAttempts: small ? 4 : 2,
    baseDelayMs: 400,
    timeoutMs: small ? CONTENT_DEADLINES.tafsirSurahSmall : CONTENT_DEADLINES.tafsirSurah,
  });
  const ayahs: Record<string, string> = {};
  if (res.status === 404) {
    // A few surahs are simply missing from some editions upstream. Marking
    // it done (empty) is what lets the run finish; an ayah in it is still
    // fetched on demand, as it would have been.
  } else {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = surahRows(await res.json());
    if (!rows) throw new Error('unexpected response');
    for (const r of rows) {
      const text = typeof r?.text === 'string' ? r.text.trim() : '';
      if (text && r.ayah != null) ayahs[String(r.ayah)] = text;
    }
  }
  await mkdirDeep(`${tafsirCacheDir()}/${edition}/s`);
  await ReactNativeBlobUtil.fs.writeFile(
    surahFilePath(edition, surah),
    JSON.stringify({ v: 1, ayahs } satisfies TafsirSurahFile),
    'utf8',
  );
}

/**
 * Fetch every surah of an edition, skipping the ones already on disk, three
 * at a time. Same contract as the other download jobs: a handle whose
 * promise says whether it finished and, if not, whether the connection had
 * stopped working altogether.
 */
export function downloadTafsirEdition(
  edition: string,
  opts: { onProgress?: (p: MushafDownloadProgress) => void },
): MushafDownloadHandle {
  let cancelled = false;
  const promise = (async () => {
    const total = TAFSIR_SURAHS;
    let done = 0;
    let failed = 0;
    let inARow = 0;
    let interrupted = false;
    let next = 1;
    const report = () => opts.onProgress?.({ done, total, failed });
    report();
    const worker = async () => {
      while (!cancelled && !interrupted) {
        const surah = next++;
        if (surah > total) return;
        try {
          if (!(await hasTafsirSurah(edition, surah))) {
            await fetchTafsirSurah(edition, surah);
          }
          done += 1;
          inARow = 0;
        } catch {
          failed += 1;
          inARow += 1;
          if (inARow >= GIVE_UP_AFTER_CONSECUTIVE_FAILURES) interrupted = true;
        }
        report();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return {
      complete: !cancelled && !interrupted && failed === 0 && done === total,
      interrupted: interrupted && !cancelled,
    };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Bytes on disk in the tafsir cache (Manage-downloads screen). */
export async function tafsirDiskUsage(): Promise<number> {
  const walk = async (dir: string): Promise<number> => {
    try {
      const entries = await ReactNativeBlobUtil.fs.lstat(dir);
      let sum = 0;
      for (const e of entries) {
        if (e.type === 'directory') {
          sum += await walk(`${dir}/${e.filename}`);
        } else {
          sum += Number(e.size) || 0;
        }
      }
      return sum;
    } catch {
      return 0;
    }
  };
  if (!(await ReactNativeBlobUtil.fs.exists(tafsirCacheDir()))) return 0;
  return walk(tafsirCacheDir());
}

/** Delete the whole tafsir cache. */
export async function deleteTafsirCache(): Promise<void> {
  try {
    await ReactNativeBlobUtil.fs.unlink(tafsirCacheDir());
  } catch {
    /* already gone */
  }
}

export const TAFSIR_ATTRIBUTION =
  'Tafsir texts (Ibn Kathir, Maarif-ul-Quran, al-Muyassar) via the ' +
  'spa5k/tafsir_api mirror of the Quran.com tafsir corpus.';
