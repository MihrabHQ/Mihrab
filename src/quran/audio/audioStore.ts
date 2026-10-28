/**
 * Offline recitation store — QR-18 (docs/quran-reader-plan.md).
 *
 * Per-surah MP3 downloads into the managed content store:
 *
 *   <Documents>/quran/audio/{reciterId}/{SSS}{AAA}.mp3
 *   <Documents>/quran/timings/{reciterId}.json
 *
 * Same worker-pool + `.part`-then-move pattern as the mushaf store
 * (`mushafDownload.ts`), so a killed app never leaves a truncated MP3
 * where the player would find it.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  CONTENT_DEADLINES,
  fetchContentOnce,
  GIVE_UP_AFTER_CONSECUTIVE_FAILURES,
  withDownloadDeadline,
  withStallDeadline,
  type DownloadOutcome,
} from '../contentNetwork';
import { mkdirDeep } from '../mushafDownload';
import { SURAHS } from '../quran';
import {
  ayahAudioFileName,
  ayahAudioUrl,
  findReciter,
  isWholeSurah,
  RECITERS,
  reciterTimingsUrl,
  surahAudioUrl,
  type Reciter,
} from './reciters';
import {
  excludedSurahs,
  expectedSurahBytes,
  surahExcluded,
  surahRecitationBytes,
} from './surahRecitation';
import { freeDiskBytes, SPACE_MARGIN_BYTES, sizeLabel } from '../downloadSpace';

function audioDir(reciterId: string): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/audio/${reciterId}`;
}

function timingsDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/timings`;
}

export function timingsFilePath(reciterId: string): string {
  return `${timingsDir()}/${reciterId}.json`;
}

export function ayahAudioFilePath(
  reciterId: string,
  surah: number,
  ayah: number,
): string {
  return `${audioDir(reciterId)}/${ayahAudioFileName(surah, ayah)}`;
}

/**
 * A whole-surah recitation keeps each surah in one file, `SSS.mp3` — never
 * to be mistaken for an ayah's `SSSAAA.mp3` (`parseAyahFileName`).
 */
export function surahAudioFilePath(reciterId: string, surah: number): string {
  return `${audioDir(reciterId)}/${String(surah).padStart(3, '0')}.mp3`;
}

/** `007.mp3` back into a surah, or null. */
export function parseSurahFileName(name: string): number | null {
  const m = /^(\d{3})\.mp3$/.exec(name);
  if (!m) return null;
  const surah = Number(m[1]);
  return surah >= 1 && surah <= 114 ? surah : null;
}

/**
 * Is this the file the boundaries were measured on? Exactly its size, or
 * not used at all — see surahRecitation.ts, "the sizes are the safety".
 */
async function surahFileExact(
  reciterId: string,
  surah: number,
  path: string,
): Promise<boolean> {
  const want = expectedSurahBytes(reciterId, surah);
  if (want == null) return false;
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return false;
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return Number(stat.size) === want;
  } catch {
    return false;
  }
}

/**
 * A whole-surah recitation's file for this surah — only when it is on
 * disk at exactly the size it was measured at. A file cut short, damaged,
 * or of another recording reads as not downloaded, so the reader is
 * offered the download again rather than an ayah cut in the wrong place.
 */
export async function localSurahFileIfAny(
  reciterId: string,
  surah: number,
): Promise<string | null> {
  const path = surahAudioFilePath(reciterId, surah);
  return (await surahFileExact(reciterId, surah, path)) ? path : null;
}

/**
 * ── A SURAH CHANGED AT ITS SOURCE ─────────────────────────────────────
 *
 * Downloaded twice and the wrong size both times: the server is serving a
 * different file from the one the boundaries were measured on. Fetching it
 * a third time on every Continue would never help, and playing it would
 * cut it in the wrong places. So it is marked — a small file beside where
 * the audio would be — and that one surah says it cannot be played in this
 * voice until the app's boundaries are measured again. The rest of the
 * recitation plays as before. Deleting the reciter clears the mark, and a
 * later download that does come in at the right size clears it too.
 */
function changedMarkPath(reciterId: string, surah: number): string {
  return `${surahAudioFilePath(reciterId, surah)}.changed`;
}

/** Whether this surah of a whole-surah recitation changed at its source. */
export async function surahChangedAtSource(
  reciterId: string,
  surah: number,
): Promise<boolean> {
  // A surah the recording does not hold whole (the table's `x`) is blocked
  // the same way, for good: nothing fetches, streams or plays it.
  if (surahExcluded(reciterId, surah)) return true;
  try {
    return await ReactNativeBlobUtil.fs.exists(changedMarkPath(reciterId, surah));
  } catch {
    return false;
  }
}

