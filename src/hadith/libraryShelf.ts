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

export type LibraryBook = { id: string; title: string; latin: string; author: string; authorLatin: string; died: string };
export const LIBRARY_BOOKS: readonly LibraryBook[] = BOOKS;
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
  return (await loadPlaces())[id] ?? null;
}

export async function setLibraryPlace(id: string, chapter: number): Promise<void> {
  const all = await loadPlaces();
  if (all[id] === chapter) return;
  all[id] = chapter;
  await AsyncStorage.setItem(PLACE_KEY, JSON.stringify(all)).catch(() => undefined);
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
