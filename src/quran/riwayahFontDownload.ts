/**
 * Fetching the face a Quranpedia muṣḥaf is set in — see `riwayahFonts.ts`
 * for why there is one and where it comes from.
 *
 * ── AFTER THE TEXT, NEVER INSTEAD OF IT ───────────────────────────────
 *
 * The text is the muṣḥaf; the face is how it looks. So the text installs
 * exactly as before, and the face is added to a muṣḥaf that is already
 * on the device (`attachRiwayahFont`), whether that is a moment later in
 * the same download or — for a copy installed before the face was offered,
 * or from a pasted link, or on a day the mirror was down — the next time
 * the store is read. A face that cannot be had leaves the page drawn in
 * Amiri, as it was; it never leaves it blank.
 *
 * The file lands in a `.part` folder beside the store and is moved into
 * place only once it has matched its pin and the platform has agreed it
 * is a font, so there is no state in which a wrong file sits where the
 * face belongs.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { IS_WEB_APP } from '../config/webApp';
import { isValidFontFile, mushafFontAvailable } from '../native/MushafFont';
import { mkdirDeep } from './mushafDownload';
import { fetchPinned, pinnedFail, type PinnedFail } from './pinnedDownload';
import { attachRiwayahFont, loadedRiwayahFontFamily, riwayatMissingFont } from './riwayahData';
import { riwayahFontUrls } from './riwayahFonts';
import { riwayahDir, riwayahFontPath } from './riwayahStore';
import { riwayahById, type RiwayahId } from './riwayat';

/** Can this build register a font from a file at all? */
export function riwayahFontsPossible(): boolean {
  return mushafFontAvailable && !IS_WEB_APP;
}

/**
 * Fetch and attach a muṣḥaf's own face. Idempotent: a face already
 * registered, or a row without one, is `ok` at once.
 *
 * The mirror once, then Quranpedia with retries, as IndoPak's files are
 * fetched; the result is the same shape as every riwayah install so a
 * caller can show the reason without a new case for it.
 */
export async function fetchRiwayahFont(
  id: RiwayahId,
  signal?: AbortSignal,
): Promise<{ ok: true } | PinnedFail> {
  const font = riwayahById(id).font;
  if (!font || loadedRiwayahFontFamily(id)) return { ok: true };
  if (!riwayahFontsPossible()) {
    return pinnedFail('quran.riwayahCouldNotSave', 'Could not save it to this device.', 'no font module');
  }
  const part = `${riwayahDir(id)}.part`;
  const tmp = `${part}/${font.name}`;
  try {
    await mkdirDeep(part);
    const [mirror, original] = riwayahFontUrls(font);
    const hosts = [
      { url: mirror, tries: 1 },
      { url: original, tries: 3 },
    ];
    const got = await fetchPinned(font, hosts, tmp, signal);
    if ('ok' in got) return got;
    if (signal?.aborted) return pinnedFail('common.cancelled', 'Cancelled.');
    if (!(await isValidFontFile(tmp))) {
      return pinnedFail(
        'quran.riwayahWrongFile',
        'The file that arrived is not the one this version of Mihrab expects.',
        `${font.name}: the platform cannot read it as a font`,
      );
    }
    await mkdirDeep(riwayahDir(id));
    const dest = riwayahFontPath(id, font.name);
    await ReactNativeBlobUtil.fs.unlink(dest).catch(() => undefined);
    await ReactNativeBlobUtil.fs.mv(tmp, dest);
    if (await attachRiwayahFont(id, font.name, font.sha256)) return { ok: true };
    await ReactNativeBlobUtil.fs.unlink(dest).catch(() => undefined);
    return pinnedFail(
      'quran.riwayahCouldNotSave',
      'Could not save it to this device.',
      `${font.name}: could not be registered`,
    );
  } catch (e) {
    if (signal?.aborted) return pinnedFail('common.cancelled', 'Cancelled.');
    return pinnedFail('quran.riwayahCouldNotSave', 'Could not save it to this device.', String(e));
  } finally {
    await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
    await ReactNativeBlobUtil.fs.unlink(part).catch(() => undefined);
  }
}

let catchingUp: Promise<void> | null = null;

/**
 * Add the face to every installed muṣḥaf that lacks it — once per launch,
 * quietly, one after another. Nothing is shown and nothing waits on it:
 * the page redraws in its own face when `attachRiwayahFont` publishes.
 */
export function fetchMissingRiwayahFonts(): Promise<void> {
  if (catchingUp) return catchingUp;
  if (!riwayahFontsPossible()) return (catchingUp = Promise.resolve());
  catchingUp = (async () => {
    for (const id of riwayatMissingFont()) {
      try {
        await fetchRiwayahFont(id);
      } catch {
        // The next launch tries again; the page is drawn meanwhile.
      }
    }
  })();
  return catchingUp;
}

/** Tests only. */
export function _resetRiwayahFontCatchUpForTests(): void {
  catchingUp = null;
}
