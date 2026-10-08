/**
 * The Quran's downloads, owned by the app rather than by a screen.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * The mushaf download used to live inside MushafReader: the handle was a
 * ref, and the effect that created it cancelled it on cleanup. Which meant
 * leaving the Quran tab — or turning the phone, or switching to the text
 * reader — threw away however much of a six-hundred-page book had arrived.
 * The only way to finish was to sit and watch it, on a screen that exists
 * to be read rather than watched.
 *
 * A module holds it now. Screens ask what is happening and subscribe to
 * changes; nothing about mounting or unmounting starts or stops anything.
 * The only two things that end a download are finishing and being
 * cancelled, and cancelling is something a person does.
 *
 * ── WHY IT OWNS THE RECITATIONS TOO ───────────────────────────────────
 *
 * Because the per-surah audio download had exactly the bug described
 * above, still: its handle lived in RecitationControls' component state
 * and died with the sheet. That was survivable for one surah of eighty
 * ayahs. A reciter's whole Quran is 6,236 files and over a gigabyte, and a
 * download that size cannot belong to a screen.
 *
 * ── ONE AT A TIME, ACROSS BOTH KINDS ──────────────────────────────────
 *
 * A second run started while the first is in flight would halve both and
 * confuse the progress — and that is as true of fonts against a recitation
 * as of fonts against fonts. They share one pipe, one disk and, on
 * Android, one foreground service: the notification IS the service, so two
 * downloads would either fight over one bar or need two services to say
 * one thing.
 *
 * So `start` is a no-op while anything is running, and the caller finds
 * out by reading the state it gets back. The alternative — a real queue,
 * with the second job waiting — was considered and is not worth it: these
 * are downloads people start deliberately, one at a time, and being told
 * "something is already downloading" is a better answer than silently
 * joining a queue whose progress bar is about something else.
 */
import type {
  MushafDownloadHandle,
  MushafDownloadProgress,
} from './mushafDownload';
import { downloadAllPageFonts, type MushafFontSet } from './mushafFontStore';
import type { DownloadError, DownloadOutcome } from './contentNetwork';
import { downloadRiwayah } from './riwayahDownload';
import { RIWAYAT, type RiwayahId } from './riwayat';
import { riwayahProvenance } from './riwayahData';
import { sizeLabel, spaceShortfall } from './downloadSpace';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  downloadAyahs,
  downloadSurahAudio,
  reciterAudioStats,
  totalAyahCount,
  downloadReciterAudio,
  estimatedReciterBytes,
} from './audio/audioStore';
import { findReciter } from './audio/reciters';
import { downloadWordMeanings, WORD_MEANINGS_SURAHS } from './wordMeanings';
import {
  downloadTafsirEdition,
  findTafsirEdition,
  tafsirEditionStats,
  tafsirNameInSentence,
  TAFSIR_SURAHS,
} from './tafsir';
import { findSurah } from './quran';
import { surahName } from './surahName';
import {
  finishDownloadNotification,
  publishDownloadProgress,
} from './downloadNotification';
import { ROUTE_QURAN_DOWNLOADS } from '../notifications/notificationRoute';
import i18n from '../i18n';

/**
 * What is being fetched.
 *
 * `fonts` is the mushaf's own per-page faces — the book's text. `audio`
 * carries the reciter, because "a download is running" is not enough for a
 * screen that lists forty-two voices and has to say which one.
 *
 * `surah` is one surah in one voice — the tilāwah download in the ayah
 * sheet. It is the small one, and it was the last to move in here: its
 * handle lived in `RecitationControls`, so closing the sheet threw it
 * away, and the shade never heard about it at all.
 *
 * `refs` are the ayahs to fetch — the MISSING ones, so the count on
 * screen is the work left rather than a walk to 286 that skips 282 of
 * them instantly. It is optional because a caller that only wants to ask
 * `isJobRunning` should not have to read the disk first; when it is
 * absent the whole surah is queued and the already-valid files are
 * skipped.
 */
export type QuranDownloadJob =
  /** The page faces: V2 when `set` is absent, or one of the tajwīd sets. */
  | { kind: 'fonts'; set?: MushafFontSet }
  | { kind: 'audio'; reciterId: string }
  /** QuranEnc's Arabic meanings of the harder words — the whole set, ~114 small files. */
  | { kind: 'wordMeanings' }
  /** One tafsir edition, whole — 114 surah files (`tafsir.ts`). */
  | { kind: 'tafsir'; editionId: string }
  /**
   * One riwayah's muṣḥaf text (`riwayahDownload.ts`) — one file, a few
   * megabytes. `url` is a link the reader pasted; without it, the
   * one-button download (this repo's mirror, then the publisher).
   */
  | { kind: 'riwayah'; riwayahId: RiwayahId; url?: string }
  | {
      kind: 'surah';
      reciterId: string;
      surah: number;
      refs?: ReadonlyArray<{ surah: number; ayah: number }>;
    };

