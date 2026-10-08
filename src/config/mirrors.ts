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
import { fetchWithRetry, type FetchWithRetryOptions } from '../utils/fetchWithRetry';

export const MIRROR_BASE = 'https://github.com/MihrabHQ/Mihrab/releases/download';

export const MIRROR_TAGS = {
  tafsir: 'data-tafsir-v1',
  wordMeanings: 'data-wordmeanings-v1',
  riwayah: 'data-riwayah-v1',
} as const;

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
