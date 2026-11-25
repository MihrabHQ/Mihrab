/**
 * How far along a reader is: in each set, at their level, overall.
 *
 * Pure functions over the record (`hadithRecord.ts`) and a set's rows, so
 * Learn and the tests read the same answer.
 *
 * Progress is not a path. Any set opens at any time, whatever the level;
 * the level only chooses which few are on the page as cards (`shelfFor`)
 * and the rest are a fold away. A set someone already knows is marked
 * read in one action (`isSetMarked`) and counts as done without a row of
 * it being opened.
 */
import { HADITH_SETS, LEVELS, type HadithSet, type Level } from './catalog';
import { isRead, isSetMarked, type HadithRecord } from './hadithRecord';

export type SetProgress = { read: number; total: number; done: boolean };

export function setProgress(rec: HadithRecord, setId: string, rowIds: readonly string[] | null): SetProgress {
  const marked = isSetMarked(rec, setId);
  if (!rowIds) return { read: 0, total: 0, done: marked };
  const total = rowIds.length;
  const read = marked ? total : rowIds.reduce((n, id) => n + (isRead(rec, id) ? 1 : 0), 0);
  return { read, total, done: marked || (total > 0 && read >= total) };
}

/**
 * The shelf at a level: that level's sets first, then the levels after it,
 * then the ones before — so "In-depth" does not open on the basics, and
 * nothing is hidden.
 */
export function rankSets(level: Level, sets: readonly HadithSet[] = HADITH_SETS): HadithSet[] {
  const at = LEVELS.indexOf(level);
  const order = [...LEVELS.slice(at), ...LEVELS.slice(0, at)];
  return order.flatMap(lv => sets.filter(s => s.level === lv));
}

/** As many sets as Learn puts in front of a reader at once. */
export const SHELF_CARDS = 4;

export type Shelf = {
  /** The cards: this level's sets not yet finished, at most `SHELF_CARDS`. */
  now: HadithSet[];
  /** Every other set not yet finished, in `rankSets` order: under "All sets". */
  more: HadithSet[];
  /** The finished ones, whatever their level: under "Completed". */
  done: HadithSet[];
};

/**
 * What Learn shows at a level.
 *
 * Three or four sets to choose among, not twelve: the level's own, less
 * the ones already finished — so a reader who has read the Forty is not
 * offered it again, and one who marked a set as known stops seeing it.
 * When a level is all but finished its cards are topped up from the next
 * level, so the page never comes down to a single card or none. Nothing
 * is taken away: every other set is in `more`, every finished one in `done`.
 */
export function shelfFor(
  level: Level,
  isDone: (set: HadithSet) => boolean,
  sets: readonly HadithSet[] = HADITH_SETS,
): Shelf {
  const ranked = rankSets(level, sets);
  const open = ranked.filter(s => !isDone(s));
  const own = open.filter(s => s.level === level);
  // Fewer than two of its own left: the next levels' fill the page.
  const now = (own.length >= 2 ? own : open).slice(0, SHELF_CARDS);
  return { now, more: open.filter(s => !now.includes(s)), done: ranked.filter(isDone) };
}

/** The level a reader gets before choosing one. */
export const DEFAULT_LEVEL: Level = 'starting';

export function levelOf(rec: HadithRecord): Level {
  const lv = rec.level?.[0];
  return lv && (LEVELS as readonly string[]).includes(lv) ? lv : DEFAULT_LEVEL;
}

/** Where "Continue reading" goes: the last entry opened, and the list it was opened from. */
export function continueAt(rec: HadithRecord): { id: string; list?: string } | null {
  const last = rec.last?.[0];
  return last?.id ? { id: last.id, list: last.list } : null;
}

/**
 * Where a hadith is from, for the "Continue reading" card: the list it
 * was being read in, and its number where it has one of its own there —
 * "Sahih al-Bukhari · 3", "An-Nawawi's Forty · 14", "Fasting".
 *
 * The card was a line of text and nothing else: for a book that is a line
 * of Arabic, and a reader of another language could not tell what it was
 * a line of. `listName` is the list's title (null when it was opened from
 * a search, with no list), `bookName` the book's when it is a book's.
 */
export function resumeWhere(
  item: { source: string; number?: number | null },
  listName: string | null,
  bookName: string | null,
  inNawawi: boolean,
): string | null {
  const name = listName ?? bookName;
  if (!name) return null;
  // A HadeethEnc entry's number is an-Nawawi's: it is the entry's place only in his Forty.
  const numbered = item.number != null && (item.source !== 'hadeethenc' || inNawawi);
  return numbered ? `${name} · ${item.number}` : name;
}

/** The next unread entry of a list after `id`, wrapping; null when every one is read. */
export function nextUnread(rec: HadithRecord, rowIds: readonly string[], afterId?: string): string | null {
  if (!rowIds.length) return null;
  const start = afterId ? rowIds.indexOf(afterId) + 1 : 0;
  for (let i = 0; i < rowIds.length; i++) {
    const id = rowIds[(start + i) % rowIds.length];
    if (!isRead(rec, id)) return id;
  }
  return null;
}

/**
 * Where "Continue reading" goes. The hadith last opened — until it is
 * marked read: then the next of its list that is not, so the card leads
 * on rather than back to the one just finished. `listIds` is that list's
 * rows, null while they are not known (the card then waits on the last).
 * A list read to its end stays on its last hadith.
 */
export function resumeTarget(
  rec: HadithRecord,
  listIds: readonly string[] | null,
): { id: string; list?: string } | null {
  const last = continueAt(rec);
  if (!last || !isRead(rec, last.id)) return last;
  const next = listIds?.length ? nextUnread(rec, listIds, last.id) : null;
  return next ? { id: next, list: last.list } : last;
}
