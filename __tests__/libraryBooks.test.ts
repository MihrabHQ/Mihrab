/**
 * The Library: whole books beside the hadith (`src/hadith/libraryShelf.ts`,
 * `scripts/library/build-library.js`, docs/hadith-policy.md §6).
 *
 * What must hold: a book is its author's text, whole — the builder stops
 * on markup it does not know and never writes a chapter with a piece
 * missing; a book is offered only when it can be had; and nothing of a
 * book reaches the hadith the app serves by its rule.
 */
import fs from 'fs';
import path from 'path';
import BOOKS from '../src/hadith/libraryBooks.json';
import { LIBRARY_BOOKS, findLibraryBook, libraryKey, libraryParts, offeredLibraryBooks } from '../src/hadith/libraryShelf';
import { validPack, type Manifest } from '../src/hadith/packTypes';
import { blockKind } from '../src/screens/hadith/LibraryBookScreen';

const REPO = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');
const builder = require('../scripts/library/build-library.js');

describe('the builder', () => {
  const { blocksOf, linksOf, packOf, MAQAMAT, HALVES } = builder;

  it('turns a page into paragraphs, headings and verse, and drops only its furniture', () => {
    const page = [
      '{{ترويسة\n|عنوان = كتاب\n|مؤلف = فلان\n}}',
      '== باب الأول ==',
      'قال النبي {{صل}} كلمة، وقال تعالى: {{قرآن|قل هو الله أحد}} [ الإخلاص: 1 ]',
      'سطر ثان من [[صفحة|الكتاب]] و[[رابط]].',
      '',
      '{{أبيات|\nصدر أول\\\\عجز أول\n|صدر ثان\\\\عجز ثان\n}}',
      "'''خاتمة''' الباب<ref>حاشية المحقق</ref>.",
      '[[تصنيف:كتب]]',
    ].join('\n');
    expect(blocksOf(page, 'test')).toEqual([
      { h: 'باب الأول' },
      'قال النبي ﷺ كلمة، وقال تعالى: ﴿قل هو الله أحد﴾ [ الإخلاص: 1 ]',
      'سطر ثان من الكتاب ورابط.',
      { v: [`صدر أول${HALVES}عجز أول`, `صدر ثان${HALVES}عجز ثان`] },
      'خاتمة الباب.',
    ]);
  });

  it('stops on a template or a tag it does not know: the author’s words may be inside it', () => {
    expect(() => blocksOf('نص {{قالب مجهول|كلام المؤلف}} نص', 'x')).toThrow(/does not know: \{\{قالب مجهول\}\}/);
    expect(() => blocksOf('نص <table><tr><td>كلام</td></tr></table>', 'x')).toThrow(/a tag this file does not know/);
    expect(() => blocksOf('نص {{صل', 'x')).toThrow(/unclosed template/);
    // The edition's own braces and brackets are text.
    expect(blocksOf('قال تعالى: {وتمت كلمة ربك} [ الأنعام: 115 ]', 'x')).toEqual(['قال تعالى: {وتمت كلمة ربك} [ الأنعام: 115 ]']);
  });

  it('takes the chapters in the order the book’s own contents page gives, each once', () => {
    const main = '* [[كتاب/باب الأول|باب الأول]]\n# [[/باب الثاني|الثاني]]\n* [[كتاب/باب الأول|باب الأول]]\n[[كتاب آخر/باب|غيره]]';
    expect(linksOf(main, 'كتاب')).toEqual([
      { page: 'كتاب/باب الأول', label: 'باب الأول' },
      { page: 'كتاب/باب الثاني', label: 'الثاني' },
    ]);
    expect(MAQAMAT).toHaveLength(51);
    expect(new Set(MAQAMAT).size).toBe(51);
  });

  it('refuses a book with a chapter that was not fetched or has no text', () => {
    const spec = { title: 'ك', author: 'م', died: '1 هـ', prefix: 'كتاب', chapters: () => [{ page: 'كتاب/أ', title: 'أ' }, { page: 'كتاب/ب', title: 'ب' }] };
    expect(() => packOf('k', spec, { 'كتاب/أ': { ts: '2020-01-01T00:00:00Z', text: 'نص' } })).toThrow(/was not fetched/);
    expect(() => packOf('k', spec, { 'كتاب/أ': { ts: '2020-01-01T00:00:00Z', text: 'نص' }, 'كتاب/ب': { ts: '2021-02-03T00:00:00Z', text: '== ب ==' } })).toThrow(/has no text/);
    const pack = packOf('k', spec, { 'كتاب/أ': { ts: '2020-01-01T00:00:00Z', text: '== أ ==\nنص أ' }, 'كتاب/ب': { ts: '2021-02-03T00:00:00Z', text: 'نص ب' } });
    // The page's heading that only repeats the chapter's name is not printed twice.
    expect(pack.chapters).toEqual([{ t: 'أ', b: ['نص أ'] }, { t: 'ب', b: ['نص ب'] }]);
    expect(pack.asOf).toBe('2021-02-03');
    expect(pack.source.license).toBe('CC BY-SA 4.0');
    expect(validPack('library/k', pack)).toBe(true);
  });

  it('reads OpenITI’s markup: headings, paragraphs that go on, verse, and none of its page marks', () => {
    const { openitiChapters, openitiPack } = builder;
    const file = [
      '######OpenITI#',
      '#META# 041.EdNUMBER\t:: الأولى',
      '#META# 043.EdPUBLISHER\t:: دار',
      '#META#Header#End#',
      '',
      '# PageV00P000',
      '### | مقدمة المؤلف',
      '### | بسم الله الرحمن الرحيم',
      '# أما بعد: فإن أولى ما ابتدئ به',
      '~~كتاب ms001 وافتتح به خطاب PageV01P003 حمد الله.',
      '### | باب في اجتناب اللحن',
      '### | وذم الغريب في الخطاب',
      '# ؟ قال الشاعر:',
      '# صدر البيت ... عجز البيت',
      '# صدر ثان ... عجز ثان',
      '### | [فصل الدعاء]',
      '# نص الفصل.',
    ].join('\n');
    expect(openitiChapters(file, 't')).toEqual([
      { t: 'مقدمة المؤلف', b: ['بسم الله الرحمن الرحيم', 'أما بعد: فإن أولى ما ابتدئ به كتاب وافتتح به خطاب حمد الله.'] },
      { t: 'باب في اجتناب اللحن وذم الغريب في الخطاب', b: ['قال الشاعر:', { v: [`صدر البيت${HALVES}عجز البيت`, `صدر ثان${HALVES}عجز ثان`] }] },
      { t: 'فصل الدعاء', b: ['نص الفصل.'] },
    ]);
    expect(() => openitiChapters('#META#Header#End#\n# نص بلا عنوان', 't')).toThrow(/before the first heading/);
    expect(() => openitiChapters('#META#Header#End#\n### | باب\n| جدول', 't')).toThrow(/does not know/);
    expect(() => openitiChapters('#META#Header#End#\n### | باب\n# نص\n### | باب آخر', 't')).toThrow(/has no text/);
    const pack = openitiPack('k', { title: 'ك', author: 'م', died: '1', read: '2026-11-26', openiti: '0775AH/data/0751X/0751X.Book/0751X.Book.Shamela1-ara1' }, file);
    // Built again another day it is the same file: the day read is written down, not today's.
    expect(pack.asOf).toBe('2026-11-26');
    expect(pack.source).toEqual({ name: 'OpenITI', license: 'CC BY-NC-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', url: 'https://github.com/OpenITI/0775AH/tree/master/data/0751X/0751X.Book', edition: 'دار، الأولى' });
    expect(validPack('library/k', pack)).toBe(true);
  });

  it('adds its own entries to the manifest and nothing else, and publishes nothing', () => {
    const src = read('scripts/library/build-library.js');
    expect(src).toContain("if (JSON.stringify({ ...manifest, library: undefined }) !== others) throw new Error('the manifest changed outside `library`: nothing written');");
    expect(src).not.toContain('gh release');
  });
});

