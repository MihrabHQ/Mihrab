/**
 * A hadith's commentary, where the Library has one.
 *
 * A commentary is a Library book like any other — its author's text, read
 * on its own pages, downloaded only if the reader asks (docs/
 * hadith-policy.md §6). What is here is the way from a hadith to the
 * chapter that explains it, and nothing of the book itself.
 *
 * One so far: Ibn Rajab's Jāmiʿ al-ʿUlūm wa'l-Ḥikam, on an-Nawawī's
 * forty-two and the eight he added. Its pack is his preface and then a
 * chapter a hadith, so hadith N is chapter N (`scripts/library/
 * build-library.js`, `jami`). The hadith is known by its number among the
 * Forty, or — for the eight — by its place in the list of his additions.
 */
import { NAWAWI_CROSSWALK, findCompilation } from './catalog';

export type Commentary = { book: string; chapter: number };

export function commentaryFor(id: string, list?: string): Commentary | null {
  const nawawi = id.startsWith('n:')
    ? Number(id.slice(2))
    : id.startsWith('h:')
      ? NAWAWI_CROSSWALK.find(c => c.henc === id.slice(2))?.n
      : undefined;
  if (nawawi && nawawi >= 1 && nawawi <= 42) return { book: 'jami', chapter: nawawi };
  // One of Ibn Rajab's eight, read in the list of them: under his number (43 to 50).
  if (list === 'comp:rajab') {
    const row = findCompilation('rajab')?.rows.find(r => (r.book ? `b:${r.book}:${r.index}` : `h:${r.henc}`) === id || (r.henc != null && `h:${r.henc}` === id));
    if (row && row.n >= 43 && row.n <= 50) return { book: 'jami', chapter: row.n };
  }
  return null;
}
