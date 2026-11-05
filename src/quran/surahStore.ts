/**
 * A text edition kept a surah at a time: tafsir, and the translations that
 * do not ship inside the app.
 *
 * ── ONE STORE, TWO KINDS ───────────────────────────────────────────────
 *
 * Tafsir has always worked this way (v2.7.28): an ayah asked for under an
 * open sheet is fetched on demand and cached, and a whole edition can be
 * downloaded by the Quran download manager — one file per surah, 114
 * requests instead of 6,236 — and read from disk after that. The
 * translations added in 2026-11 (issue #125 and the editions around it)
 * would have cost every install twenty megabytes as assets, so they are
 * kept exactly like tafsir, by this code, under their own directory.
 *
 * Everything an edition needs to be served is on the edition itself: the
 * host it comes from and the id that host knows it by (`textSources.ts`).
 * The app's own mirror (`config/mirrors`) is asked first, the host second.
 *
 * Layout, under <Documents>/quran/<kind dir>/<edition>/:
 *   s/{surah}.json      → { v: 1, ayahs: { "<ayah>": "text" } }   (a download)
 *   {surah}/{ayah}.json → { text }                                 (on demand)
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { fetchMirrored, mirrorUrl, MIRROR_TAGS } from '../config/mirrors';
import { IS_WEB_APP } from '../config/webApp';
import {
  CONTENT_DEADLINES,
  GIVE_UP_AFTER_CONSECUTIVE_FAILURES,
} from './contentNetwork';
import { mkdirDeep } from './mushafDownload';
import type {
  MushafDownloadHandle,
  MushafDownloadProgress,
} from './mushafDownload';
import { TEXT_SOURCES, type TextSourceId } from './textSources';

export type StoreKind = 'tafsir' | 'translation';

/** What the store needs to know about an edition to serve it. */
export type StoredEdition = {
  id: string;
  source: TextSourceId;
  /** The id the source knows the edition by; usually `id` itself. */
  sourceId: string;
  /** The whole edition on disk, in bytes — for the offer and the space check. */
  approxBytes: number;
};

export const STORE_SURAHS = 114;

/** Under this a whole edition is small enough to treat its files as small. */
const SMALL_EDITION_BYTES = 10_000_000;

const KIND: Record<StoreKind, { dir: string; mirrorTag: string; memory: number }> = {
  tafsir: { dir: 'tafsir', mirrorTag: MIRROR_TAGS.tafsir, memory: 3 },
  // A translation's surah is a few tens of kilobytes where a tafsir's can
  // be megabytes: more of them can be kept.
  translation: { dir: 'translations', mirrorTag: MIRROR_TAGS.translations, memory: 6 },
};