/** The surahs of a whole-surah recitation marked as changed at the source. */
export async function surahsChangedAtSource(reciterId: string): Promise<number[]> {
  const out = new Set(excludedSurahs(reciterId));
  try {
    const dir = audioDir(reciterId);
    if (await ReactNativeBlobUtil.fs.exists(dir)) {
      for (const n of await ReactNativeBlobUtil.fs.ls(dir)) {
        const m = /^(\d{3})\.mp3\.changed$/.exec(n);
        if (m) out.add(Number(m[1]));
      }
    }
  } catch {
    // the marks could not be read: the excluded surahs still stand
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * One surah of a whole-surah recitation, as the ayah sheet shows it: on
 * the device at its exact size, changed at the source (nothing will fetch
 * it), or neither — downloadable, and streamable while online.
 */
export type SurahFileState = 'here' | 'changed' | 'absent';

export async function surahFileState(
  reciterId: string,
  surah: number,
): Promise<SurahFileState> {
  if (await surahChangedAtSource(reciterId, surah)) return 'changed';
  return (await localSurahFileIfAny(reciterId, surah)) ? 'here' : 'absent';
}

/** Delete one surah of a whole-surah recitation. Returns whether it was there. */
export async function deleteSurahFile(reciterId: string, surah: number): Promise<boolean> {
  const path = surahAudioFilePath(reciterId, surah);
  try {
    const there = await ReactNativeBlobUtil.fs.exists(path);
    if (there) await ReactNativeBlobUtil.fs.unlink(path);
    return there;
  } catch {
    return false;
  }
}

/**
 * ── STREAMING, WITHOUT GIVING UP THE SAFETY ───────────────────────────
 *
 * The rule is "only the recording the boundaries were measured on", and
 * that needs the file's SIZE, not the file. Before a surah is streamed the
 * server is asked how big it is — a request for headers, a few hundred
 * bytes — and only an exact match is streamed. The answer is kept for the
 * session, so a listen across a surah asks once.
 *
 *   ok          the server has the recording: stream it
 *   changed     it serves something else: not played (and not marked on
 *               disk — two downloads at the wrong size do that)
 *   unreachable no answer: offline, or the server down; not played, and
 *               asked again next time
 */
export type RemoteSurahCheck = 'ok' | 'changed' | 'unreachable';

const remoteChecks = new Map<string, Promise<RemoteSurahCheck>>();

export function checkRemoteSurah(
  reciterId: string,
  surah: number,
): Promise<RemoteSurahCheck> {
  const key = `${reciterId}:${surah}`;
  const known = remoteChecks.get(key);
  if (known) return known;
  const run = (async (): Promise<RemoteSurahCheck> => {
    const want = expectedSurahBytes(reciterId, surah);
    if (want == null) return 'changed';
    try {
      const res = await fetchContentOnce(
        surahAudioUrl(findReciter(reciterId), surah),
        { method: 'HEAD' },
        CONTENT_DEADLINES.surahCheck,
      );
      if (!res.ok) return 'unreachable';
      const size = Number(res.headers.get('content-length'));
      if (!Number.isFinite(size) || size <= 0) return 'unreachable';
      return size === want ? 'ok' : 'changed';
    } catch {
      return 'unreachable';
    }
  })();
  remoteChecks.set(key, run);
  // Only a definite answer is worth keeping: unreachable is asked again.
  void run.then(r => {
    if (r === 'unreachable') remoteChecks.delete(key);
  });
  return run;
}

/** For tests: forget what the servers said. */
export function _resetRemoteSurahChecksForTests(): void {
  remoteChecks.clear();
}

/**
 * ── KEEPING WHAT IS LISTENED TO ───────────────────────────────────────
 *
 * The EveryAyah voices save the next few ayahs to disk as they play, and a
 * long listen ends up entirely local. A whole-surah recitation does the
 * same for the surah it is playing: fetched quietly in the background,
 * checked at its exact size, and from then on played from the device —
 * offline, next time, without asking.
 *
 * Only surahs up to QUIET_SURAH_LIMIT. Saving the short ones is cheap and
 * they are the ones people return to; saving al-Baqarah because one ayah
 * of it was played would spend two hundred megabytes nobody asked for.
 * The long ones stream, and are a tap away in the ayah sheet.
 */
export const QUIET_SURAH_LIMIT = 30 * 1024 * 1024;

const quietFetches = new Map<string, Promise<string | null>>();

export function keepSurahQuietly(reciterId: string, surah: number): Promise<string | null> {
  const key = `${reciterId}:${surah}`;
  const running = quietFetches.get(key);
  if (running) return running;
  const run = (async (): Promise<string | null> => {
    const want = expectedSurahBytes(reciterId, surah);
    if (want == null || want > QUIET_SURAH_LIMIT) return null;
    const here = await localSurahFileIfAny(reciterId, surah);
    if (here) return here;
    if (await surahChangedAtSource(reciterId, surah)) return null;
    // Room for it, with the margin every download leaves the system.
    const free = await freeDiskBytes();
    if (free != null && free < want + SPACE_MARGIN_BYTES) return null;
    const path = surahAudioFilePath(reciterId, surah);
    try {
      await mkdirDeep(audioDir(reciterId));
      await fetchSurahFile(findReciter(reciterId), surah, path, () => undefined, () => false);
      return (await localSurahFileIfAny(reciterId, surah)) ?? null;
    } catch {
      return null;
    }
  })();
  quietFetches.set(key, run);
  void run.finally(() => quietFetches.delete(key));
  return run;
}

async function fileValid(path: string, minBytes = 1000): Promise<boolean> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return false;
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return Number(stat.size) > minBytes;
  } catch {
    return false;
  }
}

/** Is every ayah of a surah on disk for this reciter? */
export async function isSurahDownloaded(
  reciterId: string,
  surah: number,
): Promise<boolean> {
  const meta = SURAHS.find(s => s.number === surah);
  if (!meta) return false;
  for (let a = 1; a <= meta.ayahCount; a++) {
    if (!(await fileValid(ayahAudioFilePath(reciterId, surah, a)))) {
      return false;
    }
  }
  return true;
}

/** Which of an ayah's audio exists locally? Sync-ish helper for queueing. */
export async function localAudioPathIfAny(
  reciterId: string,
  surah: number,
  ayah: number,
): Promise<string | null> {
  const path = ayahAudioFilePath(reciterId, surah, ayah);
  return (await fileValid(path)) ? path : null;
}

export type AudioDownloadProgress = {
  done: number;
  total: number;
  failed: number;
};

export type AudioDownloadHandle = {
  /** How it ended — see `DownloadOutcome`, and issue #55 for why three. */
  promise: Promise<DownloadOutcome>;
  cancel: () => void;
};

/** Smallest believable MP3 — anything under this is a bad download. */
const MIN_AUDIO_BYTES = 1000;

const B64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The first `count` bytes of a base64 string, decoded.
 *
 * Only the prefix, because that is all anybody here wants and a whole
 * decode of forty kilobytes to look at four bytes is a waste on a phone.
 */
/* eslint-disable no-bitwise -- base64 and MPEG frame syncs are bit work;
   spelling them with arithmetic would be the same thing, less legibly. */
export function base64Prefix(b64: string, count: number): number[] {
  const out: number[] = [];
  const chars = b64.replace(/[^A-Za-z0-9+/]/g, '');
  for (let i = 0; i + 1 < chars.length && out.length < count; i += 4) {
    const quad = [0, 1, 2, 3].map(k => B64.indexOf(chars[i + k] ?? 'A'));
    if (quad[0] < 0 || quad[1] < 0) break;
    out.push(((quad[0] << 2) | (quad[1] >> 4)) & 0xff);
    if (out.length < count && quad[2] >= 0) {
      out.push(((quad[1] << 4) | (quad[2] >> 2)) & 0xff);
    }
    if (out.length < count && quad[3] >= 0) {
      out.push(((quad[2] << 6) | quad[3]) & 0xff);
    }
  }
  return out.slice(0, count);
}

/**
 * Is this actually an MP3?
 *
 * ── WHY A SIZE CHECK IS NOT ENOUGH ────────────────────────────────────
 *
 * The downloader accepted anything over a kilobyte that arrived with a
 * 200. A captive portal — hotel wifi, a train, a corporate proxy — answers
 * every request with 200 and a login page, and a login page is several
 * kilobytes of HTML. That file lands in the audio folder under an ayah's
 * name, passes every check this store had, counts as downloaded, and is
 * silent when it is played. Offline, weeks later, with no way to tell it
 * from a real one.
 *
 * Which is one of the shapes #30 describes: "downloaded audio will not
 * play offline". Two bytes of the file say whether it is audio at all.
 *
 * An MP3 begins with an ID3 tag or an MPEG frame sync — eleven set bits.
 * HTML begins with `<`, JSON with `{`, and neither survives this.
 */
