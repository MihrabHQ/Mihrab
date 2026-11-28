/**
 * Asking for a Hadith download: the one way in, for every screen.
 *
 * Every pack and every Library file goes through the app's download
 * manager (`quran/quranDownloadManager.ts`) — the same one the muṣḥaf and
 * the recitations use. So a Hadith download has what those have: it
 * belongs to the app and not to a screen, Android keeps the app alive for
 * it under the one download notification, one runs at a time and the
 * rest wait their turn, and a run the process died under is offered again.
 * They used to run on their own, beside the manager: no notification, no
 * service, and two of them at once with a recitation.
 *
 * What is fetched, and from where, is unchanged and not here
 * (`packs.ts`, `libraryPdf.ts`): our copy first, its source second.
 *
 * These are the names the screens already called, with the same answers:
 * a promise that is true when the thing is on the device.
 */
import {
  cancelQuranDownload,
  dequeueQuranDownload,
  isJobQueued,
  isJobRunning,
  queueQuranDownload,
  subscribeQuranDownload,
} from '../quran/quranDownloadManager';
import type { HadithJob } from './hadithJob';
import {
  cancelLibraryPdf as stopLibraryPdf,
  checkLibraryPdf,
  clearLibraryPdfWaiting,
  libraryPdfStatus,
  markLibraryPdfWaiting,
  type LibraryPdfEntry,
} from './libraryPdf';
import { cancelPack as stopPack, clearPackWaiting, isPackReady, markPackWaiting, scanPacks } from './packs';
import type { PackKey } from './packTypes';

const bookId = (key: string) => key.slice('library/'.length);
const idOf = (job: HadithJob) => `${job.file ? 'file:' : ''}${job.key}`;

/** Asked for and not yet ended: the job, and who is waiting to hear. */
const asked = new Map<string, { job: HadithJob; heard: Array<(here: boolean) => void> }>();
let listening = false;

const here = (job: HadithJob) =>
  job.file ? libraryPdfStatus(bookId(job.key)).state === 'ready' : isPackReady(job.key as PackKey);

/** Whatever has left the manager — finished, failed, cancelled, or dropped from its queue — is answered. */
function settle(): void {
  for (const [id, entry] of [...asked]) {
    if (isJobRunning(entry.job) || isJobQueued(entry.job)) continue;
    asked.delete(id);
    // One whose turn never came is no longer "downloading".
    if (entry.job.file) clearLibraryPdfWaiting(bookId(entry.job.key));
    else clearPackWaiting(entry.job.key as PackKey);
    const ok = here(entry.job);
    for (const tell of entry.heard) tell(ok);
  }
}

function ask(job: HadithJob): Promise<boolean> {
  if (!listening) {
    listening = true;
    subscribeQuranDownload(settle);
  }
  const id = idOf(job);
  let entry = asked.get(id);
  if (!entry) {
    entry = { job, heard: [] };
    asked.set(id, entry);
    if (job.file) markLibraryPdfWaiting(bookId(job.key));
    else markPackWaiting(job.key as PackKey);
    queueQuranDownload(job);
  }
  const waiting = entry;
  return new Promise<boolean>(resolve => {
    waiting.heard.push(resolve);
    // A job that ended inside the call above (nothing to do, or refused at once).
    settle();
  });
}

function stop(job: HadithJob): boolean {
  if (isJobQueued(job)) {
    dequeueQuranDownload(job);
    return true;
  }
  if (isJobRunning(job)) {
    cancelQuranDownload();
    return true;
  }
  return false;
}

/** Fetch one pack. True when it is on the device. */
export async function downloadPack(key: PackKey): Promise<boolean> {
  await scanPacks();
  if (isPackReady(key)) return true;
  return ask({ kind: 'hadith', key });
}

/** Fetch every pack not yet here, one after another. True when all are. */
export async function ensurePacks(keys: readonly PackKey[]): Promise<boolean> {
  await scanPacks();
  const got = await Promise.all(keys.filter(key => !isPackReady(key)).map(key => ask({ kind: 'hadith', key })));
  return got.every(Boolean);
}

/** Stop a pack: the transfer if it is in flight, its turn if it is waiting for one. */
export function cancelPack(key: PackKey): void {
  if (!stop({ kind: 'hadith', key })) stopPack(key);
}

/** Fetch a Library book's file. True when it is here, whole, at the end. */
export async function downloadLibraryPdf(id: string, want: LibraryPdfEntry): Promise<boolean> {
  if (await checkLibraryPdf(id, want)) return true;
  return ask({ kind: 'hadith', key: `library/${id}`, file: true });
}

export function cancelLibraryPdf(id: string): void {
  if (!stop({ kind: 'hadith', key: `library/${id}`, file: true })) stopLibraryPdf(id);
}

export function _resetHadithDownloadsForTests(): void {
  asked.clear();
}
