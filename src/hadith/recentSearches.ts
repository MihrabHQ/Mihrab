/**
 * The last few things looked for in the Hadith tab's field, to look for
 * again with a tap.
 *
 * A search is kept when it led somewhere — a result was opened — and not
 * as it is typed, so the list is of searches and not of half-words. Kept
 * on this device only and never sent anywhere; the reader can empty it.
 * Newest first, one entry for a phrase however its marks were typed.
 */
import AsyncStorage from '../storage/appStorage';
import { foldForSearch } from './library';

const KEY = 'mihrab.hadith.recentSearches.v1';
export const RECENT_SEARCHES_MAX = 8;
let recent: string[] | null = null;

export async function recentSearches(): Promise<string[]> {
  if (!recent) {
    try {
      const v: unknown = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
      recent = Array.isArray(v) ? v.filter((q): q is string => typeof q === 'string' && !!q.trim()).slice(0, RECENT_SEARCHES_MAX) : [];
    } catch {
      recent = [];
    }
  }
  return [...recent];
}

/** Puts a search first; the same phrase typed before moves up instead of appearing twice. */
export async function rememberSearch(query: string): Promise<string[]> {
  const q = query.replace(/\s+/g, ' ').trim();
  const had = await recentSearches();
  if (foldForSearch(q).length < 2) return had;
  const folded = foldForSearch(q);
  recent = [q, ...had.filter(x => foldForSearch(x) !== folded)].slice(0, RECENT_SEARCHES_MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(recent)).catch(() => undefined);
  return [...recent];
}

export async function clearRecentSearches(): Promise<void> {
  recent = [];
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}

/**
 * How many of the results shown are from each place, in the order they
 * first appear: `[['bukhari', 12], ['hadeethenc', 20]]`. `null` when they
 * are all from one, where the count would say nothing.
 */
export function countBySource(hits: readonly { where: string; book?: string }[]): [string, number][] | null {
  const counts = new Map<string, number>();
  for (const h of hits) {
    const k = h.where === 'book' ? h.book ?? 'book' : h.where;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts.size > 1 ? [...counts.entries()] : null;
}

export function _resetRecentSearchesForTests(): void {
  recent = null;
}