export function looksLikeMp3(head: readonly number[]): boolean {
  if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    return true; // "ID3"
  }
  return head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
}
/* eslint-enable no-bitwise */

/**
 * The first four bytes of a file — without reading the rest of it.
 *
 * An ayah is tens of kilobytes and reading it whole cost nothing. A
 * whole-surah file is up to two hundred megabytes, and reading that into
 * a base64 string to look at four bytes of it is how a phone runs out of
 * memory. `slice` copies the four bytes to a file of their own.
 */
async function headBytes(path: string): Promise<number[]> {
  const head = `${path}.head`;
  try {
    await ReactNativeBlobUtil.fs.slice(path, head, 0, 4);
    const b64 = await ReactNativeBlobUtil.fs.readFile(head, 'base64');
    return base64Prefix(String(b64), 4);
  } finally {
    await ReactNativeBlobUtil.fs.unlink(head).catch(() => undefined);
  }
}

/**
 * Throw — and delete — if what landed at `path` is not audio.
 *
 * Deleting is the point. A file left behind is a file the next status
 * scan counts, the next repair skips, and the reader hears nothing from.
 */
async function verifyAudioFile(path: string, what: string): Promise<void> {
  let head: number[] = [];
  try {
    head = await headBytes(path);
  } catch {
    // Unreadable is its own failure; fall through to the throw below.
  }
  if (looksLikeMp3(head)) return;
  await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
  throw new Error(`${what}: not audio`);
}

/**
 * Last-resort transport: RN's own networking stack, via base64.
 *
 * `ReactNativeBlobUtil`'s streaming downloader is the one to want, but on
 * some networks EVERY request through it dies with "Download interrupted"
 * — the Android emulator's NAT does exactly that, and so do some
 * corporate proxies. The font store learned this and carries the fix; the
 * timings fetch learned it after that. The MP3s never did.
 *
 * An ayah is tens of kilobytes, so holding one in memory for the length of
 * one write is not the problem it would be for a font.
 */
async function fetchAyahViaRNFetch(url: string, dest: string): Promise<void> {
  // A deadline, because this is the path a broken network ROUTES TO. Once
  // `streamingAudioWorks` is false every ayah comes through here, and an
  // untimed fetch on a stalled connection never settles — the caller's
  // retry loop below never gets its turn.
  const response = await fetchContentOnce(
    url,
    undefined,
    CONTENT_DEADLINES.ayahAudio,
  );
  if (!response.ok) throw new Error(`ayah: HTTP ${response.status}`);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ayah: read failed'));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  if (base64.length < MIN_AUDIO_BYTES) throw new Error('ayah: truncated');
  await ReactNativeBlobUtil.fs.unlink(dest).catch(() => undefined);
  await ReactNativeBlobUtil.fs.writeFile(dest, base64, 'base64');
  await verifyAudioFile(dest, 'ayah');
}

/**
 * WHY A WHOLE-QURAN DOWNLOAD APPEARED TO HANG.
 *
 * Reported 2026-09-04: it gets stuck every time. It was not stuck — it was
 * failing 6,236 times in the slowest possible way.
 *
 * On a network where the streaming transport cannot work, every ayah spent
 * two doomed requests, a 60-second watchdog apiece, and 1.2 s of backoff
 * before falling over. Four workers doing that in parallel is a progress
 * bar that moves a few files a minute and a screen that looks frozen. The
 * font store hit exactly this and wrote it down: "the whole reason the
 * download crawled and appeared to freeze in blocks."
 *
 * So the same cure. One streaming failure condemns the transport for the
 * rest of the RUN and everything after it goes straight to the fallback.
 *
 * The run, not the session — changed for issue #55. The commonest reason
 * streaming fails is the connection going away, and a reader who walks
 * out of wifi at 85% and taps Resume an hour later was being handed the
 * slow transport for the rest of the day over a network that no longer
 * exists. A new run is new evidence, so it gets the fast path again and
 * condemns it again in one failure if it is still wrong. Playback's
 * prefetch shares the flag and rides along with whatever the last run
 * learned, which is the best evidence there is between runs.
 */
let streamingAudioWorks = true;

/** Rate-limited telemetry, so a slow run can be diagnosed from a log. */
const audioStats = { retries: 0, failures: 0, lastLog: 0, startedAt: 0 };

function noteAudioProgress(done: number, total: number): void {
  const now = Date.now();
  if (audioStats.startedAt === 0) audioStats.startedAt = now;
  if (now - audioStats.lastLog < 5000) return;
  audioStats.lastLog = now;
  const secs = Math.max(0.001, (now - audioStats.startedAt) / 1000);
  console.log(
    `[quranAudio] ${done}/${total} · ${(done / secs).toFixed(1)} files/s · ` +
      `streaming=${streamingAudioWorks} · retries=${audioStats.retries} · ` +
      `failed=${audioStats.failures}`,
  );
}

/** One ayah's audio, on disk, or a throw. Up to 3 attempts. */
async function fetchAyahFile(
  reciter: Reciter,
  surah: number,
  ayah: number,
  path: string,
): Promise<void> {
  // Transient stream resets are common on multiplexed CDN connections
  // (same pattern as mushafDownload).
  let lastError: unknown = null;
  const url = ayahAudioUrl(reciter, surah, ayah);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const tmp = `${path}.part`;
    try {
      if (attempt > 1) audioStats.retries += 1;
      // Straight to the fallback once streaming has been condemned, and
      // on the last attempt regardless — a file worth three tries is
      // worth trying the other transport at least once.
      if (attempt === 3 || !streamingAudioWorks) {
        await fetchAyahViaRNFetch(url, path);
        return;
      }
      // No RNBlobUtil `timeout` config — it breaks Android downloads
      // outright; `withDownloadDeadline` races it in JS instead.
      const res = await withDownloadDeadline(
        ReactNativeBlobUtil.config({ path: tmp, overwrite: true }).fetch(
          'GET',
          url,
        ),
        CONTENT_DEADLINES.ayahAudio,
        'audio fetch',
      );
      const stat = await ReactNativeBlobUtil.fs.stat(tmp).catch(() => null);
      if (
        res.info().status !== 200 ||
        !stat ||
        Number(stat.size) <= MIN_AUDIO_BYTES
      ) {
        throw new Error(`ayah ${surah}:${ayah}`);
      }
      await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
      await ReactNativeBlobUtil.fs.mv(tmp, path);
      // A 200 is not proof of audio — see `looksLikeMp3`. Checked after
      // the move so the file that gets verified is the file that stays.
      await verifyAudioFile(path, `ayah ${surah}:${ayah}`);
      return;
    } catch (e) {
      lastError = e;
      // The streaming transport just failed. It is condemned for the rest
      // of the session rather than retried 6,235 more times.
      if (streamingAudioWorks && attempt < 3) {
        streamingAudioWorks = false;
        console.warn(
          '[quranAudio] streaming transport failed; using RN fetch for the rest of this session',
          e,
        );
      }
      await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
      if (attempt < 3) {
        await new Promise<void>(r => setTimeout(r, 400 * attempt));
      }
    }
  }
  audioStats.failures += 1;
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** For tests: a fresh session's optimism about the transport. */
export function _resetAudioTransportForTests(): void {
  streamingAudioWorks = true;
  audioStats.retries = 0;
  audioStats.failures = 0;
  audioStats.lastLog = 0;
  audioStats.startedAt = 0;
}