describe('a pack', () => {
  const good = { id: 'k', title: 'ك', author: 'م', died: '1', lang: 'ar', source: { name: 's', license: 'l', licenseUrl: 'u', url: 'u' }, asOf: '2020-01-01', chapters: [{ t: 'أ', b: ['نص', { h: 'عنوان' }, { v: ['بيت'] }] }] };
  it('is the book its key names, with text in every chapter', () => {
    expect(validPack('library/k', good)).toBe(true);
    expect(validPack('library/other', good)).toBe(false);
    expect(validPack('library/k', { ...good, chapters: [] })).toBe(false);
    expect(validPack('library/k', { ...good, chapters: [{ t: 'أ', b: [] }] })).toBe(false);
    expect(validPack('library/k', { ...good, chapters: [{ t: 'أ', b: [7] }] })).toBe(false);
    expect(validPack('library/k', { ...good, source: undefined })).toBe(false);
    expect(blockKind('نص')).toBe('p');
    expect(blockKind({ h: 'ع' })).toBe('h');
    expect(blockKind({ v: ['ب'] })).toBe('v');
  });

  it('is our copy or nothing: the app does not read a source’s markup', () => {
    const packs = read('src/hadith/packs.ts');
    expect(packs).toContain("if (!got && !signal.cancelled && !key.startsWith('library/')) {");
    expect(packs).toContain("if (kind === 'library') return m.library?.[a] ?? null;");
  });
});

