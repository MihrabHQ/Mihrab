/**
 * What a reader meeting the Hadith tab for the first time is shown
 * (`src/hadith/`, `src/screens/HadithScreen.tsx` and the screens under
 * `src/screens/hadith/`).
 *
 *   • A long topic opens on its parts, each with the number of hadith a
 *     tap on it lists — counted from what is on the device, not copied
 *     from the source's figure for one language.
 *   • A search answers once with a hadith the source holds twice, and
 *     keeps both where the two are graded differently.
 *   • The grade filter sorts HadeethEnc's own Arabic grade, strictly: a
 *     grade with a reservation is under neither.
 *   • The hint in the search field names a reference that works, in every
 *     language — it was "Bukhari 1" in thirteen, and understood in six.
 *   • A Bengali or Hindi word is searched whole.
 *   • "Continue reading" says what it continues; a report names the entry
 *     and nothing about the reader.
 */
import fs from 'fs';
import path from 'path';

const mockPacks: Record<string, unknown> = {};
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async (key: string) => mockPacks[key] ?? null),
  packStatus: jest.fn((key: string) => (mockPacks[key] ? { state: 'ready', bytes: 1 } : { state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => Object.keys(mockPacks),
}));
jest.mock('../src/appVersion', () => ({ getInstalledAppVersionLabel: () => '2.30.0 (300)' }));

import {
  CategoryTree,
  HADITH_LANGS,
  LONG_LIST,
  opensOnContents,
  topicContents,
} from '../src/hadith/catalog';
import { agreedGradeClass, GRADE_CLASSES, gradeClass } from '../src/hadith/grade';
import {
  foldForSearch,
  gradesKnown,
  listRows,
  sameHadithTwice,
  searchHadith,
  topicCounts,
  type HadithItem,
} from '../src/hadith/library';
import { packEntry } from '../src/hadith/origin';
import type { HencEntry } from '../src/hadith/packTypes';
import { resumeWhere } from '../src/hadith/progress';
import { NAWAWI_REF, parseReference } from '../src/hadith/reference';
import { hadithReport, hadithReportIssueUrl, hadithReportMailUrl } from '../src/hadith/report';
import { BOOKS } from '../src/hadith/catalog';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const locale = (lang: string) => JSON.parse(read(`src/i18n/locales/${lang}.json`)).hadith;

// "Purity is half of faith" as HadeethEnc holds it twice (65004, 66526):
// the same words, the narrator named in full in the second.
const PURITY_A =
  'عن أبي مالكٍ الأشعريِّ رضي الله عنه قال: قال رسول الله صلى الله عليه وسلم: «الطُّهُورُ شَطْرُ الْإِيمَانِ، وَالْحَمْدُ لِلهِ تَمْلَأُ الْمِيزَانَ، وَسُبْحَانَ اللهِ وَالْحَمْدُ لِلهِ تَمْلَآنِ مَا بَيْنَ السَّمَاوَاتِ وَالْأَرْضِ، وَالصَّلَاةُ نُورٌ، وَالصَّدَقَةُ بُرْهَانٌ»';
const PURITY_B =
  'عَنْ أَبِي مَالِكٍ الحَارِثِ بْنِ عَاصِمٍ الأَشْعَرِيِّ رَضِيَ اللَّهُ عَنْهُ قَالَ: قَالَ رَسُولُ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ: «الطُّهُورُ شَطْرُ الإِيمَانِ، وَالحَمْدُ لِلَّهِ تَمْلَأُ المِيزَانَ، وَسُبْحَانَ اللَّهِ وَالحَمْدُ لِلَّهِ تَمْلَآنِ مَا بَيْنَ السَّمَاوَاتِ وَالأَرْضِ، وَالصَّلَاةُ نُورٌ، وَالصَّدَقَةُ بُرْهَانٌ»';

const entry = (id: string, t: string, c: string[], extra: Partial<HencEntry> = {}): HencEntry => ({
  id,
  t,
  h: `${t}. The hadith's own words.`,
  x: [],
  c,
  ...extra,
});