/** How many workers pull from a download queue at once. */
const WORKERS = 4;

/**
 * Work a queue of ayahs down to nothing, four at a time.
 *
 * Shared by the one-surah download and the whole-Quran one, which differ
 * only in the length of the list. A file already on disk and big enough to
 * be real is skipped, and THAT is the whole of the resume story: a run
 * that was cancelled at ayah four thousand starts again from the top and
 * spends a few seconds walking past what it already has. No index, no
 * checkpoint, nothing to get out of step with the files themselves.
 *
 * A failure is counted, never thrown — six thousand files over a phone
 * connection will drop some, and losing the other five thousand nine
 * hundred over it would be absurd. What failed is left for the next run to
 * find missing.
 */
function runAyahQueue(
  reciterId: string,
  queue: Array<{ surah: number; ayah: number }>,
  onProgress?: (p: AudioDownloadProgress) => void,
): AudioDownloadHandle {
  const reciter: Reciter = findReciter(reciterId);
  const total = queue.length;
  const pending = [...queue];
  let cancelled = false;
  let done = 0;
  let failed = 0;
  /**
   * Failures with no success between them — the signal that it is the
   * connection rather than the files (`GIVE_UP_AFTER_CONSECUTIVE_FAILURES`).
   */
  let inARow = 0;
  let interrupted = false;

  const run = async (): Promise<DownloadOutcome> => {
    if (total === 0) return { complete: false, interrupted: false };
    // A new run is new evidence about the transport; see the note on
    // `streamingAudioWorks`.
    streamingAudioWorks = true;
    await mkdirDeep(audioDir(reciterId));

    // ── THE WORDS COME WITH THE AUDIO — issue #30 ────────────────────
    //
    // "Plays start to finish in aeroplane mode WITH THE TEXT
    // SYNCHRONISED" is the whole of #30's first condition, and the
    // synchronising half was never downloaded with the audio. Timings
    // are fetched the first time the highlight needs them, which is
    // during ONLINE playback — so a reader who downloaded a surah and
    // went straight to a plane had every MP3 and no word timing, and the
    // highlight silently fell back to the ayah.
    //
    // One file per reciter, cached on disk by `loadReciterTimings`, and
    // free after the first time. Awaited so it is on disk before the
    // download reports success, and swallowed so it can never fail an
    // audio download: the words are best-effort, the recitation is not.
    await loadReciterTimings(reciterId).catch(() => null);

    const worker = async (): Promise<void> => {
      while (!cancelled && !interrupted) {
        const next = pending.shift();
        if (next == null) return;
        const path = ayahAudioFilePath(reciterId, next.surah, next.ayah);
        try {
          if (!(await fileValid(path))) {
            await fetchAyahFile(reciter, next.surah, next.ayah, path);
          }
          inARow = 0;
        } catch {
          failed += 1;
          inARow += 1;
          /**
           * THE CONNECTION IS GONE — issue #55.
           *
           * Without this the queue walks the remaining six thousand
           * files and fails each of them three times, which on a stalled
           * connection is three sixty-second deadlines apiece: hours of
           * a phone's radio to arrive at a number that was knowable in
           * the first ten seconds. And the number it arrives at is
           * "5,900 failed", which is how a download that was 85% done
           * came to be reported as a failure.
           *
           * Stop, keep every byte, and say which ending this was. The
           * files already on disk are the resume.
           */
          if (inARow >= GIVE_UP_AFTER_CONSECUTIVE_FAILURES) interrupted = true;
        } finally {
          done += 1;
          noteAudioProgress(done, total);
          onProgress?.({ done, total, failed });
        }
      }
    };

    await Promise.all(Array.from({ length: WORKERS }, () => worker()));
    return {
      complete: !cancelled && !interrupted && failed === 0,
      // Cancelling is a person; it is never an interruption to come back
      // from, however it ended the queue.
      interrupted: interrupted && !cancelled,
    };
  };

  return {
    promise: run(),
    cancel: () => {
      cancelled = true;
    },
  };
}

/**
 * Download one surah for a reciter: its ayah files (skipping valid ones),
 * or for a whole-surah recitation its one file — checked against its
 * exact size like every file of the full download, and counted in
 * megabytes the same way.
 */
export function downloadSurahAudio(
  reciterId: string,
  surah: number,
  onProgress?: (p: AudioDownloadProgress) => void,
): AudioDownloadHandle {
  if (isWholeSurahId(reciterId)) {
    return runSurahFileQueue(reciterId, onProgress, [surah]);
  }
  const meta = SURAHS.find(s => s.number === surah);
  if (!meta) {
    return {
      promise: Promise.resolve({ complete: false, interrupted: false }),
      cancel: () => undefined,
    };
  }
  const queue = Array.from({ length: meta.ayahCount }, (_, i) => ({
    surah,
    ayah: i + 1,
  }));
  return runAyahQueue(reciterId, queue, onProgress);
}

/**
 * `007001.mp3` back into an ayah. Null for anything that is not one —
 * `.part` files, a stray timings file, whatever a file manager left.
 */
export function parseAyahFileName(
  name: string,
): { surah: number; ayah: number } | null {
  const m = /^(\d{3})(\d{3})\.mp3$/.exec(name);
  if (!m) return null;
  const surah = Number(m[1]);
  const ayah = Number(m[2]);
  if (surah < 1 || surah > 114 || ayah < 1) return null;
  return { surah, ayah };
}

export type SurahAudioStatus = {
  surah: number;
  /** Ayahs in this surah. */
  total: number;
  /** How many of them are on disk. */
  have: number;
  /** The ones that are not, in order. Empty when `have === total`. */
  missing: number[];
};

/**
 * How much of one surah is actually on disk — issue #30.
 *
 * ── WHY A BOOLEAN WAS NOT ENOUGH ──────────────────────────────────────
 *
 * `isSurahDownloaded` answers yes or no, and the download row asked it
 * exactly that. So a surah that is 284 ayahs of 286 looks identical to
 * one that was never touched: "Download this surah". Tapping it repairs
 * the gap — the queue skips valid files — but nothing ever said there
 * was a gap, or that finishing it was two files rather than two hundred.
 * And a reader who has listened to half a surah online has half of it on
 * disk without knowing, then finds it stops partway through in the air.
 *
 * ONE directory listing, not `ayahCount` stats. `isSurahDownloaded` does
 * 286 sequential `exists`+`stat` round trips for al-Baqarah; this reads
 * the folder once and counts. Same floor as the downloader validates
 * against, so "on disk" means the same thing to both.
 */