export function storeDir(kind: StoreKind): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/${KIND[kind].dir}`;
}

function editionDir(kind: StoreKind, edition: string): string {
  return `${storeDir(kind)}/${edition}`;
}

function surahFilePath(kind: StoreKind, edition: string, surah: number): string {
  return `${editionDir(kind, edition)}/s/${surah}.json`;
}

function ayahFilePath(kind: StoreKind, edition: string, surah: number, ayah: number): string {
  return `${editionDir(kind, edition)}/${surah}/${ayah}.json`;
}

function mirrorSurahUrl(kind: StoreKind, edition: string, surah: number): string {
  return mirrorUrl(KIND[kind].mirrorTag, `${edition}__${surah}.json`);
}

export type SurahFile = { v: 1; ayahs: Record<string, string> };

function rowsToFile(rows: ReadonlyArray<{ ayah: number; text: string }>): SurahFile {
  const ayahs: Record<string, string> = {};
  for (const r of rows) {
    if (r.text && Number.isFinite(r.ayah)) ayahs[String(r.ayah)] = r.text;
  }
  return { v: 1, ayahs };
}

// ─── Memory ────────────────────────────────────────────────────────────
//
// The last few surah files read, parsed. A big edition's surah is several
// megabytes of JSON; reading ayah after ayah of one surah must not parse it
// again each time. Few entries, because each one can be large.

const memory: Record<StoreKind, Map<string, SurahFile>> = {
  tafsir: new Map(),
  translation: new Map(),
};

export function resetStoreMemory(kind?: StoreKind): void {
  if (kind) memory[kind].clear();
  else for (const m of Object.values(memory)) m.clear();
}

function remember(kind: StoreKind, key: string, file: SurahFile): void {
  const m = memory[kind];
  m.delete(key);
  m.set(key, file);
  while (m.size > KIND[kind].memory) {
    const oldest = m.keys().next().value;
    if (oldest === undefined) break;
    m.delete(oldest);
  }
}

function recall(kind: StoreKind, key: string): SurahFile | undefined {
  const m = memory[kind];
  const hit = m.get(key);
  if (hit) {
    m.delete(key); // refresh recency
    m.set(key, hit);
  }
  return hit;
}

// ─── Reading ───────────────────────────────────────────────────────────

async function readSurahFile(
  kind: StoreKind,
  edition: string,
  surah: number,
): Promise<SurahFile | null> {
  const key = `${edition}:${surah}`;
  const hit = recall(kind, key);
  if (hit) return hit;
  try {
    const path = surahFilePath(kind, edition, surah);
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return null;
    const parsed = JSON.parse(
      String(await ReactNativeBlobUtil.fs.readFile(path, 'utf8')),
    ) as Partial<SurahFile>;
    if (parsed?.v !== 1 || !parsed.ayahs || typeof parsed.ayahs !== 'object') {
      return null;
    }
    const file = parsed as SurahFile;
    remember(kind, key, file);
    return file;
  } catch {
    return null;
  }
}

const mirrorInFlight = new Map<string, Promise<SurahFile | null>>();

/**
 * One surah asked for under an open sheet, answered from the mirror.
 *
 * The mirror holds a surah per file, not an ayah per file, so the surah is
 * fetched once and kept in memory with the files read from disk: the next
 * ayah of the same surah is then immediate rather than another download.
 * Concurrent asks for one surah share a request. Bounded by its own
 * deadline — on a slow link the host's one-ayah answer is the quicker of
 * the two, so null here simply hands over to it. Never written to disk: a
 * whole-edition download is the only thing that marks a surah as held.
 */
async function mirrorSurah(
  kind: StoreKind,
  ed: StoredEdition,
  surah: number,
): Promise<SurahFile | null> {
  // A browser can't read a release download (no CORS header): the web app
  // goes to the host instead of failing loudly first.
  if (IS_WEB_APP) return null;
  const key = `${kind}:${ed.id}:${surah}`;
  const pending = mirrorInFlight.get(key);
  if (pending) return pending;
  const job = (async () => {
    try {
      const res = await fetchWithRetry(mirrorSurahUrl(kind, ed.id, surah), undefined, {
        maxAttempts: 1,
        timeoutMs: CONTENT_DEADLINES.tafsirMirrorSurah,
      });
      if (!res.ok) return null;
      const rows = TEXT_SOURCES[ed.source].surahRows(await res.json());
      if (!rows) return null;
      const file = rowsToFile(rows);
      remember(kind, `${ed.id}:${surah}`, file);
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

/**
 * One surah from the host itself, for a reader who wants the whole surah
 * (the verse-by-verse reader, search) and has not downloaded the edition.
 * Kept in memory like the mirror's answer, never written to disk.
 */
async function hostSurah(
  kind: StoreKind,
  ed: StoredEdition,
  surah: number,
): Promise<SurahFile | null> {
  try {
    const src = TEXT_SOURCES[ed.source];
    const res = await fetchWithRetry(src.surahUrl(ed.sourceId, surah), undefined, {
      maxAttempts: 2,
      baseDelayMs: 400,
      timeoutMs: CONTENT_DEADLINES.tafsirSurahSmall,
    });
    if (!res.ok) return null;
    const rows = src.surahRows(await res.json());
    if (!rows) return null;
    const file = rowsToFile(rows);
    remember(kind, `${ed.id}:${surah}`, file);
    return file;
  } catch {
    return null;
  }
}

/**
 * One ayah's text. Resolves null on any failure — the UI shows a quiet
 * "unavailable offline" note. Disk first (a download, then an ayah cached
 * on its own), then the mirror's surah, then the host's one-ayah answer.
 */
export async function loadAyah(
  kind: StoreKind,
  ed: StoredEdition,
  surah: number,
  ayah: number,
): Promise<string | null> {
  const whole = await readSurahFile(kind, ed.id, surah);
  const held = whole?.ayahs[String(ayah)];
  if (held) return held;
  const path = ayahFilePath(kind, ed.id, surah, ayah);
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
    let text: string | undefined = (await mirrorSurah(kind, ed, surah))?.ayahs[
      String(ayah)
    ];
    if (!text) {
      // Two attempts, not four: a reader is looking at an open sheet, so a
      // CDN's transient 502 is worth exactly one more try and no more. The
      // deadline is what matters most here — before this, a stalled origin
      // left the sheet's spinner running with nothing to end it.
      const src = TEXT_SOURCES[ed.source];
      const res = await fetchWithRetry(src.ayahUrl(ed.sourceId, surah, ayah), undefined, {
        maxAttempts: 2,
        baseDelayMs: 400,
        timeoutMs: CONTENT_DEADLINES.tafsir,
      });
      if (!res.ok) return null;
      text = src.ayahText(await res.json()) ?? undefined;
    }
    if (!text) return null;
    // Cache for offline re-reads (best effort).
    try {
      await mkdirDeep(`${editionDir(kind, ed.id)}/${surah}`);
      await ReactNativeBlobUtil.fs.writeFile(path, JSON.stringify({ text }), 'utf8');
    } catch {
      /* cache write is optional */
    }
    return text;
  } catch {
    return null;
  }
}

/**
 * A whole surah's ayahs, by number. From disk when the edition is
 * downloaded; otherwise the mirror, then the host, in memory only. Null
 * when nothing answers.
 */
export async function loadSurah(
  kind: StoreKind,
  ed: StoredEdition,
  surah: number,
): Promise<Record<string, string> | null> {
  const file =
    (await readSurahFile(kind, ed.id, surah)) ??
    (await mirrorSurah(kind, ed, surah)) ??
    (await hostSurah(kind, ed, surah));
  return file?.ayahs ?? null;
}

// ─── Whole editions ─────────────────────────────────────────────────────

/** Is this surah of the edition on disk as part of a whole-edition download? */
export async function hasSurah(kind: StoreKind, edition: string, surah: number): Promise<boolean> {
  try {
    return await ReactNativeBlobUtil.fs.exists(surahFilePath(kind, edition, surah));
  } catch {
    return false;
  }
}

/** How much of one edition is on disk, for the downloads screen. */
export async function editionStats(
  kind: StoreKind,
  edition: string,
): Promise<{ bytes: number; surahs: number }> {
  const dir = editionDir(kind, edition);
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
export async function deleteEdition(kind: StoreKind, edition: string): Promise<void> {
  memory[kind].clear();
  try {
    await ReactNativeBlobUtil.fs.unlink(editionDir(kind, edition));
  } catch {
    /* already gone */
  }
}

/** One surah file → disk. A surah upstream has no file for is NOT a failure. */
async function fetchSurahToDisk(kind: StoreKind, ed: StoredEdition, surah: number): Promise<void> {
  // A small edition's surah is a few tens of kilobytes: a request that has
  // not answered in a dozen seconds is a stalled one, and waiting a minute
  // on it three at a time is what made the first run crawl on a phone
  // (≈3 surahs a minute). So: a short deadline and several tries. A big
  // edition's biggest surah is megabytes, which needs the long one.
  const small = ed.approxBytes < SMALL_EDITION_BYTES;
  const src = TEXT_SOURCES[ed.source];
  const res = await fetchMirrored(
    mirrorSurahUrl(kind, ed.id, surah),
    src.surahUrl(ed.sourceId, surah),
    undefined,
    {
      maxAttempts: small ? 4 : 2,
      baseDelayMs: 400,
      timeoutMs: small ? CONTENT_DEADLINES.tafsirSurahSmall : CONTENT_DEADLINES.tafsirSurah,
    },
  );
  let file: SurahFile = { v: 1, ayahs: {} };
  if (res.status === 404) {
    // A few surahs are simply missing from some editions upstream. Marking
    // it done (empty) is what lets the run finish; an ayah in it is still
    // fetched on demand, as it would have been.
  } else {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = src.surahRows(await res.json());
    if (!rows) throw new Error('unexpected response');
    file = rowsToFile(rows);
  }
  await mkdirDeep(`${editionDir(kind, ed.id)}/s`);
  await ReactNativeBlobUtil.fs.writeFile(
    surahFilePath(kind, ed.id, surah),
    JSON.stringify(file),
    'utf8',
  );
}

/**
 * Fetch every surah of an edition, skipping the ones already on disk, three
 * at a time. Same contract as the other download jobs: a handle whose
 * promise says whether it finished and, if not, whether the connection had
 * stopped working altogether.
 */
export function downloadEdition(
  kind: StoreKind,
  ed: StoredEdition,
  opts: { onProgress?: (p: MushafDownloadProgress) => void },
): MushafDownloadHandle {
  let cancelled = false;
  const promise = (async () => {
    const total = STORE_SURAHS;
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
          if (!(await hasSurah(kind, ed.id, surah))) {
            await fetchSurahToDisk(kind, ed, surah);
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

/** Bytes on disk for one kind (Manage-downloads screen). */
export async function storeDiskUsage(kind: StoreKind): Promise<number> {
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
  if (!(await ReactNativeBlobUtil.fs.exists(storeDir(kind)))) return 0;
  return walk(storeDir(kind));
}

/** Delete everything of one kind. */
export async function deleteStore(kind: StoreKind): Promise<void> {
  memory[kind].clear();
  try {
    await ReactNativeBlobUtil.fs.unlink(storeDir(kind));
  } catch {
    /* already gone */
  }
}
