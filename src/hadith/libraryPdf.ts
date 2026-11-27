/**
 * A Library book that is a PDF: fetched once, kept, read with no network.
 *
 * Some books are published as a typeset file and nothing else — a
 * publisher's PDF, passed on unaltered (docs/hadith-policy.md §6). The
 * book's small pack says what it is and whose; this is the file itself:
 * `library/<id>.pdf` beside the packs, from our copy of it.
 *
 * WHAT MUST HOLD
 *
 * - A book is here whole or not here. The transfer goes to a file of its
 *   own and is moved into place only when it is the size and the SHA-256
 *   the manifest names; anything else is thrown away. A dropped
 *   connection leaves no half-book that opens to a grey page.
 * - It is never opened from a link. Reading asks nothing of the network.
 * - A failure says why, in a word the page can turn into a sentence and a
 *   button: no room, no connection, or not the file.
 * - Room is asked about before the transfer, not found out at its end.
 */
import { useSyncExternalStore } from 'react';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { IS_WEB_APP } from '../config/webApp';
import { mkdirDeep } from '../quran/mushafDownload';
import { quiet } from '../utils/quiet';
import { hadithMirrorUrl, refreshPacks } from './packs';

/** What the manifest says of a book's file. */
export type LibraryPdfEntry = { bytes: number; sha256: string; pages: number };

export type LibraryPdfStatus =
  | { state: 'absent' }
  | { state: 'ready' }
  | { state: 'downloading'; progress: number }
  /** `space`: it will not fit. `network`: it could not be fetched. `file`: what came is not the book. */
  | { state: 'failed'; why: 'space' | 'network' | 'file' };

/** The largest file the shelf offers: past this a book is a download nobody expects on a phone. */
export const LIBRARY_PDF_MAX_BYTES = 25 * 1024 * 1024;
/** Room wanted beyond the file itself: the copy being written, and something left for the phone. */
export const LIBRARY_PDF_HEADROOM = 20 * 1024 * 1024;

export const libraryPdfAsset = (id: string) => `library.${id}.pdf`;
export const libraryPdfPath = (id: string) => `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/hadith/v1/library/${id}.pdf`;

/** Is this what a manifest may say of a file? Anything else and the book is not offered. */
export function validLibraryPdf(v: unknown): v is LibraryPdfEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.bytes === 'number' && Number.isInteger(e.bytes) && e.bytes > 0 && e.bytes <= LIBRARY_PDF_MAX_BYTES &&
    typeof e.sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.sha256) &&
    typeof e.pages === 'number' && Number.isInteger(e.pages) && e.pages > 0
  );
}

/** Will it fit? `free` is what the device says it has; unknown (null) is not a no. */
export function libraryPdfFits(bytes: number, free: number | null): boolean {
  return free == null || free >= bytes + LIBRARY_PDF_HEADROOM;
}

// ── the store: one status a book, and who is listening ──
let statuses: Record<string, LibraryPdfStatus> = {};
const listeners = new Set<() => void>();
const running = new Map<string, { cancelled: boolean; abort?: () => void }>();
const ABSENT: LibraryPdfStatus = { state: 'absent' };

function set(id: string, s: LibraryPdfStatus): void {
  statuses = { ...statuses, [id]: s };
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => statuses;

export function useLibraryPdfStatus(id: string): LibraryPdfStatus {
  return useSyncExternalStore(subscribe, snapshot, snapshot)[id] ?? ABSENT;
}
export const libraryPdfStatus = (id: string): LibraryPdfStatus => statuses[id] ?? ABSENT;
/** Every book's, for the shelf. */
export function useLibraryPdfStatuses(): Record<string, LibraryPdfStatus> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

async function freeBytes(): Promise<number | null> {
  try {
    const df = (await ReactNativeBlobUtil.fs.df()) as unknown as Record<string, unknown>;
    // iOS says `free`; Android says `internal_free`.
    const n = Number(df.internal_free ?? df.free);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return null;
    return Number((await ReactNativeBlobUtil.fs.stat(path)).size);
  } catch {
    return null;
  }
}

/**
 * Is the book's file here? By its size: the SHA-256 was checked when it
 * came, and hashing twenty megabytes on every visit to the shelf is not a
 * check worth its wait. A file of another size is not the book and goes.
 */
export async function checkLibraryPdf(id: string, want: LibraryPdfEntry): Promise<boolean> {
  if (IS_WEB_APP) return false;
  if (running.has(id)) return false;
  const path = libraryPdfPath(id);
  const size = await sizeOf(path);
  if (size === want.bytes) {
    if (libraryPdfStatus(id).state !== 'ready') set(id, { state: 'ready' });
    return true;
  }
  if (size != null) await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
  if (libraryPdfStatus(id).state === 'ready') set(id, ABSENT);
  return false;
}

/** Our copy by an ordinary request, written to `tmp`. False when it could not be had. */
async function byRequest(url: string, tmp: string, job: { cancelled: boolean; abort?: () => void }): Promise<boolean> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 300_000);
  job.abort = () => controller.abort();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return false;
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('pdf: read failed'));
      reader.onloadend = () => {
        const result = String(reader.result ?? '');
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.readAsDataURL(blob);
    });
    if (job.cancelled) return false;
    await ReactNativeBlobUtil.fs.writeFile(tmp, base64, 'base64');
    return true;
  } catch (e) {
    quiet('hadith/libraryPdf', e);
    return false;
  } finally {
    clearTimeout(deadline);
    job.abort = undefined;
  }
}