export async function surahAudioStatus(
  reciterId: string,
  surah: number,
): Promise<SurahAudioStatus> {
  const meta = SURAHS.find(s => s.number === surah);
  const total = meta?.ayahCount ?? 0;
  const present = new Set<number>();
  try {
    const dir = audioDir(reciterId);
    if (await ReactNativeBlobUtil.fs.exists(dir)) {
      const entries = await ReactNativeBlobUtil.fs.lstat(dir).catch(() => []);
      for (const entry of entries) {
        const ref = parseAyahFileName(String(entry.filename ?? ''));
        if (!ref || ref.surah !== surah) continue;
        if ((Number(entry.size) || 0) <= MIN_AUDIO_BYTES) continue;
        present.add(ref.ayah);
      }
    }
  } catch {
    // An unreadable folder is an empty one: the answer is "download it".
  }
  const missing: number[] = [];
  for (let a = 1; a <= total; a++) if (!present.has(a)) missing.push(a);
  return { surah, total, have: total - missing.length, missing };
}

/**
 * Download exactly these ayahs. The repair path.
 *
 * `downloadSurahAudio` queues the whole surah and skips what is already
 * valid, which downloads the right bytes but reports the wrong thing: a
 * progress bar counting to 286 when four files are missing tells somebody
 * to expect a long wait. This queues only the gap, so the number on
 * screen is the work that is left.
 */
export function downloadAyahs(
  reciterId: string,
  refs: ReadonlyArray<{ surah: number; ayah: number }>,
  onProgress?: (p: AudioDownloadProgress) => void,
): AudioDownloadHandle {
  return runAyahQueue(reciterId, [...refs], onProgress);
}

/**
 * Delete one surah's audio for one reciter — issue #30 asked for stored
 * audio to be clearable, and per reciter was all there was.
 *
 * Returns how many files went, so the caller can say so rather than
 * claiming a deletion that deleted nothing.
 */
export async function deleteSurahAudio(
  reciterId: string,
  surah: number,
): Promise<number> {
  let removed = 0;
  try {
    const dir = audioDir(reciterId);
    if (!(await ReactNativeBlobUtil.fs.exists(dir))) return 0;
    const entries = await ReactNativeBlobUtil.fs.lstat(dir).catch(() => []);
    for (const entry of entries) {
      const name = String(entry.filename ?? '');
      const ref = parseAyahFileName(name);
      if (!ref || ref.surah !== surah) continue;
      await ReactNativeBlobUtil.fs.unlink(`${dir}/${name}`).catch(() => undefined);
      removed += 1;
    }
  } catch {
    /* nothing readable is nothing to delete */
  }
  return removed;
}

/** Every ayah in the book, in recitation order. */
export function allAyahRefs(): Array<{ surah: number; ayah: number }> {
  const refs: Array<{ surah: number; ayah: number }> = [];
  for (const s of SURAHS) {
    for (let a = 1; a <= s.ayahCount; a++) refs.push({ surah: s.number, ayah: a });
  }
  return refs;
}

/** 6,236. Computed rather than written down, so it cannot drift. */
export function totalAyahCount(): number {
  return SURAHS.reduce((sum, s) => sum + s.ayahCount, 0);
}

/**
 * The whole Quran in one reciter's voice.
 *
 * The same files the reader already streams and prefetches, into the same
 * folder — `<Documents>/quran/audio/{reciterId}/` — so this is not a
 * second copy of anything. Someone who downloads a reciter to listen to on
 * a flight has, by the same act, made the mushaf's play-from-here work
 * without a connection, and someone who has been reading with recitation
 * for a month finds this download already part-done.
 */
export function downloadReciterAudio(
  reciterId: string,
  onProgress?: (p: AudioDownloadProgress) => void,
): AudioDownloadHandle {
  if (isWholeSurah(findReciter(reciterId))) {
    return runSurahFileQueue(reciterId, onProgress);
  }
  return runAyahQueue(reciterId, allAyahRefs(), onProgress);
}

// ── Whole-surah recitations ──────────────────────────────────────────
//
// One file per surah (SURAH_FILE_RECITERS), played from the device only:
// the download is the whole recitation, 114 files and one to three and a
// half gigabytes, and it goes through the same manager, notification and
// space check as any reciter. What differs is the size of a file — up to
// two hundred megabytes for al-Baqarah — which changes three things:
//
//   • progress is counted in MEGABYTES, not files: a bar that sits at 0%
//     for the minute al-Baqarah takes reads as a stall;
//   • the deadline is on SILENCE, not on the whole file: no fixed time is
//     right for both an-Nās and al-Baqarah, and a file still arriving is
//     not a file to give up on;
//   • the in-memory fallback transport is for the small files only: a
//     file of two hundred megabytes cannot be held as a base64 string on
//     a phone, but a short surah can, and on a network where the streaming
//     transport never works (the emulator's NAT, some proxies) it is the
//     difference between juz ʿamma on the device and nothing.

/** One megabyte, as the download counts it — the same MB every size label prints. */
export const AUDIO_MB = 1024 * 1024;
const MB = AUDIO_MB;
/** Give up on a file when nothing at all has arrived for this long. */
const SURAH_STALL_MS = 60_000;
/** Fewer workers than for ayahs: these are big, and the pipe is one pipe. */
const SURAH_WORKERS = 2;
/** A surah file up to this size may come through RN's own fetch, held in memory once. */
const SURAH_FALLBACK_BYTES = 12 * MB;

/** A surah the server now serves at another size twice running. */
class SurahChangedAtSource extends Error {
  constructor(readonly surah: number) {
    super(`surah ${surah}: changed at the source`);
  }
}

/** The surahs the last run of each reciter could not fetch, for its notice. */
const lastFailedSurahs = new Map<string, number[]>();

/** Which surahs the last whole-surah download of this reciter left behind. */
export function failedSurahsOf(reciterId: string): number[] {
  return lastFailedSurahs.get(reciterId) ?? [];
}