const TREE: Array<[string, string | null, string, number]> = [
  ['4', null, 'Jurisprudence', 0],
  ['134', '4', 'Prayer', 999],
  ['458', '134', 'The Adhan', 999],
  ['472', '134', 'Friday Prayer', 999],
  ['477', '472', 'Virtue of Friday', 999],
  ['476', '134', 'Prayer of Fear', 999],
  ['133', '4', 'Purification', 999],
  ['437', '133', 'Ablution', 999],
  ['137', '4', 'Fasting', 999],
];

beforeAll(() => {
  mockPacks['categories/en'] = { lang: 'en', retrieved: '2026-11-25', items: TREE };
  mockPacks['henc/all/en'] = {
    pack: 'all',
    lang: 'en',
    source: 'HadeethEnc.com',
    retrieved: '2026-11-25',
    entries: [
      entry('1', 'The call to prayer', ['458'], { g: 'Authentic', q: 1 }),
      entry('2', 'The second call', ['458'], { g: 'Good', q: 2 }),
      entry('3', 'The best day', ['477'], { g: 'Authentic', q: 1 }),
      entry('4', 'Bathing on Friday', ['472', '437'], { g: 'Authentic', q: 1 }),
      entry('5', 'Prayer itself', ['134'], { g: 'Authentic except a phrase' }),
      entry('6', 'Wudu', ['437'], { g: 'Authentic', q: 1 }),
      entry('65004', 'Purity is half of faith', ['437'], { g: 'Authentic', a: 'Narrated by Muslim', s: 1, q: 1, ar: PURITY_A }),
      entry('66526', 'Purity is half of faith', ['437'], { g: 'Authentic', a: 'Narrated by Muslim', s: 1, q: 1, ar: PURITY_B }),
    ],
  };
});

describe('a long topic opens on its parts', () => {
  const tree = new CategoryTree(TREE);

  it('counts each hadith once under a topic, wherever under it the hadith sits', async () => {
    const counts = await topicCounts('en');
    // 1, 2 (adhan), 3 (under Friday), 4 (Friday), 5 (prayer itself).
    expect(counts.get('134')).toBe(5);
    expect(counts.get('472')).toBe(2);
    // 4 is under Friday and under Ablution: one of each, not two of either.
    expect(counts.get('437')).toBe(4);
    expect(counts.get('133')).toBe(4);
    // Under both Prayer and Purification, and one hadith of Jurisprudence.
    expect(counts.get('4')).toBe(8);
    expect(counts.get('137')).toBeUndefined();
  });

  it('is the number of rows a tap on it lists, not the figure the tree carries', async () => {
    const counts = await topicCounts('en');
    for (const id of ['134', '472', '458', '437', '133']) {
      expect({ id, n: counts.get(id) }).toEqual({ id, n: (await listRows(`cat:${id}`, 'en')).length });
      expect(tree.count(id)).toBe(999);
    }
  });

  it('lists the topics under each of a tile\'s topics, and leaves out the empty ones', async () => {
    const counts = await topicCounts('en');
    expect(topicContents(['134', '133'], tree, counts)).toEqual([
      { topic: '134', total: 5, children: [{ id: '458', count: 2 }, { id: '472', count: 2 }] },
      { topic: '133', total: 4, children: [{ id: '437', count: 4 }] },
    ]);
    // Nothing here is under Fasting: no section, not an empty one.
    expect(topicContents(['137'], tree, counts)).toEqual([]);
  });

  it('only where there is more than is read through, and more than one part', () => {
    const two = [{ topic: 'a', total: 40, children: [{ id: 'b', count: 20 }, { id: 'c', count: 20 }] }];
    expect(opensOnContents(two, 40)).toBe(true);
    expect(opensOnContents(two, LONG_LIST - 1)).toBe(false);
    // One part is not a choice.
    expect(opensOnContents([{ topic: 'a', total: 40, children: [{ id: 'b', count: 40 }] }], 40)).toBe(false);
    expect(opensOnContents([{ topic: 'a', total: 40, children: [] }], 40)).toBe(false);
    // A tile of two topics is two parts, whatever is under them.
    expect(opensOnContents([{ topic: 'a', total: 20, children: [] }, { topic: 'b', total: 20, children: [] }], 40)).toBe(true);
    expect(opensOnContents([], 0)).toBe(false);
  });

  it('knows the topics a topic is under', () => {
    expect(tree.path('477')).toEqual(['477', '472', '134', '4']);
    expect(tree.path('4')).toEqual(['4']);
    expect(tree.path('nowhere')).toEqual(['nowhere']);
  });

  it('keeps the search field above the parts, and "All hadith" among them', () => {
    const src = read('src/screens/hadith/HadithListScreen.tsx');
    const header = src.slice(src.indexOf('const header = ('), src.indexOf('return (\n    <HadithPage'));
    expect(header.indexOf('{field}')).toBeGreaterThan(-1);
    expect(header.indexOf('{field}')).toBeLessThan(header.indexOf("t('hadith.allHadith')"));
    expect(header).toContain('all: true');
  });
});

