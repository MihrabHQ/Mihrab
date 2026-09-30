/**
 * The little bit of markdown a release note actually uses.
 *
 * ── WHY NOT A MARKDOWN LIBRARY ────────────────────────────────────────
 *
 * The notes are Play's, and Play accepts almost nothing: a bullet is a
 * line that starts with a bullet character, a paragraph is a line that
 * does not, and blank lines separate them. Fifty-eight releases of them
 * use exactly that and nothing else — no headings, no links, no tables,
 * no code. `react-native-markdown-display` and its kin are 40–120 KB of
 * dependency, a parser with its own HTML escape rules, and a styling API
 * that would have to be re-taught this app's tokens anyway.
 *
 * So: one function, a hundred lines, and a test that walks every note in
 * the generated table and asserts nothing is dropped on the floor. A
 * format the app controls both ends of does not need a general parser.
 *
 * ── WHAT IT UNDERSTANDS ───────────────────────────────────────────────
 *
 *   • a bullet             — a line opening with •, -, * or –
 *   a paragraph            — any other line
 *   (blank line)           — ends the block above it
 *   **bold**               — inline, the lead-in phrase CHANGELOG.md sets
 *                            in bold; not yet used by a Play note, and
 *                            here so that the first one that does is
 *                            typeset rather than shown with its asterisks
 *
 * Consecutive bullets become ONE list, so the gap between two bullets is
 * the gap inside a list rather than the gap between blocks. Consecutive
 * paragraph lines join with a space, which is what a soft wrap means
 * everywhere else markdown is read.
 */

/** A run of text, bold or not. */
export type Span = { text: string; bold: boolean };

export type NoteBlock =
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'list'; items: Span[][] };

/**
 * The characters Play's notes have used to open a bullet.
 *
 * `•` is what every note written since 2.8 uses; the hyphen and the
 * asterisk are markdown's own, and the en dash is what a word processor
 * turns a hyphen into. All four are followed by a space — a line that
 * begins "- " is a bullet, a line that begins "-40 minutes" is not.
 */
const BULLET = /^\s*[•\-*–]\s+/;

/** `**bold**`, non-greedy, never spanning a blank line. */
const BOLD = /\*\*([^*\n][^*]*?)\*\*/g;

/**
 * Split one line into bold and plain runs.
 *
 * Unmatched asterisks are left exactly as typed: a note reading "3 * 4"
 * is arithmetic, and a half-written `**` is a typo that should be visible
 * to whoever wrote it rather than silently eaten.
 */
export function parseSpans(line: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  BOLD.lastIndex = 0;
  for (let m = BOLD.exec(line); m; m = BOLD.exec(line)) {
    if (m.index > at) {
      spans.push({ text: line.slice(at, m.index), bold: false });
    }
    spans.push({ text: m[1], bold: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) {
    spans.push({ text: line.slice(at), bold: false });
  }
  // An empty line has no spans at all rather than one empty span, so a
  // caller measuring `spans.length` is not told there is something here.
  return spans.filter(s => s.text.length > 0);
}

/**
 * One note's raw text to the blocks that draw it.
 *
 * Never throws and never returns a block with nothing in it: a note that
 * is only whitespace produces an empty array, which the sheet renders as
 * the release having said nothing — which is the truth about it.
 */
export function parseNote(raw: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  let items: Span[][] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const spans = parseSpans(paragraph.join(' '));
    if (spans.length > 0) blocks.push({ kind: 'paragraph', spans });
    paragraph = [];
  };
  const flushList = () => {
    if (items.length === 0) return;
    blocks.push({ kind: 'list', items });
    items = [];
  };

  for (const line of (raw ?? '').replace(/\r\n/g, '\n').split('\n')) {
    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    if (BULLET.test(line)) {
      flushParagraph();
      const spans = parseSpans(line.replace(BULLET, '').trim());
      if (spans.length > 0) items.push(spans);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * The note with its markup removed and its blocks flattened.
 *
 * Not drawn anywhere: this is what `notesMarkup.test.ts` walks every
 * shipped note through to prove the parser drops nothing. A round trip
 * that loses a sentence is invisible in the tree and obvious in a string.
 */
export function notePlainText(raw: string): string {
  return parseNote(raw)
    .map(b =>
      b.kind === 'paragraph'
        ? b.spans.map(s => s.text).join('')
        : b.items.map(i => i.map(s => s.text).join('')).join('. '),
    )
    .join('\n');
}

/**
 * The note as text to paste somewhere else — a store listing, a GitHub
 * release, a message — under a line naming the release.
 *
 * Not `notePlainText`, which flattens a list into sentences to prove the
 * parser drops nothing. This keeps the shape a reader would expect to
 * paste: one line per paragraph, one "• " line per bullet, a blank line
 * between blocks, and the `**` markers gone. It goes through the same
 * parser the sheet draws with, so what is copied is what was shown.
 */
export function noteCopyText(heading: string, raw: string): string {
  const blocks = parseNote(raw).map(b =>
    b.kind === 'paragraph'
      ? b.spans.map(s => s.text).join('')
      : b.items.map(i => `• ${i.map(s => s.text).join('')}`).join('\n'),
  );
  return [heading, ...blocks].join('\n\n');
}

// ---------------------------------------------------------- platforms

/**
 * Which platforms a change is for, as the note's own words say.
 *
 * The notes are one list for every store, and a change that only exists
 * on Android or only on Apple's devices says so in its text — "on
 * Android", "On iPhone and iPad" — because the Play listing and the App
 * Store listing are the same file. The names are product names and stay
 * in Latin script in every translation, so the same test reads the
 * English, Swedish and Arabic note alike. A bullet naming both, or
 * neither, is for everyone.
 *
 * "Live Activity" is not an Apple word here: the Android app has one too.
 */
export type Platform = 'all' | 'android' | 'apple';

const ANDROID_WORDS = /\bAndroid\b|\bMaterial You\b|\bF-Droid\b|\bGoogle Play\b/;
const APPLE_WORDS =
  /\biPhone\b|\biPad\b|\biPadOS\b|\biOS\b|\bmacOS\b|\bMac\b|\bHomebrew\b|\bApp Store\b|\bLiquid Glass\b/;

export function platformOf(text: string): Platform {
  const android = ANDROID_WORDS.test(text);
  const apple = APPLE_WORDS.test(text);
  if (android === apple) return 'all';
  return android ? 'android' : 'apple';
}

/** The order the groups are drawn in: what everyone gets comes first. */
export const PLATFORM_ORDER: readonly Platform[] = ['all', 'android', 'apple'];

/**
 * A note's blocks sorted into the platforms they are for, in
 * `PLATFORM_ORDER`, leaving out a platform with nothing in it.
 *
 * Bullets are sorted one by one; a paragraph is prose around them and
 * stays with everyone's. Within a group the note's own order is kept.
 */
export function groupByPlatform(
  blocks: NoteBlock[],
): { platform: Platform; blocks: NoteBlock[] }[] {
  const by: Record<Platform, NoteBlock[]> = { all: [], android: [], apple: [] };
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      by.all.push(block);
      continue;
    }
    const items: Record<Platform, Span[][]> = { all: [], android: [], apple: [] };
    for (const item of block.items) {
      items[platformOf(item.map(s => s.text).join(''))].push(item);
    }
    for (const p of PLATFORM_ORDER) {
      if (items[p].length > 0) by[p].push({ kind: 'list', items: items[p] });
    }
  }
  return PLATFORM_ORDER.filter(p => by[p].length > 0).map(p => ({
    platform: p,
    blocks: by[p],
  }));
}
