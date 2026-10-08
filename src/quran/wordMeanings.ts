/**
 * Arabic meanings of the harder words in an ayah.
 *
 * Source: QuranEnc.com (Encyclopedia of the Noble Quran), the Arabic
 * "معاني الكلمات" set (edition `arabic_seraj`) — one short gloss per
 * difficult word, written for that word as it is used in that ayah. It
 * covers the harder words only; plenty of ayahs have no entry.
 *
 * ── A DOWNLOAD, NOT A LOOKUP ──────────────────────────────────────────
 *
 * The whole set is a few hundred kilobytes, so it is fetched once, whole,
 * by the Quran download manager (`kind: 'wordMeanings'`) and read from
 * disk after that — the sheet never touches the network. One request per
 * surah (114), one small file per surah, so a run that stops resumes from
 * the surahs it had not got to (`quranDownloadManager`, issue #55).
 *
 * QuranEnc's terms for reuse (quranenc.com/ar/home/api): the content is
 * shown WITHOUT modification, addition or deletion; the publisher and
 * source are credited (QuranEnc.com). So the only thing done to a gloss
 * here is dropping the empty ones and splitting a stored text into lines
 * for layout. QuranEnc names no individual author for this set and
 * publishes no version number, so none is claimed; each file records the
 * date it was fetched.
 *
 * Layout: <Documents>/quran/wordmeanings/{surah}.json
 *   { v: 1, fetchedAt: ISO, glosses: { "<ayah>": "word: meaning[\n…]" } }
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
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
import { findSurah } from './quran';

export const WORD_MEANINGS_EDITION = 'arabic_seraj';
export const WORD_MEANINGS_SURAHS = 114;

/** The credit, as the Settings → Attributions page shows it. */
export const WORD_MEANINGS_CREDIT =
  'موسوعة القرآن الكريم — QuranEnc.com (معاني الكلمات)';

export const WORD_MEANINGS_SOURCE_URL =
  'https://quranenc.com/ar/browse/arabic_seraj';

export type WordMeaning = {
  /** The word as the source writes it; '' if the line has no "word:" part. */
  word: string;
  /** The gloss, exactly as published. */
  meaning: string;
};

type SurahFile = {
  v: 1;
  fetchedAt: string;
  glosses: Record<string, string>;
};

export function wordMeaningsDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/wordmeanings`;
}

function surahPath(surah: number): string {
  return `${wordMeaningsDir()}/${surah}.json`;
}

function surahUrl(surah: number): string {
  return `https://quranenc.com/api/v1/translation/sura/${WORD_MEANINGS_EDITION}/${surah}`;
}

/** In-memory copy of the surah files read so far (they are small). */
const memory = new Map<number, SurahFile>();

/** Drop the in-memory copies — after a delete, and for tests. */
export function resetWordMeaningsMemory(): void {
  memory.clear();
}

async function readSurahFile(surah: number): Promise<SurahFile | null> {
  const hit = memory.get(surah);
  if (hit) return hit;
  try {
    const path = surahPath(surah);
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return null;
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    const parsed = JSON.parse(String(raw)) as Partial<SurahFile>;
    if (parsed?.v !== 1 || typeof parsed.glosses !== 'object' || !parsed.glosses) {
      return null;
    }
    const file = parsed as SurahFile;
    memory.set(surah, file);
    return file;
  } catch {
    return null;
  }
}

/**
 * Lay the stored text out as a list. One gloss per line; a line reads
 * "word: meaning", split at the FIRST colon only (a meaning may contain
 * more). A line with no colon is kept whole as a meaning with no word —
 * nothing is dropped or reworded.
 */
export function parseWordMeanings(text: string): WordMeaning[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const i = line.indexOf(':');
      if (i <= 0) return { word: '', meaning: line };
      return {
        word: line.slice(0, i).trim(),
        meaning: line.slice(i + 1).trim(),
      };
    });
}

/**
 * The glosses for one ayah, from disk. Empty when the ayah has none OR
 * the set has not been downloaded — `hasWordMeanings` tells those apart
 * for a caller that needs to.
 */
export async function wordMeaningsFor(
  surah: number,
  ayah: number,
): Promise<WordMeaning[]> {
  const file = await readSurahFile(surah);
  const text = file?.glosses[String(ayah)];
  return text ? parseWordMeanings(text) : [];
}

/** Has this surah's file been downloaded? (Whole set ⇒ every surah is.) */
export async function hasWordMeanings(surah = 1): Promise<boolean> {
  return (await readSurahFile(surah)) != null;
}

/** How much of the set is on disk, for the downloads screen. */
export async function wordMeaningsStats(): Promise<{
  bytes: number;
  surahs: number;
}> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(wordMeaningsDir()))) {
      return { bytes: 0, surahs: 0 };
    }
    const entries = await ReactNativeBlobUtil.fs.lstat(wordMeaningsDir());
    let bytes = 0;
    let surahs = 0;
    for (const e of entries) {
      if (!/^\d+\.json$/.test(String(e.filename))) continue;
      bytes += Number(e.size) || 0;
      surahs += 1;
    }
    return { bytes, surahs };
  } catch {
    return { bytes: 0, surahs: 0 };
  }
}

export async function deleteWordMeanings(): Promise<void> {
  memory.clear();
  try {
    await ReactNativeBlobUtil.fs.unlink(wordMeaningsDir());
  } catch {
    /* already gone */
  }
}

type SuraResponse = {
  result?: Array<{ aya?: string | number; translation?: string | null }>;
};

/** One surah → its file. Throws when the response cannot be trusted. */
async function fetchSurah(surah: number): Promise<void> {
  const res = await fetchMirrored(mirrorUrl(MIRROR_TAGS.wordMeanings, `${surah}.json`), surahUrl(surah), undefined, {
    maxAttempts: 2,
    baseDelayMs: 400,
    timeoutMs: CONTENT_DEADLINES.wordMeanings,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as SuraResponse;
  const rows = body?.result;
  // The surah's whole ayah list or nothing: a short answer written down as
  // complete would look finished and quietly miss ayahs for good.
  const expected = findSurah(surah)?.ayahCount ?? 0;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length < expected) {
    throw new Error('incomplete response');
  }
  const glosses: Record<string, string> = {};
  for (const r of rows) {
    const text = (r.translation ?? '').trim();
    if (text) glosses[String(r.aya)] = text;
  }
  const file: SurahFile = { v: 1, fetchedAt: new Date().toISOString(), glosses };
  await mkdirDeep(wordMeaningsDir());
  await ReactNativeBlobUtil.fs.writeFile(
    surahPath(surah),
    JSON.stringify(file),
    'utf8',
  );
  memory.set(surah, file);
}

/**
 * Fetch every surah's glosses, skipping the ones already on disk, three
 * at a time. Same contract as the other download jobs: a handle whose
 * promise says whether it finished and, if not, whether the connection
 * had stopped working altogether.
 */
export function downloadWordMeanings(opts: {
  onProgress?: (p: MushafDownloadProgress) => void;
}): MushafDownloadHandle {
  let cancelled = false;
  const promise = (async () => {
    const total = WORD_MEANINGS_SURAHS;
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
          if (!(await hasWordMeanings(surah))) await fetchSurah(surah);
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
