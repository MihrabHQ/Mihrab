/**
 * The hadith on this device, as the screens read them: one entry, a list
 * of them, or the ones a search finds — whichever packs they came in.
 *
 * Built from the packs that are here (`packs.ts`) and rebuilt when one
 * arrives or goes; nothing in it is fetched.
 */
import {
  AGREED_IDS,
  bookChapters,
  findChapter,
  type BookChapter,
  compilationBooks,
  findCompilation,
  type Compilation,
  BOOKS,
  CategoryTree,
  categoriesKey,
  findHub,
  findSet,
  hencPackKey,
  NAWAWI_CROSSWALK,
  NAWAWI_KEY,
  bookKey,
  nawawiIds,
  packLangs,
  parseEntryId,
  parseList,
  WHOLE_PACK,
  type HadithSet,
} from './catalog';
import { isSahihBook, rowIndex, rowVerdicts, type BookRow, type GraderVerdict } from './bookGrades';
import { servedGrade } from './grade';
import { loadPack, packsRevision, packStatus, readyPackKeys } from './packs';
import type { BookFile, CategoriesFile, HencEntry, HencPack, NawawiFile, PackKey } from './packTypes';
import WITHHELD from './withheld.json';

export type HadithSource = 'hadeethenc' | 'nawawi' | 'book';

export type HadithItem = {
  id: string;
  source: HadithSource;
  /** The list title: HadeethEnc's, or the matn's first words. */
  title: string;
  /** The Arabic, with its diacritics. */
  arabic: string;
  /** The meaning, in `textLang`; null where there is none (Arabic readers, the books). */
  text: string | null;
  textLang: string | null;
  /** True when the app's language had no translation and English stands in. */
  fallback: boolean;
  attribution?: string;
  /** HadeethEnc's grade in its words; for a graded book, every grader's verdict on one line. */
  grade?: string;
  /** A graded book's hadith: each grader and his verdict, as hadith-api records them. */
  verdicts?: GraderVerdict[];
  /** al-Bukhārī's or Muslim's: read on the standing of the collection, not graded one by one. */
  sahihCollection?: boolean;
  explanation?: string;
  hints: string[];
  words: Array<{ word: string; meaning: string }>;
  categories: string[];
  /** an-Nawawi's number, or the book's own. */
  number?: number | null;
  book?: string;
};

export type ListRow = {
  id: string;
  title: string;
  number?: number | null;
  /** Who reported it and its grade, in HadeethEnc's words: the line under a title in a topic and in search. */
  note?: string;
};

/** Lets a long read step aside for the screen: a turn of the event loop. */
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// ── The index of HadeethEnc entries in a language ──────────────────────

type HencIndex = { lang: Map<string, HencEntry>; en: Map<string, HencEntry>; langs: string[] };
let indexCache: { key: string; index: Promise<HencIndex> } | null = null;

/**
 * The HadeethEnc packs of a language that are here: the whole one first,
 * then any smaller ones (a browser's, by set and by topic — `catalog.ts`).
 */
function readyHencKeys(lang: string): PackKey[] {
  const whole = hencPackKey(WHOLE_PACK, lang);
  const suffix = `/${lang}`;
  return readyPackKeys()
    .filter(k => k.startsWith('henc/') && k.endsWith(suffix))
    .sort((a, b) => Number(b === whole) - Number(a === whole) || a.localeCompare(b));
}

/** The HadeethEnc ids not served on the day the packs were last built (`grade.ts`). */
const WITHHELD_IDS: ReadonlySet<string> = new Set(WITHHELD.henc);

/**
 * Is an entry of a pack on this device read at all? A pack downloaded
 * before the rule (`grade.ts`, `servedGrade`) still holds what the rule
 * leaves out, until it is fetched again; and an Arabic pack says of each
 * entry, in its own grade, whether it is sound.
 */
export function entryServed(e: Pick<HencEntry, 'id' | 'g'>, packLang: string): boolean {
  if (WITHHELD_IDS.has(e.id)) return false;
  return packLang !== 'ar' || servedGrade(e.g);
}

async function indexOf(keys: PackKey[]): Promise<Map<string, HencEntry>> {
  const out = new Map<string, HencEntry>();
  for (const key of keys) {
    const pack = await loadPack<HencPack>(key);
    const lang = key.slice(key.lastIndexOf('/') + 1);
    for (const e of pack?.entries ?? []) if (!out.has(e.id) && entryServed(e, lang)) out.set(e.id, e);
  }
  return out;
}

