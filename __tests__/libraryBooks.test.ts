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
import { LIBRARY_BOOKS, findLibraryBook, libraryKey, offeredLibraryBooks } from '../src/hadith/libraryShelf';
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
      expect([f, Object.keys(k).sort()]).toEqual([f, ['bookNote', 'by', 'chapters', 'continue', 'empty', 'intro', 'needsDownload', 'next', 'previous', 'source', 'tab']]);
      for (const key of ['by', 'source', 'continue']) expect(k[key]).toMatch(/\{\{/);
    }
  });
});
