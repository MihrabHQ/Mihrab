/**
 * What the Hadith tab offers and how it finds it: ids, languages, the
 * shelf's order by level, progress, and the matching that search uses.
 */
import {
  BOOKS,
  findSet,
  HADITH_HUBS,
  HADITH_SETS,
  homeList,
  libraryPacks,
  packsForTopics,
  NAWAWI_CROSSWALK,
  nawawiIds,
  packLangs,
  packsForSet,
  parseEntryId,
  parseList,
  ROOT_TOPICS,
  CategoryTree,
} from '../src/hadith/catalog';
import { EMPTY_HADITH_RECORD, setRead, setSetMarked } from '../src/hadith/hadithRecord';
import { foldForSearch, openingWords } from '../src/hadith/library';
import { levelOf, nextUnread, rankSets, resumeTarget, setProgress, SHELF_CARDS, shelfFor } from '../src/hadith/progress';
import { setLast } from '../src/hadith/hadithRecord';
import { BOOK_FILES, cleanMatn, CsvMatnReader, packIds } from '../src/hadith/origin';
import en from '../src/i18n/locales/en.json';

const T = 1_700_000_000_000;

describe('ids', () => {
  it('reads entry ids of every kind', () => {
    expect(parseEntryId('h:5456')).toEqual({ kind: 'henc', id: '5456' });
    expect(parseEntryId('n:12')).toEqual({ kind: 'nawawi', n: 12 });
    expect(parseEntryId('b:bukhari:0')).toEqual({ kind: 'book', book: 'bukhari', index: 0 });
    expect(parseEntryId('n:0')).toBeNull();
    expect(parseEntryId('b:bukhari:x')).toBeNull();
    expect(parseEntryId('q:1')).toBeNull();
  });

  it('reads list ids of every kind', () => {
    expect(parseList('set:nawawi40')).toEqual({ kind: 'set', id: 'nawawi40' });
    expect(parseList('cat:3')).toEqual({ kind: 'cat', id: '3' });
    expect(parseList('hub:prayer')).toEqual({ kind: 'hub', id: 'prayer' });
    expect(parseList('book:muslim')).toEqual({ kind: 'book', id: 'muslim' });
    expect(parseList('bookmarks')).toEqual({ kind: 'bookmarks' });
    expect(parseList('set:')).toBeNull();
    expect(parseList(undefined)).toBeNull();
  });

  it('gives an entry opened without a list the list it is in by itself', () => {
    // A search hit: the reader's next and previous are its book's.
    expect(homeList('b:bukhari:0')).toBe('book:bukhari');
    expect(homeList('n:12')).toBe('set:nawawi40');
    // A HadeethEnc entry is under several topics: no one home.
    expect(homeList('h:5456')).toBeUndefined();
    expect(homeList('q:1')).toBeUndefined();
  });
});

describe('the catalog', () => {
  it("holds an-Nawawi's Forty and two, in order", () => {
    expect(NAWAWI_CROSSWALK.map(c => c.n)).toEqual(Array.from({ length: 42 }, (_, i) => i + 1));
    expect(nawawiIds()).toHaveLength(42);
    expect(new Set(nawawiIds()).size).toBe(42);
  });

  it('names a source file for the two books that are rebuilt from their source, and for no other', () => {
    expect(BOOKS).toEqual(['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik']);
    // A graded book is our copy or nothing (`bookGrades.ts`): its source has every hadith and no grade.
    expect(Object.keys(BOOK_FILES).sort()).toEqual(['bukhari', 'muslim']);
  });

  it('has an English title and blurb for every set, topic and book', () => {
    const h = (en as Record<string, any>).hadith;
    for (const s of HADITH_SETS) {
      expect(h.set[s.id]?.title).toBeTruthy();
      expect(h.set[s.id]?.blurb).toBeTruthy();
    }
    for (const hub of HADITH_HUBS) expect([hub.id, !!h.hub[hub.id]]).toEqual([hub.id, true]);
    for (const id of ROOT_TOPICS) expect(h.topic[id]).toBeTruthy();
    for (const b of BOOKS) expect(h.book[b]).toBeTruthy();
  });

  it('asks for English beside a language HadeethEnc covers only in part', () => {
    expect(packLangs('en')).toEqual(['en']);
    expect(packLangs('ar')).toEqual(['ar']);
    expect(packLangs('sv')).toEqual(['sv', 'en']);
    expect(packLangs('zh-Hans')).toEqual(['zh', 'en']);
    expect(packLangs('xx')).toEqual(['en']);
  });

  it('is one download a language, with English beside a language covered in part', () => {
    expect(libraryPacks('en')).toEqual(['categories/en', 'henc/all/en', 'nawawi/ar']);
    expect(libraryPacks('sv')).toEqual(['categories/sv', 'categories/en', 'henc/all/sv', 'henc/all/en', 'nawawi/ar']);
    expect(libraryPacks('ar')).toEqual(['categories/ar', 'henc/all/ar', 'nawawi/ar']);
  });

  it('needs nothing more for any set or topic once that download is here', () => {
    const library = new Set(libraryPacks('sv'));
    for (const set of HADITH_SETS.filter(s => !s.book)) {
      for (const key of packsForSet(set, 'sv')) expect([set.id, key, library.has(key)]).toEqual([set.id, key, true]);
    }
    for (const hub of HADITH_HUBS) {
      for (const key of packsForTopics(hub.topics, 'sv')) expect(library.has(key)).toBe(true);
    }
    expect(packsForSet(findSet('book-bukhari')!, 'sv')).toEqual(['books/bukhari']);
  });

  it('is small packs in a browser, which keeps nothing and fetches an entry a request', () => {
    expect(packsForSet(findSet('nawawi40')!, 'sv', true)).toEqual([
      'categories/sv',
      'categories/en',
      'henc/set-nawawi40/sv',
      'henc/set-nawawi40/en',
      'nawawi/ar',
    ]);
    expect(packsForTopics(['134', '133'], 'en', true)).toEqual(['categories/en', 'henc/cat-134/en', 'henc/cat-133/en']);
    // The first download there: the first level's sets, and no more.
    const first = libraryPacks('en', true);
    expect(first).toContain('henc/set-nawawi40/en');
    expect(first).toContain('henc/set-foundations/en');
    expect(first).not.toContain('henc/all/en');
    expect(first.some(k => k.startsWith('henc/set-creed'))).toBe(false);
  });

  it("knows which entries a browser's small pack holds without asking for a list", async () => {
    expect(await packIds('set-foundations', 'en')).toEqual(findSet('foundations')!.ids);
    expect(await packIds('set-nawawi40', 'en')).toHaveLength(NAWAWI_CROSSWALK.filter(c => c.henc).length);
    await expect(packIds('set-nothing', 'en')).rejects.toThrow('unknown HadeethEnc pack');
    await expect(packIds('starter', 'en')).rejects.toThrow('unknown HadeethEnc pack');
  });
});

