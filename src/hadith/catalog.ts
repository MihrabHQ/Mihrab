/**
 * What the Hadith tab offers, and where each piece lives.
 *
 * ── IDS ────────────────────────────────────────────────────────────────
 *
 * An entry is `h:<HadeethEnc id>`, `n:<number>` for one of an-Nawawi's
 * Forty that HadeethEnc does not hold (Arabic only), or
 * `b:<book>:<index>` for a hadith of one of the books — `index` is its
 * place in Open-Hadith-Data's file, not in our pack. A list is
 * `set:<id>` (a curated set, `sets.json`), `hub:<id>` (one of Look up's
 * tiles: a few HadeethEnc topics under a name of ours), `cat:<id>` (a
 * HadeethEnc topic) or `book:<id>`. The reader's record keys on these, so
 * they are kept stable.
 *
 * ── WHAT IS DOWNLOADED ─────────────────────────────────────────────────
 *
 * HadeethEnc in a language is ONE pack (`henc/all/<lang>`, 2–13 MB). It
 * was eight — a starter set and a pack a topic — and every tile in Browse
 * met the reader with another download, and search found only what the
 * tiles already opened had happened to bring. One tap now, and every set,
 * topic and search has everything. The books stay a pack each: they are
 * megabytes apiece and few readers want all seven.
 *
 * Seven, of the nine: Musnad Aḥmad and Sunan ad-Dārimī are not offered,
 * and five of the seven hold only the hadith their graders call sound
 * (`bookGrades.ts`).
 *
 * A browser keeps nothing between visits and can only rebuild a pack from
 * HadeethEnc one entry a request (`origin.ts`), so there the packs stay
 * small and are fetched as they are opened: `set-<id>` for a set,
 * `cat-<id>` for a topic. `piecewise` is that switch.
 *
 * ── WHICH LANGUAGE ─────────────────────────────────────────────────────
 *
 * The app's own, when HadeethEnc has the entry in it; English when it does
 * not (German, for one, has a fraction of the encyclopedia so far). An
 * Arabic reader gets HadeethEnc's Arabic explanation and no translation.
 */
import SETS from './sets.json';
import NAWAWI from './nawawi40.json';
import { IS_WEB_APP } from '../config/webApp';
import { ALL_BOOKS, SAHIH_BOOKS } from './bookGrades';
import type { CategoryRow, PackKey } from './packTypes';

export type Level = 'starting' | 'building' | 'depth';
export const LEVELS: readonly Level[] = ['starting', 'building', 'depth'];

export type HadithSet = {
  id: string;
  level: Level;
  /** HadeethEnc entries, chosen and in reading order. */
  ids?: string[];
  /** The HadeethEnc topics `ids` were chosen from (`scripts/hadith/draft-sets.js`). */
  categories?: string[];
  /** an-Nawawi's Forty, in his order. */
  nawawi?: boolean;
  /** A whole book, in Arabic. */
  book?: string;
};

/**
 * One of Look up's tiles: a question people come with ("prayer",
 * "fasting", "family"), and the HadeethEnc topics that answer it.
 *
 * HadeethEnc's own tree is a scholar's ("Jurisprudence and Juristic
 * Principles" → "Jurisprudence of Acts of Worship" → "Prayer"), and its
 * seven roots were the tiles: the 359 hadith on prayer sat two levels
 * under a name nobody searches for. The tree is still there, whole, under
 * "All topics".
 */
export type HadithHub = {
  id: string;
  topics: string[];
  /** Its hadith are read for rulings: the list opens with the note that a hadith is not a fatwa. */
  fiqh?: boolean;
};

export const HADITH_SETS: readonly HadithSet[] = SETS.sets as HadithSet[];
export const HADITH_HUBS: readonly HadithHub[] = SETS.hubs as HadithHub[];
/** The seven HadeethEnc topics, in the order "All topics" shows them. */
export const ROOT_TOPICS: readonly string[] = SETS.roots;
/** HadeethEnc's root for jurisprudence: every list under it carries the note. */
export const FIQH_ROOT = '4';
/**
 * The books, in the order Browse shows them. A browser is offered the two
 * it can fetch from their source; the graded five are our copy only, which
 * it cannot read (`bookGrades.ts`).
 */