export type QuranDownloadState = {
  /** What is running, or null when nothing is. */
  running: QuranDownloadJob | null;
  progress: MushafDownloadProgress;
  /**
   * How the last run ended, for a screen that was not mounted when it did.
   * Cleared when the next one starts.
   */
  last: {
    job: QuranDownloadJob;
    complete: boolean;
    cancelled: boolean;
    failed: number;
    /**
     * It stopped because the files had stopped arriving — issue #55.
     *
     * The difference between "this download failed" and "this download
     * is waiting for your wifi", which is the difference the reporter
     * was on the wrong side of. Everything already fetched is on disk
     * either way; this says whether coming back is the answer.
     */
    interrupted: boolean;
    /** Where it had got to, so a screen can say so without a disk read. */
    done: number;
    total: number;
    /** Why it did not complete, when there is one reason to give. */
    error?: DownloadError;
  } | null;
};

const EMPTY_PROGRESS: MushafDownloadProgress = { done: 0, total: 0, failed: 0 };

let state: QuranDownloadState = {
  running: null,
  progress: EMPTY_PROGRESS,
  last: null,
};
let cancelledByUser = false;

const listeners = new Set<(s: QuranDownloadState) => void>();

function publish(next: QuranDownloadState): void {
  state = next;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // A subscriber that throws must not take the download with it.
    }
  }
}

export function quranDownloadState(): QuranDownloadState {
  return state;
}