export function hencIndex(appLang: string): Promise<HencIndex> {
  const langs = packLangs(appLang);
  const keys = langs.map(readyHencKeys);
  // The names, and how often a pack was replaced: a corrected pack has the name it had.
  const cacheKey = `${JSON.stringify(keys)}#${packsRevision()}`;
  if (indexCache?.key !== cacheKey) {
    indexCache = {
      key: cacheKey,
      index: (async () => ({
        lang: await indexOf(keys[0]),
        en: keys[1] ? await indexOf(keys[1]) : new Map(),
        langs,
      }))(),
    };
  }
  return indexCache.index;
}

/** The topic tree in the app's language, English where it has none. */
export async function categoryTree(appLang: string): Promise<CategoryTree | null> {
  for (const lang of packLangs(appLang)) {
    const file = await loadPack<CategoriesFile>(categoriesKey(lang));
    if (file) return new CategoryTree(file.items);
  }
  return null;
}

// ── One entry ──────────────────────────────────────────────────────────

/** The matn's first few words, as a list title for Arabic-only texts. */
export function openingWords(arabic: string, words = 9): string {
  const parts = arabic.split(/\s+/).filter(Boolean);
  return parts.length > words ? `${parts.slice(0, words).join(' ')}…` : parts.join(' ');
}

function hencItem(id: string, idx: HencIndex): HadithItem | null {
  const primary = idx.lang.get(id);
  const entry = primary ?? idx.en.get(id);
  if (!entry) return null;
  const arabicPack = idx.langs[0] === 'ar';
  const nawawi = NAWAWI_CROSSWALK.find(c => c.henc === id);
  return {
    id: `h:${id}`,
    source: 'hadeethenc',
    title: entry.t,
    arabic: arabicPack ? entry.h : entry.ar ?? '',
    text: arabicPack ? null : entry.h,
    textLang: arabicPack ? null : primary ? idx.langs[0] : 'en',
    fallback: !arabicPack && !primary,
    attribution: entry.a,
    grade: entry.g,
    explanation: entry.e,
    hints: (entry.x ?? []).map(h => h.trim()).filter(Boolean),
    words: entry.w ?? [],
    categories: entry.c,
    number: nawawi?.n,
  };
}

async function nawawiItem(n: number): Promise<HadithItem | null> {
  const file = await loadPack<NawawiFile>(NAWAWI_KEY);
  const row = file?.hadiths.find(h => h[0] === n);
  if (!row) return null;
  return {
    id: `n:${n}`,
    source: 'nawawi',
    title: openingWords(row[1]),
    arabic: row[1],
    text: null,
    textLang: null,
    fallback: false,
    hints: [],
    words: [],
    categories: [],
    number: n,
  };
}

// ── A book's rows ──────────────────────────────────────────────────────

const MARKS = '[\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]*';
/** A word as it may be written: any vowelling, either final yāʾ. */
const written = (w: string) => [...w].map(c => (c === 'ى' ? '[ىي]' : c) + MARKS).join('');
const SALAWAT = new RegExp(`(?:${['صلى', 'الله', 'عليه', 'وسلم'].map(written).join('\\s+')}|\\uFDFA)`);
/** "قال" / "يقول" and punctuation, between the blessing and what was said. */
const SAID = new RegExp(`^(?:[\\s:،.«"“]+|(?:${['قال', 'يقول'].map(written).join('|')})(?=[\\s:،«"“]))+`);

/**
 * A row's title for a hadith of the books.
 *
 * Open-Hadith-Data gives each hadith as one text, chain of narrators
 * first, and a chain opens the same way seven thousand times ("حدثنا عبد
 * الله بن يوسف قال أخبرنا مالك…"): titled by their opening words, the
 * rows of al-Bukhārī could not be told apart. So the title is an EXCERPT:
 * the words that follow the first "صلى الله عليه وسلم", which is where a
 * chain has reached the Prophet ﷺ and the report itself is under way. It
 * opens with "…" because it is cut from inside the text, not the text's
 * beginning, and nothing is added to it or reordered.
 *
 * Nine in ten rows of the six books have such a place. A text that does
 * not name him (a companion's own words, most of the Muwaṭṭaʾ's reports
 * from the people of Madinah) keeps its opening words, as before.
 */
export function bookRowTitle(text: string, words = 12): string {
  const m = SALAWAT.exec(text);
  if (m) {
    const rest = text.slice(m.index + m[0].length).replace(SAID, '');
    if (rest.split(/\s+/).filter(Boolean).length >= 3) return `… ${openingWords(rest, words)}`;
  }
  return openingWords(text, words);
}