/** One surah's file on disk, or a throw. Up to 3 attempts. */
async function fetchSurahFile(
  reciter: Reciter,
  surah: number,
  path: string,
  onBytes: (received: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const url = surahAudioUrl(reciter, surah);
  let lastError: unknown = null;
  let wrongSize = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const tmp = `${path}.part`;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    try {
      if (attempt > 1) audioStats.retries += 1;
      onBytes(0);
      // A deadline on silence, not on the whole file: see withStallDeadline.
      const guard = withStallDeadline(
        ReactNativeBlobUtil.config({ path: tmp, overwrite: true }).fetch('GET', url),
        SURAH_STALL_MS,
        `surah ${surah}`,
      );
      guard.task.progress({ interval: 500 }, received => {
        guard.alive();
        onBytes(Number(received) || 0);
      });
      // A person cancelling the download ends the file in flight too.
      watchdog = setInterval(() => {
        if (isCancelled()) guard.cancel();
      }, 1000);
      const res = await guard.result;
      const stat = await ReactNativeBlobUtil.fs.stat(tmp).catch(() => null);
      if (res.info().status !== 200 || !stat || Number(stat.size) <= MIN_AUDIO_BYTES) {
        throw new Error(`surah ${surah}: HTTP ${res.info().status}`);
      }
      // The size first, the bytes second: a file of any other size is not
      // the recording the boundaries fit (surahRecitation.ts).
      const want = expectedSurahBytes(reciter.id, surah);
      if (want != null && Number(stat.size) !== want) {
        wrongSize += 1;
        throw new Error(`surah ${surah}: ${stat.size} bytes, expected ${want}`);
      }
      await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
      await ReactNativeBlobUtil.fs.mv(tmp, path);
      await verifyAudioFile(path, `surah ${surah}`);
      await ReactNativeBlobUtil.fs.unlink(changedMarkPath(reciter.id, surah)).catch(() => undefined);
      return;
    } catch (e) {
      lastError = e;
      // Said in the log: a surah that never arrives is otherwise silent
      // where the notification cannot be shown.
      console.warn(`[audioStore] ${reciter.id} surah ${surah}, attempt ${attempt}: ${String(e)}`);
      await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
      if (isCancelled()) break;
      // Twice the wrong size is the source, not the connection: mark it
      // and stop asking (see "a surah changed at its source").
      if (wrongSize >= 2) {
        await ReactNativeBlobUtil.fs
          .writeFile(changedMarkPath(reciter.id, surah), String(lastError), 'utf8')
          .catch(() => undefined);
        throw new SurahChangedAtSource(surah);
      }
      if (attempt < 3) await new Promise<void>(r => setTimeout(r, 1000 * attempt));
    } finally {
      if (watchdog != null) clearInterval(watchdog);
    }
  }
  // The streaming transport failed three times and the file is small
  // enough to hold: once through RN's own networking, the way an ayah
  // file comes when the streaming transport cannot work on this network.
  const want = expectedSurahBytes(reciter.id, surah);
  if (!isCancelled() && wrongSize === 0 && want != null && want <= SURAH_FALLBACK_BYTES) {
    try {
      await fetchSurahViaRNFetch(url, path, want, onBytes);
      await ReactNativeBlobUtil.fs.unlink(changedMarkPath(reciter.id, surah)).catch(() => undefined);
      return;
    } catch (e) {
      lastError = e;
      console.warn(`[audioStore] ${reciter.id} surah ${surah}, RN fetch: ${String(e)}`);
    }
  }
  audioStats.failures += 1;
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** A small surah file through RN's own networking stack, checked to the byte like any other. */
async function fetchSurahViaRNFetch(
  url: string,
  dest: string,
  want: number,
  onBytes: (received: number) => void,
): Promise<void> {
  onBytes(0);
  const response = await fetchContentOnce(url, undefined, SURAH_STALL_MS);
  if (!response.ok) throw new Error(`surah: HTTP ${response.status}`);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('surah: read failed'));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  const tmp = `${dest}.part`;
  await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
  await ReactNativeBlobUtil.fs.writeFile(tmp, base64, 'base64');
  const stat = await ReactNativeBlobUtil.fs.stat(tmp).catch(() => null);
  if (!stat || Number(stat.size) !== want) {
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
    throw new Error(`surah: ${stat?.size ?? 0} bytes, expected ${want}`);
  }
  await ReactNativeBlobUtil.fs.unlink(dest).catch(() => undefined);
  await ReactNativeBlobUtil.fs.mv(tmp, dest);
  await verifyAudioFile(dest, 'surah');
  onBytes(want);
}

/**
 * What a run killed half-way leaves behind: `.part` files never finished,
 * `.head` files from the four-byte check. Swept at the start of a run, so
 * a cancelled download does not keep a few hundred megabytes nobody can see.
 */
async function clearLeftovers(reciterId: string): Promise<void> {
  try {
    const dir = audioDir(reciterId);
    const names = await ReactNativeBlobUtil.fs.ls(dir);
    for (const n of names) {
      if (n.endsWith('.part') || n.endsWith('.head')) {
        await ReactNativeBlobUtil.fs.unlink(`${dir}/${n}`).catch(() => undefined);
      }
    }
  } catch {
    /* nothing there is nothing to clear */
  }
}

/**
 * The whole recitation, file by file. The same resume story as the ayah
 * queue: a file on disk and big enough to be real is skipped.
 */