/** Subscribe; returns the unsubscribe, for a `useEffect`. */
export function subscribeQuranDownload(
  listener: (s: QuranDownloadState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Is this exact job the one running? */
export function isJobRunning(job: QuranDownloadJob): boolean {
  const running = state.running;
  if (!running || running.kind !== job.kind) return false;
  if (running.kind === 'audio' && job.kind === 'audio') {
    return running.reciterId === job.reciterId;
  }
  if (running.kind === 'tafsir' && job.kind === 'tafsir') {
    return running.editionId === job.editionId;
  }
  if (running.kind === 'riwayah' && job.kind === 'riwayah') {
    return running.riwayahId === job.riwayahId;
  }
  if (running.kind === 'surah' && job.kind === 'surah') {
    // Identity is the voice and the surah. NOT the refs: the caller
    // asking is a row that wants to know whether the bar it is drawing is
    // its own, and it has no business knowing which ayahs were missing
    // when somebody else pressed the button.
    return running.reciterId === job.reciterId && running.surah === job.surah;
  }
  if (running.kind === 'fonts' && job.kind === 'fonts') {
    return fontSetOf(running) === fontSetOf(job);
  }
  return true;
}

/** Which page faces a fonts job fetches — V2 unless it says otherwise. */
export function fontSetOf(job: { kind: 'fonts'; set?: MushafFontSet }): MushafFontSet {
  return job.set ?? 'v2';
}

/** A riwayah's name in the app's language, for the shade and the strip. */
export function riwayahLabel(id: RiwayahId): string {
  const def = RIWAYAT.find(r => r.id === id);
  return def ? i18n.t(def.nameKey, def.arabic) : id;
}

/** The reciter's name as the shade should say it. */
function reciterLabel(reciterId: string): string {
  return findReciter(reciterId).name;
}

/** One surah's name in the app's language, for the shade and the strip. */
export function jobSurahName(surah: number): string {
  const meta = findSurah(surah);
  return meta ? surahName(meta, i18n.language) : String(surah);
}

/** How many ayahs a surah job will fetch, known before the first one lands. */
function surahJobTotal(job: {
  surah: number;
  refs?: ReadonlyArray<unknown>;
}): number {
  if (job.refs) return job.refs.length;
  return findSurah(job.surah)?.ayahCount ?? 0;
}

/**
 * The four strings the shade needs, in the units this job actually counts.
 *
 * The mushaf counts pages and a recitation counts ayahs. The notification
 * takes them as text rather than deciding for itself, so neither has to
 * know about the other.
 */
function notificationText(job: QuranDownloadJob) {
  if (job.kind === 'surah') {
    const name = reciterLabel(job.reciterId);
    const surah = jobSurahName(job.surah);
    return {
      label: i18n.t('quran.downloadingSurah', { surah, name }),
      body: (done: number, total: number) =>
        i18n.t('quran.downloadProgressAyahs', { done, total }),
      doneTitle: i18n.t('quran.surahDownloadDoneTitle', { surah }),
      doneBody: i18n.t('quran.surahDownloadDoneBody', { surah, name }),
      incompleteTitle: i18n.t('quran.audioDownloadIncompleteTitle'),
      incompleteBody: (failed: number) =>
        i18n.t('quran.audioDownloadIncompleteBody', { count: failed }),
      stoppedTitle: i18n.t('quran.downloadStoppedTitle'),
      stoppedBody: (done: number, total: number) =>
        i18n.t('quran.downloadStoppedBodyAyahs', { done, total }),
    };
  }
  if (job.kind === 'audio') {
    const name = reciterLabel(job.reciterId);
    return {
      // `downloadingReciter`, not `downloadingAudio`. The latter already
      // existed for the per-surah download inside the ayah sheet
      // ("Downloading… 40/86"), and adding a second entry under the same
      // key silently overrode it — JSON keeps the last one, so that sheet
      // had started announcing a reciter's name where a count belonged.
      label: i18n.t('quran.downloadingReciter', { name }),
      body: (done: number, total: number) =>
        i18n.t('quran.downloadProgressAyahs', { done, total }),
      doneTitle: i18n.t('quran.audioDownloadDoneTitle', { name }),
      doneBody: i18n.t('quran.audioDownloadDoneBody', { name }),
      incompleteTitle: i18n.t('quran.audioDownloadIncompleteTitle'),
      incompleteBody: (failed: number) =>
        i18n.t('quran.audioDownloadIncompleteBody', { count: failed }),
      stoppedTitle: i18n.t('quran.downloadStoppedTitle'),
      stoppedBody: (done: number, total: number) =>
        i18n.t('quran.downloadStoppedBodyAyahs', { done, total }),
    };
  }
  if (job.kind === 'tafsir') {
    const name = tafsirNameInSentence(
      findTafsirEdition(job.editionId)?.label ?? job.editionId,
    );
    return {
      label: i18n.t('quran.downloadingTafsir', { name }),
      body: (done: number, total: number) =>
        i18n.t('quran.downloadProgressSurahs', { done, total }),
      doneTitle: i18n.t('quran.tafsirDoneTitle', { name }),
      doneBody: i18n.t('quran.tafsirDoneBody'),
      incompleteTitle: i18n.t('quran.downloadIncompleteTitle'),
      incompleteBody: (failed: number) =>
        i18n.t('quran.wordMeaningsIncompleteBody', { count: failed }),
      stoppedTitle: i18n.t('quran.downloadStoppedTitle'),
      stoppedBody: (done: number, total: number) =>
        i18n.t('quran.downloadStoppedBodySurahs', { done, total }),
    };
  }
  if (job.kind === 'riwayah') {
    const name = riwayahLabel(job.riwayahId);
    return {
      label: i18n.t('quran.riwayahDownloading', { name }),
      body: () => i18n.t('quran.riwayahDownloadingBody'),
      doneTitle: i18n.t('quran.riwayahDoneTitle', { name }),
      doneBody: i18n.t('quran.riwayahDoneBody', { name }),
      incompleteTitle: i18n.t('quran.riwayahFailedTitle', { name }),
      incompleteBody: () => i18n.t('quran.riwayahFailedBody'),
      stoppedTitle: i18n.t('quran.downloadStoppedTitle'),
      stoppedBody: () => i18n.t('quran.riwayahStoppedBody'),
    };
  }
  if (job.kind === 'wordMeanings') {
    return {
      label: i18n.t('quran.downloadingWordMeanings'),
      body: (done: number, total: number) =>
        i18n.t('quran.downloadProgressSurahs', { done, total }),
      doneTitle: i18n.t('quran.wordMeaningsDoneTitle'),
      doneBody: i18n.t('quran.wordMeaningsDoneBody'),
      incompleteTitle: i18n.t('quran.downloadIncompleteTitle'),
      incompleteBody: (failed: number) =>
        i18n.t('quran.wordMeaningsIncompleteBody', { count: failed }),
      stoppedTitle: i18n.t('quran.downloadStoppedTitle'),
      stoppedBody: (done: number, total: number) =>
        i18n.t('quran.downloadStoppedBodySurahs', { done, total }),
    };
  }
  const tajweed = fontSetOf(job) !== 'v2';
  return {
    label: tajweed ? i18n.t('tajweed.downloading') : i18n.t('quran.downloadingFonts'),
    body: (done: number, total: number) =>
      i18n.t('quran.downloadProgress', { done, total }),
    doneTitle: tajweed ? i18n.t('tajweed.downloadDoneTitle') : i18n.t('quran.downloadDoneTitle'),
    doneBody: tajweed ? i18n.t('tajweed.downloadDoneBody') : i18n.t('quran.downloadDoneBody'),
    incompleteTitle: i18n.t('quran.downloadIncompleteTitle'),
    incompleteBody: (failed: number) =>
      i18n.t('quran.downloadIncompleteBody', { count: failed }),
    stoppedTitle: i18n.t('quran.downloadStoppedTitle'),
    stoppedBody: (done: number, total: number) =>
      i18n.t('quran.downloadStoppedBodyPages', { done, total }),
  };
}

/**
 * What a job is called on a screen, for every kind — one answer, so a
 * screen listing "what is downloading" cannot fall through to "Mushaf
 * pages" for a kind it did not know about (which the Downloads screen did
 * for a surah's recitation).
 */
export function jobDisplayName(job: QuranDownloadJob): string {
  switch (job.kind) {
    case 'audio':
      return reciterLabel(job.reciterId);
    case 'surah':
      return `${jobSurahName(job.surah)} · ${reciterLabel(job.reciterId)}`;
    case 'tafsir':
      return findTafsirEdition(job.editionId)?.label ?? job.editionId;
    case 'wordMeanings':
      return i18n.t('downloads.wordMeanings', 'Arabic word meanings');
    case 'riwayah':
      return riwayahLabel(job.riwayahId);
    case 'fonts':
      return fontSetOf(job) === 'v2'
        ? i18n.t('downloads.mushaf', 'Mushaf pages')
        : i18n.t('tajweed.downloadsRow', 'Tajweed colours');
  }
}

/** "40 of 86 ayahs", "12 of 114 surahs", "300 of 604 pages" — in the job's own unit. */
export function jobProgressText(
  job: QuranDownloadJob,
  done: number,
  total: number,
): string {
  return notificationText(job).body(done, total);
}

/**
 * The last percent this manager told anybody about.
 *
 * A whole-Quran download reports 6,236 times. Publishing each one drags
 * every subscribed screen through a render — and the listening page's
 * subscriber sits above a 114-row list, so that is 6,236 full re-renders
 * of the screen you are watching the bar on. The bar itself cannot show
 * them: it is a few hundred points wide, so one ayah is a fraction of a
 * pixel.
 *
 * The mushaf reader had worked this out and throttled inside its own
 * component. That fixed the reader and left every other consumer to
 * rediscover it, so the throttle lives here now, where the flood starts.
 * The final event always goes out whatever the percent, because "6236 of
 * 6236" is the one number that has to be exact.
 */
let lastPublishedPct = -1;

/**
 * The job's own download, started. Pure dispatch: everything that keeps a
 * run honest — the watchdog, the run token, the note on disk — wraps this
 * in `startQuranDownload`, so a seventh kind of download inherits it by
 * being added here and nowhere else.
 */
function begin(
  job: QuranDownloadJob,
  onProgress: (p: MushafDownloadProgress) => void,
): MushafDownloadHandle {
  if (job.kind === 'surah') {
    // The refs are the gap. Without them — a caller that could not read
    // the disk — the whole surah is queued and the valid files skipped,
    // which fetches the right bytes and counts the wrong ones. Only the
    // fallback.
    return job.refs
      ? downloadAyahs(job.reciterId, job.refs, onProgress)
      : downloadSurahAudio(job.reciterId, job.surah, onProgress);
  }
  if (job.kind === 'audio') {
    return downloadReciterAudio(job.reciterId, onProgress);
  }
  if (job.kind === 'wordMeanings') return downloadWordMeanings({ onProgress });
  if (job.kind === 'tafsir') return downloadTafsirEdition(job.editionId, { onProgress });
  if (job.kind === 'riwayah') {
    const def = RIWAYAT.find(r => r.id === job.riwayahId);
    return downloadRiwayah(
      job.riwayahId,
      { url: job.url, direct: def?.source?.direct },
      onProgress,
    );
  }
  return downloadAllPageFonts({ onProgress, set: fontSetOf(job) });
}

/**
 * ── WHAT IS STILL TO COME, FOR THE SPACE CHECK ────────────────────────
 *
 * Only the two downloads big enough to fill a phone are measured: a
 * reciter (up to 1.4 GB) and a tafsir edition (up to ~85 MB). What is
 * already on disk is subtracted, so resuming at 90% asks for the last
 * tenth, not the whole. Everything else is a few megabytes and comes in
 * under the margin `spaceShortfall` keeps anyway.
 */
function needsSpaceCheck(job: QuranDownloadJob): boolean {
  return job.kind === 'audio' || job.kind === 'tafsir';
}

async function bytesStillNeeded(job: QuranDownloadJob): Promise<number> {
  if (job.kind === 'audio') {
    const have = (await reciterAudioStats(job.reciterId)).bytes;
    return Math.max(0, estimatedReciterBytes(job.reciterId) - have);
  }
  if (job.kind === 'tafsir') {
    const whole = findTafsirEdition(job.editionId)?.approxBytes ?? 0;
    const have = (await tafsirEditionStats(job.editionId)).bytes;
    return Math.max(0, whole - have);
  }
  return 0;
}

/** The total a job's bar starts at, known before the first file lands. */
function initialProgress(job: QuranDownloadJob): MushafDownloadProgress {
  // A bar that starts at "0 of 0" and jumps to "1 of 6236" reads as a
  // stall. `fonts` learns its own total from the first callback.
  if (job.kind === 'audio') return { done: 0, total: totalAyahCount(), failed: 0 };
  if (job.kind === 'surah') return { done: 0, total: surahJobTotal(job), failed: 0 };
  if (job.kind === 'wordMeanings') return { done: 0, total: WORD_MEANINGS_SURAHS, failed: 0 };
  if (job.kind === 'tafsir') return { done: 0, total: TAFSIR_SURAHS, failed: 0 };
  if (job.kind === 'riwayah') return { done: 0, total: 1, failed: 0 };
  return EMPTY_PROGRESS;
}

/**
 * ── A RUN THAT CANNOT WEDGE THE MANAGER ───────────────────────────────
 *
 * "Something is already downloading" is the manager's one refusal, so a
 * run that never ends is not a stuck download — it is every download
 * button in the app, disabled until the process dies. Three things could
 * do that, and each has an answer here:
 *
 *   • a job that THROWS while starting, or whose promise REJECTS. Both
 *     end the run as a failure with the error carried along; before, a
 *     rejection skipped the `.then` and left `running` set for good.
 *   • a job that simply stops calling back and never settles — a native
 *     download that lost its socket without saying so. Each request has a
 *     deadline (`contentNetwork.ts`), but a deadline is per request; this
 *     is the backstop for the run. No progress for `STALL_MS` and the run
 *     is cancelled; if even the cancel is not answered within
 *     `STALL_GRACE_MS`, the run is ended for it. Either way it ends as
 *     INTERRUPTED — the network's fault until shown otherwise, so it is
 *     offered again rather than called a failure.
 *   • a LATE answer from a run already ended that way. Every run carries
 *     a token, and anything from a run that is no longer the current one
 *     — progress or outcome — is dropped, so it cannot overwrite the
 *     state of the run that replaced it.
 *
 * `STALL_MS` is longer than the slowest legitimate gap between two
 * callbacks: one ayah's three attempts at a minute each plus the backoff,
 * or one big tafsir surah from the mirror and twice from the original.
 */
export const STALL_MS = 6 * 60_000;
export const STALL_GRACE_MS = 15_000;

type Run = {
  id: number;
  job: QuranDownloadJob;
  inner: MushafDownloadHandle | null;
  stalled: boolean;
  /** The space check found the phone too full: why the run was stopped. */
  noSpace: DownloadError | null;
  settled: boolean;
  watchdog: ReturnType<typeof setTimeout> | null;
};

let runSeq = 0;
let current: Run | null = null;

function isCurrent(run: Run): boolean {
  return current === run && !run.settled;
}

function armWatchdog(run: Run): void {
  if (run.watchdog) clearTimeout(run.watchdog);
  run.watchdog = setTimeout(() => {
    if (!isCurrent(run)) return;
    run.stalled = true;
    try {
      run.inner?.cancel();
    } catch {
      /* the grace timer below ends it either way */
    }
    run.watchdog = setTimeout(
      () => finishRun(run, { complete: false, interrupted: true }),
      STALL_GRACE_MS,
    );
  }, STALL_MS);
}

function failure(e: unknown): DownloadOutcome {
  return {
    complete: false,
    interrupted: false,
    error: {
      key: 'quran.downloadIncompleteTitle',
      fallback: 'The download did not finish',
      detail: String(e instanceof Error ? e.message : e),
    },
  };
}

/**
 * Start one, if nothing is running. Returns whether this call started it.
 */
/**
 * Jobs waiting for the running one to finish — see `queueQuranDownload`.
 *
 * Not the general queue the header note declines: it is never more than
 * the other tajwīd palette or a second reciter someone tapped while the
 * first was running, and it empties itself the moment a run is cancelled,
 * because a person who stops one download did not ask for the next.
 */
let queued: QuranDownloadJob[] = [];

export function queuedQuranDownloads(): readonly QuranDownloadJob[] {
  return queued;
}

export function isJobQueued(job: QuranDownloadJob): boolean {
  return queued.some(q => sameJob(q, job));
}

function sameJob(a: QuranDownloadJob, b: QuranDownloadJob): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'fonts' && b.kind === 'fonts') return fontSetOf(a) === fontSetOf(b);
  if (a.kind === 'audio' && b.kind === 'audio') return a.reciterId === b.reciterId;
  if (a.kind === 'wordMeanings' && b.kind === 'wordMeanings') return true;
  if (a.kind === 'tafsir' && b.kind === 'tafsir') return a.editionId === b.editionId;
  if (a.kind === 'riwayah' && b.kind === 'riwayah') return a.riwayahId === b.riwayahId;
  if (a.kind === 'surah' && b.kind === 'surah') {
    return a.reciterId === b.reciterId && a.surah === b.surah;
  }
  return false;
}

