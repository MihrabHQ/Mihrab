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
import { manifestEntry } from './packs';
import type { Manifest, PackKey } from './packTypes';

/** `level`: 1 to begin with, 2 for a later stage — the maintainer's own two lists. What a book is, in the reader's language, is `hadith.library.about.<id>`. */
export type LibraryBook = { id: string; title: string; latin: string; author: string; authorLatin: string; died: string; level: 1 | 2 };
export const LIBRARY_BOOKS: readonly LibraryBook[] = BOOKS as LibraryBook[];
export const libraryKey = (id: string): PackKey => `library/${id}`;
export function findLibraryBook(id: string): LibraryBook | undefined {
  return LIBRARY_BOOKS.find(b => b.id === id);
}

/** The books to offer: named by the manifest, or here already. */
export function offeredLibraryBooks(manifest: Manifest | null, here: (key: PackKey) => boolean): LibraryBook[] {
  return LIBRARY_BOOKS.filter(b => here(libraryKey(b.id)) || manifestEntry(manifest, libraryKey(b.id)) != null);
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
 * the book when it is shown. On the device only.
 */
export type LibraryBookmark = { c: number; b: number; at: number };
const BOOKMARKS_KEY = 'mihrab.library.bookmarks.v1';
let bookmarks: Record<string, LibraryBookmark[]> | null = null;

async function loadBookmarks(): Promise<Record<string, LibraryBookmark[]>> {
  if (bookmarks) return bookmarks;
  const out: Record<string, LibraryBookmark[]> = {};
  try {
    const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, list] of Object.entries(v)) {
        if (!Array.isArray(list)) continue;
        const marks = list.filter((m): m is LibraryBookmark => !!m && whole(m.c) && whole(m.b) && typeof m.at === 'number');
        if (marks.length) out[k] = marks;
      }
    }
  } catch {
    // As above.
  }
  bookmarks = out;
  return bookmarks;
}

export async function libraryBookmarks(id: string): Promise<LibraryBookmark[]> {
  return [...((await loadBookmarks())[id] ?? [])];
}

/** Marks a paragraph, or takes its mark off. Returns the book's marks after. */
export async function toggleLibraryBookmark(id: string, c: number, b: number, now = Date.now()): Promise<LibraryBookmark[]> {
  const all = await loadBookmarks();
  const list = all[id] ?? [];
  const next = list.some(m => m.c === c && m.b === b) ? list.filter(m => !(m.c === c && m.b === b)) : [{ c, b, at: now }, ...list];
  if (next.length) all[id] = next;
  else delete all[id];
  await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(all)).catch(() => undefined);
  return [...next];
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
  bookmarks = null;
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
