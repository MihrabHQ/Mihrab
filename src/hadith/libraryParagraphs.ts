/**
 * A long passage of a Library book, set as paragraphs for the eye.
 *
 * A book is its author's text as the transcription divides it, and some
 * transcriptions hardly divide it at all: a tale of Kalīla wa-Dimna is one
 * paragraph of ten thousand letters, a maqāma another. On a phone that is
 * three screens without a place for the eye to rest or to come back to.
 *
 * So the page sets such a passage in paragraphs, cut where a sentence of
 * its own ends. This is how it is drawn and nothing more: the pack is not
 * touched, the passage is still one block — one bookmark, one copy, one
 * place a search finds — and its pieces joined by a space are the passage
 * again, letter for letter. A text with no sentence marks of its own (many
 * older ones have none) is left whole: there is nowhere honest to cut it.
 */

/** From this many letters a passage is set in paragraphs. */
export const LONG_PASSAGE = 1400;
/** A paragraph is at least this long before it may end. */
export const PARAGRAPH_MIN = 600;

/** The end of a sentence: its mark, whatever closes a quotation after it, and the space. */
const SENTENCE_END = /[.!?؟۔。]+["'»”’)\]]*\s+/g;

export function readingParagraphs(text: string): string[] {
  if (text.length < LONG_PASSAGE) return [text];
  const out: string[] = [];
  let start = 0;
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) {
    const end = m.index + m[0].length;
    // Not a stub at either side: a paragraph of a line reads as a fault.
    if (end - start < PARAGRAPH_MIN || text.length - end < PARAGRAPH_MIN / 2) continue;
    out.push(text.slice(start, end).trimEnd());
    start = end;
  }
  out.push(text.slice(start));
  return out;
}