/**
 * Start the job now, or after whatever is running. The answer is what
 * happened: `started`, `queued`, or `running` when it already is one of
 * the two. Used by the tajwīd switch, which wants both palettes and does
 * not want to be told to come back later for the second.
 */
export function queueQuranDownload(
  job: QuranDownloadJob,
): 'started' | 'queued' | 'running' {
  if (isJobRunning(job)) return 'running';
  if (isJobQueued(job)) return 'queued';
  if (!state.running) {
    startQuranDownload(job);
    return 'started';
  }
  queued = [...queued, job];
  publish({ ...state });
  return 'queued';
}

export function dequeueQuranDownload(job: QuranDownloadJob): void {
  const next = queued.filter(q => !sameJob(q, job));
  if (next.length === queued.length) return;
  queued = next;
  publish({ ...state });
}

function startNextQueued(): void {
  const [next, ...rest] = queued;
  if (!next) return;
  queued = rest;
  startQuranDownload(next);
}

export function startQuranDownload(job: QuranDownloadJob): boolean {
  if (state.running) return false;
  cancelledByUser = false;
  lastPublishedPct = -1;
  const run: Run = {
    id: ++runSeq,
    job,
    inner: null,
    stalled: false,
    noSpace: null,
    settled: false,
    watchdog: null,
  };
  current = run;
  publish({ running: job, progress: initialProgress(job), last: null });

  /**
   * THE NOTE GOES DOWN AT THE START, not only when the network takes the
   * run away. A process killed mid-download — swiped away, reclaimed by
   * the system for memory, a crash — ends no run at all, so a note
   * written at the end was never written, and the reader came back to a
   * half-downloaded reciter with nothing offering to finish it. Now the
   * note exists for as long as the run does and is cleared only by an
   * ending that is not worth coming back to.
   */
  void rememberPendingJob(job);

  const text = notificationText(job);
  // The bar goes up on the tap, not on the first file that lands. A surah
  // of seven ayahs on a slow connection used to leave several seconds
  // between "Download" and anything appearing in the shade, which reads as
  // a button that did nothing.
  // Only when the total is already known: `fonts` learns its own from the
  // first callback, and a bar that says "0 of 0 pages" is worse than a bar
  // that is a second late.
  if (state.progress.total > 0) {
    void publishDownloadProgress({
      done: 0,
      total: state.progress.total,
      label: text.label,
      body: text.body(0, state.progress.total),
    });
  }

  const onProgress = (progress: MushafDownloadProgress) => {
    if (!isCurrent(run)) return;
    armWatchdog(run);
    const pct =
      progress.total > 0
        ? Math.floor((progress.done / progress.total) * 100)
        : 0;
    const finished = progress.done >= progress.total;
    if (pct === lastPublishedPct && !finished) return;
    lastPublishedPct = pct;
    publish({ ...state, progress });
    void publishDownloadProgress({
      done: progress.done,
      total: progress.total,
      label: text.label,
      body: text.body(progress.done, progress.total),
    });
  };

  const settle = (outcome: DownloadOutcome) => finishRun(run, outcome);
  armWatchdog(run);
  try {
    run.inner = begin(job, onProgress);
    run.inner.promise.then(settle, e => settle(failure(e)));
  } catch (e) {
    settle(failure(e));
    return true;
  }
  // The space check runs BESIDE the download rather than before it, so
  // starting stays synchronous for every caller; a few files may land in
  // the milliseconds it takes, which costs nothing. Too full, and the run
  // is stopped with that as its one reason.
  if (needsSpaceCheck(job)) void checkSpace(run);
  return true;
}

