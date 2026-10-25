/**
 * Turning DigitalKhatt's IndoPak file into a muṣḥaf — or refusing to.
 *
 * ── WHAT THE FILE IS ──────────────────────────────────────────────────
 *
 * `quran_text_indopak_15.ts` is a TypeScript module: one array of 610
 * pages, each an array of its printed lines as strings. Nothing in it
 * says which ayah a line belongs to; the ayah numbers are IN the text, as
 * the medallion (U+06DD) followed by Arabic-Indic digits, exactly where
 * the Taj Company's 15-line print puts them. So the file is read the way
 * the print is read: line by line, counting.
 *
 * ── AND WHY IT IS NOT EXECUTED ────────────────────────────────────────
 *
 * It is code, and the one thing never done with it is to run it. A strict
 * tokenizer accepts the five things the file is made of — the opening
 * `let quranText = [`, single-quoted strings, brackets, commas and the
 * closing `export { quranText };` — and nothing else. A file that carries
 * anything more is not this file, whatever its hash says, and is refused.
 *
 * ── WHAT THIS MODULE DOES NOT DO ──────────────────────────────────────
 *
 * It does not decide whether the text is the Qur'an. It turns the file
 * into the verse shape `verifyRiwayahDataset` already reads — a key, a
 * page, the Ḥafṣ ayah it stands for — and that function does what it does
 * for Warsh, Qālūn and Shuʿbah: proves every Ḥafṣ ayah is accounted for,
 * in order, and reads all 6,236 of them against the text this app ships.
 * One gate for every muṣḥaf, so a check fixed for one is fixed for all.
 *
 * What is this module's own is the LINE table: which words of which ayah
 * sit on which line of which page, which the other riwayat never had.
 */
import {
  verifyRiwayahDataset,
  type ExactLine,
  type ExactLineRun,
  type ExactLinesTable,
  type RiwayahVerifyResult,
  type SourceVerse,
} from './riwayahImport';
import type { MushafPageRange, SurahMeta } from './pages';

const END_OF_AYAH = '\u06DD';
/** The one place the file writes a bidi override where a medallion goes. */
const BIDI_OVERRIDE = '\u202E';

export class IndopakFileError extends Error {}

/**
 * The file's pages and lines, read without evaluating a byte of it.
 *
 * Throws `IndopakFileError` with the offset of the first thing it does
 * not understand, which is the whole of what a maintainer needs to know.
 */