export const BOOKS: readonly string[] = IS_WEB_APP ? ALL_BOOKS.filter(b => SAHIH_BOOKS.includes(b)) : ALL_BOOKS;
/** an-Nawawi's number → HadeethEnc id, where it has one. */
export const NAWAWI_CROSSWALK: ReadonlyArray<{ n: number; henc: string | null }> = NAWAWI;

/** The languages HadeethEnc is read in here — the app's thirteen. */
export const HADITH_LANGS = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'] as const;

/** The app language as a pack language, and English beside it when it is neither. */
export function packLangs(appLang: string): string[] {
  const base = appLang.slice(0, 2);
  const lang = (HADITH_LANGS as readonly string[]).includes(base) ? base : 'en';
  return lang === 'en' || lang === 'ar' ? [lang] : [lang, 'en'];
}

export const hencPackKey = (pack: string, lang: string): PackKey => `henc/${pack}/${lang}`;
export const categoriesKey = (lang: string): PackKey => `categories/${lang}`;
export const bookKey = (book: string): PackKey => `books/${book}`;
export const NAWAWI_KEY: PackKey = 'nawawi/ar';
/** The one HadeethEnc pack a language has. */
export const WHOLE_PACK = 'all';

/** The topic tree and these HadeethEnc packs, in the app's language (and English beside it). */
function hencKeys(pieces: readonly string[], appLang: string, piecewise: boolean): PackKey[] {
  const langs = packLangs(appLang);
  const packs = piecewise ? [...new Set(pieces)] : [WHOLE_PACK];
  return [...langs.map(categoriesKey), ...packs.flatMap(p => langs.map(l => hencPackKey(p, l)))];
}

/** Everything a set needs on the device to be read in this language. */
export function packsForSet(set: HadithSet, appLang: string, piecewise = IS_WEB_APP): PackKey[] {
  if (set.book) return [bookKey(set.book)];
  const keys = hencKeys([`set-${set.id}`], appLang, piecewise);
  if (set.nawawi) keys.push(NAWAWI_KEY);
  return keys;
}

/** What a list of HadeethEnc topics needs: a topic's page, one of Look up's tiles. */
export function packsForTopics(topics: readonly string[], appLang: string, piecewise = IS_WEB_APP): PackKey[] {
  return hencKeys(topics.map(t => `cat-${t}`), appLang, piecewise);
}

/**
 * What the first download brings: all of HadeethEnc in this language and
 * the Arabic of an-Nawawi's Forty. In a browser, the first level's sets.
 */
export function libraryPacks(appLang: string, piecewise = IS_WEB_APP): PackKey[] {
  if (!piecewise) return [...hencKeys([], appLang, false), NAWAWI_KEY];
  const keys = HADITH_SETS.filter(s => s.level === LEVELS[0]).flatMap(s => packsForSet(s, appLang, true));
  return [...new Set(keys)];
}

export function findSet(id: string): HadithSet | undefined {
  return HADITH_SETS.find(s => s.id === id);
}

export function findHub(id: string): HadithHub | undefined {
  return HADITH_HUBS.find(h => h.id === id);
}

// ── List ids ───────────────────────────────────────────────────────────

export type ListRef =
  | { kind: 'set'; id: string }
  | { kind: 'hub'; id: string }
  | { kind: 'cat'; id: string }
  | { kind: 'book'; id: string }
  | { kind: 'bookmarks' };

export function parseList(list: string | undefined): ListRef | null {
  if (!list) return null;
  if (list === 'bookmarks') return { kind: 'bookmarks' };
  const [kind, id] = list.split(':');
  if (!id) return null;
  if (kind === 'set' || kind === 'hub' || kind === 'cat' || kind === 'book') return { kind, id };
  return null;
}

export type EntryRef =
  | { kind: 'henc'; id: string }
  | { kind: 'nawawi'; n: number }
  | { kind: 'book'; book: string; index: number };

export function parseEntryId(id: string): EntryRef | null {
  const parts = id.split(':');
  if (parts[0] === 'h' && parts[1]) return { kind: 'henc', id: parts[1] };
  if (parts[0] === 'n' && Number(parts[1]) > 0) return { kind: 'nawawi', n: Number(parts[1]) };
  if (parts[0] === 'b' && parts[1] && Number.isInteger(Number(parts[2]))) {
    return { kind: 'book', book: parts[1], index: Number(parts[2]) };
  }
  return null;
}