describe('the sets', () => {
  const chosen = HADITH_SETS.filter(s => !s.book && !s.nawawi);

  it('are a few dozen chosen hadith each, not a whole topic', () => {
    expect(chosen.length).toBeGreaterThanOrEqual(9);
    for (const s of chosen) {
      expect([s.id, Array.isArray(s.ids)]).toEqual([s.id, true]);
      expect(s.ids!.length).toBeGreaterThan(0);
      expect(s.ids!.length).toBeLessThanOrEqual(40);
      expect(new Set(s.ids).size).toBe(s.ids!.length);
      for (const id of s.ids!) expect(id).toMatch(/^\d+$/);
    }
  });

  it('say who chose them: a rule, until a person has', () => {
    // "rules" is scripts/hadith/draft-sets.js. A set a person has settled
    // names them, and the script then leaves it alone.
    for (const s of chosen) expect([s.id, typeof (s as { chosenBy?: string }).chosenBy]).toEqual([s.id, 'string']);
  });
});

describe("Look up's tiles", () => {
  it('are a dozen at most, each a few HadeethEnc topics', () => {
    expect(HADITH_HUBS.length).toBeGreaterThanOrEqual(8);
    expect(HADITH_HUBS.length).toBeLessThanOrEqual(12);
    expect(new Set(HADITH_HUBS.map(h => h.id)).size).toBe(HADITH_HUBS.length);
    for (const h of HADITH_HUBS) {
      expect(h.topics.length).toBeGreaterThan(0);
      for (const t of h.topics) expect(t).toMatch(/^\d+$/);
    }
  });
});

describe('the topic tree', () => {
  const tree = new CategoryTree([
    ['1', null, 'Quran', 10],
    ['2', '1', 'Virtues', 4],
    ['3', '2', 'Recitation', 2],
    ['4', null, 'Creed', 7],
  ]);

  it('finds a root and everything under a topic', () => {
    expect(tree.rootOf('3')).toBe('1');
    expect([...tree.within('1')].sort()).toEqual(['1', '2', '3']);
    expect(tree.children(null)).toEqual(['1', '4']);
    expect(tree.title('2')).toBe('Virtues');
  });
});

