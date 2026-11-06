/**
 * Fetching a file whose bytes are known in advance.
 *
 * ── BYTES, NOT STRINGS ────────────────────────────────────────────────
 *
 * `installRiwayahFromUrl` reads a muṣḥaf with `response.text()`, which is
 * right for a JSON export and wrong for a font. A pinned file is therefore
 * fetched TO DISK, hashed there (`fs.hash`, the platform's own SHA-256 —
 * the app carries none), and only then read: the pin is checked against
 * the bytes that arrived, never against a decoded string.
 *
 * Shared by the IndoPak download (two pinned files from DigitalKhatt) and
 * the KFGQPC faces the Quranpedia muṣḥafs are drawn in
 * (`riwayahFontDownload.ts`); it was written for the first and lifted out
 * when the second needed exactly the same thing.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { CONTENT_DEADLINES, fetchContentOnce, withDownloadDeadline } from './contentNetwork';
import type { RiwayahInstallResult } from './riwayahDownload';

/** A file the app will accept only as the exact bytes recorded here. */
export type PinnedFile = {
  /** The file's name in the mirror release and in the riwayah store. */
  name: string;
  bytes: number;
  sha256: string;
};

export type PinnedFail = Extract<RiwayahInstallResult, { ok: false }>;

export function pinnedFail(key: string, fallback: string, detail?: string): PinnedFail {
  return { ok: false, error: { key, fallback, detail } };
}

export class Cancelled extends Error {}
export class ServerSaidNo extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * One file to disk, over the streaming downloader, or RN's own fetch
 * where the streaming path fails (as it does on some networks — see
 * `mushafFontStore`). Throws on anything but a 200 that lands.
 */
export async function downloadTo(
  url: string,
  path: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) throw new Cancelled();
  await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
  try {
    // Under the deadline from the first byte (`quranContentDeadlines`
    // holds every streaming download to this), and cancelled with the
    // reader's signal: the task is kept so the abort can reach it.
    let task: ReturnType<ReturnType<typeof ReactNativeBlobUtil.config>['fetch']> | null = null;
    const onAbort = () => {
      try {
        task?.cancel(() => undefined);
      } catch {
        // Already settled.
      }
    };
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await withDownloadDeadline(
        (task = ReactNativeBlobUtil.config({ path, overwrite: true }).fetch('GET', url)),
        CONTENT_DEADLINES.indopakFile,
        url,
      );
      const status = res.info().status;
      if (status !== 200) throw new ServerSaidNo(status);
      return;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } catch (e) {
    if (signal?.aborted) throw new Cancelled();
    if (e instanceof ServerSaidNo) throw e;
    // The streaming transport failed; the slower one gets one try.
  }
  await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
  const response = await fetchContentOnce(url, { signal }, CONTENT_DEADLINES.indopakFile);
  if (!response.ok) throw new ServerSaidNo(response.status);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  await ReactNativeBlobUtil.fs.writeFile(path, base64, 'base64');
}

/** Is the file on disk the one the pin describes? Null when it is; else why not. */
export async function pinMismatch(path: string, file: PinnedFile): Promise<string | null> {
  const stat = await ReactNativeBlobUtil.fs.stat(path).catch(() => null);
  const size = Number(stat?.size);
  if (!stat || size !== file.bytes) {
    return `${file.name}: ${size || 0} bytes, expected ${file.bytes}`;
  }
  const digest = String(await ReactNativeBlobUtil.fs.hash(path, 'sha256')).toLowerCase();
  if (digest !== file.sha256) return `${file.name}: SHA-256 ${digest.slice(0, 12)}… is not the pinned file`;
  return null;
}

/**
 * Each host in turn, as many tries as it is given, until a copy that
 * matches the pin lands. A mirror and its original are the same bytes by
 * construction, so a copy that fails the pin is a wrong copy wherever it
 * came from, and the next host is asked.
 */
export async function fetchPinned(
  file: PinnedFile,
  hosts: ReadonlyArray<{ url: string; tries: number }>,
  path: string,
  signal: AbortSignal | undefined,
): Promise<{ from: string } | PinnedFail> {
  let last: unknown = null;
  for (const { url, tries } of hosts) {
    for (let i = 0; i < tries; i++) {
      try {
        await downloadTo(url, path, signal);
        const wrong = await pinMismatch(path, file);
        if (!wrong) return { from: url };
        last = new Error(wrong);
      } catch (e) {
        if (e instanceof Cancelled) return pinnedFail('common.cancelled', 'Cancelled.');
        last = e;
      }
      if (i < tries - 1) await new Promise<void>(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  if (last instanceof ServerSaidNo) {
    return {
      ok: false,
      error: {
        key: 'quran.riwayahServerSaidNo',
        fallback: 'The server answered {{status}}.',
        params: { status: last.status },
      },
    };
  }
  const message = last instanceof Error ? last.message : String(last);
  if (/bytes|SHA-256/.test(message)) {
    return pinnedFail(
      'quran.riwayahWrongFile',
      'The file that arrived is not the one this version of Mihrab expects.',
      message,
    );
  }
  return pinnedFail(
    'quran.riwayahUnreachable',
    'Could not reach that link. Check the address and your connection.',
    message,
  );
}