async function checkSpace(run: Run): Promise<void> {
  let short = 0;
  try {
    short = await spaceShortfall(await bytesStillNeeded(run.job));
  } catch {
    return; // unknown is not a reason to refuse
  }
  if (short <= 0 || !isCurrent(run)) return;
  run.noSpace = {
    key: 'quran.downloadNoSpaceBody',
    fallback: 'This download needs {{size}} more free space. Free some up and try again.',
    params: { size: sizeLabel(short) },
  };
  try {
    run.inner?.cancel();
  } catch {
    /* ended below either way */
  }
  // In place of the watchdog, so ending the run clears it.
  if (run.watchdog) clearTimeout(run.watchdog);
  run.watchdog = setTimeout(
    () => finishRun(run, { complete: false, interrupted: false }),
    STALL_GRACE_MS,
  );
}

/** End a run — once, and only the run that is still current. */
function finishRun(run: Run, outcome: DownloadOutcome): void {
  if (!isCurrent(run)) return;
  run.settled = true;
  if (run.watchdog) clearTimeout(run.watchdog);
  current = null;
  const job = run.job;
  const failed = state.progress.failed;
  const { done, total } = state.progress;
  const text = notificationText(job);
  const error = run.noSpace ?? outcome.error;
  const noSpace = run.noSpace != null;
  const complete = outcome.complete && !run.stalled && !noSpace;
  const interrupted =
    (outcome.interrupted || run.stalled) && !cancelledByUser && !noSpace;
  publish({
    running: null,
    progress: state.progress,
    last: {
      job,
      complete,
      cancelled: cancelledByUser,
      failed,
      interrupted,
      done,
      total,
      ...(error ? { error } : {}),
    },
  });
  /**
   * WHAT IS WORTH COMING BACK TO, remembered across launches.
   *
   * The state above dies with the process, and the process is exactly
   * what dies while a phone sits in a pocket with no wifi. Without a
   * note on disk, a reader who reopens the app is back to a reciter
   * row that offers only Delete — which is issue #55 with one extra
   * step. Cleared on a run that completed or was cancelled, because
   * neither is something to resume.
   */
  if (interrupted) void rememberPendingJob(job);
  else void forgetPendingJob();
  // A stopped download stops the ones behind it too: cancelled by hand,
  // or by the connection going — the next one would only stall the same
  // way, and its "stopped" would bury this one's.
  if (cancelledByUser || interrupted) queued = [];
  void finishDownloadNotification({
    complete,
    cancelled: cancelledByUser,
    failed,
    interrupted,
    doneTitle: text.doneTitle,
    doneBody: text.doneBody,
    incompleteTitle: noSpace
      ? i18n.t('quran.downloadNoSpaceTitle')
      : text.incompleteTitle,
    incompleteBody: noSpace
      ? i18n.t('quran.downloadNoSpaceBody', error?.params)
      : text.incompleteBody(failed),
    stoppedTitle: text.stoppedTitle,
    stoppedBody: text.stoppedBody(done, total),
    route: ROUTE_QURAN_DOWNLOADS,
  });
  startNextQueued();
}