const bookRowsCache = new WeakMap<object, ListRow[]>();
const bookPlacesCache = new WeakMap<object, Map<number, BookRow>>();

/**
 * The row an id's index names. An index is the row's place in
 * Open-Hadith-Data's file (`rowIndex`): in a graded book, which holds
 * some of that file's rows, not where the row stands in the pack.
 */
function bookRowAt(file: BookFile, index: number): BookRow | undefined {
  let places = bookPlacesCache.get(file);
  if (!places) {
    places = new Map(file.hadiths.map((h, at) => [rowIndex(h, at), h]));
    bookPlacesCache.set(file, places);
  }
  return places.get(index);
}

/** Every grader's verdict on one line: "Al-Albani: Sahih · Zubair Ali Zai: Isnaad Hasan". */
export function verdictsLine(verdicts: readonly GraderVerdict[]): string | undefined {
  return verdicts.length ? verdicts.map(v => `${v.grader}: ${v.grade}`).join(' · ') : undefined;
}

async function bookItem(book: string, index: number): Promise<HadithItem | null> {
  const file = await loadPack<BookFile>(bookKey(book));
  const row = file ? bookRowAt(file, index) : undefined;
  if (!row) return null;
  const verdicts = rowVerdicts(row, file?.grades?.graders);
  return {
    id: `b:${book}:${index}`,
    source: 'book',
    title: bookRowTitle(row[1], 9),
    arabic: row[1],
    text: null,
    textLang: null,
    fallback: false,
    grade: verdictsLine(verdicts),
    verdicts: verdicts.length ? verdicts : undefined,
    sahihCollection: isSahihBook(book) || undefined,
    hints: [],
    words: [],
    categories: [],
    number: row[0],
    book,
  };
}

export async function loadItem(id: string, appLang: string): Promise<HadithItem | null> {
  const ref = parseEntryId(id);
  if (!ref) return null;
  if (ref.kind === 'henc') {
    const item = hencItem(ref.id, await hencIndex(appLang));
    if (item) return item;
    // One of the Forty whose HadeethEnc entry is not in this language's
    // packs: the Arabic, from an-Nawawi's own text.
    const n = NAWAWI_CROSSWALK.find(c => c.henc === ref.id)?.n;
    return n ? nawawiItem(n) : null;
  }
  if (ref.kind === 'nawawi') return nawawiItem(ref.n);
  return bookItem(ref.book, ref.index);
}

// ── Lists ──────────────────────────────────────────────────────────────

function rowOf(id: string, idx: HencIndex): ListRow | null {
  const e = idx.lang.get(id) ?? idx.en.get(id);
  return e ? { id: `h:${id}`, title: e.t } : null;
}

/**
 * Who reported an entry and how it is graded, as HadeethEnc words both,
 * on one line. Some attributions run over several ("the first narration:
 * … the second: …"); a row has room for the start of one.
 */
