/**
 * Which books are offered, and what stands behind each hadith in them.
 *
 * The maintainer's rule (2026-11-25): the app does not serve a hadith that
 * is weak, disputed or ungraded. For the books that comes to three kinds:
 *
 *   • al-Bukhārī's Ṣaḥīḥ and Muslim's are whole. They are not graded
 *     hadith by hadith in any open dataset; they are read on the standing
 *     of the collection, and the reader's page says exactly that
 *     (`hadith.sahihCollectionNote`) — not a grade of ours on each text.
 *   • The four Sunan and the Muwaṭṭaʾ carry, for each hadith, what the
 *     graders in fawazahmed0/hadith-api ruled, and a pack holds only the
 *     hadith EVERY one of them who ruled calls ṣaḥīḥ or ḥasan
 *     (`scripts/hadith/book-grades.js` has the rule and how a grade is
 *     paired with a text). The grades are as that dataset records them;
 *     the page shows each grader's own verdict, in its words.
 *   • Musnad Aḥmad and Sunan ad-Dārimī are not offered: no open dataset
 *     grades them. They come back when one does.
 *
 * A graded book is only ever OUR copy of it. Open-Hadith-Data's file has
 * every hadith and no grade, so `origin.ts` does not rebuild these five
 * from it, and a browser — which cannot read our copy — is not offered
 * them (`BOOKS` in `catalog.ts`).
 *
 * The app does not take the pack's word for it either: `validBookFile`
 * reads every row's grades by the rule below and refuses a file with one
 * that does not pass, so a pack built wrongly, or downloaded before the
 * rule, is not read (`packs.ts` removes it).
 */
import SETS from './sets.json';

/** Whole, on the standing of the collection. */
export const SAHIH_BOOKS: readonly string[] = ['bukhari', 'muslim'];
/** Graded hadith by hadith: only what every grader who ruled calls sound. */
export const GRADED_BOOKS: readonly string[] = ['abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik'];
/** Every book there is a pack of. */
export const ALL_BOOKS: readonly string[] = SETS.books;

export const isGradedBook = (book: string) => GRADED_BOOKS.includes(book);
export const isSahihBook = (book: string) => SAHIH_BOOKS.includes(book);

/** `[grader, grade]`: an index into the file's `graders`, and the verdict as hadith-api words it. */
export type BookGrade = [number, string];
/**
 * `[number | null, Arabic text]`, and in a graded book `[…, i, grades]`:
 * `i` is the row's place in Open-Hadith-Data's file, which is what its id
 * is made of (`b:<book>:<i>`), so an id stays on its hadith whichever
 * rows a build keeps.
 */
export type BookRow = [number | null, string] | [number | null, string, number, BookGrade[]];

/**
 * What a grade says of a hadith: weak, sound, or nothing either way
 * ("Maqtu", "-"). Anything weak in it makes it weak. The same rule as in
 * `scripts/hadith/book-grades.js` (`__tests__/hadithBookGrades.test.ts`
 * holds the two together).
 */
// book-grade-rule:start
const GRADE_WEAK = /da.?if|munkar|shadh|mawdu|batil|malool|mursal/i;
const GRADE_SOUND = /sahih|hasan/i;
export function bookGradeVerdict(grade: string | null | undefined): 'weak' | 'sound' | null {
  const g = String(grade ?? '');
  if (GRADE_WEAK.test(g)) return 'weak';
  return GRADE_SOUND.test(g) ? 'sound' : null;
}
/** Sound by every grader who ruled, and at least one did. */
export function soundByAll(grades: ReadonlyArray<string | null | undefined>): boolean {
  let sound = 0;
  for (const g of grades) {
    const v = bookGradeVerdict(g);
    if (v === 'weak') return false;
    if (v === 'sound') sound++;
  }
  return sound > 0;
}
// book-grade-rule:end

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Is this the file of `book` as it may be read: a book that is offered, and — graded — sound in every row? */
export function validBookFile(book: string, v: Record<string, unknown>): boolean {
  if (!ALL_BOOKS.includes(book)) return false;
  const rows = v.hadiths;
  if (!Array.isArray(rows) || !rows.length) return false;
  if (!rows.every(h => Array.isArray(h) && typeof h[1] === 'string')) return false;
  if (!isGradedBook(book)) return true;
  const graders = isObj(v.grades) ? v.grades.graders : null;
  if (!Array.isArray(graders) || !graders.length || !graders.every(g => typeof g === 'string' && g)) return false;
  return rows.every(h => {
    const grades: unknown = h[3];
    if (!Number.isInteger(h[2]) || h[2] < 0 || !Array.isArray(grades)) return false;
    const each = grades.every(
      g => Array.isArray(g) && Number.isInteger(g[0]) && g[0] >= 0 && g[0] < graders.length && typeof g[1] === 'string',
    );
    return each && soundByAll(grades.map(g => g[1]));
  });
}

/** A row's place in Open-Hadith-Data's file: its own where the pack says, where it stands otherwise. */
export const rowIndex = (row: BookRow, at: number): number => (typeof row[2] === 'number' ? row[2] : at);

export type GraderVerdict = { grader: string; grade: string };

/** Each grader's verdict on a row, by name. */
export function rowVerdicts(row: BookRow, graders: readonly string[] | undefined): GraderVerdict[] {
  if (!graders || !Array.isArray(row[3])) return [];
  return row[3].flatMap(([g, grade]) => (graders[g] ? [{ grader: graders[g], grade }] : []));
}