/**
 * ── COMING BACK TO A DOWNLOAD THAT STOPPED — issue #55 ────────────────
 *
 * There is nothing to rewind and no byte range to negotiate: these
 * downloads are thousands of small files and a file already on disk is
 * skipped (`runAyahQueue`). Resuming is therefore the same call again,
 * and the only thing that was ever missing was a way to make it.
 *
 * Two sources for "there is something to resume", and they answer
 * different questions. `state.last` is this session's: precise, knows how
 * far it got, gone when the process is. The note on disk is the one that
 * survives the pocket, and is what the reader meets when they open the
 * app on the train home.
 */
export function resumableJob(): QuranDownloadJob | null {
  if (state.running) return null;
  const last = state.last;
  if (last && last.interrupted) return last.job;
  return pendingJob;
}

/** Start the job that stopped, if there is one. Returns whether it did. */
export function resumeQuranDownload(): boolean {
  const job = resumableJob();
  return job ? startQuranDownload(job) : false;
}

/**
 * Forget the stopped run — the reader said no, or dealt with it another
 * way. The files stay; only the offer goes.
 */
export function dismissResumableJob(): void {
  pendingJob = null;
  void forgetPendingJob();
  if (state.last?.interrupted) {
    publish({ ...state, last: { ...state.last, interrupted: false } });
  }
}

