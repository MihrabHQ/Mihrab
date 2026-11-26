/**
 * Finding words inside ONE Library book.
 *
 * A book's text is searched on the book's own page and nowhere else: it
 * is not in the Hadith tab's search, which finds hadith the app serves by
 * its rule (docs/hadith-policy.md, "Nothing of a book leaves the book").
 *
 * Matching is the hadith search's folding (`foldForSearch`): without
 * diacritics, with the hamza forms, ى/ي and ة/ه made one, so "انما" finds
 * "إِنَّمَا". The words typed are looked for as they stand, in order — a
 * phrase, not a bag of words — because a reader of these books is usually
 * after a line he half remembers.
 *
 * The folded text is made once for a book, a slice at a time so a long
 * one (al-ʿIqd is thirty thousand paragraphs) does not hold the screen,
 * and kept while the book's file is.
 */
import { foldForSearch } from './library';
import type { LibraryBlock, LibraryChapter } from './packTypes';

export type LibraryHit = { c: number; b: number; snippet: string };
/** The fewest letters worth looking for. */
export const LIBRARY_QUERY_MIN = 2;
/** The most places shown: past this a reader wants a longer phrase, not a longer list. */
export const LIBRARY_HITS_MAX = 100;
const SLICE = 400;

const text = (b: LibraryBlock): string => (typeof b === 'string' ? b : 'h' in b ? b.h : b.v.join(' '));

/** A book folded for matching: a chapter's blocks, each as `foldForSearch` leaves it. */
export type LibraryIndex = string[][];
const indexes = new WeakMap<readonly LibraryChapter[], Promise<LibraryIndex>>();

/** The book's folded text, made once. `pause` yields between slices (tests pass one that does not wait). */
export function libraryIndex(
  chapters: readonly LibraryChapter[],
  pause: () => Promise<void> = () => new Promise(r => setTimeout(r, 0)),
): Promise<LibraryIndex> {
  const had = indexes.get(chapters);
  if (had) return had;
  const made = (async () => {
    const out: LibraryIndex = [];
    let n = 0;
    for (const ch of chapters) {
      const folded: string[] = [];
      for (const b of ch.b) {
        folded.push(foldForSearch(text(b)));
        if (++n % SLICE === 0) await pause();
      }
      out.push(folded);
    }
    return out;
  })();
  indexes.set(chapters, made);
  return made;
}

/**
 * The words around a match, from the text as written: the block is cut to
 * a line that holds what was found, at word edges, with "…" where it was
 * cut. Found by folding the block a word at a time, so a place in the
 * folded text is a word of the original.
 */
export function librarySnippet(original: string, folded: string, before = 5, after = 14): string {
  const words = original.split(/\s+/).filter(Boolean);
  let at = 0;
  let joined = '';
  for (let i = 0; i < words.length; i++) {
    const f = foldForSearch(words[i]);
    if (!f) continue;
    joined = joined ? `${joined} ${f}` : f;
    if (joined.includes(folded)) {
      // The match ends in this word: step back over as many words as the phrase has.
      at = Math.max(0, i - (folded.split(' ').length - 1));
      break;
    }
  }
  const from = Math.max(0, at - before);
  const to = Math.min(words.length, at + after);
  return `${from > 0 ? '… ' : ''}${words.slice(from, to).join(' ')}${to < words.length ? ' …' : ''}`;
}

/** Where a phrase is in a book, in the book's order, and whether there were more than are given. */
export function searchLibrary(chapters: readonly LibraryChapter[], index: LibraryIndex, query: string, max = LIBRARY_HITS_MAX): { hits: LibraryHit[]; more: boolean } {
  const q = foldForSearch(query);
  const hits: LibraryHit[] = [];
  if (q.length < LIBRARY_QUERY_MIN) return { hits, more: false };
  for (let c = 0; c < index.length; c++) {
    for (let b = 0; b < index[c].length; b++) {
      if (!index[c][b].includes(q)) continue;
      if (hits.length === max) return { hits, more: true };
      hits.push({ c, b, snippet: librarySnippet(text(chapters[c].b[b]), q) });
    }
  }
  return { hits, more: false };
}

/** A chapter's own headings, for its jump list: each with the block it is. */
export function chapterHeadings(blocks: readonly LibraryBlock[]): { b: number; h: string }[] {
  const out: { b: number; h: string }[] = [];
  blocks.forEach((blk, b) => {
    if (typeof blk === 'object' && 'h' in blk) out.push({ b, h: blk.h });
  });
  return out;
}