/**
 * The list an entry belongs to by itself: a book's hadith is in its book,
 * an-Nawawi's own are in his Forty. An entry opened from a search or by a
 * link has no list handed to it, and without one the reader has no
 * neighbours — no next, no previous, "Hadith · 1" for a title (Pixel 10
 * Pro, 2026-11-25). A HadeethEnc entry is under several topics and has no
 * one home: undefined.
 */
export function homeList(id: string): string | undefined {
  const ref = parseEntryId(id);
  if (ref?.kind === 'book') return `book:${ref.book}`;
  if (ref?.kind === 'nawawi') {
    const set = HADITH_SETS.find(s => s.nawawi);
    return set ? `set:${set.id}` : undefined;
  }
  return undefined;
}

/** The ids of an-Nawawi's Forty, in his order. */
export function nawawiIds(): string[] {
  return NAWAWI_CROSSWALK.map(c => (c.henc ? `h:${c.henc}` : `n:${c.n}`));
}

// ── The topic tree ─────────────────────────────────────────────────────

/** One topic of a topic page, and the topics under it that hold something. */
export type TopicSection = { topic: string; total: number; children: Array<{ id: string; count: number }> };

/**
 * What a topic page lists before any hadith: each of its topics, and the
 * topics under each, with how many hadith are there (`topicCounts`). A
 * topic nothing on this device is under is left out.
 */
export function topicContents(
  topics: readonly string[],
  tree: CategoryTree,
  counts: ReadonlyMap<string, number>,
): TopicSection[] {
  return topics
    .map(topic => ({
      topic,
      total: counts.get(topic) ?? 0,
      children: tree
        .children(topic)
        .map(id => ({ id, count: counts.get(id) ?? 0 }))
        .filter(c => c.count > 0),
    }))
    .filter(s => s.total > 0);
}

/** A list this long is not read through; it gets a field, and a page of contents where it has parts. */
export const LONG_LIST = 30;

/**
 * Whether a topic opens on its sub-topics instead of its hadith.
 *
 * "Prayer and purification" was 483 hadith in the order the source
 * happens to hold them — the first row was about graves — over a tree
 * that already sorts them under fifty headings (the adhan, ablution, the
 * Friday prayer…). A long topic with parts opens on the parts; a short
 * one, or one with a single part, is still simply its hadith.
 */
export function opensOnContents(sections: readonly TopicSection[], total: number): boolean {
  if (total < LONG_LIST) return false;
  return sections.length > 1 || (sections[0]?.children.length ?? 0) > 1;
}

export class CategoryTree {
  private byId = new Map<string, CategoryRow>();
  private kids = new Map<string, string[]>();

  constructor(rows: readonly CategoryRow[]) {
    for (const row of rows) {
      this.byId.set(row[0], row);
      const parent = row[1] ?? '';
      this.kids.set(parent, [...(this.kids.get(parent) ?? []), row[0]]);
    }
  }

  title(id: string): string | undefined {
    return this.byId.get(id)?.[2];
  }

  count(id: string): number {
    return this.byId.get(id)?.[3] ?? 0;
  }

  children(id: string | null): string[] {
    return this.kids.get(id ?? '') ?? [];
  }

  rootOf(id: string): string {
    let cur = id;
    for (let i = 0; i < 10; i++) {
      const parent = this.byId.get(cur)?.[1];
      if (!parent) return cur;
      cur = parent;
    }
    return cur;
  }

  /** The topic and each topic it is under, nearest first. */
  path(id: string): string[] {
    const out = [id];
    for (let i = 0; i < 10; i++) {
      const parent = this.byId.get(out[out.length - 1])?.[1];
      if (!parent || out.includes(parent)) break;
      out.push(parent);
    }
    return out;
  }

  /** The topic and everything under it. */
  within(id: string): Set<string> {
    const out = new Set<string>([id]);
    const stack = [id];
    while (stack.length) {
      for (const k of this.children(stack.pop()!)) {
        if (!out.has(k)) {
          out.add(k);
          stack.push(k);
        }
      }
    }
    return out;
  }
}