export function entryNote(e: Pick<HencEntry, 'a' | 'g'>): string | undefined {
  const parts = [e.a, e.g].map(v => (v ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Every topic under these, each with the place of the topic it was reached from. */
function topicRanks(topics: readonly string[], tree: CategoryTree | null): Map<string, number> {
  const rank = new Map<string, number>();
  topics.forEach((t, i) => {
    for (const id of tree ? tree.within(t) : [t]) if (!rank.has(id)) rank.set(id, i);
  });
  return rank;
}

/**
 * HadeethEnc entries under any of these topics: the first topic's, then
 * the second's, each in the order the packs give them. They are a
 * reference list, so each row says who reported it.
 */
function underTopics(idx: HencIndex, topics: readonly string[], tree: CategoryTree | null): ListRow[] {
  const rank = topicRanks(topics, tree);
  const seen = new Set<string>();
  const rows: Array<{ row: ListRow; at: number }> = [];
  for (const map of [idx.lang, idx.en]) {
    for (const e of map.values()) {
      if (seen.has(e.id)) continue;
      let at = Infinity;
      for (const c of e.c) at = Math.min(at, rank.get(c) ?? Infinity);
      if (at === Infinity) continue;
      seen.add(e.id);
      rows.push({ row: { id: `h:${e.id}`, title: e.t, note: entryNote(e) }, at });
    }
  }
  // Stable: within a topic, the packs' order.
  return rows.sort((a, b) => a.at - b.at).map(r => r.row);
}

/**
 * Whether the entries here say which grade they carry (`q`, `grade.ts`).
 * A pack downloaded before they did has none, and neither has a
 * translation rebuilt from HadeethEnc on the device (`origin.ts`); a grade
 * filter over such a pack would answer "nothing found" to every search.
 *
 * Asked of EACH language on show, not of either: with the reader's own
 * language saying nothing and English saying, the filter would list the
 * entries English stands in for and silently leave out every one the
 * reader has in their own language. It is not offered until the pack has
 * been fetched again (`packUpdates.ts`).
 */
export async function gradesKnown(appLang: string): Promise<boolean> {
  const idx = await hencIndex(appLang);
  const maps = [idx.lang, idx.en].filter(m => m.size > 0);
  const says = (m: Map<string, HencEntry>) => {
    for (const e of m.values()) if (e.q) return true;
    return false;
  };
  return maps.length > 0 && maps.every(says);
}

const countsCache = new WeakMap<HencIndex, Promise<Map<string, number>>>();

/**
 * How many hadith are under each topic — in it or in anything below it —
 * counted from the entries that are here, each once.
 *
 * Not the tree's own figure (`CategoryTree.count`): that is HadeethEnc's
 * count in one language, and a topic's list here also holds the entries
 * English stands in for, so a German reader's "12" opened a list of 40.
 */
export function topicCounts(appLang: string): Promise<Map<string, number>> {
  return hencIndex(appLang).then(idx => {
    let counts = countsCache.get(idx);
    if (!counts) {
      counts = categoryTree(appLang).then(tree => {
        const out = new Map<string, number>();
        const seen = new Set<string>();
        for (const map of [idx.lang, idx.en]) {
          for (const e of map.values()) {
            if (seen.has(e.id)) continue;
            seen.add(e.id);
            const under = new Set<string>();
            for (const c of e.c) for (const t of tree ? tree.path(c) : [c]) under.add(t);
            for (const t of under) out.set(t, (out.get(t) ?? 0) + 1);
          }
        }
        return out;
      });
      countsCache.set(idx, counts);
    }
    return counts;
  });
}

async function nawawiRows(idx: HencIndex): Promise<ListRow[]> {
  const file = await loadPack<NawawiFile>(NAWAWI_KEY);
  const arabic = new Map(file?.hadiths.map(h => [h[0], h[1]]) ?? []);
  return nawawiIds().map((id, i) => {
    const n = NAWAWI_CROSSWALK[i].n;
    const row = id.startsWith('h:') ? rowOf(id.slice(2), idx) : null;
    // Its HadeethEnc entry, or an-Nawawi's Arabic in its place.
    return row
      ? { ...row, number: n }
      : { id: `n:${n}`, title: openingWords(arabic.get(n) ?? ''), number: n };
  });
}

export async function setRows(set: HadithSet, appLang: string): Promise<ListRow[]> {
  if (set.book) return bookRows(set.book);
  const idx = await hencIndex(appLang);
  if (set.nawawi) return nawawiRows(idx);
  // Chosen, and in the order chosen. An entry HadeethEnc has since
  // withdrawn is left out and the set is that much shorter.
  return (set.ids ?? []).flatMap(id => rowOf(id, idx) ?? []);
}

export async function bookRows(book: string): Promise<ListRow[]> {
  const file = await loadPack<BookFile>(bookKey(book));
  if (!file) return [];
  let rows = bookRowsCache.get(file);
  if (!rows) {
    rows = file.hadiths.map((h, i) => ({ id: `b:${book}:${rowIndex(h, i)}`, title: bookRowTitle(h[1]), number: h[0] }));
    bookRowsCache.set(file, rows);
  }
  return rows;
}

/** Is this row of a book (`b:<book>:<place>`) in the chapter? */
export function inChapter(id: string, chapter: BookChapter): boolean {
  const place = Number(id.slice(id.lastIndexOf(':') + 1));
  return place >= chapter.from && place < chapter.to;
}

/** How many of a book's rows each of its chapters holds, by the chapter's number. */
export function chapterCounts(book: string, rows: readonly ListRow[]): Map<number, number> {
  const chapters = bookChapters(book);
  const counts = new Map<number, number>();
  let at = 0;
  for (const r of rows) {
    const place = Number(r.id.slice(r.id.lastIndexOf(':') + 1));
    // The rows are in the book's order, and so are its chapters.
    while (at + 1 < chapters.length && place >= chapters[at].to) at++;
    const c = chapters[at];
    if (c && place >= c.from && place < c.to) counts.set(c.no, (counts.get(c.no) ?? 0) + 1);
  }
  return counts;
}

/**
 * A compilation's rows, in its compiler's order and under his numbers:
 * the HadeethEnc entry where the hadith has one here (a translation), the
 * book's own row otherwise. A hadith whose book is not on the device, or
 * whose row a later build of the book no longer holds, is left out.
 */
export async function compilationRows(c: Compilation, appLang: string): Promise<ListRow[]> {
  const idx = await hencIndex(appLang);
  const files = new Map<string, BookFile | null>();
  // Whichever of its books are here: the Sunan are not asked for (`compilationNeeds`).
  for (const book of compilationBooks(c)) {
    files.set(book, packStatus(bookKey(book)).state === 'ready' ? await loadPack<BookFile>(bookKey(book)) : null);
  }
  const rows: ListRow[] = [];
  for (const r of c.rows) {
    const translated = r.henc ? rowOf(r.henc, idx) : null;
    if (translated) {
      rows.push(c.numbered ? { ...translated, number: r.n } : translated);
      continue;
    }
    const file = r.book ? files.get(r.book) : null;
    const row = file ? bookRowAt(file, r.index) : undefined;
    if (row) rows.push({ id: `b:${r.book}:${r.index}`, title: bookRowTitle(row[1]), ...(c.numbered ? { number: r.n } : null) });
  }
  return rows;
}

/**
 * Of a compilation's hadith that are not among the rows shown, how many
 * wait for a book to be downloaded — and for nothing else. The list says
 * "N more appear once those books are on this device", and that has to be
 * true of every one of the N: a hadith told only by a HadeethEnc entry
 * that is not translated into the reader's language (or English) is not
 * shown either, and no download brings it. Counting every missing row
 * told a reader of ʿUmdat al-Aḥkām, all of whose hadith are from the two
 * Ṣaḥīḥs, that two more were "from the Sunan".
 */
export function compilationWaiting(c: Compilation, shown: readonly ListRow[]): number {
  const here = new Set(shown.map(r => r.id));
  return c.rows.filter(
    r =>
      r.book !== '' &&
      !here.has(`b:${r.book}:${r.index}`) &&
      !(r.henc && here.has(`h:${r.henc}`)) &&
      packStatus(bookKey(r.book)).state !== 'ready',
  ).length;
}

/** The rows of a list id (`catalog.ts`). Bookmarks are the caller's: they come from the record. */
export async function listRows(list: string, appLang: string, bookmarks: readonly string[] = []): Promise<ListRow[]> {
  const ref = parseList(list);
  if (!ref) return [];
  if (ref.kind === 'set') {
    const set = findSet(ref.id);
    return set ? setRows(set, appLang) : [];
  }
  if (ref.kind === 'cat') {
    return underTopics(await hencIndex(appLang), [ref.id], await categoryTree(appLang));
  }
  if (ref.kind === 'hub') {
    const hub = findHub(ref.id);
    return hub ? underTopics(await hencIndex(appLang), hub.topics, await categoryTree(appLang)) : [];
  }
  if (ref.kind === 'book') {
    const rows = await bookRows(ref.id);
    const chapter = ref.chapter != null ? findChapter(ref.id, ref.chapter) : undefined;
    return chapter ? rows.filter(r => inChapter(r.id, chapter)) : rows;
  }
  if (ref.kind === 'comp') {
    const c = findCompilation(ref.id);
    return c ? compilationRows(c, appLang) : [];
  }
  if (ref.kind === 'agreed') {
    // In the list's order. An entry HadeethEnc has since withdrawn or
    // regraded is not in the pack, and the list is that much shorter.
    const idx = await hencIndex(appLang);
    return AGREED_IDS.flatMap(id => rowOf(id, idx) ?? []);
  }
  const rows: ListRow[] = [];
  for (const id of bookmarks) {
    const item = await loadItem(id, appLang);
    if (item) rows.push({ id, title: item.title, number: item.number });
  }
  return rows;
}

// ── Search ─────────────────────────────────────────────────────────────

/** "٢٣٤٥" and "۲۳۴۵" as "2345": a hadith's number, however the keyboard writes it. */
export function latinDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 0xf));
}

