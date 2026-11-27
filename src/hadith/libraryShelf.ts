/**
 * The Library: whole books to read, beside the hadith.
 *
 * A book is a pack like any other here (`library/<id>`, downloaded on
 * request, checked against the manifest) and is NOT hadith served by the
 * app's rule: it is its author's text, shown whole and graded by no one
 * here (docs/hadith-policy.md, "The Library"). So nothing in this file
 * reaches into search, the topics, the hadith of the day or a
 * compilation; a book is read on its own pages and nowhere else.
 *
 * The list is the books this build knows how to name. One is offered when
 * our copy's manifest names its pack, or the pack is already on the
 * device — so a build is never ahead of what can be downloaded.
 */
import AsyncStorage from '../storage/appStorage';
import BOOKS from './libraryBooks.json';
import { libraryMarkKey, libraryMarksOf, setLibraryMark } from './hadithRecord';
import { getHadithRecord, hydrateHadithRecord, updateHadithRecord } from './hadithStore';
import { manifestEntry } from './packs';
import type { Manifest, PackKey } from './packTypes';
import { validLibraryPdf } from './libraryPdf';
import { pdfSupported } from '../native/MihrabPdf';

/** `level`: 1 to begin with, 2 for a later stage — the maintainer's own two lists. What a book is, in the reader's language, is `hadith.library.about.<id>`. */
export type LibraryBook = {
  id: string;
  title: string;
  latin: string;
  author: string;
  authorLatin: string;
  died: string;
  level: 1 | 2;
  /** The language the book is written in: what its page is set in, whatever the app's is. */
  lang: string;
  /** What it is about: the shelf it stands on. */
  subject: LibrarySubject;
  /** A book, a short text made to be learnt (`matn`), or a commentary on another's (`sharh`). */
  kind: 'book' | 'matn' | 'sharh';
  /** The school a book of fiqh is written in. Said on the shelf: a primer of one school is not every reader's. */
  /** A school; or 'evidence': a work that argues from the evidence across the schools and is of no one of them. */
  madhhab?: 'hanafi' | 'maliki' | 'shafii' | 'hanbali' | 'evidence';
  /** A book that is a typeset file, read page by page (`libraryPdf.ts`); absent for a book that is text. */
  format?: 'pdf';
  /**
   * What the book is, in the book's own language: for a book offered only to those who read that language,
   * in place of `hadith.library.about.<id>` in thirteen. An Arabic book, which everyone is offered, has none.
   */
  about?: string;
};
/** The shelves, in the order they stand. */
export const LIBRARY_SUBJECTS = ['quran', 'hadith', 'sira', 'creed', 'fiqh', 'heart', 'letters'] as const;
export type LibrarySubject = (typeof LIBRARY_SUBJECTS)[number];
export const LIBRARY_BOOKS: readonly LibraryBook[] = BOOKS as LibraryBook[];

/** The language a book's page is set in; Arabic for a book this build does not know. */
export function libraryBookLang(book: Pick<LibraryBook, 'lang'> | undefined): string {
  return book?.lang ?? 'ar';
}

/** The books by shelf: each subject that has any, the ones to begin with first, otherwise in the list's order. */
export function libraryShelves(books: readonly LibraryBook[]): { subject: LibrarySubject; books: LibraryBook[] }[] {
  return LIBRARY_SUBJECTS.map(subject => ({
    subject,
    books: [1, 2].flatMap(level => books.filter(b => b.subject === subject && b.level === level)),
  })).filter(s => s.books.length > 0);
}

/** What the shelf says of a book beside its author: its school, that it is a commentary, that it is for later. Keys for `t`. */
export function libraryBookTags(book: Pick<LibraryBook, 'kind' | 'level' | 'madhhab'>): string[] {
  return [
    ...(book.madhhab ? [book.madhhab === 'evidence' ? 'hadith.library.acrossSchools' : `settings.madhab_${book.madhhab}`] : []),
    ...(book.kind === 'sharh' ? ['hadith.library.commentary'] : []),
    ...(book.level === 2 ? ['hadith.library.levelLater'] : []),
  ];
}
/**
 * The language to name on a book, in that language's own name: a book in a language the reader asked for
 * (or holds already), among books in the reader's own. Arabic is everyone's and a reader's own languages
 * are what the shelf is in; neither is named. null: nothing to say.
 */
export function libraryBookLanguageChip(book: Pick<LibraryBook, 'lang'>, own: readonly string[]): string | null {
  const lang = libraryBookLang(book);
  if (lang === 'ar' || own.some(o => sameLanguage(o, lang))) return null;
  return LIBRARY_LANGUAGE_NAMES[lang] ?? null;
}
export const libraryKey = (id: string): PackKey => `library/${id}`;
export function findLibraryBook(id: string): LibraryBook | undefined {
  return LIBRARY_BOOKS.find(b => b.id === id);
}

/**
 * The books to offer: named by the manifest, or here already — and, given
 * the reader's language, the ones that reader can read: the Arabic books
 * are everyone's (the shelf began with them, and a learner opens them
 * too), and a book in another language is offered to those whose app, or
 * whose hadith, is in it. One already downloaded is never hidden.
 */