function runSurahFileQueue(
  reciterId: string,
  onProgress?: (p: AudioDownloadProgress) => void,
  /** Which surahs: the whole recitation when absent, or one (the ayah sheet). */
  only?: readonly number[],
): AudioDownloadHandle {
  const reciter = findReciter(reciterId);
  const pending = only ? [...only] : Array.from({ length: 114 }, (_, i) => i + 1);
  const totalBytes = only
    ? only.reduce((a, s) => a + (expectedSurahBytes(reciterId, s) ?? 0), 0)
    : surahRecitationBytes(reciterId) ?? estimatedReciterBytes(reciterId);
  const total = Math.max(1, Math.round(totalBytes / MB));
  let cancelled = false;
  let interrupted = false;
  let failed = 0;
  let inARow = 0;
  /** Bytes of the files finished, and of each file still arriving. */
  let settledBytes = 0;
  const arriving = new Map<number, number>();

  const report = () => {
    let bytes = settledBytes;
    for (const b of arriving.values()) bytes += b;
    onProgress?.({ done: Math.min(total, Math.floor(bytes / MB)), total, failed });
  };

  const failedSurahs: number[] = [];
  let noSpace: number | null = null;

  const run = async (): Promise<DownloadOutcome> => {
    await mkdirDeep(audioDir(reciterId));
    await clearLeftovers(reciterId);
    // Surahs already marked as changed at the source are not fetched again
    // on every Continue: they would only come in at the wrong size again.
    const changed = new Set(await surahsChangedAtSource(reciterId));
    lastFailedSurahs.set(reciterId, []);
    const worker = async (): Promise<void> => {
      while (!cancelled && !interrupted && noSpace == null) {
        const surah = pending.shift();
        if (surah == null) return;
        if (changed.has(surah)) {
          report();
          continue;
        }
        const path = surahAudioFilePath(reciterId, surah);
        try {
          if (!(await surahFileExact(reciterId, surah, path))) {
            // Room for this file before it starts, not a write that fails
            // half-way through two hundred megabytes. The margin is the
            // same one the run's own check keeps for the system.
            const want = expectedSurahBytes(reciterId, surah) ?? 0;
            const free = await freeDiskBytes();
            if (free != null && free < want + SPACE_MARGIN_BYTES) {
              noSpace = want + SPACE_MARGIN_BYTES - free;
              pending.unshift(surah);
              return;
            }
            await fetchSurahFile(
              reciter,
              surah,
              path,
              b => {
                arriving.set(surah, b);
                report();
              },
              () => cancelled,
            );
          }
          settledBytes += expectedSurahBytes(reciterId, surah) ?? 0;
          inARow = 0;
        } catch (e) {
          if (cancelled) return;
          failed += 1;
          failedSurahs.push(surah);
          // A source that changed is not the connection going.
          if (!(e instanceof SurahChangedAtSource)) {
            inARow += 1;
            if (inARow >= GIVE_UP_AFTER_CONSECUTIVE_FAILURES) interrupted = true;
          }
        } finally {
          arriving.delete(surah);
          report();
        }
      }
    };
    await Promise.all(Array.from({ length: SURAH_WORKERS }, () => worker()));
    lastFailedSurahs.set(reciterId, [...failedSurahs].sort((a, b) => a - b));
    if (noSpace != null && !cancelled) {
      return {
        complete: false,
        interrupted: false,
        error: {
          key: 'quran.downloadNoSpaceBody',
          fallback: 'This download needs {{size}} more free space. Free some up and try again.',
          params: { size: sizeLabel(noSpace) },
        },
      };
    }
    const names = failedSurahs
      .sort((a, b) => a - b)
      .map(n => SURAHS.find(x => x.number === n)?.romanized ?? String(n));
    return {
      complete: !cancelled && !interrupted && failed === 0,
      interrupted: interrupted && !cancelled,
      // Which ones, by name: "3 failed" is a number to wonder about, and
      // Continue fetches exactly these.
      ...(names.length > 0 && !interrupted
        ? {
            error: {
              key: 'quran.wholeSurahIncompleteBody',
              fallback: '{{count}} surahs did not download: {{names}}. Continue fetches just these.',
              params: { count: names.length, names: names.join(', ') },
            },
          }
        : {}),
    };
  };

  return {
    promise: run(),
    cancel: () => {
      cancelled = true;
    },
  };
}

/**
 * What a reciter's download counts and is complete at: 6,236 ayah files,
 * or 114 surah files for a whole-surah recitation.
 */
export function reciterFileTotal(reciterId: string): number {
  return isWholeSurahId(reciterId) ? 114 : totalAyahCount();
}

/**
 * Whether this id names a whole-surah recitation — read off the catalogue
 * itself, not through `findReciter`, which answers with the default voice
 * for one that cannot be played: its files on disk are still its own.
 */
function isWholeSurahId(reciterId: string): boolean {
  const r = RECITERS.find(x => x.id === reciterId);
  return r != null && isWholeSurah(r);
}

/**
 * Prefetch a single ayah MP3 — for gapless playback (v2.7.28) and for the
 * word reader, which needs the ayah on disk before it can play a slice.
 * Called by the playback orchestrator for upcoming queue items so long
 * listening sessions turn local (no network gap between ayahs) after
 * warmup. Best-effort: resolves the local path or null.
 *
 * It goes through `fetchAyahFile` — the same three attempts and the same
 * fall-back transport as the bulk download — because the streaming
 * transport alone is what fails on a NAT that stalls long responses (the
 * emulator's, some proxies'), and a prefetch that only ever tried that
 * one route came back null on those networks every time.
 */
export async function prefetchAyahAudio(
  reciterId: string,
  surah: number,
  ayah: number,
): Promise<string | null> {
  const path = ayahAudioFilePath(reciterId, surah, ayah);
  try {
    if (await fileValid(path)) return path;
    await mkdirDeep(audioDir(reciterId));
    await fetchAyahFile(findReciter(reciterId), surah, ayah, path);
    return path;
  } catch {
    return null;
  }
}

/**
 * The bitrate the reciter's files were encoded at, from the folder name.
 *
 * Every EveryAyah folder ends in it — `Husary_128kbps`, `Ghamadi_40kbps` —
 * and the spread is wide enough to matter: the same book is 1.4 GB in one
 * voice and 350 MB in another. Someone deciding whether to put this on
 * their phone is really asking about that number, so it is worth reading
 * rather than assuming.
 */
export function reciterBitrateKbps(reciter: Reciter): number {
  const match = /_(\d+)kbps$/.exec(reciter.folder);
  const kbps = match ? Number(match[1]) : NaN;
  // 64 is the middle of the catalog and the safe thing to say when a
  // folder ever stops following the convention.
  return Number.isFinite(kbps) && kbps > 0 ? kbps : 64;
}

/**
 * Roughly how long a whole recitation runs, in hours.
 *
 * Murattal readings of the whole book sit between about twenty and thirty
 * hours depending on the reciter's pace, and nothing in the catalog
 * carries its own duration. Twenty-four is the middle of that, and every
 * number derived from it is presented as "about" for exactly this reason —
 * it is the right order of magnitude for deciding whether a download fits
 * on a phone, and it is not a promise.
 */
const RECITATION_HOURS = 24;

/** About how many bytes a reciter's whole Quran will take. */
export function estimatedReciterBytes(reciterId: string): number {
  // A whole-surah recitation's size is known to the byte: it was measured
  // when its boundaries were (tools/surah-audio/align.py).
  const exact = surahRecitationBytes(reciterId);
  if (exact != null) return exact;
  const kbps = reciterBitrateKbps(findReciter(reciterId));
  return Math.round((RECITATION_HOURS * 3600 * kbps * 1000) / 8);
}

export type ReciterAudioStats = {
  /** Ayah files on disk for this reciter. */
  files: number;
  bytes: number;
  /** Every ayah in the book is here. */
  complete: boolean;
};

/**
 * What this reciter has on disk — one directory listing, not 6,236 stats.
 *
 * `lstat` on the folder returns every entry with its size in one call,
 * which is the difference between a screen that opens and one that thinks
 * about it for ten seconds. `.part` files are excluded: a half-written
 * ayah is not a downloaded one, and counting it would make a cancelled run
 * look further along than it is.
 */