/**
 * The note on disk. Device-local by nature — it is about this phone's
 * files — so it is a plain key rather than anything the sync blob carries.
 */
const PENDING_KEY = 'mihrab.quran.download.pending';
let pendingJob: QuranDownloadJob | null = null;

function validJob(value: unknown): QuranDownloadJob | null {
  if (!value || typeof value !== 'object') return null;
  const job = value as Record<string, unknown>;
  if (job.kind === 'fonts') {
    return job.set === 'tajweed-light' || job.set === 'tajweed-dark'
      ? { kind: 'fonts', set: job.set }
      : { kind: 'fonts' };
  }
  if (job.kind === 'wordMeanings') return { kind: 'wordMeanings' };
  if (job.kind === 'riwayah') {
    const def = RIWAYAT.find(r => r.id === job.riwayahId);
    if (!def || def.id === 'hafs') return null;
    return typeof job.url === 'string' && /^https:\/\//i.test(job.url)
      ? { kind: 'riwayah', riwayahId: def.id, url: job.url }
      : { kind: 'riwayah', riwayahId: def.id };
  }
  if (job.kind === 'tafsir') {
    return typeof job.editionId === 'string' && findTafsirEdition(job.editionId)
      ? { kind: 'tafsir', editionId: job.editionId }
      : null;
  }
  if (typeof job.reciterId !== 'string' || !job.reciterId) return null;
  if (job.kind === 'audio') return { kind: 'audio', reciterId: job.reciterId };
  if (job.kind === 'surah' && typeof job.surah === 'number') {
    // WITHOUT the refs. They were the gap as it stood an hour ago, and
    // the reader may have listened since; the queue re-reads the disk and
    // skips what is there, which is the same answer made of facts.
    return { kind: 'surah', reciterId: job.reciterId, surah: job.surah };
  }
  return null;
}