/**
 * For matching, not for showing: Arabic without its diacritics and with
 * its letter variants made one (أ إ آ → ا, ى → ي, ة → ه), and Latin
 * without accents, in lower case. A reader types "salah" for "ṣalāh" and
 * "انما" for "إِنَّمَا". The vowel signs of the Indic scripts are letters'
 * own and stay.
 */
export function foldForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u200E\u200F]/g, '')
    .toLowerCase()
    // Marks are kept: a Bengali or Hindi word is written with them, and
    // putting a space where each vowel sign was left "নামাজ" as three
    // single letters — which a search then threw away, finding nothing.
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SearchHit = ListRow & {
  where: 'hadeethenc' | 'nawawi' | 'book';
  book?: string;
  /** The words around the match, from the text itself; absent when the title already shows it. */
  snippet?: string;
  /** True when the match is in HadeethEnc's explanation and not in the hadith. */
  inExplanation?: boolean;
};

export type SearchOptions = {
  limit?: number;
  /** Only this book: the filter field of a book's own list. */
  book?: string;
  /** Only HadeethEnc's entries under these topics: a topic's own field, the search's topic filter. */
  topics?: readonly string[];
  /** Only HadeethEnc's entries reported by al-Bukhārī or Muslim (`sahihayn.ts`). */
  sahihayn?: boolean;
  /** Only HadeethEnc's entries it grades ṣaḥīḥ (1) or ḥasan (2) outright (`grade.ts`). */
  grade?: 1 | 2;
  /** Only the books that are on the device. */
  booksOnly?: boolean;
  /** A newer query has replaced this one. */
  isCancelled?: () => boolean;
  /** What has been found so far, as each source is finished. */
  onPartial?: (hits: SearchHit[]) => void;
};

