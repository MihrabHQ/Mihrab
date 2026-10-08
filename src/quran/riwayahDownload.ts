/**
 * Fetching a muṣḥaf the app is not allowed to ship.
 *
 * ── WHAT THIS IS AND IS NOT ───────────────────────────────────────────
 *
 * It is not the download manager — `quranDownloadManager` runs this as
 * its `riwayah` job (`downloadRiwayah` below), so the shade, the queue,
 * the resume and the one-at-a-time rule are the same as for every other
 * download. This module is the install itself.
 *
 * What it IS, and the reason it is its own module, is the boundary
 * between "bytes from the internet" and "scripture on a device". Nothing
 * crosses it without `verifyRiwayahDataset` — the same function the CLI
 * importer runs, so a file that would have been refused on a maintainer's
 * laptop is refused on the phone too. The failure a reader must never
 * have is a muṣḥaf that renders beautifully and is quietly wrong.
 *
 * ── AND WHERE IT COMES FROM ───────────────────────────────────────────
 *
 * KFGQPC's terms are permissive — a free digital copy, for software use,
 * worldwide — and since October 2026 Mihrab keeps its own copy of each
 * muṣḥaf as a release asset (`config/mirrors.ts`), byte for byte what the
 * publisher serves. The one-button download asks that copy first and the
 * publisher second, so a publisher moving its URL does not take the
 * feature with it. Either way the file crosses the verifier below before
 * a word of it is drawn, and the provenance records which host it came
 * from.
 */
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { mirrorUrl, MIRROR_TAGS } from '../config/mirrors';
import { CONTENT_DEADLINES, type DownloadOutcome } from './contentNetwork';
import type { MushafDownloadHandle, MushafDownloadProgress } from './mushafDownload';
import { MUSHAF_PAGES, MUSHAF_SURAHS } from './pages';
import { installRiwayahDataset } from './riwayahData';
import { verifyRiwayahDataset } from './riwayahImport';
import { warmSurahCache, releaseSurahCache } from './quran';
import type { RiwayahProvenance } from './riwayahStore';
import type { RiwayahId } from './riwayat';

/**
 * The largest file worth reading into memory to check.
 *
 * The whole Qur'an as vocalised Arabic text with a page number per ayah
 * is a few megabytes; the word-by-word export is larger but still well
 * inside this. The cap is here so a wrong link — a video, an ISO, an
 * HTML error page that never ends — fails as a size error rather than as
 * an out-of-memory crash with no explanation.
 */
const MAX_BYTES = 48 * 1024 * 1024;

/**
 * Why an install did not happen, as something the UI can translate.
 *
 * A key and a fallback, not a sentence: this module has no `t()` and the
 * app speaks thirteen languages. `detail` carries the verifier's own
 * words — "expected 6236 ayahs, found 6235" — which stay in English on
 * purpose. They are diagnostics about a file, they are what someone would
 * paste into an issue, and inventing thirteen translations of every way a
 * dataset can be wrong would make them less useful, not more.
 */
export type RiwayahInstallError = {
  key: string;
  fallback: string;
  params?: Record<string, string | number>;
  detail?: string;
};

export type RiwayahInstallResult =
  | { ok: true; provenance: RiwayahProvenance }
  | { ok: false; error: RiwayahInstallError };

function fail(
  key: string,
  fallback: string,
  extra?: Omit<RiwayahInstallError, 'key' | 'fallback'>,
): RiwayahInstallResult {
  return { ok: false, error: { key, fallback, ...extra } };
}

/**
 * Install a riwayah from a URL the reader gave us.
 *
 * Every failure names something someone can act on. "Something went
 * wrong" would leave a reader with a link, a blank screen and no idea
 * whether the problem is the link, the network or the file.
 */
export async function installRiwayahFromUrl(
  id: RiwayahId,
  url: string,
  signal?: AbortSignal,
  /** One try for a mirror that has a fallback behind it; retries otherwise. */
  maxAttempts?: number,
): Promise<RiwayahInstallResult> {
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    // https only. This is scripture arriving over someone's café wifi; a
    // link that can be rewritten in transit is not one to accept.
    return fail('quran.riwayahNeedsHttps', 'The link must start with https://');
  }

  let body: string;
  try {
    // A deadline of its own. The caller's signal only covers a reader who
    // presses cancel; a host that accepts the connection and then says
    // nothing left the sheet spinning until they thought to.
    const response = await fetchWithRetry(
      trimmed,
      { signal },
      { timeoutMs: CONTENT_DEADLINES.riwayah, maxAttempts },
    );
    if (!response.ok) {
      return fail(
        'quran.riwayahServerSaidNo',
        'The server answered {{status}}.',
        { params: { status: response.status } },
      );
    }
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) {
      return fail(
        'quran.riwayahTooLarge',
        'That file is much larger than a muṣḥaf dataset. Check the link.',
      );
    }
    body = await response.text();
  } catch {
    // A timeout aborts too, so the error's name alone no longer says which
    // happened. The reader's own signal is the only thing that can tell
    // "I pressed cancel" from "that host went quiet" — and telling someone
    // they cancelled something they were waiting on is its own small lie.
    if (signal?.aborted) {
      return fail('common.cancelled', 'Cancelled.');
    }
    return fail(
      'quran.riwayahUnreachable',
      'Could not reach that link. Check the address and your connection.',
    );
  }

  if (body.length > MAX_BYTES) {
    return fail(
      'quran.riwayahTooLarge',
      'That file is much larger than a muṣḥaf dataset. Check the link.',
    );
  }
  return finish(id, body, trimmed);
}