async function rememberPendingJob(job: QuranDownloadJob): Promise<void> {
  pendingJob = job;
  try {
    const stored =
      job.kind === 'surah' ? { kind: job.kind, reciterId: job.reciterId, surah: job.surah } : job;
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(stored));
  } catch {
    // The offer is then only as durable as the process, which is the
    // behaviour without this note at all — not a reason to fail a run.
  }
}

async function forgetPendingJob(): Promise<void> {
  pendingJob = null;
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    /* a note that will not go away is harmless: the job is startable */
  }
}

/**
 * Read the note. Called once at startup, before anything asks.
 *
 * A job whose files are all there by now — the reader finished it on the
 * other device, or deleted the reciter — is dropped rather than offered:
 * `startQuranDownload` on a complete reciter would walk 6,236 files to do
 * nothing, and the offer would be a lie about work remaining.
 */
export async function hydrateResumableJob(): Promise<QuranDownloadJob | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const job = validJob(JSON.parse(raw));
    if (!job) {
      await forgetPendingJob();
      return null;
    }
    if (job.kind === 'riwayah' && riwayahProvenance(job.riwayahId)) {
      await forgetPendingJob();
      return null;
    }
    if (job.kind === 'audio') {
      const stats = await reciterAudioStats(job.reciterId);
      if (stats.complete || stats.files === 0) {
        await forgetPendingJob();
        return null;
      }
    }
    pendingJob = job;
    publish({ ...state });
    return job;
  } catch {
    return null;
  }
}

/** Stop it. Whatever landed on disk stays there and is usable. */
export function cancelQuranDownload(): void {
  const run = current;
  if (!run || run.settled) return;
  cancelledByUser = true;
  try {
    run.inner?.cancel();
  } catch {
    // A cancel that throws must still end the run; the watchdog would,
    // but a person who pressed Stop should not wait six minutes for it.
    finishRun(run, { complete: false, interrupted: false });
  }
}

/** For tests. */
export function resetQuranDownloadState(): void {
  if (current?.watchdog) clearTimeout(current.watchdog);
  current = null;
  cancelledByUser = false;
  lastPublishedPct = -1;
  pendingJob = null;
  queued = [];
  listeners.clear();
  state = { running: null, progress: EMPTY_PROGRESS, last: null };
}