const foldedCache = new WeakMap<object, string>();
function folded(obj: object, text: () => string): string {
  let f = foldedCache.get(obj);
  if (f === undefined) {
    f = ` ${foldForSearch(text())} `;
    foldedCache.set(obj, f);
  }
  return f;
}

/** A row's title, folded once: a list's filter runs on every keystroke. */
export function foldedTitle(row: ListRow): string {
  return folded(row, () => row.title);
}

/** An entry's title folded on its own, apart from the entry's whole text: a key for `folded`. */
const titleKeys = new WeakMap<HencEntry, object>();
function titleOf(e: HencEntry): object {
  let k = titleKeys.get(e);
  if (!k) titleKeys.set(e, (k = {}));
  return k;
}

/** The explanation and the lessons, folded apart from the hadith: a match there ranks lower. */
const explanationCache = new WeakMap<object, string>();
function foldedExplanation(e: HencEntry): string {
  let f = explanationCache.get(e);
  if (f === undefined) {
    f = ` ${foldForSearch(`${e.e ?? ''} ${(e.x ?? []).join(' ')}`)} `;
    explanationCache.set(e, f);
  }
  return f;
}

/**
 * The words around the first match, as they are written — diacritics,
 * capitals and all. Found word by word, because a folded text is not the
 * same length as its original and an index into one is not an index into
 * the other.
 */
export function snippetAround(text: string, words: readonly string[], before = 4, after = 14): string | null {
  const parts = text.split(/\s+/).filter(Boolean);
  let at = -1;
  for (let i = 0; i < parts.length && at < 0; i++) {
    const f = foldForSearch(parts[i]);
    if (f && words.some(w => f.includes(w))) at = i;
  }
  if (at < 0) return null;
  const from = Math.max(0, at - before);
  const to = Math.min(parts.length, at + after + 1);
  return `${from > 0 ? '… ' : ''}${parts.slice(from, to).join(' ')}${to < parts.length ? ' …' : ''}`;
}

/**
 * How far a text's words are from the words asked for: 0 when each is
 * there as a word of its own, a little more for each letter a word runs
 * on by ("intentions" for "intention"), and more again when it is only
 * found inside another word. Lower is nearer.
 *
 * This weighs the MATCH, not the hadith: "intention" was answered with
 * "…falsely and intentionally…" above "…good intention…" and "…depends on
 * the intentions…", because all three hold the letters and the pack had
 * them in that order (Pixel 10 Pro, 2026-11-26). Among texts that match
 * equally closely the packs' order still stands.
 */
export function matchDistance(hay: string, words: readonly string[]): number {
  let sum = 0;
  for (const w of words) {
    let best = Infinity;
    for (let at = hay.indexOf(w); at >= 0 && best > 0; at = hay.indexOf(w, at + 1)) {
      const start = hay.lastIndexOf(' ', at) + 1;
      let end = hay.indexOf(' ', at + w.length);
      if (end < 0) end = hay.length;
      const before = at - start;
      const after = end - (at + w.length);
      best = Math.min(best, (before ? INSIDE_A_WORD + before : 0) + after);
    }
    sum += best === Infinity ? NOT_THERE : best;
  }
  return sum;
}
const INSIDE_A_WORD = 3;
const NOT_THERE = 99;

/** Nearest match first; equal matches as they were found (the sort is stable). */
function nearestFirst<T extends { near: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.near - b.near);
}

class Cancelled extends Error {}