export function offeredLibraryBooks(manifest: Manifest | null, here: (key: PackKey) => boolean, reads?: readonly string[]): LibraryBook[] {
  const read = (b: LibraryBook) => !reads || b.lang === 'ar' || reads.some(l => sameLanguage(l, b.lang));
  // A book that is a file is offered where the file can be had and read: named by the manifest, of a size
  // a phone is asked to fetch, on a build that can draw it.
  const had = (b: LibraryBook) => {
    const entry = manifestEntry(manifest, libraryKey(b.id));
    return entry != null && (b.format !== 'pdf' || (pdfSupported() && validLibraryPdf(entry.pdf)));
  };
  return LIBRARY_BOOKS.filter(b => (here(libraryKey(b.id)) && (b.format !== 'pdf' || pdfSupported())) || (had(b) && read(b)));
}

/** "id" and "id-ID" are one language. */
const sameLanguage = (a: string, b: string) => a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0];

/** A language's own name for itself, for the languages there are books in. */
export const LIBRARY_LANGUAGE_NAMES: Record<string, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
  sv: 'Svenska',
  bn: 'বাংলা',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  hi: 'हिन्दी',
  ru: 'Русский',
  tr: 'Türkçe',
  ur: 'اردو',
  zh: '中文',
};

/**
 * The languages a reader is shown books in without asking: the app's,
 * the one hadith are read in, and the phone's own — an Indonesian reader
 * who keeps the app in Arabic or English has a phone that says so.
 */
export function libraryOwnLanguages(...langs: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const l of langs) {
    const base = typeof l === 'string' ? l.toLowerCase().split(/[-_]/)[0] : '';
    if (/^[a-z]{2,3}$/.test(base) && !out.includes(base)) out.push(base);
  }
  return out;
}

/**
 * The languages there are books in that this reader is not shown already:
 * what the shelf offers to switch on. Arabic is never one (its books are
 * everyone's).
 */
export function libraryOtherLanguages(own: readonly string[], books: readonly LibraryBook[] = LIBRARY_BOOKS): string[] {
  const all = [...new Set(books.map(b => b.lang))].filter(l => l !== 'ar' && !own.some(o => sameLanguage(o, l)));
  return all.sort((a, b) => (LIBRARY_LANGUAGE_NAMES[a] ?? a).localeCompare(LIBRARY_LANGUAGE_NAMES[b] ?? b));
}

/** The phone's own language, where it can be asked. */
export function deviceLanguage(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}

/**
 * Where a reader is in each book: the chapter last opened, by its place.
 * Kept on the device and not carried to another (`syncCompleteness`): a
 * bookmark of convenience, lost with nothing else.
 */
const PLACE_KEY = 'mihrab.library.place.v1';
let places: Record<string, number> | null = null;

async function loadPlaces(): Promise<Record<string, number>> {
  if (places) return places;
  try {
    const raw = await AsyncStorage.getItem(PLACE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    const out: Record<string, number> = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[k] = n;
    }
    places = out;
  } catch {
    places = {};
  }
  return places;
}

export async function libraryPlace(id: string): Promise<number | null> {
  return (await loadReading())[id]?.c ?? (await loadPlaces())[id] ?? null;
}

export async function setLibraryPlace(id: string, chapter: number): Promise<void> {
  const all = await loadPlaces();
  if (all[id] === chapter) return;
  all[id] = chapter;
  await AsyncStorage.setItem(PLACE_KEY, JSON.stringify(all)).catch(() => undefined);
}

/**
 * Where a reader is, to the paragraph: the chapter (`c`), the block in it
 * (`b`), how far through the chapter that is (`f`, 0–1), and what the
 * shelf needs to say so without opening the book — how many chapters it
 * has (`n`) and the chapter's name (`t`) — with when (`at`), so the shelf
 * can offer the book last read. On the device only, like the chapter
 * place it grew out of (`mihrab.library.place.v1`, still read for a book
 * not opened since).
 */
export type LibraryReading = { c: number; b: number; f: number; n: number; t: string; at: number };
const READING_KEY = 'mihrab.library.reading.v1';
let reading: Record<string, LibraryReading> | null = null;

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
function validReading(v: unknown): v is LibraryReading {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return whole(r.c) && whole(r.b) && whole(r.n) && r.n > 0 && typeof r.f === 'number' && r.f >= 0 && r.f <= 1 && typeof r.t === 'string' && typeof r.at === 'number';
}

async function loadReading(): Promise<Record<string, LibraryReading>> {
  if (reading) return reading;
  const out: Record<string, LibraryReading> = {};
  try {
    const raw = await AsyncStorage.getItem(READING_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, r] of Object.entries(v)) if (validReading(r)) out[k] = r;
    }
  } catch {
    // Nothing kept is nothing lost: the book opens at its beginning.
  }
  reading = out;
  return reading;
}

export async function libraryReading(id: string): Promise<LibraryReading | null> {
  return (await loadReading())[id] ?? null;
}

/** Every book's place, for the shelf. */
export async function libraryReadings(): Promise<Record<string, LibraryReading>> {
  return { ...(await loadReading()) };
}

