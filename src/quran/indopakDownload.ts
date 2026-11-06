/**
 * Fetching the IndoPak muṣḥaf: two files, pinned, mirror first.
 *
 * ── BYTES, NOT STRINGS ────────────────────────────────────────────────
 *
 * Both files are fetched to disk and hashed there before they are read
 * (`pinnedDownload.ts`): the pin in `indopakSource.ts` is checked against
 * the bytes that arrived, never against a decoded string.
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
import {
  INDOPAK_COMMIT,
  INDOPAK_FONT,
  INDOPAK_FORMAT,
  INDOPAK_TEXT,
  indopakUrls,
  type IndopakFile,
} from './indopakSource';
import { verifyIndopakFile } from './indopakImport';
import { mkdirDeep } from './mushafDownload';
import { MUSHAF_PAGES, MUSHAF_SURAHS } from './pages';
import { releaseSurahCache, warmSurahCache } from './quran';
import { fetchPinned, pinnedFail, type PinnedFail } from './pinnedDownload';
import { installRiwayahDataset } from './riwayahData';
import type { RiwayahInstallResult } from './riwayahDownload';
import { riwayahDir, riwayahFontPath } from './riwayahStore';
import type { RiwayahId } from './riwayat';

const ID: RiwayahId = 'indopak';

/** Which file the download is on, for the progress strip. */
export type IndopakStep = 'text' | 'font' | 'verify';

type Fail = PinnedFail;
const fail = pinnedFail;

/** The mirror once, then DigitalKhatt with retries — see `fetchPinned`. */
function fetchIndopak(
  file: IndopakFile,
  path: string,
  signal: AbortSignal | undefined,
): Promise<{ from: string } | Fail> {
  const [mirror, original] = indopakUrls(file);
  return fetchPinned(file, [{ url: mirror, tries: 1 }, { url: original, tries: 3 }], path, signal);
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
    const text = await fetchIndopak(INDOPAK_TEXT, textTmp, signal);
    if ('ok' in text) return text;
    onStep?.('font');
    const font = await fetchIndopak(INDOPAK_FONT, fontTmp, signal);
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
        format: INDOPAK_FORMAT,
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
