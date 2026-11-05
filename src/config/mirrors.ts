/**
 * The app's own copy of the open data it downloads.
 *
 * Everything the app fetches that is static — tafsir, word meanings, the
 * Warsh / Qālūn / Shuʿbah text — is mirrored as GitHub Release assets of
 * this repository (`scripts/mirror/build-mirror.js` builds them, byte for
 * byte what the original host answered). The app asks the mirror FIRST and
 * the original host only if the mirror cannot answer, so a host changing
 * its terms, moving, or going away does not take a downloaded feature with
 * it. Forks: change MIRROR_BASE to your own repository's releases.
 */
import { IS_WEB_APP } from './webApp';
import { fetchWithRetry, type FetchWithRetryOptions } from '../utils/fetchWithRetry';

export const MIRROR_BASE = 'https://github.com/MihrabHQ/Mihrab/releases/download';

export const MIRROR_TAGS = {
  wordMeanings: 'data-wordmeanings-v1',
  riwayah: 'data-riwayah-v1',
  indopak: 'data-indopak-v1',
  /**
   * FROZEN. The six tafsir editions of 2.7.28 lived here, all 684 surah
   * files in one release, and every version up to 2.35.0 reads them from
   * it. Nothing new goes in — see `editionMirrorTag` for why — and it must
   * not be deleted while those versions are out there.
   */
  legacyTafsir: 'data-tafsir-v1',
} as const;

/**
 * The tag that mirrors ONE text edition, a surah per asset.
 *
 * ── WHY A TAG EACH ─────────────────────────────────────────────────────
 *
 * A release holds at most 1,000 assets, and GitHub refuses the 1,001st
 * (422, "file_count limited to 1000 assets per release"). One tag for all
 * the tafsir was fine at six editions and 684 files; at twenty-five it is
 * 2,850, and the translations add 1,710 more.
 *
 * So an edition gets its own release, 114 assets in it — the shape
 * `data-namazvakti-<year>` already uses for the same reason. The tag comes
 * from the edition's id, which never changes, so adding an edition adds a
 * release and moves nothing: a tag worked out from a POSITION in the
 * registry would have silently changed under the editions already on
 * someone's phone the first time that list was reordered, and that list is
 * deliberately ordered (it decides the defaults).
 *
 * The asset is `<surah>.json`, the edition being the tag now.
 */
export function editionMirrorTag(
  kind: 'tafsir' | 'translation',
  editionId: string,
): string {
  return `data-${kind}-${editionId}`;
}

export function mirrorUrl(tag: string, asset: string): string {
  return `${MIRROR_BASE}/${tag}/${asset}`;
}

/**
 * Mirror first, original second.
 *
 * The mirror is tried once and quickly: when it has no such asset (404) or
 * does not answer, the original gets the full retry budget the caller asked
 * for. A caller's own abort is respected and never turns into a second try.
 */
export async function fetchMirrored(
  mirror: string,
  original: string,
  init: RequestInit | undefined,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  // Mihrab Web runs in a browser, and a release download answers a
  // browser without the header that would let it read the file: the mirror
  // can only fail there, loudly, so the web app asks the source straight away.
  if (IS_WEB_APP) return fetchWithRetry(original, init, options);
  try {
    const res = await fetchWithRetry(mirror, init, {
      ...options,
      maxAttempts: 1,
    });
    if (res.ok) return res;
  } catch (e) {
    if (init?.signal?.aborted) throw e;
  }
  return fetchWithRetry(original, init, options);
}