describe('a hadith the source holds twice', () => {
  const a = entry('65004', 'Purity', ['1'], { g: 'Authentic', s: 1, ar: PURITY_A });
  const b = entry('66526', 'Purity', ['1'], { g: 'Authentic', s: 1, ar: PURITY_B });

  it('is told by its Arabic, however each copy is vowelled', () => {
    expect(sameHadithTwice(a, b)).toBe(true);
  });

  it('is two hadith where the two are graded or attributed differently', () => {
    expect(sameHadithTwice(a, { ...b, g: 'Good' })).toBe(false);
    expect(sameHadithTwice(a, { ...b, s: undefined })).toBe(false);
  });

  it('is two hadith where the words differ, or are too few to tell', () => {
    expect(sameHadithTwice(a, { ...b, ar: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى' })).toBe(false);
    const short = { ...a, ar: 'الدِّينُ النَّصِيحَةُ' };
    expect(sameHadithTwice(short, { ...short, id: '9' })).toBe(false);
  });

  it('is one row of a search, and still two rows of its topic', async () => {
    const hits = await searchHadith('purity', 'en');
    expect(hits.map(h => h.id)).toEqual(['h:65004']);
    const rows = await listRows('cat:437', 'en');
    expect(rows.map(r => r.id)).toEqual(expect.arrayContaining(['h:65004', 'h:66526']));
  });
});

describe("a search's order", () => {
  // The words in the text of the first two, in the title of the third:
  // "intention" on the Pixel (2026-11-25) answered with "An army will
  // invade the Kaʿbah…" and had "…deeds depends on the intentions" below.
  const text = (id: string, t: string, extra: Partial<HencEntry> = {}) =>
    entry(id, t, ['458'], { h: `${t}, and they are judged by their intention.`, g: 'Authentic', ...extra });
  const entries: HencEntry[] = [
    text('101', 'An army will invade the Kaaba'),
    text('102', 'You will proceed with your journey'),
    entry('103', 'The reward of deeds depends on the intentions', ['458'], { g: 'Authentic' }),
    // One hadith entered twice: the first copy has the word in its text, the second in its title.
    text('104', 'Half of faith', { s: 1, ar: PURITY_A }),
    entry('105', 'Purity and intention', ['437'], { g: 'Authentic', s: 1, ar: PURITY_B }),
  ];
  const pack = (list: HencEntry[]) => ({ pack: 'all', lang: 'de', source: 'HadeethEnc.com', retrieved: '2026-11-25', entries: list });
  beforeAll(() => {
    mockPacks['henc/all/de'] = pack(entries);
  });
  afterAll(() => {
    delete mockPacks['henc/all/de'];
  });

  // Among the titles the word itself ("…and intention") comes before a word
  // that runs on from it ("…the intentions") — hadithSearchNearest.test.ts.
  it('has the hadith with the words in its title first, nearest match first, then the rest in the packs’ order', async () => {
    expect((await searchHadith('intention', 'de')).map(h => h.id)).toEqual(['h:105', 'h:103', 'h:101', 'h:102']);
  });

  it('finds a title past the entries that would have filled the page', async () => {
    expect((await searchHadith('intention', 'de', { limit: 2 })).map(h => h.id)).toEqual(['h:105', 'h:103']);
    expect((await searchHadith('intention', 'de', { limit: 3 })).map(h => h.id)).toEqual(['h:105', 'h:103', 'h:101']);
  });

  it('shows, of a hadith held twice, the copy whose title has the words', async () => {
    const ids = (await searchHadith('intention', 'de')).map(h => h.id);
    expect(ids).toContain('h:105');
    expect(ids).not.toContain('h:104');
    // And the first copy where neither title has them.
    expect((await searchHadith('judged', 'de')).map(h => h.id)).toEqual(['h:101', 'h:102', 'h:104']);
  });

  it('still has a match in an explanation only after every hadith that says it', async () => {
    mockPacks['henc/all/de'] = pack([entry('100', 'Something else', ['458'], { e: 'A note on intention.' }), ...entries]);
    mockPacks['henc/older/de'] = { pack: 'older', lang: 'de', source: '', retrieved: '', entries: [] };
    const hits = await searchHadith('intention', 'de');
    expect(hits.map(h => h.id)).toEqual(['h:105', 'h:103', 'h:101', 'h:102', 'h:100']);
    expect(hits[4].inExplanation).toBe(true);
    delete mockPacks['henc/older/de'];
  });
});

describe('the grade filter', () => {
  it('reads sahih and hasan off the Arabic grade', () => {
    for (const g of ['صحيح', 'صَحِيحٌ', 'صحيحان', 'صحيحة', 'الحديثان صحيحان', 'صحيح على شرط البخاري', 'قال النووي: حديث صحيح']) {
      expect({ g, q: gradeClass(g) }).toEqual({ g, q: 1 });
    }
    for (const g of ['حسن', 'قال الترمذي: حديث حسن', 'حسن غريب']) {
      expect({ g, q: gradeClass(g) }).toEqual({ g, q: 2 });
    }
  });

  it('counts a grade reached through supporting chains as that grade', () => {
    for (const g of ['صحيح لغيره', 'صحيح بشواهده', 'صحيح بمجموع طرقه']) expect(gradeClass(g)).toBe(1);
    for (const g of ['حسن لغيره', 'حسن بشواهده', 'حسن لطرقه']) expect(gradeClass(g)).toBe(2);
  });

  it('takes the lower where an entry holds both', () => {
    expect(gradeClass('حسن صحيح')).toBe(2);
    expect(gradeClass('صحيح وحديث جابر حسن')).toBe(2);
    expect(gradeClass('حديث ابن عباس: صحيح.\nحديث النزال: صحيح.\nحديث عبد الله بن عمرو: حسن')).toBe(2);
  });

  it('is neither where the grade has a reservation', () => {
    for (const g of [
      'ضعيف',
      'حديث أبي ذر ضعيف، وحديث معيقيب صحيح',
      'صحيح إلا (نصف يوم من)',
      'صحيح دون قوله: (ولم يستدر)',
      'صحيح، دون الجملة الأخيرة (فإن الزانية...)',
      'صحيح, لكن قوله: ((تقول امرأته ..... )) مدرجٌ من قول أبي هريرة',
      'صحيح موقوفًا على ابن عباس -رضي الله عنهما',
      'صحيح وهو موقوف هلى أنس بن مالك',
      'إسناده صحيح',
      'إسناده حسن',
      'سنده صحيح',
      'صحيح الإسناد',
      'قال النووي: بإسناد حسن',
      'قال الهيثمي في مجمع الزوائد: رجاله رجال الصحيح',
      'نقل الألباني تصحيحه عن ابن تيمية ولم يتعقبه',
      'صحيح.\nملحوظة: لم نجد له حكما للألباني',
      '',
    ]) {
      expect({ g, q: gradeClass(g) }).toEqual({ g, q: 0 });
    }
    expect(gradeClass(undefined)).toBe(0);
    expect(gradeClass(null)).toBe(0);
  });

  it('is one rule in the app and in the script that builds the packs', () => {
    const rule = (file: string) => {
      const src = read(file);
      const body = src.slice(src.indexOf('// grade-rule:start'), src.indexOf('// grade-rule:end'));
      expect(body.length).toBeGreaterThan(300);
      // The same lines, but for the types and `export` a TypeScript file writes.
      return body
        .replace(/export /g, '')
        .replace(/: string \| null \| undefined\): 0 \| 1 \| 2/, ')')
        .replace(/\s+/g, ' ');
    };
    expect(rule('src/hadith/grade.ts')).toBe(rule('scripts/hadith/build-packs.js'));
  });

  it("is a translation's only where its Arabic grade and the Arabic entry's grade today agree", () => {
    expect(agreedGradeClass('صحيح', 'صحيح')).toBe(1);
    expect(agreedGradeClass('حسن', 'حسن لغيره')).toBe(2);
    // HadeethEnc 65065 on 2026-11-25: "Authentic hadith" in English, weak in the Arabic.
    expect(agreedGradeClass('صحيح', 'ضعيف')).toBe(0);
    // Revised between the two grades: under neither, not under the older one.
    expect(agreedGradeClass('صحيح', 'حسن')).toBe(0);
    expect(agreedGradeClass('حسن', 'صحيح')).toBe(0);
    // No Arabic entry to check against: no class.
    expect(agreedGradeClass('صحيح', undefined)).toBe(0);
  });

  it('rides in a pack rebuilt from HadeethEnc only where it can be checked: the Arabic one', () => {
    const d = { id: 7, title: 't', hadeeth: 'h', grade: 'صحيح', categories: [3] };
    expect(packEntry('ar', d).q).toBe(1);
    expect(packEntry('ar', { ...d, grade: 'حسن' }).q).toBe(2);
    expect(packEntry('ar', { ...d, grade: 'إسناده صحيح' }).q).toBeUndefined();
    // A translation rebuilt alone has no Arabic entry beside it to agree with.
    expect(packEntry('en', { ...d, grade: 'Authentic' }).q).toBeUndefined();
  });

  it('is built into the packs by the same agreement', () => {
    const script = read('scripts/hadith/build-packs.js');
    expect(script).toContain("lang === 'ar' ? gradeClass(d.grade) : agreedGradeClass(d.grade_ar, currentGradeAr)");
    const body = (src: string) =>
      src
        .slice(src.indexOf('function agreedGradeClass('))
        .split('\n}')[0]
        .replace(/export /g, '')
        .replace(/: string \| null \| undefined/g, '')
        .replace(/\): 0 \| 1 \| 2/, ')')
        .replace(/\s+/g, ' ');
    expect(body(read('src/hadith/grade.ts'))).toBe(body(script));
  });

  it('keeps a search to one grade, and leaves the reserved ones to the search without it', async () => {
    expect((await searchHadith('call', 'en')).map(h => h.id)).toEqual(['h:1', 'h:2']);
    expect((await searchHadith('call', 'en', { grade: 1 })).map(h => h.id)).toEqual(['h:1']);
    expect((await searchHadith('call', 'en', { grade: 2 })).map(h => h.id)).toEqual(['h:2']);
    expect((await searchHadith('itself', 'en', { grade: 1 })).map(h => h.id)).toEqual([]);
    expect((await searchHadith('itself', 'en')).map(h => h.id)).toEqual(['h:5']);
  });

  it('is offered only over a pack whose entries say their grade', async () => {
    expect(await gradesKnown('en')).toBe(true);
    const held = mockPacks['henc/all/en'];
    mockPacks['henc/all/en'] = {
      pack: 'all',
      lang: 'en',
      source: 'HadeethEnc.com',
      retrieved: '2026-11-01',
      entries: [entry('1', 'An older pack', ['458'], { g: 'Authentic' })],
    };
    // A different set of ready packs is a different index (`hencIndex`).
    mockPacks['henc/older/en'] = { pack: 'older', lang: 'en', source: '', retrieved: '', entries: [] };
    expect(await gradesKnown('en')).toBe(false);
    mockPacks['henc/all/en'] = held;
    delete mockPacks['henc/older/en'];
    // The reader's own language rebuilt on the device, which cannot say
    // (`origin.ts`), beside an English that does: not offered — it would
    // list English's entries and leave out every Swedish one.
    mockPacks['henc/all/sv'] = {
      pack: 'all',
      lang: 'sv',
      source: 'HadeethEnc.com',
      retrieved: '2026-11-01',
      entries: [entry('1', 'Ett äldre paket', ['458'], { g: 'Autentisk' })],
    };
    expect(await gradesKnown('sv')).toBe(false);
    mockPacks['henc/all/sv'] = {
      pack: 'all',
      lang: 'sv',
      source: 'HadeethEnc.com',
      retrieved: '2026-11-25',
      entries: [entry('1', 'Ett paket som säger', ['458'], { g: 'Autentisk', q: 1 })],
    };
    mockPacks['henc/older/sv'] = { pack: 'older', lang: 'sv', source: '', retrieved: '', entries: [] };
    expect(await gradesKnown('sv')).toBe(true);
    delete mockPacks['henc/all/sv'];
    delete mockPacks['henc/older/sv'];
    const screen = read('src/screens/HadithScreen.tsx');
    expect(screen).toMatch(/\{grades \? \(\s*<Chip/);
  });

  it('has two choices, each named in every language', () => {
    expect(GRADE_CLASSES.map(g => g.q)).toEqual([1, 2]);
    for (const lang of HADITH_LANGS) {
      const f = locale(lang).filter;
      for (const k of ['grade', 'sahih', 'hasan', 'clearGrade', 'gradeNote']) {
        expect({ lang, k, ok: typeof f[k] === 'string' && f[k].length > 0 }).toEqual({ lang, k, ok: true });
      }
      expect(f.clearGrade).toContain('{{grade}}');
      // Whose grading it is, in every language.
      expect(f.gradeNote).toContain('HadeethEnc');
    }
  });
});

describe("the search field's hint", () => {
  const names = (lang: string) => {
    const h = locale(lang);
    const out: Record<string, string> = { [NAWAWI_REF]: h.set.nawawi40.title };
    for (const b of BOOKS) out[b] = h.book[b];
    return out;
  };

  it.each([...HADITH_LANGS])('%s: names a reference the field understands', lang => {
    const h = locale(lang);
    expect(h.searchPlaceholder).toContain('{{example}}');
    const ref = parseReference(h.searchExample, names(lang));
    expect({ lang, example: h.searchExample, understood: !!ref }).toEqual({ lang, example: h.searchExample, understood: true });
  });

  it.each([...HADITH_LANGS].filter(l => l !== 'ar'))('%s: is one the reader can read without Arabic', lang => {
    // The books are Arabic only; an-Nawawi's Forty are translated.
    expect(parseReference(locale(lang).searchExample, names(lang))?.book).toBe(NAWAWI_REF);
  });

  it('reads part of a collection\'s name when it is no other collection\'s', () => {
    expect(parseReference('Бухари 1', names('ru'))).toEqual({ book: 'bukhari', n: 1 });
    expect(parseReference('বুখারী 1', names('bn'))).toEqual({ book: 'bukhari', n: 1 });
    expect(parseReference('बुख़ारी 1', names('hi'))).toEqual({ book: 'bukhari', n: 1 });
    expect(parseReference('Bujari 1', names('es'))).toEqual({ book: 'bukhari', n: 1 });
    // "Sahih" is al-Bukhari's and Muslim's: it names neither.
    expect(parseReference('Sahih 1', names('en'))).toBeNull();
    expect(parseReference('Sunan 5', names('en'))).toBeNull();
    // And a word of no collection's is still words to search for.
    expect(parseReference('patience 5', names('en'))).toBeNull();
  });

  it('marks the books as Arabic where the reader does not read it', () => {
    const screen = read('src/screens/HadithScreen.tsx');
    expect(screen).toContain("=== 'ar' ? '' : t('hadith.arabicTag')");
    expect(screen).toContain('hadith.refNeedsBookArabic');
    expect(read('src/screens/hadith/HadithListScreen.tsx')).toContain('hadith.bookNeedsDownload');
  });
});

describe('a word in a script written with vowel signs', () => {
  it('is searched whole', () => {
    expect(foldForSearch('নামাজ')).toBe('নামাজ'.normalize('NFD'));
    expect(foldForSearch('नमाज़').split(' ')).toHaveLength(1);
    expect(foldForSearch('বুখারী ১').split(' ')[0].length).toBeGreaterThan(3);
  });

  it('still loses what is not the word: Arabic vowelling, Latin accents, punctuation', () => {
    expect(foldForSearch('إِنَّمَا الْأَعْمَالُ')).toBe('انما الاعمال');
    expect(foldForSearch('Ṣalāh, “prayer”!')).toBe('salah prayer');
  });
});

describe('"Continue reading"', () => {
  it('says which book and number', () => {
    expect(resumeWhere({ source: 'book', number: 3 }, 'Sahih al-Bukhari', 'Sahih al-Bukhari', false)).toBe('Sahih al-Bukhari · 3');
    // Opened from a search: no list, and the book still names it.
    expect(resumeWhere({ source: 'book', number: 3 }, null, 'Sahih al-Bukhari', false)).toBe('Sahih al-Bukhari · 3');
  });

  it("gives an-Nawawi's number only in an-Nawawi's Forty", () => {
    expect(resumeWhere({ source: 'hadeethenc', number: 14 }, "an-Nawawi's Forty", null, true)).toBe("an-Nawawi's Forty · 14");
    // The same entry read under a topic is not the topic's fourteenth.
    expect(resumeWhere({ source: 'hadeethenc', number: 14 }, 'Fasting', null, false)).toBe('Fasting');
    expect(resumeWhere({ source: 'nawawi', number: 2 }, "an-Nawawi's Forty", null, true)).toBe("an-Nawawi's Forty · 2");
  });

  it('says nothing where there is nothing to say', () => {
    expect(resumeWhere({ source: 'hadeethenc' }, null, null, false)).toBeNull();
    expect(resumeWhere({ source: 'hadeethenc' }, 'Patience', null, false)).toBe('Patience');
  });
});

describe('a report of a problem with a hadith', () => {
  const item: HadithItem = {
    id: 'h:65004',
    source: 'hadeethenc',
    title: 'Purity is half of faith',
    arabic: PURITY_A,
    text: 'Purity is half of faith…',
    textLang: 'en',
    fallback: true,
    hints: [],
    words: [],
    categories: ['437'],
  };

  it('names the entry, the language shown and the app — and nothing of the reader', () => {
    const r = hadithReport(item, 'sv-SE', 'Vad är fel?', 'android');
    expect(r.subject).toBe('Hadith h:65004');
    expect(r.body.startsWith('Vad är fel?')).toBe(true);
    expect(r.body).toContain('HadeethEnc entry 65004');
    expect(r.body).toContain('Purity is half of faith');
    expect(r.body).toContain('English standing in for sv');
    expect(r.body).toContain('2.30.0 (300), android');
    // Not the text, a note, a bookmark or a place: what is in the body is listed above.
    expect(r.body.split('\n').filter(l => l.includes(':')).map(l => l.split(':')[0])).toEqual(['Entry', 'Opens with', 'Shown in', 'App']);
  });

  it("names a book's hadith by its number and its row", () => {
    const book: HadithItem = { ...item, id: 'b:bukhari:7', source: 'book', book: 'bukhari', number: 8, text: null, textLang: null, fallback: false };
    const r = hadithReport(book, 'en', 'What is wrong?', 'ios');
    expect(r.body).toContain('bukhari, no. 8 (row 7');
    expect(r.body).toContain('Shown in: Arabic only');
  });

  it("goes to the project's address, the one the privacy policy gives", () => {
    const r = hadithReport(item, 'en', 'What is wrong?', 'android');
    const mail = hadithReportMailUrl(r);
    expect(mail.startsWith('mailto:mihrab@elghamri.se?subject=Hadith%20h%3A65004&body=')).toBe(true);
    expect(read('PRIVACY_POLICY.md')).toContain('mihrab@elghamri.se');
    expect(decodeURIComponent(mail.split('&body=')[1])).toBe(r.body);
  });

  it('opens as an issue where there is no mail app, and is sent by the reader either way', () => {
    const r = hadithReport(item, 'en', 'What is wrong?', 'android');
    expect(hadithReportIssueUrl(r).startsWith('https://github.com/MihrabHQ/Mihrab/issues/new?labels=hadith&title=')).toBe(true);
    const reader = read('src/screens/hadith/HadithReaderScreen.tsx');
    // Opened, never fetched: nothing leaves the device until the reader sends it.
    expect(reader).toMatch(/Linking\.openURL\(hadithReportMailUrl\(r\)\)\.catch\(\(\) =>\s*Linking\.openURL\(hadithReportIssueUrl\(r\)\)/);
    expect(read('src/hadith/report.ts')).not.toMatch(/fetch\(|XMLHttpRequest/);
  });
});

describe('the reader', () => {
  const reader = read('src/screens/hadith/HadithReaderScreen.tsx');

  it('has one place that marks a hadith read', () => {
    const bar = reader.slice(reader.indexOf('<Column style={styles.barInner}>'), reader.indexOf('<NoteEditor'));
    expect(bar).not.toContain('setRead(');
    expect(bar).not.toContain("t('hadith.markRead')");
    // Under the text: mark it (and go on); once read, unmark it.
    expect(reader.match(/setRead\(r, id, true/g)).toHaveLength(1);
    expect(reader.match(/setRead\(r, id, false/g)).toHaveLength(1);
  });

  it('says where it is in a set or a topic, and leaves a book to its own numbers', () => {
    expect(reader).toContain("item.source !== 'book' && at >= 0 && ids.length > 1");
    expect(reader).toContain("t('hadith.position', { n: at + 1, total: ids.length })");
    for (const lang of HADITH_LANGS) {
      const p = locale(lang).position;
      expect({ lang, ok: p.includes('{{n}}') && p.includes('{{total}}') }).toEqual({ lang, ok: true });
    }
  });
});

describe('the first open', () => {
  const screen = read('src/screens/HadithScreen.tsx');

  it('is the download card alone, until anything is on the device', () => {
    const first = screen.slice(screen.indexOf('if (firstOpen) {'), screen.indexOf('return (\n    <View style={[styles.root, { backgroundColor: palette.bg }]}>\n      <Column outer'));
    expect(first).toContain('{gate}');
    expect(first).not.toContain('<TextInput');
    expect(first).not.toContain('<SegmentedControl');
    expect(first).not.toContain('<Learn');
  });

  it('does not flash the card before the device has been looked at', () => {
    expect(screen.indexOf('if (!scanned) return')).toBeGreaterThan(-1);
    expect(screen.indexOf('if (!scanned) return')).toBeLessThan(screen.indexOf('if (firstOpen) {'));
  });

  it("holds through its own download: the tree's small pack lands before the hadith", () => {
    expect(screen).toContain('!library.keys.includes(k as PackKey)');
  });

  it('offers the download where a search finds nothing because the hadith are not here', () => {
    // A book kept and the hadith deleted in Settings: "intention" found
    // nothing, and the page said "Nothing found." with the download hidden.
    expect(screen).toContain('whenEmpty={library.missing.length ? gate : undefined}');
    const empty = screen.slice(screen.indexOf('{hits?.length ? ('), screen.indexOf("t('hadith.searchNeedsDownload')"));
    expect(empty.indexOf('whenEmpty ? (')).toBeGreaterThan(-1);
    // After the search has finished, and after a reference's own answer.
    expect(empty.indexOf('busy && anything')).toBeLessThan(empty.indexOf('whenEmpty ? ('));
    expect(empty.indexOf('answer.missing) ? null')).toBeLessThan(empty.indexOf('whenEmpty ? ('));
  });

  it('opens Look up from its top after Learn was scrolled', () => {
    const choose = screen.slice(screen.indexOf('const choose = useCallback'), screen.indexOf('const [query, setQuery]'));
    expect(choose).toContain('scrollTo({ y: 0, animated: false })');
  });
});
