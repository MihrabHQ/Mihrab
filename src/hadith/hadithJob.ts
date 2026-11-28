/**
 * A Hadith download as the download manager runs it
 * (`quran/quranDownloadManager.ts`, kind `hadith`).
 *
 * One job is one file: a pack, or — `file` — the PDF of a Library book
 * that is one. The fetching itself is `packs.ts` and `libraryPdf.ts`, as
 * it was: our copy first (the `data-hadith-v1` release), where it came
 * from second. This is only the seam: the manager's handle, its bar (the
 * status those modules already publish, as a hundredth), and a name for
 * the notification.
 *
 * It does not know the manager, so the manager can know it.
 */
import i18n from '../i18n';
import { languageLabel } from '../i18n/languages';
import type { MushafDownloadHandle, MushafDownloadProgress } from '../quran/mushafDownload';
import { WHOLE_PACK, findHadithLanguage } from './catalog';
import LIBRARY_BOOKS from './libraryBooks.json';
import {
  cancelLibraryPdf,
  checkLibraryPdf,
  downloadLibraryPdf,
  libraryPdfStatus,
  subscribeLibraryPdf,
  validLibraryPdf,
} from './libraryPdf';
import {
  cancelPack,
  downloadPack,
  fetchManifest,
  isPackReady,
  manifestEntry,
  packStatus,
  scanPacks,
  subscribePacks,
} from './packs';
import type { PackKey } from './packTypes';

export type HadithJob = { kind: 'hadith'; key: string; file?: boolean };

const LIBRARY = 'library/';
const bookId = (key: string) => key.slice(LIBRARY.length);

/** A pack's key as the packs are named: no dots, no climbing out of the folder. */
const KEY = /^(henc|categories|nawawi|books|library)(\/[A-Za-z0-9_-]+){0,2}$/;

/** A job read back from disk (the manager's note of a run that did not end). */
export function validHadithJob(value: Record<string, unknown>): HadithJob | null {
  if (typeof value.key !== 'string' || !KEY.test(value.key)) return null;
  if (value.file === true) return value.key.startsWith(LIBRARY) ? { kind: 'hadith', key: value.key, file: true } : null;
  return { kind: 'hadith', key: value.key };
}

export const sameHadithJob = (a: HadithJob, b: HadithJob) => a.key === b.key && !!a.file === !!b.file;

const packLanguage = (code: string) =>
  languageLabel(code) !== code ? languageLabel(code) : (findHadithLanguage(code)?.native ?? code);

/** What the job is called, in the notification and the strip. */
export function hadithJobName(job: HadithJob): string {
  const [kind, a, b] = job.key.split('/');
  if (kind === 'library') {
    const book = (LIBRARY_BOOKS as Array<{ id: string; title: string }>).find(x => x.id === a);
    return book?.title ?? i18n.t('hadith.library.tab');
  }
  if (kind === 'henc') {
    const what =
      a === WHOLE_PACK
        ? i18n.t('hadith.packAll')
        : a === 'starter'
          ? i18n.t('hadith.packStarter')
          : i18n.t(`hadith.topic.${a.replace('cat-', '')}`, { defaultValue: i18n.t('hadith.topics') });
    return `${what} · ${packLanguage(b)}`;
  }
  if (kind === 'categories') return `${i18n.t('hadith.packCategories')} · ${packLanguage(a)}`;
  if (kind === 'nawawi') return i18n.t('hadith.packNawawi');
  return i18n.t(`hadith.book.${a}`);
}

/** What the manifest — or, without one, the app itself — says the book's file is. */
async function fileOf(job: HadithJob) {
  const pdf = manifestEntry(await fetchManifest(), job.key as PackKey)?.pdf;
  return validLibraryPdf(pdf) ? pdf : null;
}

/** Is what the job would fetch already here? */
export async function hadithJobDone(job: HadithJob): Promise<boolean> {
  if (!job.file) {
    await scanPacks();
    return isPackReady(job.key as PackKey);
  }
  const want = await fileOf(job);
  return want ? checkLibraryPdf(bookId(job.key), want) : false;
}

export function beginHadithJob(job: HadithJob, onProgress: (p: MushafDownloadProgress) => void): MushafDownloadHandle {
  let cancelled = false;
  const report = (fraction: number, failed = 0) =>
    onProgress({ done: Math.max(0, Math.min(100, Math.round(fraction * 100))), total: 100, failed });
  let last = 0;
  const read = () => {
    const s = job.file ? libraryPdfStatus(bookId(job.key)) : packStatus(job.key as PackKey);
    if (s.state !== 'downloading') return;
    // Never the whole before it is: "100 of 100" is the manager's word for finished.
    last = Math.min(0.99, s.progress);
    report(last);
  };
  const off = job.file ? subscribeLibraryPdf(read) : subscribePacks(read);
  const promise = (async () => {
    try {
      let ok = false;
      if (job.file) {
        const want = await fileOf(job);
        if (want && !cancelled) ok = await downloadLibraryPdf(bookId(job.key), want);
      } else if (!cancelled) {
        ok = await downloadPack(job.key as PackKey);
      }
      if (ok) report(1);
      else if (!cancelled) report(last, 1);
      // Not "interrupted": that is the manager's word for a run it will come back to by itself, and a
      // pack no source answered for is asked for again by its own Retry.
      return { complete: ok, interrupted: false };
    } finally {
      off();
    }
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (job.file) cancelLibraryPdf(bookId(job.key));
      else cancelPack(job.key as PackKey);
    },
  };
}
