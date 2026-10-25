/**
 * Where the IndoPak muṣḥaf comes from, pinned.
 *
 * ── ONE COMMIT, TWO FILES, FOUR NUMBERS ───────────────────────────────
 *
 * DigitalKhatt publishes the 15-line IndoPak text (MIT) and the font that
 * draws it (OFL) in one repository. The app does not follow that
 * repository's `main`: a text that can change under a reader is not
 * scripture anyone can account for, so the download names a commit, and
 * every byte that arrives is checked against the SHA-256 recorded here
 * before it is read. Changing the edition means changing this file —
 * after `tools/indopak/check.ts` has passed on the new commit and the
 * mirror release has been rebuilt from it (`scripts/mirror/build-mirror.js`
 * reads `INDOPAK_COMMIT` from this file, so the two cannot disagree).
 *
 * ── MIRROR FIRST ──────────────────────────────────────────────────────
 *
 * The files are fetched from this repository's own release
 * (`config/mirrors.ts`, tag `data-indopak-v1`) and from DigitalKhatt only
 * when the mirror cannot answer. The mirror is built byte for byte from
 * the commit below, so the same pins check both.
 */
import { mirrorUrl, MIRROR_TAGS } from '../config/mirrors';

export const INDOPAK_COMMIT = '78372d7a1e211bbab677cc0304384f278f508657';

const RAW = `https://raw.githubusercontent.com/DigitalKhatt/digitalkhatt-js/${INDOPAK_COMMIT}`;

export type IndopakFile = {
  /** The file's name in the mirror release and in the riwayah store. */
  name: string;
  /** Its path in the DigitalKhatt repository at `INDOPAK_COMMIT`. */
  repoPath: string;
  bytes: number;
  sha256: string;
};

export const INDOPAK_TEXT: IndopakFile = {
  name: 'quran_text_indopak_15.ts',
  repoPath: 'apps/site-angular/src/app/services/quran_text_indopak_15.ts',
  bytes: 1503148,
  sha256: '35310a914f08379e370592d5d28ecae6224bba570cda1e97bab093d23f4cd3df',
};

export const INDOPAK_FONT: IndopakFile = {
  name: 'DigitalKhattIndoPak.ttf',
  repoPath: 'apps/site-angular/src/assets/fonts/coretext/DigitalKhattIndoPak.ttf',
  bytes: 650788,
  sha256: '0e435ecd7e271ed5b2cf6b36ad60f945606d2c4649bc3f13048a75bfd6b40959',
};

/** What the reader is told the download weighs. */
export const INDOPAK_DOWNLOAD_BYTES = INDOPAK_TEXT.bytes + INDOPAK_FONT.bytes;

/** The mirror's copy, then DigitalKhatt's, in the order they are tried. */
export function indopakUrls(file: IndopakFile): [mirror: string, original: string] {
  return [mirrorUrl(MIRROR_TAGS.indopak, file.name), `${RAW}/${file.repoPath}`];
}