const matnWordsCache = new WeakMap<object, Set<string>>();
/** The words of an entry's Arabic, unvowelled: what two entries of one hadith share. */
function matnWords(e: HencEntry): Set<string> {
  let w = matnWordsCache.get(e);
  if (!w) {
    w = new Set(foldForSearch(e.ar ?? e.h).split(' ').filter(Boolean));
    matnWordsCache.set(e, w);
  }
  return w;
}

/** How much of two entries' Arabic is the same words, 0–1. */
const SAME_MATN = 0.8;

/**
 * Is `b` the hadith `a` already is, entered a second time?
 *
 * HadeethEnc holds some hadith twice — an-Nawawi's Forty were added as
 * he worded them, beside the entries it already had — and a search for
 * "purity" answered with "Purity is half of faith…" on two rows that
 * read the same (Pixel 10 Pro, 2026-11-25). The second is left out of a
 * search's results when the Arabic is four-fifths the same words AND the
 * two are attributed and graded in the same words: where HadeethEnc
 * grades one "authentic" and its twin "good", both stay, because leaving
 * one out would be choosing which grade the reader is shown. Both are
 * still in their topics' lists.
 */
export function sameHadithTwice(a: HencEntry, b: HencEntry): boolean {
  if ((a.g ?? '').trim() !== (b.g ?? '').trim() || (a.s ?? 0) !== (b.s ?? 0)) return false;
  const x = matnWords(a);
  const y = matnWords(b);
  if (x.size < 6 || y.size < 6) return false;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both) >= SAME_MATN;
}

/**
 * Everything on the device that holds every word of the query.
 *
 * In this order: HadeethEnc entries whose TITLE holds it, those whose
 * meaning or Arabic does, an-Nawawi's Arabic, the books, and last the
 * HadeethEnc entries where only the explanation does — a hadith that
 * says a thing comes before one whose commentary mentions it.
 *
 * The title first, because an entry's title is the hadith's own opening
 * words, and that is what a hadith is known and looked for by. In the
 * packs' order alone, "intention" answered with "An army will invade the
 * Kaʿbah…" (its last line has the word) and had "Verily, the reward of
 * deeds depends on the intentions…" further down the page (Pixel 10 Pro,
 * 2026-11-25). Within each of the two, the nearest match comes first
 * (`matchDistance`: the word itself before a longer word that holds it),
 * and among equal matches the packs' order stands: nothing here weighs
 * one hadith against another. So every HadeethEnc entry is
 * looked at before the answer is given, not only as many as fill a page —
 * a title on the pack's last entry is found — which is three and a half
 * thousand texts already folded (`warmSearch`).
 *
 * A text is folded the first time it is searched, and a book is
 * megabytes: that is seconds on a phone. So the work is done a slice at
 * a time, handing the thread back between slices, a newer query stops an
 * older one (`isCancelled`), and what one source found is handed over
 * before the next is read (`onPartial`).
 */