export async function setLibraryReading(id: string, at: LibraryReading): Promise<void> {
  const all = await loadReading();
  const was = all[id];
  if (was && was.c === at.c && was.b === at.b) return;
  all[id] = at;
  await AsyncStorage.setItem(READING_KEY, JSON.stringify(all)).catch(() => undefined);
}

/** How far through a book a place is, 0–1: whole chapters behind it and the part of this one. By chapters, not by words. */
export function libraryProgress(r: Pick<LibraryReading, 'c' | 'f' | 'n'>): number {
  return Math.min(1, Math.max(0, (r.c + r.f) / r.n));
}

/** The book last read, of those given. */
export function lastReadBook(readings: Record<string, LibraryReading>, ids: readonly string[]): string | null {
  let best: string | null = null;
  for (const id of ids) if (readings[id] && (best == null || readings[id].at > readings[best].at)) best = id;
  return best;
}

/**
 * Bookmarks: paragraphs a reader marked, by chapter and block, newest
 * first. A mark is a place and not a copy of the text, which is read from
 * the book when it is shown.
 *
 * They are the reader's own record, so they are kept where the hadith
 * bookmarks and notes are — the hadith record, encrypted, carried by
 * backup and sync and merged mark by mark (`hadithRecord.ts`, `library`;
 * the maintainer's decision of 2026-11-26). For a day they were a key of
 * their own on the device (`mihrab.library.bookmarks.v1`): what is found
 * there is moved into the record once, with the time each was made, and
 * the key is removed.
 */
export type LibraryBookmark = { c: number; b: number; at: number };
const OLD_BOOKMARKS_KEY = 'mihrab.library.bookmarks.v1';
let moved: Promise<void> | null = null;

function moveOldBookmarks(): Promise<void> {
  if (!moved) {
    moved = (async () => {
      try {
        const raw = await AsyncStorage.getItem(OLD_BOOKMARKS_KEY);
        if (!raw) return;
        const v: unknown = JSON.parse(raw);
        const found: [string, LibraryBookmark][] = [];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const [book, list] of Object.entries(v)) {
            if (!Array.isArray(list)) continue;
            for (const m of list) if (m && whole(m.c) && whole(m.b) && typeof m.at === 'number') found.push([book, m]);
          }
        }
        if (found.length) {
          await updateHadithRecord(rec => {
            let out = rec;
            // A mark already in the record (made on another device, say) is the newer word.
            for (const [book, m] of found) if (!out.library?.[libraryMarkKey(book, m.c, m.b)]) out = setLibraryMark(out, book, m.c, m.b, true, m.at);
            return out;
          });
        }
        await AsyncStorage.removeItem(OLD_BOOKMARKS_KEY);
      } catch {
        // Left where it is: it will be tried again on the next launch.
      }
    })();
  }
  return moved;
}

export async function libraryBookmarks(id: string): Promise<LibraryBookmark[]> {
  await moveOldBookmarks();
  await hydrateHadithRecord();
  return libraryMarksOf(getHadithRecord(), id);
}

/** Marks a paragraph, or takes its mark off. Returns the book's marks after. */
export async function toggleLibraryBookmark(id: string, c: number, b: number, now = Date.now()): Promise<LibraryBookmark[]> {
  await moveOldBookmarks();
  await hydrateHadithRecord();
  const on = getHadithRecord().library?.[libraryMarkKey(id, c, b)]?.[0] === 1;
  await updateHadithRecord(rec => setLibraryMark(rec, id, c, b, !on, now));
  return libraryMarksOf(getHadithRecord(), id);
}

/** A block as words: a paragraph or a heading as it is, verse a line to a line. */
export function libraryBlockText(block: string | { h: string } | { v: string[] }): string {
  return typeof block === 'string' ? block : 'h' in block ? block.h : block.v.join('\n');
}

/**
 * A passage to send: its words, then whose they are — the book, its
 * author and the chapter — so a line that leaves the app keeps its name.
 * In Arabic, as the text is.
 */
export function libraryShareText(book: { title: string; author: string }, chapter: string, block: string | { h: string } | { v: string[] }): string {
  const from = chapter && chapter !== book.title ? `${book.title}، ${book.author} · ${chapter}` : `${book.title}، ${book.author}`;
  return `${libraryBlockText(block)}\n\n— ${from}`;
}

/** Storage forgotten, for tests. */
export function _resetLibraryForTests(): void {
  places = null;
  reading = null;
  moved = null;
}

/**
 * A book's parts, where it has them: each a name, its first chapter and
 * how many. `null` for a book whose chapters stand alone. Chapters of one
 * part follow one another, so a part is a run.
 */
export function libraryParts(chapters: readonly { t: string; p?: string }[]): { name: string; first: number; count: number }[] | null {
  if (!chapters.some(c => c.p)) return null;
  const out: { name: string; first: number; count: number }[] = [];
  chapters.forEach((c, i) => {
    const name = c.p ?? c.t;
    const last = out[out.length - 1];
    if (last && last.name === name) last.count++;
    else out.push({ name, first: i, count: 1 });
  });
  return out;
}
