/**
 * The two Ṣaḥīḥs by their compilers' books ("كتاب") — ninety-seven of
 * al-Bukhārī's, an introduction and fifty-six of Muslim's
 * (`scripts/hadith/book-chapters.js`, `src/hadith/chapters.json`).
 *
 *   • Every book is there, in order, each beginning after the one before.
 *   • Every book has a name, in Arabic and in English.
 *   • A book's list opens on its chapters; a chapter is a list of its
 *     own (`book:<id>:<chapter>`), holding the rows between its start
 *     and the next book's.
 *   • Dividing changes nothing in a hadith: the same rows, each once.
 */
const mockPacks: Record<string, unknown> = {};
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async (key: string) => mockPacks[key] ?? null),
  packStatus: jest.fn((key: string) => (mockPacks[key] ? { state: 'ready', bytes: 1 } : { state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => Object.keys(mockPacks),
  usePackStatuses: () => ({}),
  usePacksReadyKey: () => '',
}));

import fs from 'fs';
import path from 'path';
import CHAPTERS from '../src/hadith/chapters.json';
import NAMES from '../src/hadith/chapterNames.json';
import { bookChapters, chapterName, findChapter, parseList } from '../src/hadith/catalog';
import { chapterCounts, inChapter, listRows } from '../src/hadith/library';
import { packsForList } from '../src/hadith/useHadith';
import { hadithReference, hadithShareText } from '../src/screens/hadith/HadithReaderScreen';
import type { HadithItem } from '../src/hadith/library';

const REPO = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

describe('the divisions', () => {
  it('are every book of the two Ṣaḥīḥs, each beginning after the one before', () => {
    expect(CHAPTERS.note).toContain('scripts/hadith/book-chapters.js');
    expect(CHAPTERS.books.bukhari.first).toBe(1);
    expect(CHAPTERS.books.bukhari.starts).toHaveLength(97);
    expect(CHAPTERS.books.muslim.first).toBe(0);
    expect(CHAPTERS.books.muslim.starts).toHaveLength(57);
    for (const b of Object.values(CHAPTERS.books)) {
      expect(b.starts[0]).toBe(0);
      for (let i = 1; i < b.starts.length; i++) expect(b.starts[i]).toBeGreaterThan(b.starts[i - 1]);
    }
  });

  it('each have a name, in Arabic and in English', () => {
    for (const book of ['bukhari', 'muslim'] as const) {
      const n = NAMES[book];
      expect(n.first).toBe(CHAPTERS.books[book].first);
      expect(n.ar).toHaveLength(CHAPTERS.books[book].starts.length);
      expect(n.en).toHaveLength(n.ar.length);
      for (const name of n.ar) expect(name).toMatch(/[ء-ي]/);
      for (const name of n.en) expect(name).toMatch(/^[A-Z]/);
    }
    expect(chapterName('bukhari', 1, 'ar')).toBe('بدء الوحي');
    expect(chapterName('bukhari', 2, 'en')).toBe('Faith');
    expect(chapterName('bukhari', 97, 'ar')).toBe('التوحيد');
    expect(chapterName('muslim', 0, 'ar')).toBe('المقدمة');
    expect(chapterName('muslim', 56, 'en')).toBe("Commentary on the Qur'an");
    // A reader in another language is shown the English.
    expect(chapterName('muslim', 1, 'sv')).toBe('Faith');
    expect(chapterName('tirmidhi', 1, 'en')).toBe('');
  });

  it('every locale says which names it is shown: Arabic its own, the rest English', () => {
    for (const f of fs.readdirSync(path.join(REPO, 'src/i18n/locales'))) {
      const v = JSON.parse(read(`src/i18n/locales/${f}`)).hadith.chapterNamesIn;
      expect([f, v]).toEqual([f, f === 'ar.json' ? 'ar' : 'en']);
    }
  });
});