/**
 * The one-button download: this repository's own copy first (see
 * `config/mirrors`), the publisher's link only when the copy cannot be had
 * or does not verify. What the reader sees on failure is the publisher's
 * answer — the last thing tried.
 */
export async function installRiwayahMirrored(
  id: RiwayahId,
  direct: string,
  signal?: AbortSignal,
): Promise<RiwayahInstallResult> {
  const mirrored = await installRiwayahFromUrl(
    id,
    mirrorUrl(MIRROR_TAGS.riwayah, `${id}.json`),
    signal,
    1,
  );
  if (mirrored.ok || signal?.aborted) return mirrored;
  return installRiwayahFromUrl(id, direct, signal);
}

/**
 * The same install as a download-manager job (`kind: 'riwayah'`).
 *
 * A muṣḥaf is one file, so its progress is 0 of 1 until it is installed —
 * but it is a download like the others: it belongs in the shade, it must
 * outlive the screen that started it, and it must not run beside a
 * reciter's gigabyte on the same pipe. `url` is a link the reader pasted;
 * without one it is the one-button download, mirror first.
 *
 * Endings, in the manager's words: installed is `complete`; a host that
 * could not be reached is `interrupted` (come back to it); anything else —
 * a file that would not verify, a server that said no — is a failure with
 * the reason carried in `error`.
 */
export function downloadRiwayah(
  id: RiwayahId,
  source: { direct?: string; url?: string },
  onProgress?: (p: MushafDownloadProgress) => void,
): MushafDownloadHandle {
  const controller = new AbortController();
  const promise = (async (): Promise<DownloadOutcome> => {
    onProgress?.({ done: 0, total: 1, failed: 0 });
    const result = source.url
      ? await installRiwayahFromUrl(id, source.url, controller.signal)
      : source.direct
        ? await installRiwayahMirrored(id, source.direct, controller.signal)
        : fail('quran.riwayahUnreachable', 'Could not reach that link. Check the address and your connection.');
    if (result.ok) {
      onProgress?.({ done: 1, total: 1, failed: 0 });
      return { complete: true, interrupted: false };
    }
    onProgress?.({ done: 0, total: 1, failed: 1 });
    if (controller.signal.aborted) return { complete: false, interrupted: false };
    return {
      complete: false,
      // Unreachable, or a server error (5xx): the network's problem, not the
      // file's — worth coming back to. A 4xx or a bad file is not.
      interrupted:
        result.error.key === 'quran.riwayahUnreachable' ||
        (result.error.key === 'quran.riwayahServerSaidNo' &&
          Number(result.error.params?.status) >= 500),
      error: result.error,
    };
  })();
  return { promise, cancel: () => controller.abort() };
}

/**
 * Install from text the reader already has — a file they opened, a paste.
 *
 * Same verification, different transport, and deliberately the same
 * `finish` rather than a second copy of the checking that agrees today.
 */
export async function installRiwayahFromText(
  id: RiwayahId,
  contents: string,
  from: string,
): Promise<RiwayahInstallResult> {
  return finish(id, contents, from);
}

/** Parse, verify, store. The only way a muṣḥaf reaches the device. */
async function finish(
  id: RiwayahId,
  body: string,
  from: string,
): Promise<RiwayahInstallResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    // Overwhelmingly the commonest wrong link: the resource PAGE rather
    // than the export. Say so, because "invalid JSON" tells a reader
    // nothing about what to do next.
    return body.trimStart().startsWith('<')
      ? fail(
          'quran.riwayahGotAPage',
          'That link returned a web page, not a data file. Use the download link for the JSON export.',
        )
      : fail('quran.riwayahNotJson', 'That file is not a data file.');
  }

  // The corpus this is checked against is read from disk now, and
  // `verifyRiwayahDataset` is synchronous all the way down — it walks
  // every ayah of the downloaded muṣḥaf against ours inside loops that
  // cannot await. Warmed here, where we can, and released below: an
  // import is the one moment the whole corpus is genuinely needed, and
  // it is already several hundred megabytes into a download by this
  // point. Without this the check would find nothing to compare against
  // and skip every surah — which each caller treats as "this build
  // cannot judge it", so a broken file would install quietly.
  await warmSurahCache();
  let verified: ReturnType<typeof verifyRiwayahDataset>;
  try {
    verified = verifyRiwayahDataset(raw, MUSHAF_SURAHS, MUSHAF_PAGES);
  } finally {
    releaseSurahCache();
  }
  if (!verified.ok) {
    return fail(
      'quran.riwayahNotAQuran',
      'That file is not a complete Qur’an, so it was not installed.',
      { detail: verified.error },
    );
  }
  // Shape alone is not enough to become scripture on someone's device.
  // `verifyRiwayahDataset` will report a well-formed file it could not
  // read the content of — a build with no reference text of its own — and
  // that is a refusal here rather than an install, because a muṣḥaf that
  // renders beautifully and is quietly wrong is the one failure a reader
  // must never have.
  if (!verified.checked) {
    return fail(
      'quran.riwayahNotAQuran',
      'That file is not a complete Qur’an, so it was not installed.',
      { detail: 'this build has no reference text to check it against' },
    );
  }

  try {
    const provenance = await installRiwayahDataset(id, verified.dataset, from);
    return { ok: true, provenance };
  } catch (e) {
    return fail(
      'quran.riwayahCouldNotSave',
      'Could not save it to this device.',
      { detail: String(e) },
    );
  }
}
