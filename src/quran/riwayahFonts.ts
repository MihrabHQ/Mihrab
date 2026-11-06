/**
 * The faces the Quranpedia muṣḥafs are set in, pinned.
 *
 * ── WHY A FONT AT ALL ─────────────────────────────────────────────────
 *
 * Warsh, Qālūn and Shuʿbah arrived as text and were drawn in Amiri Quran,
 * the app's bundled Qur'anic face — correct, and not the book. KFGQPC
 * sets each of these muṣḥafs in a face of its own, the same family the
 * Ḥafṣ page fonts come from, and a reader who knows the Madinah Qālūn
 * print sees the difference at once (a reader wrote in to say so). So the
 * face is fetched beside the text, as IndoPak's is, and the page is set in
 * it once it is on the device.
 *
 * ── WHERE THEY COME FROM, AND WHICH VERSION ──────────────────────────
 *
 * Each Quranpedia muṣḥaf record names the face it is set in (`font_file`),
 * and the face has to be THAT one: KFGQPC re-encoded these texts between
 * versions of the font. The copy Mihrab mirrors (`data-riwayah-v1`) was
 * taken while Quranpedia served version 2 of each text, and it is set in
 * version 2 of each face — `UthmanicQaloun_V21.ttf` and its siblings,
 * which carry every codepoint the text uses. Quranpedia has since moved to
 * version 3, which spells hamzat al-waṣl and the open tanwīn with the
 * Unicode 14 letters (U+0870…, U+08F0…); the version 3 face draws boxes
 * for the version 2 marks (U+06EA, U+06DF, U+06E7, U+06E8) and the other
 * way round. So the pin is the version 2 file, byte for byte what
 * Quranpedia still serves at the name the mirrored record gives, and the
 * mirror carries the same bytes.
 *
 * KFGQPC's embedded licence grants use, copying and distribution free of
 * cost and forbids sale and modification; nothing here modifies the files,
 * and the mirror ships the notice beside them.
 *
 * ── OPTIONAL, UNLIKE INDOPAK'S ────────────────────────────────────────
 *
 * IndoPak's text leans on marks only its own face shapes, so that row
 * waits for its font. These texts have been drawn in Amiri since they
 * were added and read correctly in it, so the face is an improvement
 * rather than a requirement: a muṣḥaf whose font cannot be had — a build
 * without the native font module, the web app, no network that day — is
 * drawn in Amiri as before, and the font is fetched the next time the
 * store is read (`riwayahFontDownload.ts`).
 */
import { mirrorUrl, MIRROR_TAGS } from '../config/mirrors';
import type { PinnedFile } from './pinnedDownload';
import type { PrintedTypeMetrics } from './riwayat';

export type RiwayahFontFile = PinnedFile & {
  /** The publisher's own copy, asked when the mirror cannot answer. */
  original: string;
  /** How the printed page is sized when set in THIS face. */
  metrics: PrintedTypeMetrics;
};

/**
 * The QPC faces' type metrics, measured — see `MushafUnicodePage` for the
 * Amiri figures these replace when the face is loaded.
 *
 * Every word of each muṣḥaf was shaped in its own face and in Amiri Quran
 * (uharfbuzz, over the 8,807 lines of the print): the Warsh and Qālūn
 * words come out 5.0% wider in the QPC face, Shuʿbah's 1.6%. The gaps and
 * the medallions are drawn the same either way, so the typical line is
 * Amiri's 18.2 with only the words' share of it scaled: 18.9 and 18.4.
 *
 * Vertically the faces are far more compact than Amiri: hhea (which the
 * platform lays rows out with) is 1.15–1.17 em above and 0.57–0.59 below,
 * and the tallest stack of marks reaches 1.19 em, the deepest 0.62. A row
 * of 1.85 em holds that with a hair to spare, where Amiri needed 2.05.
 */
function qpc(typicalLineEm: number, ascentEm: number, descentEm: number): PrintedTypeMetrics {
  return { typicalLineEm, lineHeightEm: 1.85, ascentEm, descentEm };
}

const QURANPEDIA_FONTS = 'https://quranpedia.net/assets/fonts/arabic';

export const RIWAYAH_FONTS = {
  warsh: {
    name: 'UthmanicWarsh_V21.ttf',
    bytes: 256132,
    sha256: '57e48b5ac7bd7c17fb1f727853376dc9fd01e49d7cfad4dc851981991159cca1',
    original: `${QURANPEDIA_FONTS}/UthmanicWarsh_V21.ttf`,
    metrics: qpc(18.9, 1.16, 0.574),
  },
  qalun: {
    name: 'UthmanicQaloun_V21.ttf',
    bytes: 260660,
    sha256: '38a50a628d531a0705efac1594ad8545459ab8ddbcb07744fb13ae0cbabd0578',
    original: `${QURANPEDIA_FONTS}/UthmanicQaloun_V21.ttf`,
    metrics: qpc(18.9, 1.147, 0.574),
  },
  shubah: {
    name: 'UthmanicShuba_V20.ttf',
    bytes: 246548,
    sha256: '7ea74ec592cc7bfcdfc7a11e65a700bb77cecf80dd7b447c4d81ed2513d57cc8',
    original: `${QURANPEDIA_FONTS}/UthmanicShuba_V20.ttf`,
    metrics: qpc(18.4, 1.172, 0.586),
  },
} as const satisfies Record<string, RiwayahFontFile>;

/** The mirror's copy, then Quranpedia's, in the order they are tried. */
export function riwayahFontUrls(font: RiwayahFontFile): [mirror: string, original: string] {
  return [mirrorUrl(MIRROR_TAGS.riwayah, font.name), font.original];
}