export async function reciterAudioStats(
  reciterId: string,
): Promise<ReciterAudioStats> {
  const empty: ReciterAudioStats = { files: 0, bytes: 0, complete: false };
  try {
    const dir = audioDir(reciterId);
    if (!(await ReactNativeBlobUtil.fs.exists(dir))) return empty;
    const entries = await ReactNativeBlobUtil.fs.lstat(dir).catch(() => []);
    let files = 0;
    let bytes = 0;
    const wholeSurah = isWholeSurahId(reciterId);
    // A surah the recording does not hold is settled from the start: no
    // download will bring it, and none is asked for.
    const excluded = new Set(wholeSurah ? excludedSurahs(reciterId) : []);
    let changed = excluded.size;
    for (const entry of entries) {
      const name = String(entry.filename ?? '');
      const size = Number(entry.size) || 0;
      if (wholeSurah) {
        // A surah file counts only at its exact size; a changed-at-source
        // mark counts as settled, because no download will bring it.
        if (name.endsWith('.mp3.changed')) {
          if (!excluded.has(parseSurahFileName(name.slice(0, -'.changed'.length)) ?? 0)) changed += 1;
          continue;
        }
        const surah = parseSurahFileName(name);
        if (surah == null || excluded.has(surah)) continue;
        bytes += size;
        if (size === expectedSurahBytes(reciterId, surah)) files += 1;
        continue;
      }
      if (!name.endsWith('.mp3')) continue;
      // Same floor the downloader validates against, so "on disk" means
      // the same thing to both.
      if (size <= 1000) continue;
      files += 1;
      bytes += size;
    }
    return { files, bytes, complete: files + changed >= reciterFileTotal(reciterId) };
  } catch {
    return empty;
  }
}

/**
 * Every reciter with anything on disk, keyed by id.
 *
 * For the picker, which has to decide per row whether to offer a download
 * or a delete — and cannot ask forty-two times. One `ls` of the audio
 * folder names the reciters that have a directory at all, which on a real
 * device is nought to three of them, and only those are measured.
 */
export async function downloadedReciters(): Promise<
  Record<string, ReciterAudioStats>
> {
  const out: Record<string, ReciterAudioStats> = {};
  try {
    const base = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/audio`;
    if (!(await ReactNativeBlobUtil.fs.exists(base))) return out;
    const dirs = await ReactNativeBlobUtil.fs.ls(base).catch(() => []);
    for (const id of dirs) {
      const stats = await reciterAudioStats(id);
      // A directory with nothing usable in it is not a download. It is
      // what a cancelled run leaves behind, and offering to delete it
      // would be offering to delete nothing.
      if (stats.files > 0) out[id] = stats;
    }
  } catch {
    /* an unreadable folder is an empty one, for this purpose */
  }
  return out;
}

/** Delete all downloaded audio for one reciter. */
export async function deleteReciterAudio(reciterId: string): Promise<void> {
  try {
    await ReactNativeBlobUtil.fs.unlink(audioDir(reciterId));
  } catch {
    /* already gone */
  }
}

/** Bytes on disk across all reciters (Manage downloads UI). */
export async function audioDiskUsage(): Promise<number> {
  try {
    const base = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/audio`;
    if (!(await ReactNativeBlobUtil.fs.exists(base))) return 0;
    let sum = 0;
    const reciterDirs = await ReactNativeBlobUtil.fs.ls(base);
    for (const dir of reciterDirs) {
      const files = await ReactNativeBlobUtil.fs
        .lstat(`${base}/${dir}`)
        .catch(() => []);
      for (const f of files) sum += Number(f.size) || 0;
    }
    return sum;
  } catch {
    return 0;
  }
}

type TimingsJson = { [key: string]: number[][] };

/** Smallest believable timings file — anything under this is a bad download. */
const MIN_TIMINGS_BYTES = 10_000;

/**
 * Last-resort transport: RN's own networking stack, straight to a string.
 *
 * `ReactNativeBlobUtil`'s streaming downloader is the one to want, but on
 * some networks EVERY request through it dies with "Download interrupted"
 * — the Android emulator's NAT does exactly that, and so do some corporate
 * proxies. The font store learned this and carries the same fallback
 * (`fetchFontViaRNFetch`); the timings fetch did not, which is why the
 * word highlight was dead on the emulator no matter how often it retried:
 * every attempt used the one transport that cannot work there.
 *
 * A timings file is ~1.4 MB of JSON, so holding it in memory for the
 * length of one parse is not the problem it would be for a font.
 */
async function fetchTimingsViaRNFetch(url: string): Promise<string> {
  const response = await fetchContentOnce(
    url,
    undefined,
    CONTENT_DEADLINES.timings,
  );
  if (!response.ok) throw new Error(`timings: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length < MIN_TIMINGS_BYTES) throw new Error('timings: truncated');
  return text;
}

/**
 * Fetch (once) and cache a reciter's word-timing JSON. Resolves null on
 * any failure — word highlighting is strictly best-effort and must never
 * block playback.
 */
export async function loadReciterTimings(
  reciterId: string,
): Promise<TimingsJson | null> {
  // No timing data published for this reciter — skip the network round
  // trip entirely; the UI falls back to ayah-level highlighting.
  if (!findReciter(reciterId).hasTimings) return null;
  const path = timingsFilePath(reciterId);
  const url = reciterTimingsUrl(findReciter(reciterId));

  // Cached, and readable. A file that is there but will not parse is a bad
  // download, and keeping it would answer null for ever — see the expiry
  // policy in useWordTiming, which cannot help if the file never changes.
  if (await fileValid(path, MIN_TIMINGS_BYTES)) {
    try {
      return JSON.parse(String(await ReactNativeBlobUtil.fs.readFile(path, 'utf8')));
    } catch (e) {
      console.warn('audioStore: cached timings unreadable, refetching', e);
      await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
    }
  }

  const tmp = `${path}.part`;
  try {
    await mkdirDeep(timingsDir());
    // No `timeout` in the config: on Android it makes every download fail
    // instantly with "Download interrupted" (same note as the font store).
    // This one had no watchdog either, so a stalled origin hung the word
    // highlight for the life of the session with nothing to fall back to.
    const res = await withDownloadDeadline(
      ReactNativeBlobUtil.config({ path: tmp, overwrite: true }).fetch(
        'GET',
        url,
      ),
      CONTENT_DEADLINES.timings,
      'timings fetch',
    );
    const stat = await ReactNativeBlobUtil.fs.stat(tmp).catch(() => null);
    if (res.info().status !== 200 || !stat) {
      throw new Error(`timings: HTTP ${res.info().status}`);
    }
    await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
    await ReactNativeBlobUtil.fs.mv(tmp, path);
    return JSON.parse(String(await ReactNativeBlobUtil.fs.readFile(path, 'utf8')));
  } catch (streamError) {
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
    try {
      const text = await fetchTimingsViaRNFetch(url);
      const parsed: TimingsJson = JSON.parse(text);
      // Cache it, but the answer does not depend on the write: a device
      // that cannot write here should still highlight this session.
      await ReactNativeBlobUtil.fs
        .writeFile(path, text, 'utf8')
        .catch(() => undefined);
      return parsed;
    } catch (e) {
      console.warn('audioStore: timings unavailable', streamError, e);
      return null;
    }
  }
}