export function parseIndopakFile(source: string): string[][] {
  const head = /^\s*let quranText = \[/.exec(source);
  if (!head) throw new IndopakFileError('does not begin with `let quranText = [`');
  const tail = /\]\s*;?\s*export \{ quranText \};?\s*$/.exec(source);
  if (!tail) throw new IndopakFileError('does not end with `export { quranText };`');

  const body = source.slice(head[0].length, tail.index);
  const token = /\s*(\[|\]|,|'((?:[^'\\\n]|\\['\\])*)')/y;
  const pages: string[][] = [];
  let page: string[] | null = null;
  let pos = 0;
  while (pos < body.length) {
    token.lastIndex = pos;
    const m = token.exec(body);
    if (!m) {
      if (/^\s*$/.test(body.slice(pos))) break;
      throw new IndopakFileError(`unexpected text at offset ${head[0].length + pos}`);
    }
    pos = token.lastIndex;
    const t = m[1];
    if (t === '[') {
      if (page) throw new IndopakFileError(`nested bracket at offset ${head[0].length + pos}`);
      page = [];
    } else if (t === ']') {
      if (!page) throw new IndopakFileError(`stray bracket at offset ${head[0].length + pos}`);
      pages.push(page);
      page = null;
    } else if (t === ',') {
      // Separators carry nothing; a trailing one after the last page is
      // what the real file has.
    } else {
      if (!page) throw new IndopakFileError(`string outside a page at offset ${head[0].length + pos}`);
      page.push(m[2].replace(/\\(['\\])/g, '$1'));
    }
  }
  if (page) throw new IndopakFileError('a page is not closed');
  if (pages.length === 0) throw new IndopakFileError('no pages');
  return pages;
}

/**
 * IndoPak's spellings folded to the ones `skeleton()` already knows.
 *
 * Measured on the real file: without this the shared check refuses it at
 * 4:45, 37:86, 53:10 and 79:25 and the corpus agrees to 91.5%; with it
 * every ayah clears the floors and the corpus agrees to 98.3%, against
 * the Warsh muṣḥaf's 98.5%. `indopakImport.test.ts` holds both numbers.
 *
 * Applied to the text that is JUDGED, never to the text that is drawn.
 */
export function foldIndopakSpelling(text: string): string {
  return (
    text
      // A hamza seat with a combining hamza above or below — vowels, and
      // the grapheme joiner the file wraps some hamzas in, allowed
      // between — is the precomposed letter Ḥafṣ writes.
      .replace(
        /([\u0627\u0648\u0649\u064A\u06CC])([\u034F\u064B-\u0653\u0656-\u065F\u0670]*)([\u0654\u0655])/g,
        (_m, seat: string, marks: string, hamza: string) => {
          marks = marks.replace(/\u034F/g, '');
          const letter =
            seat === '\u0627'
              ? hamza === '\u0654'
                ? '\u0623'
                : '\u0625'
              : seat === '\u0648'
                ? '\u0624'
                : '\u0626';
          return letter + marks;
        },
      )
      // The name of Allah carries a dagger alif the Ḥafṣ text does not.
      .replace(/\u0644\u0651\u0670\u0647/g, '\u0644\u0651\u0647')
      // Alif followed by a dagger alif is the madd alif.
      .replace(/\u0627\u0670/g, '\u0627')
      // A dagger alif IndoPak sets BEFORE a final ya, Ḥafṣ sets after it.
      .replace(
        /([\u064E\u064F\u0650\u0651]*)\u0670([\u0649\u064A\u06CC])(?=\s|$|[^\u0621-\u064A])/g,
        '$1$2\u0670',
      )
  );
}

/** A surah header line. */
const HEADER = /^\u0633\u064F\u0648\u0631\u064E\u0629\u064F /;
/** A basmalah band: the basmalah closed by a bare medallion. */
const BASMALAH = /^\u0628\u0650\u0633\u0652\u0645\u0650 .* \u06DD$/;
/** A medallion, its number, and whatever stop sign the print hangs on it. */
const MARK = /^\u06DD([\u0660-\u0669]+)([^\s]*)$/;

/**
 * Where the print's ayah numbers differ from the Ḥafṣ keys.
 *
 * Only in al-Fātiḥah: the IndoPak print leaves the basmalah unnumbered
 * and counts seven ayahs from al-ḥamdu, so its printed 1–5 are Ḥafṣ 1:2–
 * 1:6 and its 6 and 7 together are Ḥafṣ 1:7. Every other surah numbers
 * as Ḥafṣ does (the file was checked surah by surah: 114 counts equal).
 */
function hafsKeyOf(surah: number, printed: number): { ayah: number; printed: number } {
  if (surah !== 1) return { ayah: printed, printed };
  if (printed <= 5) return { ayah: printed + 1, printed };
  return { ayah: 7, printed };
}

export type IndopakConversion = {
  verses: SourceVerse[];
  lines: ExactLinesTable;
  /** What was counted, for the report. */
  counts: { pages: number; headers: number; basmalahs: number; ayahs: number };
};

/**
 * Read the pages into verses and lines, or say what is wrong.
 *
 * Throws `IndopakFileError` on anything the print could not have: a
 * number out of sequence, a surah header where no surah begins, a page
 * with the wrong number of lines.
 */
export function convertIndopak(
  pages: string[][],
  hafsPages: ReadonlyArray<MushafPageRange>,
): IndopakConversion {
  const words = new Map<string, string[]>();
  const pageOf = new Map<string, number>();
  const lines: ExactLine[][] = [];
  let surah = 0;
  let printed = 0;
  let headers = 0;
  let basmalahs = 0;

  const keyOf = (s: number, a: number) => `${s}:${a}`;
  const push = (key: string, word: string, page: number) => {
    const list = words.get(key) ?? [];
    list.push(word);
    words.set(key, list);
    const seen = pageOf.get(key);
    if (seen == null) pageOf.set(key, page);
    else if (seen !== page) {
      throw new IndopakFileError(`${key} is on pages ${seen} and ${page}`);
    }
  };

  pages.forEach((page, pi) => {
    const number = pi + 1;
    const out: ExactLine[] = [];
    page.forEach((line, li) => {
      if (HEADER.test(line)) {
        surah += 1;
        headers += 1;
        printed = 0;
        out.push(['h', surah]);
        return;
      }
      if (BASMALAH.test(line)) {
        if (surah === 1) {
          // Al-Fātiḥah's basmalah IS its first ayah; the print sets it
          // unnumbered, so the medallion carries no number.
          const body = line.slice(0, -2);
          for (const w of body.split(' ')) push(keyOf(1, 1), w, number);
          pageOf.set(keyOf(1, 1), number);
          out.push([[1, 1, body.split(' ').length, 1, END_OF_AYAH]]);
        } else {
          basmalahs += 1;
          out.push(['b', line.slice(0, -2)]);
        }
        return;
      }
      if (surah === 0) {
        throw new IndopakFileError(`page ${number} line ${li + 1}: text before the first surah`);
      }
      const runs: ExactLineRun[] = [];
      const tokens = line.replace(BIDI_OVERRIDE, ` ${END_OF_AYAH}`).split(' ').filter(Boolean);
      for (const token of tokens) {
        const m = MARK.exec(token);
        if (m) {
          const n = Number(
            [...m[1]].map(d => d.charCodeAt(0) - 0x0660).join(''),
          );
          printed += 1;
          if (n !== printed) {
            throw new IndopakFileError(
              `page ${number} line ${li + 1}: ayah ${surah}:${n} printed where ${printed} was expected`,
            );
          }
          const { ayah } = hafsKeyOf(surah, printed);
          const key = keyOf(surah, ayah);
          if (!words.has(key)) words.set(key, []);
          if (!pageOf.has(key)) pageOf.set(key, number);
          const last = runs[runs.length - 1];
          // The medallion as printed: its number, and the stop sign or
          // rukūʿ mark set on it — 2,800 of them, which the face draws
          // and the app's own medallion could not carry.
          const mark = token;
          if (last && last[0] === surah && last[1] === ayah && last[3] === 0) {
            last[3] = 1;
            last[4] = mark;
          } else {
            runs.push([surah, ayah, 0, 1, mark]);
          }
        } else {
          // The word belongs to the ayah the next medallion closes.
          const { ayah } = hafsKeyOf(surah, printed + 1);
          const key = keyOf(surah, ayah);
          push(key, token, number);
          const last = runs[runs.length - 1];
          if (last && last[0] === surah && last[1] === ayah && last[3] === 0) {
            last[2] += 1;
          } else {
            runs.push([surah, ayah, 1, 0]);
          }
        }
      }
      if (runs.length === 0) {
        throw new IndopakFileError(`page ${number} line ${li + 1}: an empty line`);
      }
      out.push(runs);
    });
    lines.push(out);
  });

  const verses: SourceVerse[] = [];
  for (const [key, list] of words) {
    const [s, a] = key.split(':').map(Number);
    const text = list.join(' ');
    verses.push({
      verse_key: key,
      text,
      check: foldIndopakSpelling(text),
      page_number: pageOf.get(key),
      juz_number: juzOf(hafsPages, s, a),
      number_in_hafs: [a],
    });
  }

  return {
    verses,
    lines: { pages: lines },
    counts: { pages: pages.length, headers, basmalahs, ayahs: verses.length },
  };
}

/** The juz an ayah is in, from the Ḥafṣ page table. */
function juzOf(
  hafsPages: ReadonlyArray<MushafPageRange>,
  surah: number,
  ayah: number,
): number {
  let lo = 0;
  let hi = hafsPages.length - 1;
  const after = (p: { surah: number; ayah: number }) =>
    p.surah < surah || (p.surah === surah && p.ayah <= ayah);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = hafsPages[mid];
    if (after(p.start) && (!p.end || !after(p.end))) return p.juz;
    if (after(p.start)) lo = mid + 1;
    else hi = mid - 1;
  }
  return 1;
}

/** The shape every page of the print has. */
const LINES_PER_PAGE = 15;
const FRAMED_PAGES = 2;
const FRAMED_LINES = 8;
const EXPECTED_PAGES = 610;
const LAST_PAGE_LINES = 10;

/**
 * Parse, convert, verify. The one way the IndoPak file becomes a muṣḥaf.
 *
 * The shape checks come first and are this print's own; the content
 * checks are `verifyRiwayahDataset`'s and are everyone's.
 */
export function verifyIndopakFile(
  source: string,
  surahs: ReadonlyArray<SurahMeta>,
  hafsPages: ReadonlyArray<MushafPageRange>,
): RiwayahVerifyResult & { counts?: IndopakConversion['counts'] } {
  let pages: string[][];
  let converted: IndopakConversion;
  try {
    pages = parseIndopakFile(source);
    if (pages.length !== EXPECTED_PAGES) {
      throw new IndopakFileError(`expected ${EXPECTED_PAGES} pages, found ${pages.length}`);
    }
    pages.forEach((page, i) => {
      const want =
        i < FRAMED_PAGES ? FRAMED_LINES : i === pages.length - 1 ? LAST_PAGE_LINES : LINES_PER_PAGE;
      if (page.length !== want) {
        throw new IndopakFileError(`page ${i + 1} has ${page.length} lines, expected ${want}`);
      }
    });
    converted = convertIndopak(pages, hafsPages);
    if (converted.counts.headers !== 114) {
      throw new IndopakFileError(`found ${converted.counts.headers} surah headers, expected 114`);
    }
    // 113 basmalah lines in the print: al-Fātiḥah's is its first ayah
    // and is counted with the ayahs, the other 112 are bands.
    if (converted.counts.basmalahs !== 112) {
      throw new IndopakFileError(`found ${converted.counts.basmalahs} basmalah bands, expected 112`);
    }
  } catch (e) {
    if (e instanceof IndopakFileError) return { ok: false, error: e.message };
    throw e;
  }
  const result = verifyRiwayahDataset(converted.verses, surahs, hafsPages);
  if (!result.ok) return result;
  return {
    ...result,
    dataset: { ...result.dataset, lines: converted.lines },
    counts: converted.counts,
  };
}

/** The number a run's medallion shows, read off the printed mark; null for a bare medallion. */
export function printedNumber(run: ExactLineRun): number | null {
  const mark = run[4];
  if (!mark) return run[1];
  const digits = /[٠-٩]+/.exec(mark);
  if (!digits) return null;
  return Number([...digits[0]].map(d => d.charCodeAt(0) - 0x0660).join(''));
}
