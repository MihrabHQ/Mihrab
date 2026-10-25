/**
 * Fetching the IndoPak muṣḥaf: two files, pinned, mirror first.
 *
 * ── BYTES, NOT STRINGS ────────────────────────────────────────────────
 *
 * `installRiwayahFromUrl` reads a muṣḥaf with `response.text()`, which is
 * right for a JSON export and wrong for a font. Both IndoPak files are
 * therefore fetched TO DISK, hashed there (`fs.hash`, the platform's own
 * SHA-256 — the app carries none), and only then read: the pin in
 * `indopakSource.ts` is checked against the bytes that arrived, never
 * against a decoded string.
 *
 * ── THE ORDER OF OPERATIONS ───────────────────────────────────────────
 *
 * Everything lands in a `.part` folder beside the store: text, font,
 * both checked; the text converted and verified (`verifyIndopakFile`,
 * which hands it to the same gate every riwayah passes); the font moved
 * into place and registered; and only then the dataset written, with
 * `source.json` last. Any failure removes the `.part` folder and leaves
 * the device exactly as it was — there is no state in which a muṣḥaf is
 * half installed and looks whole.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { isValidFontFile } from '../native/MushafFont';
import { CONTENT_DEADLINES, fetchContentOnce, withDownloadDeadline } from './contentNetwork';
import { INDOPAK_COMMIT, INDOPAK_FONT, INDOPAK_TEXT, indopakUrls, type IndopakFile } from './indopakSource';
import { verifyIndopakFile } from './indopakImport';
import { mkdirDeep } from './mushafDownload';
import { MUSHAF_PAGES, MUSHAF_SURAHS } from './pages';
import { releaseSurahCache, warmSurahCache } from './quran';
import { installRiwayahDataset } from './riwayahData';
import type { RiwayahInstallResult } from './riwayahDownload';
import { riwayahDir, riwayahFontPath } from './riwayahStore';
import type { RiwayahId } from './riwayat';

const ID: RiwayahId = 'indopak';

/** Which file the download is on, for the progress strip. */
export type IndopakStep = 'text' | 'font' | 'verify';

type Fail = Extract<RiwayahInstallResult, { ok: false }>;

function fail(key: string, fallback: string, detail?: string): Fail {
  return { ok: false, error: { key, fallback, detail } };
}

class Cancelled extends Error {}
class ServerSaidNo extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * One file to disk, over the streaming downloader, or RN's own fetch
 * where the streaming path fails (as it does on some networks — see
 * `mushafFontStore`). Throws on anything but a 200 that lands.
 */
async function downloadTo(url: string, path: string, signal: AbortSignal | undefined): Promise<void> {
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
async function pinMismatch(path: string, file: IndopakFile): Promise<string | null> {
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
 * The mirror once, then the original with retries, until a copy that
 * matches the pin lands. The mirror and the original are the same bytes
 * by construction, so a copy that fails the pin is a wrong copy wherever
 * it came from, and the next host is asked.
 */
async function fetchPinned(
  file: IndopakFile,
  path: string,
  signal: AbortSignal | undefined,
): Promise<{ from: string } | Fail> {
  const [mirror, original] = indopakUrls(file);
  const attempts: Array<{ url: string; tries: number }> = [
    { url: mirror, tries: 1 },
    { url: original, tries: 3 },
  ];
  let last: unknown = null;
  for (const { url, tries } of attempts) {
    for (let i = 0; i < tries; i++) {
      try {
        await downloadTo(url, path, signal);
        const wrong = await pinMismatch(path, file);
        if (!wrong) return { from: url };
        last = new Error(wrong);
      } catch (e) {
        if (e instanceof Cancelled) return fail('common.cancelled', 'Cancelled.');
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
    return fail(
      'quran.riwayahWrongFile',
      'The file that arrived is not the one this version of Mihrab expects.',
      message,
    );
  }
  return fail(
    'quran.riwayahUnreachable',
    'Could not reach that link. Check the address and your connection.',
    message,
  );
}

/**
 * Download, verify and install the IndoPak muṣḥaf.
 *
 * `onStep` is told which file is in flight, for the progress strip; the
 * result is the same shape every riwayah install returns, so the screens
 * need no new case for it.
 */
export async function installIndopak(
  signal?: AbortSignal,
  onStep?: (step: IndopakStep) => void,
): Promise<RiwayahInstallResult> {
  const part = `${riwayahDir(ID)}.part`;
  const textTmp = `${part}/${INDOPAK_TEXT.name}`;
  const fontTmp = `${part}/${INDOPAK_FONT.name}`;
  const cleanup = async () => {
    for (const p of [textTmp, fontTmp, part]) {
      await ReactNativeBlobUtil.fs.unlink(p).catch(() => undefined);
    }
  };
  try {
    await mkdirDeep(part);

    onStep?.('text');
    const text = await fetchPinned(INDOPAK_TEXT, textTmp, signal);
    if ('ok' in text) return text;
    onStep?.('font');
    const font = await fetchPinned(INDOPAK_FONT, fontTmp, signal);
    if ('ok' in font) return font;
    if (signal?.aborted) return fail('common.cancelled', 'Cancelled.');

    onStep?.('verify');
    if (!(await isValidFontFile(fontTmp))) {
      return fail(
        'quran.riwayahWrongFile',
        'The file that arrived is not the one this version of Mihrab expects.',
        `${INDOPAK_FONT.name}: the platform cannot read it as a font`,
      );
    }
    const source = await ReactNativeBlobUtil.fs.readFile(textTmp, 'utf8');
    // The whole corpus is needed to read every ayah against it; warmed
    // for the check and released after, as `riwayahDownload` does.
    await warmSurahCache();
    let verified: ReturnType<typeof verifyIndopakFile>;
    try {
      verified = verifyIndopakFile(String(source), MUSHAF_SURAHS, MUSHAF_PAGES);
    } finally {
      releaseSurahCache();
    }
    if (!verified.ok) {
      return fail(
        'quran.riwayahNotAQuran',
        'That file is not a complete Qur’an, so it was not installed.',
        verified.error,
      );
    }
    if (!verified.checked) {
      return fail(
        'quran.riwayahNotAQuran',
        'That file is not a complete Qur’an, so it was not installed.',
        'this build has no reference text to check it against',
      );
    }
    if (signal?.aborted) return fail('common.cancelled', 'Cancelled.');

    // The font into the store before the dataset: `installRiwayahDataset`
    // registers it from there and refuses the install if it cannot.
    await mkdirDeep(riwayahDir(ID));
    const fontPath = riwayahFontPath(ID, INDOPAK_FONT.name);
    await ReactNativeBlobUtil.fs.unlink(fontPath).catch(() => undefined);
    await ReactNativeBlobUtil.fs.mv(fontTmp, fontPath);
    try {
      const provenance = await installRiwayahDataset(ID, verified.dataset, text.from, {
        commit: INDOPAK_COMMIT,
        sha256: { [INDOPAK_TEXT.name]: INDOPAK_TEXT.sha256, [INDOPAK_FONT.name]: INDOPAK_FONT.sha256 },
        font: INDOPAK_FONT.name,
      });
      return { ok: true, provenance };
    } catch (e) {
      await ReactNativeBlobUtil.fs.unlink(fontPath).catch(() => undefined);
      return fail('quran.riwayahCouldNotSave', 'Could not save it to this device.', String(e));
    }
  } catch (e) {
    if (signal?.aborted) return fail('common.cancelled', 'Cancelled.');
    return fail('quran.riwayahCouldNotSave', 'Could not save it to this device.', String(e));
  } finally {
    await cleanup();
  }
}