export async function searchHadith(query: string, appLang: string, options: SearchOptions | number = {}): Promise<SearchHit[]> {
  const opts: SearchOptions = typeof options === 'number' ? { limit: options } : options;
  const limit = opts.limit ?? 80;
  const words = foldForSearch(query).split(' ').filter(w => w.length > 1);
  if (!words.length) return [];
  const matches = (hay: string) => words.every(w => hay.includes(w));
  /** HadeethEnc's entries that hold it: in the title, and in the text only. */
  const titled: Array<{ e: HencEntry; hit: SearchHit; near: number }> = [];
  const inText: Array<{ e: HencEntry; hit: SearchHit; near: number }> = [];
  /** an-Nawawi's Arabic and the books. */
  const hits: SearchHit[] = [];
  const explained: SearchHit[] = [];
  const EXPLAINED_MOST = 20;

  let since = Date.now();
  let seenRows = 0;
  const breathe = async () => {
    if (++seenRows % 32 !== 0 || Date.now() - since < 12) return;
    await pause();
    since = Date.now();
    if (opts.isCancelled?.()) throw new Cancelled();
  };
  const held = () => titled.length + inText.length;
  const full = () => held() + hits.length >= limit;
  const result = () =>
    [...nearestFirst(titled).map(r => r.hit), ...nearestFirst(inText).map(r => r.hit), ...hits, ...explained].slice(0, limit);

  // A topic or "al-Bukhārī and Muslim" is asked of HadeethEnc's entries:
  // a book's hadith has no topic, and the books are not searched then.
  const hencOnly = !!opts.topics?.length || !!opts.sahihayn || !!opts.grade;
  const wanted = opts.topics?.length ? topicRanks(opts.topics, await categoryTree(appLang)) : null;

  try {
    const seen = new Set<string>();
    if (!opts.book && !opts.booksOnly) {
      const idx = await hencIndex(appLang);
      for (const map of [idx.lang, idx.en]) {
        for (const e of map.values()) {
          // A page of titles is the whole answer; short of that, every entry is looked at.
          if (titled.length >= limit) break;
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          if (opts.sahihayn && e.s !== 1) continue;
          if (opts.grade && e.q !== opts.grade) continue;
          if (wanted && !e.c.some(c => wanted.has(c))) continue;
          await breathe();
          const inTitle = matches(folded(e, () => `${e.t} ${e.h} ${e.ar ?? ''}`));
          if (inTitle) {
            const titleHas = matches(folded(titleOf(e), () => e.t));
            // Past a page, an entry that holds it in its text would not be shown.
            if (!titleHas && held() >= limit) continue;
            if (titled.some(k => sameHadithTwice(k.e, e))) continue;
            const twin = inText.findIndex(k => sameHadithTwice(k.e, e));
            if (twin >= 0) {
              if (!titleHas) continue;
              // The same hadith, and this entry has the words in its title: this is the one shown.
              inText.splice(twin, 1);
            }
            const snippet = titleHas ? undefined : snippetAround(e.h, words) ?? (e.ar ? snippetAround(e.ar, words) : null) ?? undefined;
            (titleHas ? titled : inText).push({
              e,
              near: matchDistance(titleHas ? folded(titleOf(e), () => e.t) : folded(e, () => `${e.t} ${e.h} ${e.ar ?? ''}`), words),
              hit: { id: `h:${e.id}`, title: e.t, note: entryNote(e), where: 'hadeethenc', snippet },
            });
          } else if (explained.length < EXPLAINED_MOST && (e.e || e.x?.length)) {
            const both = `${folded(e, () => `${e.t} ${e.h} ${e.ar ?? ''}`)}${foldedExplanation(e)}`;
            if (matches(both)) {
              const snippet = snippetAround(`${e.e ?? ''} ${(e.x ?? []).join(' ')}`, words) ?? undefined;
              explained.push({ id: `h:${e.id}`, title: e.t, where: 'hadeethenc', snippet, inExplanation: true });
            }
          }
        }
      }
      opts.onPartial?.(result());

      const nawawi = full() || hencOnly ? null : await loadPack<NawawiFile>(NAWAWI_KEY);
      for (const h of nawawi?.hadiths ?? []) {
        if (full()) break;
        const id = NAWAWI_CROSSWALK.find(c => c.n === h[0])?.henc;
        if (id && seen.has(id)) continue;
        if (matches(folded(h, () => h[1]))) {
          hits.push({ id: `n:${h[0]}`, title: openingWords(h[1]), number: h[0], where: 'nawawi' });
        }
      }
    }

    for (const book of opts.book ? [opts.book] : hencOnly ? [] : BOOKS) {
      if (full()) break;
      if (packStatus(bookKey(book)).state !== 'ready') continue;
      const file = await loadPack<BookFile>(bookKey(book));
      const rows = file?.hadiths ?? [];
      for (let i = 0; i < rows.length && !full(); i++) {
        await breathe();
        if (matches(folded(rows[i], () => rows[i][1]))) {
          hits.push({
            id: `b:${book}:${rowIndex(rows[i], i)}`,
            title: bookRowTitle(rows[i][1]),
            number: rows[i][0],
            where: 'book',
            book,
            snippet: snippetAround(rows[i][1], words) ?? undefined,
          });
        }
      }
      opts.onPartial?.(result());
    }
  } catch (e) {
    if (e instanceof Cancelled) return [];
    throw e;
  }
  return result();
}

/**
 * Fold the HadeethEnc packs that are here before anyone searches them,
 * a slice at a time while nothing else is going on, so the first query
 * answers as fast as the second. The books are left for the first query
 * that reaches them: together they are sixty megabytes, and a folded copy
 * of a book nobody searches is memory spent on nothing.
 */
export async function warmSearch(appLang: string, isCancelled: () => boolean = () => false): Promise<void> {
  const idx = await hencIndex(appLang);
  let since = Date.now();
  for (const map of [idx.lang, idx.en]) {
    for (const e of map.values()) {
      if (isCancelled()) return;
      folded(e, () => `${e.t} ${e.h} ${e.ar ?? ''}`);
      foldedExplanation(e);
      if (Date.now() - since >= 8) {
        // A longer rest than a search takes: this is nobody's wait.
        await new Promise<void>(resolve => setTimeout(resolve, 24));
        since = Date.now();
      }
    }
  }
}