/** Fetch the book's file. True when it is here, whole, at the end. */
export async function downloadLibraryPdf(id: string, want: LibraryPdfEntry): Promise<boolean> {
  if (IS_WEB_APP) return false;
  if (running.has(id)) return false;
  if (await checkLibraryPdf(id, want)) return true;
  const job: { cancelled: boolean; abort?: () => void } = { cancelled: false };
  running.set(id, job);
  const path = libraryPdfPath(id);
  const tmp = `${path}.dl`;
  try {
    if (!libraryPdfFits(want.bytes, await freeBytes())) {
      set(id, { state: 'failed', why: 'space' });
      return false;
    }
    set(id, { state: 'downloading', progress: 0 });
    await mkdirDeep(path.slice(0, path.lastIndexOf('/')));
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
    const task = ReactNativeBlobUtil.config({ path: tmp, timeout: 300_000 }).fetch('GET', hadithMirrorUrl(libraryPdfAsset(id)));
    job.abort = () => {
      void task.cancel?.();
    };
    task.progress?.({ interval: 250 }, (received, total) => {
      const all = Number(total) > 0 ? Number(total) : want.bytes;
      if (!job.cancelled) set(id, { state: 'downloading', progress: Math.min(1, Number(received) / all) });
    });
    let status = 0;
    try {
      status = (await task).info().status;
    } catch (e) {
      quiet('hadith/libraryPdf', e);
    }
    if (job.cancelled) {
      set(id, ABSENT);
      return false;
    }
    // The streaming transfer is the one to want, and on some networks every request through it dies (the
    // Android emulator's, some proxies: the audio and the fonts learned this first). There the file comes by
    // an ordinary request instead, held in memory for the length of one write.
    if (status !== 200) {
      await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
      status = (await byRequest(hadithMirrorUrl(libraryPdfAsset(id)), tmp, job)) ? 200 : 0;
    }
    if (job.cancelled) {
      set(id, ABSENT);
      return false;
    }
    if (status !== 200) {
      set(id, { state: 'failed', why: 'network' });
      return false;
    }
    // What came is the book only if it is the file the manifest names.
    const size = await sizeOf(tmp);
    const sha = size === want.bytes ? String(await ReactNativeBlobUtil.fs.hash(tmp, 'sha256')).toLowerCase() : '';
    if (sha !== want.sha256) {
      set(id, { state: 'failed', why: size != null && size < want.bytes ? 'network' : 'file' });
      return false;
    }
    if (await ReactNativeBlobUtil.fs.exists(path)) await ReactNativeBlobUtil.fs.unlink(path);
    await ReactNativeBlobUtil.fs.mv(tmp, path);
    set(id, { state: 'ready' });
    // Settings → Downloads counts the file with its pack.
    void refreshPacks();
    return true;
  } catch (e) {
    quiet('hadith/libraryPdf', e);
    set(id, { state: 'failed', why: 'network' });
    return false;
  } finally {
    running.delete(id);
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
  }
}

/** Stop a transfer on its way. What had come is thrown away. */
export function cancelLibraryPdf(id: string): void {
  const job = running.get(id);
  if (!job) return;
  job.cancelled = true;
  job.abort?.();
}

/** Take the file off the device. The reader's place and marks are kept: the book may be fetched again. */
export async function deleteLibraryPdf(id: string): Promise<void> {
  cancelLibraryPdf(id);
  await ReactNativeBlobUtil.fs.unlink(libraryPdfPath(id)).catch(() => undefined);
  set(id, ABSENT);
}

export function _resetLibraryPdfForTests(): void {
  statuses = {};
  running.clear();
}
