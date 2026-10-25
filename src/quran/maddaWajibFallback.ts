/**
 * The madda wājib on text engines that predate it.
 *
 * The IndoPak text marks the obligatory madd with U+089C ARABIC MADDA WAAJIB,
 * 2,098 times. U+089C arrived in Unicode 14, and a text engine whose Unicode
 * tables are older takes it for an unknown BASE character, not a mark. Where
 * it sits between two letters that join, the unknown character cuts the join:
 * أُولٰٓىِٕكَ is drawn as أُولَ and ئِكَ side by side, the opening letters of
 * Maryam, al-Aʿrāf and ash-Shūrā (كٓهٰيٰعٓصٓ, الٓمّٓصٓ, عٓسٓقٓ) come apart
 * into single letters, and خَطِيْٓــَٔتُهٗ is a tangle. That is Android 12 and
 * older (HarfBuzz 2.3–2.6 and the ICU beside it), and iOS before 15.4.
 *
 * Measured, not guessed: every distinct word of the 610 pages was shaped
 * with the HarfBuzz each Android release ships (1.2.6 to 10.2.0) and with
 * CoreText, and compared glyph by glyph with Android 16's. The engines
 * without Unicode 14 break 79 distinct words, 353 places in the book, and
 * `breaksJoin` below names exactly those 79 — no word more, no word fewer
 * (`tools/indopak/check.test.ts` holds it to the pinned text).
 *
 * In those words the madda is drawn as U+0653 MADDAH ABOVE, which every
 * engine knows: the word joins as the print sets it, with the madda in the
 * same place, in the face's ordinary madda shape rather than its madd-wājib
 * one. Every other word keeps U+089C — the old engines already draw it there
 * (after an alif, which does not join forward, nothing is cut), and the
 * ordinary madda would change its shape for no gain. The stored text is never
 * changed; this is only what is handed to the platform to draw.
 */
import { Platform } from 'react-native';

const MADDA_WAJIB = '࢜';
const MADDAH_ABOVE = 'ٓ';

/** A combining mark, CGJ included — skipped when looking for the letters around the madda. */
function isMark(c: string): boolean {
  const cp = c.codePointAt(0) ?? 0;
  return (
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    cp === 0x034f ||
    (cp >= 0x06d6 && cp <= 0x06ed) ||
    (cp >= 0x08d3 && cp <= 0x08ff) ||
    cp === 0x089c
  );
}

/** An Arabic letter that takes part in joining (tatweel included). */
function isJoiningLetter(c: string): boolean {
  const cp = c.codePointAt(0) ?? 0;
  return (
    ((cp >= 0x0620 && cp <= 0x064a) || cp === 0x0671 || (cp >= 0x066e && cp <= 0x06d3)) &&
    c !== 'ء' // hamza joins nothing
  );
}

/** Letters that join to the letter before them but not to the one after. */
const NO_FORWARD_JOIN = new Set([
  'ا', 'أ', 'إ', 'آ', 'ٱ', // the alifs
  'د', 'ذ', 'ر', 'ز', // dāl, dhāl, rāʾ, zāy
  'و', 'ؤ', 'ة', // wāw, wāw with hamza, tāʾ marbūṭah
]);

/** True where a madda wājib sits inside a join an older engine would cut. */
export function breaksJoin(word: string): boolean {
  const chars = Array.from(word);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== MADDA_WAJIB) continue;
    let j = i - 1;
    while (j >= 0 && isMark(chars[j])) j--;
    let k = i + 1;
    while (k < chars.length && isMark(chars[k])) k++;
    const before = j >= 0 ? chars[j] : undefined;
    const after = k < chars.length ? chars[k] : undefined;
    if (
      before !== undefined &&
      after !== undefined &&
      isJoiningLetter(before) &&
      !NO_FORWARD_JOIN.has(before) &&
      isJoiningLetter(after)
    ) {
      return true;
    }
  }
  return false;
}

/** The word as an engine without Unicode 14 should be handed it. */
export function maddaWajibFallback(word: string): string {
  return word.includes(MADDA_WAJIB) && breaksJoin(word)
    ? word.split(MADDA_WAJIB).join(MADDAH_ABOVE)
    : word;
}

/**
 * Whether this platform's text engine knows U+089C.
 *
 * Android: API 33 (Android 13) is the first with HarfBuzz 3.x and ICU 70,
 * both Unicode 14. iOS and Mac Catalyst: 15.4 (Catalyst reports the iOS
 * version it runs, so macOS 12.3 and later).
 */
export function engineKnowsMaddaWajib(
  os: string = Platform.OS,
  version: string | number = Platform.Version,
): boolean {
  if (os === 'android') return Number(version) >= 33;
  if (os === 'ios' || os === 'macos') {
    const [major, minor] = String(version).split('.').map(n => Number(n) || 0);
    return major > 15 || (major === 15 && minor >= 4);
  }
  return true;
}

const PLATFORM_KNOWS = engineKnowsMaddaWajib();

/** What to hand the platform for one word of the IndoPak text. */
export function drawableWord(word: string): string {
  return PLATFORM_KNOWS ? word : maddaWajibFallback(word);
}

/**
 * The same for a whole āyah — the ayah sheet and the share card. Only ever
 * for what is DRAWN: copied and shared text keeps U+089C, because the
 * device it lands on may well know it.
 */
export function drawableText(text: string): string {
  if (PLATFORM_KNOWS || !text.includes(MADDA_WAJIB)) return text;
  return text.replace(/[^\s]+/g, w => maddaWajibFallback(w));
}
