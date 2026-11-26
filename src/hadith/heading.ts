/**
 * A HadeethEnc entry's title, as the reader's heading.
 *
 * The title is a sentence of the hadith — its best-known one — and for a
 * short hadith it is very nearly the whole of it. For a long one it is
 * not: the second of an-Nawawi's Forty is the hadith of Jibrīl, a page
 * long, and its title is the one answer about Islam's pillars. Set large
 * above the Arabic with nothing to say so, it read as the hadith itself
 * (Pixel 10 Pro, 2026-11-26).
 *
 * So where the text goes on for a good while before the title's words, or
 * after them, the heading is marked as cut from it — "… Islam is to
 * testify … thereto …". The words are HadeethEnc's and are not changed.
 * Where the title's words are not found in the text as they stand (a
 * title that paraphrases), nothing is marked: there is nothing to measure.
 */
import { foldForSearch } from './library';

/** A narrator's line and "the Messenger of Allah ﷺ said:" run to about thirty words; past this is more hadith. */
export const HEADING_CUT_AFTER_WORDS = 45;

export function headingCut(title: string, text: string): { before: boolean; after: boolean } {
  const none = { before: false, after: false };
  const t = foldForSearch(title);
  if (!t) return none;
  const h = foldForSearch(text);
  const at = h.indexOf(t);
  if (at < 0) return none;
  const words = (s: string) => (s.trim() ? s.trim().split(' ').length : 0);
  return {
    before: words(h.slice(0, at)) > HEADING_CUT_AFTER_WORDS,
    after: words(h.slice(at + t.length)) > HEADING_CUT_AFTER_WORDS,
  };
}

/** The title with a mark at each end the text goes on from. */
export function hadithHeading(title: string, text: string): string {
  const cut = headingCut(title, text);
  const lead = cut.before && !/^\s*…/.test(title) ? '… ' : '';
  const tail = cut.after && !/…\s*$/.test(title) ? ' …' : '';
  return `${lead}${title}${tail}`;
}