describe('the shelf', () => {
  it('names each book once, in Arabic and in Latin letters', () => {
    expect(LIBRARY_BOOKS).toHaveLength(BOOKS.length);
    expect(new Set(LIBRARY_BOOKS.map(b => b.id)).size).toBe(LIBRARY_BOOKS.length);
    for (const b of LIBRARY_BOOKS) {
      expect(b.title).toMatch(/[ء-ي]/);
      expect(b.author).toMatch(/[ء-ي]/);
      expect(b.latin).toMatch(/^[A-Z]/);
      expect(b.authorLatin).toMatch(/^[A-Z]/);
      // Every book listed is one the builder builds.
      expect(Object.keys(builder.BOOKS)).toContain(b.id);
      expect(builder.BOOKS[b.id].title).toBe(b.title);
    }
    expect(findLibraryBook('kalila')?.latin).toBe('Kalila wa Dimna');
    expect(findLibraryBook('nothing')).toBeUndefined();
  });

  it('offers a book our copy carries or that is here already, and no other', () => {
    expect(offeredLibraryBooks(null, () => false)).toEqual([]);
    const manifest = { v: 1, henc: {}, books: {}, nawawi: null, categories: {}, library: { maqamat: { bytes: 10 } } } as Manifest;
    expect(offeredLibraryBooks(manifest, () => false).map(b => b.id)).toEqual(['maqamat']);
    expect(offeredLibraryBooks(null, k => k === libraryKey('kalila')).map(b => b.id)).toEqual(['kalila']);
    // A manifest from before there was a library names none.
    expect(offeredLibraryBooks({ v: 1, henc: {}, books: {}, nawawi: null, categories: {} } as Manifest, () => false)).toEqual([]);
  });

  it('is a third page of the Hadith tab, not in a browser, and asks for no hadith download', () => {
    const tab = read('src/screens/HadithScreen.tsx');
    expect(tab).toContain("...(IS_WEB_APP ? [] : [{ key: 'library' as const, label: t('hadith.library.tab') }]),");
    expect(tab).toContain("{library.missing.length && !searching && mode !== 'library' ? gate : null}");
    expect(tab).toContain('<LibraryShelf navigation={navigation} />');
  });

  it('keeps a book out of the hadith the app serves by its rule', () => {
    // Nothing that lists, searches or grades hadith reads a Library pack.
    for (const f of ['src/hadith/library.ts', 'src/hadith/catalog.ts', 'src/hadith/daily.ts', 'src/hadith/useHadith.ts', 'src/notifications/hadithReminders.ts']) {
      expect([f, /library\/|libraryShelf|LibraryFile/.test(read(f))]).toEqual([f, false]);
    }
    const policy = read('docs/hadith-policy.md');
    expect(policy).toContain("## 6. The Library: a book is its author's text");
    expect(policy).toContain('**Nothing of a book leaves the book.**');
    // And the book's page says what it is, in every language.
    expect(read('src/screens/hadith/LibraryBookScreen.tsx')).toContain("{t('hadith.library.bookNote')}");
    for (const f of fs.readdirSync(path.join(REPO, 'src/i18n/locales'))) {
      const k = JSON.parse(read(`src/i18n/locales/${f}`)).hadith.library;
      expect([f, Object.keys(k).sort()]).toEqual([f, ['about', 'bookNote', 'by', 'chapterOf', 'chapters', 'continue', 'empty', 'firstOnly', 'intro', 'levelFirst', 'levelLater', 'mark', 'marks', 'needsDownload', 'next', 'percent', 'previous', 'remove', 'searchHint', 'sections', 'source', 'tab', 'unmark']]);
      // Every book the app can name is described, and one with coarse passages says so.
      expect([f, Object.keys(k.about).sort()]).toEqual([f, LIBRARY_BOOKS.map(b => b.id).sort()]);
      for (const about of Object.values(k.about)) expect(String(about).length).toBeGreaterThan(10);
      expect(k.about.maqamat.split(/[.。।۔]/).filter((x: string) => x.trim()).length).toBeGreaterThanOrEqual(2);
      expect(k.about.iqd.split(/[.。।۔]/).filter((x: string) => x.trim()).length).toBeGreaterThanOrEqual(2);
      for (const key of ['by', 'source', 'continue', 'percent']) expect(k[key]).toMatch(/\{\{/);
      expect(k.chapterOf).toMatch(/\{\{n\}\}.*\{\{count\}\}|\{\{count\}\}.*\{\{n\}\}/);
    }
  });

  describe('a book of books (al-ʿIqd al-Farīd)', () => {
    const { openitiParts } = builder;
    const file = [
      '#META#Header#End#',
      '',
      '# الجزء الأول',
      '### | مقدمة المؤلف',
      '# الحمد لله الأول «1» .',
      '### | كتاب اللؤلؤة في السلطان',
      '### || فرش الكتاب',
      '### ||| للحكماء:',
      '# : قالت الحكماء إمام عادل خير من مطر وابل وإن مثلك إذا عفا لم',
      '# PageV01P019',
      '# يعدد «2» ، وإذا صفح لم يثرب.',
      '# .',
      '# أسر وفاء ثم أظهر غدرة ... فمن لي بعذر يوسع الناس ظاهره',
      '### |EDITOR|',
      '# تم الجزء الأول ويليه الجزء الثاني',
      '# الجزء الثانى',
      '### | كتاب الزمردة في المواعظ والزهد',
      '### || فرش كتاب الزمردة',
      '# قول أول</span>',
      '### | كتاب الزمردة في المواعظ والزهد',
      '### || فرش كتاب الزمردة الثانية في فضائل الشعر',
      'قول بلا علامة',
    ].join('\n');
    const spec = {
      volumes: /^# الجزء \S+\s*$/,
      editors: 1,
      mend: { 'قول بلا علامة': '# قول بلا علامة' },
      mendAt: { '### | كتاب الزمردة في المواعظ والزهد': [null, '### | كتاب الزمردة الثانية في فضائل الشعر'] },
    };

    it('reads parts, chapters and the headings inside them, and takes off what is not the author\'s', () => {
      expect(openitiParts(file, 't', spec)).toEqual([
        { t: 'مقدمة المؤلف', p: 'مقدمة المؤلف', b: ['الحمد لله الأول.'] },
        {
          t: 'فرش الكتاب',
          p: 'كتاب اللؤلؤة في السلطان',
          b: [
            { h: 'للحكماء' },
            'قالت الحكماء إمام عادل خير من مطر وابل وإن مثلك إذا عفا لم يعدد، وإذا صفح لم يثرب.',
            { v: [`أسر وفاء ثم أظهر غدرة${builder.HALVES}فمن لي بعذر يوسع الناس ظاهره`] },
          ],
        },
        { t: 'فرش كتاب الزمردة', p: 'كتاب الزمردة في المواعظ والزهد', b: ['قول أول'] },
        { t: 'فرش كتاب الزمردة الثانية في فضائل الشعر', p: 'كتاب الزمردة الثانية في فضائل الشعر', b: ['قول بلا علامة'] },
      ]);
    });

    it('stops on what it was not told about', () => {
      expect(() => openitiParts(file, 't', { ...spec, mend: {} })).toThrow(/does not know/);
      expect(() => openitiParts(file, 't', { ...spec, editors: 0 })).toThrow(/marked as the editor's/);
      expect(() => openitiParts(file, 't', { ...spec, mend: { ...spec.mend, 'سطر ليس في الملف': '# x' } })).toThrow(/mended nothing/);
      expect(() => openitiParts('#META#Header#End#\n### | كتاب\n### || باب\n### ||| عنوان', 't', {})).toThrow(/has no text/);
    });

    it('lists a book of books by its parts, and leaves the others alone', () => {
      expect(libraryParts([{ t: 'a' }, { t: 'b' }])).toBeNull();
      expect(libraryParts([{ t: 'م', p: 'م' }, { t: 'x', p: 'ك' }, { t: 'y', p: 'ك' }])).toEqual([
        { name: 'م', first: 0, count: 1 },
        { name: 'ك', first: 1, count: 2 },
      ]);
    });
  });

  describe('a reader\'s place, marks and what leaves the app', () => {
    const shelf = require('../src/hadith/libraryShelf') as typeof import('../src/hadith/libraryShelf');
    const storage = require('../src/storage/appStorage').default as { multiRemove: (k: string[]) => Promise<void>; setItem: (k: string, v: string) => Promise<void>; getItem: (k: string) => Promise<string | null> };
    beforeEach(async () => {
      await storage.multiRemove(['mihrab.library.place.v1', 'mihrab.library.reading.v1', 'mihrab.library.bookmarks.v1']);
      shelf._resetLibraryForTests();
      require('../src/hadith/hadithStore')._resetHadithStoreForTests();
      // The record on disk is emptied too: a mark from one test is not found by the next.
      await require('../src/storage/durableWrite').durableEncryptedSet('prayerapp.hadith.v1', JSON.stringify({ v: 1, items: {}, sets: {} }));
    });

    it('keeps the paragraph, and still reads the chapter kept before there were paragraphs', async () => {
      await storage.setItem('mihrab.library.place.v1', JSON.stringify({ kalila: 3 }));
      expect(await shelf.libraryPlace('kalila')).toBe(3);
      expect(await shelf.libraryReading('kalila')).toBeNull();
      await shelf.setLibraryReading('kalila', { c: 5, b: 12, f: 0.5, n: 19, t: 'باب', at: 100 });
      shelf._resetLibraryForTests();
      expect(await shelf.libraryReading('kalila')).toEqual({ c: 5, b: 12, f: 0.5, n: 19, t: 'باب', at: 100 });
      expect(await shelf.libraryPlace('kalila')).toBe(5);
    });

    it('drops what is not a place, and loses nothing else with it', async () => {
      await storage.setItem('mihrab.library.reading.v1', JSON.stringify({ a: { c: 1, b: 0, f: 0, n: 4, t: 'x', at: 1 }, b: { c: -1 }, c: 'no' }));
      expect(Object.keys(await shelf.libraryReadings())).toEqual(['a']);
      await storage.setItem('mihrab.library.bookmarks.v1', '{not json');
      expect(await shelf.libraryBookmarks('a')).toEqual([]);
    });

    it('measures a book by its chapters and offers the one read last', () => {
      expect(shelf.libraryProgress({ c: 0, f: 0, n: 10 })).toBe(0);
      expect(shelf.libraryProgress({ c: 4, f: 0.5, n: 10 })).toBeCloseTo(0.45);
      expect(shelf.libraryProgress({ c: 9, f: 1, n: 10 })).toBe(1);
      const r = { a: { c: 0, b: 0, f: 0, n: 2, t: '', at: 5 }, b: { c: 0, b: 0, f: 0, n: 2, t: '', at: 9 } };
      expect(shelf.lastReadBook(r, ['a', 'b'])).toBe('b');
      // A book that is not on the device is not offered to go on with.
      expect(shelf.lastReadBook(r, ['a'])).toBe('a');
      expect(shelf.lastReadBook(r, [])).toBeNull();
    });

    it('marks a paragraph and takes the mark off, newest first', async () => {
      expect(await shelf.toggleLibraryBookmark('a', 1, 2, 10)).toEqual([{ c: 1, b: 2, at: 10 }]);
      expect(await shelf.toggleLibraryBookmark('a', 0, 7, 20)).toEqual([{ c: 0, b: 7, at: 20 }, { c: 1, b: 2, at: 10 }]);
      shelf._resetLibraryForTests();
      expect(await shelf.toggleLibraryBookmark('a', 1, 2, 30)).toEqual([{ c: 0, b: 7, at: 20 }]);
      expect(await shelf.toggleLibraryBookmark('a', 0, 7, 40)).toEqual([]);
    });

    it('keeps marks in the record that travels, so they are backed up, synced and merged mark by mark', async () => {
      const record = require('../src/hadith/hadithRecord') as typeof import('../src/hadith/hadithRecord');
      const store = require('../src/hadith/hadithStore') as typeof import('../src/hadith/hadithStore');
      await shelf.toggleLibraryBookmark('iqd', 3, 2, 10);
      expect(store.getHadithRecord().library).toEqual({ 'iqd:3:2': [1, 10] });
      // Two devices: a mark made on one and taken back later on the other stays taken back.
      const here = record.setLibraryMark(record.EMPTY_HADITH_RECORD, 'iqd', 3, 2, true, 10);
      const there = record.setLibraryMark(record.setLibraryMark(record.EMPTY_HADITH_RECORD, 'iqd', 3, 2, false, 20), 'kalila', 0, 1, true, 15);
      const merged = record.mergeHadith(here, there);
      expect(merged).toEqual(record.mergeHadith(there, here));
      expect(record.libraryMarksOf(merged, 'iqd')).toEqual([]);
      expect(record.libraryMarksOf(merged, 'kalila')).toEqual([{ c: 0, b: 1, at: 15 }]);
      // What is not a mark is dropped on the way in, and a record without any keeps its bytes.
      expect(record.coerceHadithRecord({ v: 1, items: {}, sets: {}, library: { 'iqd:3:2': [1, 10], 'bad key': [1, 1], 'iqd:1:1': ['x', 1] } }).library).toEqual({ 'iqd:3:2': [1, 10] });
      expect('library' in record.mergeHadith(record.EMPTY_HADITH_RECORD, record.EMPTY_HADITH_RECORD)).toBe(false);
      expect(read('__tests__/syncCompleteness.test.ts')).toContain("'prayerapp.hadith.v1',");
    });

    it('moves the marks kept on the device for a day into the record, once', async () => {
      const store = require('../src/hadith/hadithStore') as typeof import('../src/hadith/hadithStore');
      await storage.setItem('mihrab.library.bookmarks.v1', JSON.stringify({ iqd: [{ c: 3, b: 2, at: 7 }], bahja: [{ c: 1, b: 0, at: 9 }, { c: 'x' }] }));
      expect(await shelf.libraryBookmarks('iqd')).toEqual([{ c: 3, b: 2, at: 7 }]);
      expect(await shelf.libraryBookmarks('bahja')).toEqual([{ c: 1, b: 0, at: 9 }]);
      expect(await storage.getItem('mihrab.library.bookmarks.v1')).toBeNull();
      expect(Object.keys(store.getHadithRecord().library ?? {}).sort()).toEqual(['bahja:1:0', 'iqd:3:2']);
    });

    it('sends a passage with whose it is, whole', () => {
      const book = { title: 'العقد الفريد', author: 'ابن عبد ربه الأندلسي' };
      expect(shelf.libraryShareText(book, 'المشورة', 'قول كامل.')).toBe('قول كامل.\n\n— العقد الفريد، ابن عبد ربه الأندلسي · المشورة');
      expect(shelf.libraryShareText(book, 'العقد الفريد', { v: ['صدر  عجز', 'صدر  عجز'] })).toBe('صدر  عجز\nصدر  عجز\n\n— العقد الفريد، ابن عبد ربه الأندلسي');
      const { bookmarkSnippet } = require('../src/screens/hadith/LibraryBookScreen');
      expect(bookmarkSnippet('كلمة  قصيرة')).toBe('كلمة قصيرة');
      const long = bookmarkSnippet('كلمة '.repeat(60));
      expect(long.length).toBeLessThanOrEqual(91);
      expect(long.endsWith('…')).toBe(true);
    });

    it('never reaches the hadith: a place and a mark are the only things the Library keeps', () => {
      const src = read('src/hadith/libraryShelf.ts');
      expect(src.match(/'mihrab\.library\.[a-z]+\.v1'/g)).toEqual(["'mihrab.library.place.v1'", "'mihrab.library.reading.v1'", "'mihrab.library.bookmarks.v1'"]);
    });
  });

  describe('finding a phrase in one book', () => {
    const { libraryIndex, searchLibrary, librarySnippet, chapterHeadings } = require('../src/hadith/librarySearch') as typeof import('../src/hadith/librarySearch');
    const chapters = [
      { t: 'باب الأول', b: [{ h: 'فصل في النية' }, 'قال النبي ﷺ: «إِنَّمَا الأعمالُ بالنيّات» وهذا أصل عظيم.', { v: ['أسر وفاء ثم أظهر غدرة\u2003\u2003فمن لي بعذر'] }] },
      { t: 'باب الثاني', b: ['كلام آخر في المشورة.', { h: 'فصل ثان' }, 'إنما يُعرف الفضل لأهله.'] },
    ];
    const now = () => Promise.resolve();

    it('finds it whatever the marks and the hamza, as a phrase, in the book\'s order', async () => {
      const index = await libraryIndex(chapters, now);
      expect(searchLibrary(chapters, index, 'انما').hits.map(h => [h.c, h.b])).toEqual([[0, 1], [1, 2]]);
      expect(searchLibrary(chapters, index, 'انما الاعمال بالنيات').hits.map(h => [h.c, h.b])).toEqual([[0, 1]]);
      // The words in another order are another phrase.
      expect(searchLibrary(chapters, index, 'الاعمال انما').hits).toEqual([]);
      // Verse and headings are the book's text too.
      expect(searchLibrary(chapters, index, 'أظهر غدرة').hits.map(h => [h.c, h.b])).toEqual([[0, 2]]);
      expect(searchLibrary(chapters, index, 'فصل').hits.map(h => [h.c, h.b])).toEqual([[0, 0], [1, 1]]);
    });

    it('asks for two letters, and says when there was more than it gives', async () => {
      const index = await libraryIndex(chapters, now);
      expect(searchLibrary(chapters, index, 'ا')).toEqual({ hits: [], more: false });
      expect(searchLibrary(chapters, index, '  ')).toEqual({ hits: [], more: false });
      const r = searchLibrary(chapters, index, 'انما', 1);
      expect(r.hits.map(h => [h.c, h.b])).toEqual([[0, 1]]);
      expect(r.more).toBe(true);
      // Made once for a book.
      expect(libraryIndex(chapters, now)).toBe(libraryIndex(chapters, now));
    });

    it('shows the words around what was found, as written', () => {
      const long = `${'كلمة '.repeat(30)}حتى إِنَّمَا الأعمالُ بالنيّات ${'ثم '.repeat(30)}`.trim();
      const s = librarySnippet(long, 'انما الاعمال');
      expect(s).toContain('إِنَّمَا الأعمالُ بالنيّات');
      expect(s.startsWith('… ')).toBe(true);
      expect(s.endsWith(' …')).toBe(true);
      expect(s.split(' ').length).toBeLessThan(25);
      expect(librarySnippet('قول قصير.', 'قول')).toBe('قول قصير.');
    });

    it('lists a chapter\'s own headings with where they are', () => {
      expect(chapterHeadings(chapters[1].b)).toEqual([{ b: 1, h: 'فصل ثان' }]);
      expect(chapterHeadings(['نص'])).toEqual([]);
    });

    it('keeps the screen on for a chapter, not for the book\'s page, under the reader\'s own setting', () => {
      const src = read('src/screens/hadith/LibraryBookScreen.tsx');
      expect(src).toContain('useKeepAwake(keepLit && chapter != null)');
      expect(src).toContain('prefs.readerKeepAwake');
    });

    it('is not the Hadith tab\'s search', () => {
      for (const f of ['src/screens/HadithScreen.tsx', 'src/hadith/library.ts']) expect([f, /librarySearch/.test(read(f))]).toEqual([f, false]);
    });
  });
});