describe('a chapter', () => {
  const [first, second, third] = bookChapters('bukhari');
  const row = (place: number) => [place + 1, `حدثنا فلان عن النبي صلى الله عليه وسلم قال كلمة رقم ${place} من الحديث`];

  beforeAll(() => {
    // The first two books of al-Bukhārī whole, and the first row of the third: a pack's rows stand at their places.
    mockPacks['books/bukhari'] = {
      book: 'bukhari',
      source: 'Open-Hadith-Data',
      license: 'ODbL-1.0',
      retrieved: '2026-11-25',
      hadiths: Array.from({ length: third.from + 1 }, (_, i) => row(i)),
    };
  });

  it('runs from its first row up to the next book’s', () => {
    expect(first).toEqual({ no: 1, from: 0, to: second.from });
    expect(findChapter('bukhari', 2)).toEqual({ no: 2, from: second.from, to: third.from });
    expect(inChapter(`b:bukhari:${second.from - 1}`, first)).toBe(true);
    expect(inChapter(`b:bukhari:${second.from}`, first)).toBe(false);
    expect(inChapter(`b:bukhari:${second.from}`, second)).toBe(true);
    // The last book runs to the end.
    expect(bookChapters('bukhari')[96].to).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('is a list of its own, read from the book’s pack', async () => {
    expect(parseList('book:bukhari:2')).toEqual({ kind: 'book', id: 'bukhari', chapter: 2 });
    expect(parseList('book:bukhari')).toEqual({ kind: 'book', id: 'bukhari' });
    // No such chapter: the book.
    expect(parseList('book:bukhari:400')).toEqual({ kind: 'book', id: 'bukhari' });
    expect(parseList('book:tirmidhi:2')).toEqual({ kind: 'book', id: 'tirmidhi' });
    expect(packsForList('book:bukhari:2', 'en')).toEqual(['books/bukhari']);
    const rows = await listRows('book:bukhari:2', 'en');
    expect(rows).toHaveLength(third.from - second.from);
    expect(rows[0].id).toBe(`b:bukhari:${second.from}`);
    expect(rows[rows.length - 1].id).toBe(`b:bukhari:${third.from - 1}`);
  });

  it('between them hold every row of the book, each once', async () => {
    const all = await listRows('book:bukhari', 'en');
    const counts = chapterCounts('bukhari', all);
    expect(counts.get(1)).toBe(second.from);
    expect(counts.get(2)).toBe(third.from - second.from);
    expect(counts.get(3)).toBe(1);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(all.length);
  });
});

describe('on the page', () => {
  const list = read('src/screens/hadith/HadithListScreen.tsx');

  it('a book its compiler divided opens on its chapters, with the whole book first', () => {
    expect(list).toContain('const contents = !all && !!rows && (opensOnContents(sections, rows.length) || !!inChapters);');
    expect(list.indexOf('testID="hadith-book-all"')).toBeLessThan(list.indexOf('testID={`hadith-chapter-${c.no}`}'));
    expect(list).toContain("onPress={() => navigation.push('HadithList', { list: `book:${ref.id}:${c.no}` })}");
  });

  it('a chapter is named by its own name, and its field keeps to it', () => {
    expect(list).toContain("ref.chapter != null ? chapterName(ref.id, ref.chapter, t('hadith.chapterNamesIn')) : ''");
    expect(list).toContain('chapterIds && found ? found.filter(h => chapterIds.has(h.id)) : found');
  });
});

describe('the builder', () => {
  const script = read('scripts/hadith/book-chapters.js');

  it('takes the divisions and nothing else from hadith-api: its text is read to pair rows, its names not at all', () => {
    expect(script).toContain("const { pairRows } = require('./book-grades.js');");
    expect(script).toContain('hadiths: d.hadiths.map(h => [h.hadithnumber, h.reference?.book ?? null, h.text]),');
    expect(script).not.toMatch(/sections\[|\.sections\./);
  });

  it('refuses to write unless every book is found, in order', () => {
    expect(script).toContain('throw new Error(`book ${k} was not found among our rows`);');
    expect(script).toContain('throw new Error(`book ${ranges[i][0]} does not begin after the one before it`);');
  });
});

describe('copied or shared, a book’s hadith carries the reference it is cited by', () => {
  const t = ((k: string, o?: { book?: string }) =>
    k === 'hadith.chapterNamesIn' ? 'en' : k === 'hadith.book.bukhari' ? 'Sahih al-Bukhari' : k === 'hadith.sourceBook' ? `From ${o?.book}` : k) as never;
  const item = (over: Partial<HadithItem>): HadithItem => ({
    id: 'b:bukhari:6',
    source: 'book',
    title: '…',
    arabic: 'النص',
    text: null,
    textLang: null,
    fallback: false,
    hints: [],
    words: [],
    categories: [],
    number: 8,
    book: 'bukhari',
    ...over,
  });

  it('names the book, its number and the compiler’s chapter', () => {
    // Place 6 is the first row of al-Bukhārī's second book.
    expect(hadithReference(item({}), t)).toBe('Sahih al-Bukhari 8 · Faith');
    expect(hadithReference(item({ id: 'b:bukhari:0', number: 1 }), t)).toBe('Sahih al-Bukhari 1 · The Beginning of Revelation');
    expect(hadithReference(item({ number: null }), t)).toBe('Sahih al-Bukhari · Faith');
  });

  it('is in what Copy and Share hand on, between the grade and the source', () => {
    const text = hadithShareText(item({}), t).split('\n\n');
    expect(text).toEqual(['النص', 'Sahih al-Bukhari 8 · Faith', 'From Sahih al-Bukhari']);
  });

  it('says nothing of an entry that is not a book’s row', () => {
    expect(hadithReference(item({ id: 'h:1', source: 'hadeethenc', book: undefined }), t)).toBeNull();
  });
});