describe('progress', () => {
  const rows = ['h:1', 'h:2', 'h:3', 'h:4'];

  it('counts what has been read', () => {
    let r = setRead(EMPTY_HADITH_RECORD, 'h:2', true, T);
    r = setRead(r, 'h:9', true, T);
    expect(setProgress(r, 'daily', rows)).toEqual({ read: 1, total: 4, done: false });
    for (const id of rows) r = setRead(r, id, true, T);
    expect(setProgress(r, 'daily', rows).done).toBe(true);
  });

  it('counts a set marked as already read as done, read or not', () => {
    const r = setSetMarked(EMPTY_HADITH_RECORD, 'daily', true, T);
    expect(setProgress(r, 'daily', rows)).toEqual({ read: 4, total: 4, done: true });
    expect(setProgress(r, 'daily', null)).toEqual({ read: 0, total: 0, done: true });
  });

  it('finds the next unread entry, wrapping round', () => {
    let r = setRead(EMPTY_HADITH_RECORD, 'h:1', true, T);
    r = setRead(r, 'h:4', true, T);
    expect(nextUnread(r, rows, 'h:3')).toBe('h:2');
    expect(nextUnread(r, rows)).toBe('h:2');
    for (const id of rows) r = setRead(r, id, true, T);
    expect(nextUnread(r, rows)).toBeNull();
  });

  it('puts three or four sets in front of a reader, the level\'s own', () => {
    const none = () => false;
    for (const lv of ['starting', 'building', 'depth'] as const) {
      const shelf = shelfFor(lv, none);
      expect(shelf.now.length).toBeGreaterThanOrEqual(3);
      expect(shelf.now.length).toBeLessThanOrEqual(SHELF_CARDS);
      for (const s of shelf.now) expect(s.level).toBe(lv);
      // Nothing is taken away: every other set is a fold away.
      expect(shelf.now.length + shelf.more.length).toBe(HADITH_SETS.length);
      expect(shelf.done).toEqual([]);
    }
    expect(shelfFor('starting', none).now.map(s => s.id)).toEqual(['nawawi40', 'foundations', 'daily']);
  });

  it('stops offering a set that is finished or marked as known', () => {
    const shelf = shelfFor('starting', s => s.id === 'nawawi40');
    expect(shelf.now.map(s => s.id)).toEqual(['foundations', 'daily']);
    expect(shelf.done.map(s => s.id)).toEqual(['nawawi40']);
    expect(shelf.more.some(s => s.id === 'nawawi40')).toBe(false);
  });

  it('fills the page from the next level when a level is all but read', () => {
    const shelf = shelfFor('starting', s => s.id === 'nawawi40' || s.id === 'foundations');
    expect(shelf.now).toHaveLength(SHELF_CARDS);
    expect(shelf.now[0].id).toBe('daily');
    expect(shelf.now[1].level).toBe('building');
    // Everything read: nothing to offer, and nothing pretended.
    expect(shelfFor('depth', () => true)).toMatchObject({ now: [], more: [] });
  });

  it('puts the chosen level first and hides nothing', () => {
    const depth = rankSets('depth');
    expect(depth[0].level).toBe('depth');
    expect(depth).toHaveLength(HADITH_SETS.length);
    expect(rankSets('starting')[0].id).toBe('nawawi40');
    expect(levelOf(EMPTY_HADITH_RECORD)).toBe('starting');
  });
});

describe('search folding', () => {
  it('matches Arabic without its diacritics and letter variants', () => {
    expect(foldForSearch('إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ')).toBe('انما الاعمال بالنيات');
    expect(foldForSearch('الصلاة')).toBe(foldForSearch('الصلاه'));
  });

  it('matches Latin without accents or case', () => {
    expect(foldForSearch('Ṣalāh, Zakāh!')).toBe('salah zakah');
  });

  it('titles an Arabic-only text with its opening words', () => {
    expect(openingWords('a b c', 2)).toBe('a b…');
    expect(openingWords('a b', 2)).toBe('a b');
  });
});

describe('reading the books from source', () => {
  it('reads quoted CSV fields across chunk boundaries, keeping the first two', () => {
    const reader = new CsvMatnReader();
    for (const chunk of ['1,"قال، رسول', ' الله",commentary\r\n2,"he said ""', 'yes""",x\nx,"third"']) reader.push(chunk);
    expect(reader.end()).toEqual([
      [1, 'قال، رسول الله'],
      [2, 'he said "yes"'],
      [null, 'third'],
    ]);
  });

  it('takes out direction marks and squeezes spaces from a matn', () => {
    expect(cleanMatn('  \u200Fقال   رسول\u00a0الله ')).toBe('قال رسول الله');
  });
});

describe('"Continue reading"', () => {
  const list = ['h:1', 'h:2', 'h:3'];
  const at = (id: string) => setLast(EMPTY_HADITH_RECORD, id, 'set:nawawi40', T);

  it('is nothing before anything has been opened', () => {
    expect(resumeTarget(EMPTY_HADITH_RECORD, list)).toBeNull();
  });

  it('goes back to the hadith last opened while it is unread', () => {
    expect(resumeTarget(at('h:2'), list)).toEqual({ id: 'h:2', list: 'set:nawawi40' });
  });

  it('leads on to the next unread once that one is marked read', () => {
    const rec = setRead(at('h:1'), 'h:1', true, T + 1);
    expect(resumeTarget(rec, list)).toEqual({ id: 'h:2', list: 'set:nawawi40' });
    // Past one already read, to the first that is not.
    expect(resumeTarget(setRead(rec, 'h:2', true, T + 2), list)).toEqual({ id: 'h:3', list: 'set:nawawi40' });
  });

  it('stays on the last hadith when its list is read through, or not yet known', () => {
    let rec = at('h:3');
    for (const id of list) rec = setRead(rec, id, true, T + 1);
    expect(resumeTarget(rec, list)).toEqual({ id: 'h:3', list: 'set:nawawi40' });
    expect(resumeTarget(setRead(at('h:1'), 'h:1', true, T + 1), null)).toEqual({ id: 'h:1', list: 'set:nawawi40' });
  });
});
