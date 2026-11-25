/**
 * Only sound hadith are served (`src/hadith/bookGrades.ts`, `grade.ts`,
 * `scripts/hadith/book-grades.js`) — the maintainer's rule of 2026-11-25:
 * nothing weak, nothing the graders disagree on, nothing ungraded.
 *
 * What that has to mean, each held here:
 *
 *   • A hadith of the four Sunan or the Muwaṭṭaʾ is in its pack only when
 *     EVERY grader who ruled on it calls it ṣaḥīḥ or ḥasan.
 *   • A row that cannot be paired with a grade with confidence is left
 *     out. A weak hadith under a sound one's grade is the one mistake the
 *     pairing must not make, so every doubt is settled against the row.
 *   • The app does not take a pack's word for it: a file with a row that
 *     does not pass, or with no grades at all, is not a pack.
 *   • Musnad Aḥmad and Sunan ad-Dārimī are not offered: ungraded.
 *   • A graded book is never rebuilt from its source, which has every
 *     hadith and no grade.
 *   • A HadeethEnc entry its Arabic grade does not call sound is not read,
 *     even out of a pack downloaded before the rule.
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

import {
  ALL_BOOKS,
  bookGradeVerdict,
  GRADED_BOOKS,
  SAHIH_BOOKS,
  soundByAll,
} from '../src/hadith/bookGrades';
import { BOOKS, HADITH_SETS } from '../src/hadith/catalog';
import { servedGrade } from '../src/hadith/grade';
import { bookRows, entryServed, loadItem, searchHadith } from '../src/hadith/library';
import { BOOK_FILES, servedEntry } from '../src/hadith/origin';
import { validPack } from '../src/hadith/packTypes';
import WITHHELD from '../src/hadith/withheld.json';

const script = require('../scripts/hadith/book-grades.js') as {
  GRADED_BOOKS: Record<string, string>;
  bookGradeVerdict: (g: string) => 'weak' | 'sound' | null;
  soundByAll: (g: string[]) => boolean;
  pairRows: (ours: string[], theirs: string[]) => Array<{ at: number; score: number; rival: number | null; also: number[] } | null>;
  gradeBook: (
    hadiths: Array<[number | null, string]>,
    api: Array<{ text: string; grades?: Array<{ name: string; grade: string }> }>,
  ) => { rows: Array<[number | null, string, number, Array<[number, string]>]>; graders: string[]; left: Record<string, number>; of: number };
};

const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

/** A text of `n` words nothing else here has: a hadith of its own. */
const LETTERS = 'بتثجحخدذرزسشصضطظعغفقكلمنهوي';
const N = LETTERS.length;
function words(seed: number, n: number): string[] {
  // Two letters for the text, two for the word's place in it: no word twice, in a text or across them.
  return Array.from({ length: n }, (_, i) => LETTERS[seed % N] + LETTERS[Math.floor(seed / N) % N] + LETTERS[i % N] + LETTERS[Math.floor(i / N) % N]);
}
const text = (seed: number, n = 24) => words(seed, n).join(' ');
const by = (grades: Record<string, string>) => Object.entries(grades).map(([name, grade]) => ({ name, grade }));

describe("a grader's verdict", () => {
  it('is weak, sound or neither, by the words hadith-api writes', () => {
    for (const g of ['Sahih', 'Hasan', 'Hasan Sahih', 'Isnaad Hasan', 'Sahih Isnaad', 'Sahih Lighairihi', 'Hasan Lighairihi', 'Sahih - Agreed Upon', 'Sahih Muslim (537)', 'Mauquf Sahih', 'Maqtu Sahih']) {
      expect([g, bookGradeVerdict(g)]).toEqual([g, 'sound']);
    }
    for (const g of ['Daif', "Da'if", 'Very Daif', 'Daif Isnaad', 'Sanad Daif', 'Munkar', 'Shadh', 'Mawdu', 'Batil', 'Isnaad Malool', 'Mauquf Daif', 'Maqtu Daif']) {
      expect([g, bookGradeVerdict(g)]).toEqual([g, 'weak']);
    }
    for (const g of ['-', '', 'Maqtu', 'Mauquf', null, undefined]) expect([g, bookGradeVerdict(g)]).toEqual([g, null]);
  });

  it('is weak where anything in it is', () => {
    expect(bookGradeVerdict('Shadh, Sahih')).toBe('weak');
    expect(bookGradeVerdict('Mursal Sahih Isnaad')).toBe('weak');
    expect(bookGradeVerdict('Munkar Daif')).toBe('weak');
  });

  it('is one rule in the app and in the script that builds the packs', () => {
    const rule = (file: string) => {
      const src = read(file);
      const body = src.slice(src.indexOf('// book-grade-rule:start'), src.indexOf('// book-grade-rule:end'));
      expect(body.length).toBeGreaterThan(400);
      // The same lines, but for the types and `export` a TypeScript file writes.
      return body
        .replace(/export /g, '')
        .replace(/: string \| null \| undefined\): 'weak' \| 'sound' \| null/, ')')
        .replace(/: ReadonlyArray<string \| null \| undefined>\): boolean/, ')')
        .replace(/\s+/g, ' ');
    };
    expect(rule('src/hadith/bookGrades.ts')).toBe(rule('scripts/hadith/book-grades.js'));
  });
});

describe('sound by every grader who ruled', () => {
  it('needs each of them to say so, and at least one to have ruled', () => {
    expect(soundByAll(['Sahih', 'Hasan', 'Isnaad Hasan'])).toBe(true);
    expect(soundByAll(['Sahih'])).toBe(true);
    // One of four calls it weak: it is disputed, and not served.
    expect(soundByAll(['Sahih', 'Sahih', 'Hasan', 'Daif'])).toBe(false);
    expect(soundByAll(['Daif'])).toBe(false);
    // Nobody ruled: ungraded, and not served.
    expect(soundByAll([])).toBe(false);
    expect(soundByAll(['-', 'Maqtu'])).toBe(false);
    // A grader who said nothing either way does not stand in the way of the ones who did.
    expect(soundByAll(['-', 'Sahih'])).toBe(true);
  });

  it('is the same answer from the script', () => {
    for (const grades of [['Sahih', 'Hasan'], ['Sahih', 'Daif'], [], ['-'], ['Hasan Sahih']]) {
      expect(script.soundByAll(grades)).toBe(soundByAll(grades));
    }
  });
});

describe('which rows of a book are kept', () => {
  const api = [
    /* 0 */ { text: text(1), grades: by({ 'Al-Albani': 'Sahih', 'Zubair Ali Zai': 'Isnaad Hasan' }) },
    /* 1 */ { text: text(2), grades: by({ 'Al-Albani': 'Sahih', 'Zubair Ali Zai': 'Daif' }) },
    /* 2 */ { text: text(3), grades: by({ 'Al-Albani': 'Daif', 'Zubair Ali Zai': 'Daif' }) },
    /* 3 */ { text: text(4), grades: by({ 'Al-Albani': '-' }) },
    /* 4 */ { text: text(5, 40), grades: by({ 'Al-Albani': 'Hasan' }) },
    /* 5 */ { text: text(6), grades: by({ 'Al-Albani': 'Daif' }) },
    /* 6 */ { text: text(7), grades: by({ 'Al-Albani': 'Sahih' }) },
    /* 7 */ { text: text(8), grades: [] },
  ];
  const ours: Array<[number | null, string]> = [
    /* 0 */ [1, text(1)],
    /* 1 */ [2, text(2)],
    /* 2 */ [3, text(3)],
    /* 3 */ [4, text(4)],
    /* 4 */ [5, text(99)], // in our edition only
    /* 5 */ [6, `${text(5, 40)} ${text(6)}`], // a sound hadith and the weak one after it, as one row
    /* 6 */ [7, `${text(7)} ${words(50, 4).join(' ')}`], // a sound hadith and the compiler's remark
    /* 7 */ [8, text(8)],
  ];
  const graded = script.gradeBook(ours, api);

  it('keeps a row every grader calls sound, with their verdicts and its place in the source', () => {
    expect(graded.rows.map(r => r[2])).toEqual([0, 6]);
    expect(graded.graders).toEqual(['Al-Albani', 'Zubair Ali Zai']);
    expect(graded.rows[0]).toEqual([1, text(1), 0, [[0, 'Sahih'], [1, 'Isnaad Hasan']]]);
    // The remark after the hadith is ours to keep: the text is Open-Hadith-Data's, whole.
    expect(graded.rows[1][1]).toBe(ours[6][1]);
    expect(graded.rows[1][3]).toEqual([[0, 'Sahih']]);
    expect(graded.of).toBe(8);
  });

  it('leaves out the weak, the disputed, the ungraded, the unpaired and a row that holds a weak hadith besides', () => {
    expect(graded.left).toEqual({ weak: 1, disputed: 1, ungraded: 2, unpaired: 1, joined: 1 });
  });

  it('every row it keeps passes the rule the app reads a pack by', () => {
    const file = {
      book: 'abudawud',
      source: 'Open-Hadith-Data',
      license: 'ODbL-1.0',
      retrieved: '2026-11-25',
      hadiths: graded.rows,
      grades: { source: 'fawazahmed0/hadith-api', rule: 'sound-by-all', graders: graded.graders },
    };
    expect(validPack('books/abudawud', file)).toBe(true);
  });

  it('does not pair a row with a text that only resembles it', () => {
    // Half its words are another hadith's: not the same hadith, and no grade.
    const half = [...words(1, 24).slice(0, 12), ...words(77, 12)].join(' ');
    expect(script.pairRows([half], api.map(a => a.text))).toEqual([null]);
  });

  it('asks the next closest row too when two are nearly as close, and keeps the row only if both are sound', () => {
    // One hadith by two chains, the same words but for the first few — and
    // our edition's row is as near the one as the other.
    const matn = words(20, 40);
    const first = [...words(21, 3), ...matn].join(' ');
    const second = [...words(22, 3), ...matn].join(' ');
    const mine: Array<[number | null, string]> = [[1, [...words(23, 3), ...matn].join(' ')]];
    const sound = by({ 'Al-Albani': 'Sahih' });
    const weak = by({ 'Al-Albani': 'Daif' });
    expect(script.gradeBook(mine, [{ text: first, grades: sound }, { text: second, grades: sound }]).rows).toHaveLength(1);
    const doubted = script.gradeBook(mine, [{ text: first, grades: sound }, { text: second, grades: weak }]);
    expect(doubted.rows).toHaveLength(0);
    expect(doubted.left.unpaired).toBe(1);
  });

  it('lets one row of theirs grade one row of ours', () => {
    const t = text(30, 30);
    const twice: Array<[number | null, string]> = [
      [1, t],
      [2, `${t} ${words(31, 3).join(' ')}`],
    ];
    const out = script.gradeBook(twice, [{ text: t, grades: by({ 'Al-Albani': 'Sahih' }) }]);
    expect(out.rows.map(r => r[2])).toEqual([0]);
    expect(out.left.unpaired).toBe(1);
  });
});

describe('a book pack, as the app reads it', () => {
  const MATN = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ';
  const grades = { source: 'fawazahmed0/hadith-api', rule: 'sound-by-all', graders: ['Al-Albani', 'Zubair Ali Zai'] };
  const file = (hadiths: unknown[], more: Record<string, unknown> = { grades }) => ({
    book: 'x',
    source: 'Open-Hadith-Data',
    license: 'ODbL-1.0',
    retrieved: '2026-11-25',
    hadiths,
    ...more,
  });

  it('is a graded book only with every row sound by all', () => {
    expect(validPack('books/tirmidhi', file([[1, MATN, 0, [[0, 'Sahih'], [1, 'Hasan']]]]))).toBe(true);
    // One grader calls it weak.
    expect(validPack('books/tirmidhi', file([[1, MATN, 0, [[0, 'Sahih'], [1, 'Daif']]]]))).toBe(false);
    // One weak row among sound ones refuses the file.
    expect(
      validPack('books/tirmidhi', file([[1, MATN, 0, [[0, 'Sahih']]], [2, MATN, 1, [[0, 'Munkar']]]])),
    ).toBe(false);
    // No grader ruled.
    expect(validPack('books/tirmidhi', file([[1, MATN, 0, []]]))).toBe(false);
    expect(validPack('books/tirmidhi', file([[1, MATN, 0, [[0, '-']]]]))).toBe(false);
    // A grader the file does not name.
    expect(validPack('books/tirmidhi', file([[1, MATN, 0, [[5, 'Sahih']]]]))).toBe(false);
  });

  it('is not a graded book as it was before it carried grades: every hadith, weak ones too', () => {
    for (const book of GRADED_BOOKS) {
      expect([book, validPack(`books/${book}`, file([[1, MATN]], {}))]).toEqual([book, false]);
      expect([book, validPack(`books/${book}`, file([[1, MATN]]))]).toEqual([book, false]);
    }
  });

  it("is al-Bukhari's or Muslim's whole, on the standing of the collection", () => {
    for (const book of SAHIH_BOOKS) expect(validPack(`books/${book}`, file([[1, MATN]], {}))).toBe(true);
  });

  it('is never a book that is not offered, whatever it holds', () => {
    for (const book of ['ahmad', 'darimi', 'somethingelse']) {
      expect(validPack(`books/${book}`, file([[1, MATN]], {}))).toBe(false);
      expect(validPack(`books/${book}`, file([[1, MATN, 0, [[0, 'Sahih']]]]))).toBe(false);
    }
  });
});

describe('the books that are offered', () => {
  it('are the two served whole and the five that are graded: no ungraded book', () => {
    expect([...ALL_BOOKS].sort()).toEqual([...SAHIH_BOOKS, ...GRADED_BOOKS].sort());
    expect(BOOKS).toEqual(ALL_BOOKS);
    expect(ALL_BOOKS).not.toContain('ahmad');
    expect(ALL_BOOKS).not.toContain('darimi');
    for (const set of HADITH_SETS) if (set.book) expect(ALL_BOOKS).toContain(set.book);
  });

  it('are the ones the builder grades and builds', () => {
    expect(Object.keys(script.GRADED_BOOKS).sort()).toEqual([...GRADED_BOOKS].sort());
    const builder = read('scripts/hadith/build-packs.js');
    const built = builder.slice(builder.indexOf('const BOOKS = {'), builder.indexOf('};', builder.indexOf('const BOOKS = {')));
    expect([...built.matchAll(/^\s+(\w+): \{ dir:/gm)].map(m => m[1]).sort()).toEqual([...ALL_BOOKS].sort());
  });

  it('a graded book is never rebuilt from its source, which has every hadith and no grade', () => {
    for (const book of GRADED_BOOKS) expect([book, BOOK_FILES[book]]).toEqual([book, undefined]);
    for (const book of SAHIH_BOOKS) expect(BOOK_FILES[book]).toBeTruthy();
  });
});

describe('a HadeethEnc entry that is served', () => {
  it('is one its Arabic grade calls sound, and nowhere weak', () => {
    for (const g of ['صحيح', 'حسن', 'حسن صحيح', 'صَحِيحٌ', 'إسناده حسن', 'سنده صحيح', 'قال النووي: حديث حسن', 'صحيح موقوفًا على ابن عباس -رضي الله عنهما', 'قال الهيثمي في مجمع الزوائد: رجاله رجال الصحيح']) {
      expect([g, servedGrade(g)]).toEqual([g, true]);
    }
    // "بشواهده" — by its supporting chains — holds the letters of a word for "feeble" and is not one.
    expect(servedGrade('صحيح بشواهده')).toBe(true);
    expect(servedGrade('حسن لشواهده')).toBe(true);
  });

  it('is not one it calls weak, in whole or in part, or does not grade', () => {
    for (const g of ['ضعيف', 'ضعيف جدًّا', 'موضوع', 'منكر', 'لا يصح', 'لا أصل له', 'حديث أبي ذر ضعيف، وحديث معيقيب صحيح', 'صحيح، وضعفه بعضهم', '', null, undefined, 'رواه أحمد']) {
      expect([g, servedGrade(g)]).toEqual([g, false]);
    }
  });

  it('is one rule in the app and in the script that builds the packs', () => {
    const rule = (file: string) => {
      const src = read(file);
      const body = src.slice(src.indexOf('// served-rule:start'), src.indexOf('// served-rule:end'));
      expect(body.length).toBeGreaterThan(300);
      return body
        .replace(/export /g, '')
        .replace(/: string \| null \| undefined\): boolean/, ')')
        .replace(/\s+/g, ' ');
    };
    expect(rule('src/hadith/grade.ts')).toBe(rule('scripts/hadith/build-packs.js'));
  });

  it("the builder's list of what it left out is ids, each once, in order", () => {
    expect(WITHHELD.henc.length).toBeGreaterThan(0);
    expect(WITHHELD.henc.every(id => /^\d+$/.test(id))).toBe(true);
    expect([...new Set(WITHHELD.henc)].sort((a, b) => Number(a) - Number(b))).toEqual(WITHHELD.henc);
    expect(WITHHELD.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is not rebuilt on the device: by the list, and by the Arabic grade the translation carries', () => {
    const one = { id: '7', title: 't', hadeeth: 'h', grade: 'Authentic', grade_ar: 'صحيح' };
    expect(servedEntry('en', one)).toBe(true);
    // The English still reads "Authentic"; the Arabic entry has since been graded weak (`grade.ts`).
    expect(servedEntry('en', { ...one, id: WITHHELD.henc[0] })).toBe(false);
    expect(servedEntry('en', { ...one, grade_ar: 'ضعيف' })).toBe(false);
    expect(servedEntry('en', { ...one, grade_ar: undefined })).toBe(false);
    expect(servedEntry('ar', { ...one, grade: 'صحيح' })).toBe(true);
    expect(servedEntry('ar', { ...one, grade: 'ضعيف' })).toBe(false);
  });
});

describe('what is read from the packs on the device', () => {
  const MALIK = 'و حَدَّثَنِي عَنْ مَالِك عَنْ رَبِيعَةَ بْنِ أَبِي عَبْدِ الرَّحْمَنِ عَنْ الْقَاسِمِ بْنِ مُحَمَّدٍ أَنَّهُ قَالَ مَا أَدْرَكْتُ النَّاسَ إِلَّا وَهُمْ يُصَلُّونَ الظُّهْرَ بِعَشِيٍّ';
  const BUKHARI = 'حَدَّثَنَا الْحُمَيْدِيُّ قَالَ سَمِعْتُ رَسُولَ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ يَقُولُ إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى';
  const entry = (id: string, t: string) => ({ id, t, h: `${t} in full`, g: 'Authentic', c: ['88'], ar: 'نص' });

  beforeEach(() => {
    for (const k of Object.keys(mockPacks)) delete mockPacks[k];
    // A pack downloaded before the rule: it still holds an entry the Arabic now grades weak.
    mockPacks['henc/all/en'] = {
      pack: 'all',
      lang: 'en',
      source: 'HadeethEnc.com',
      retrieved: '2026-11-20',
      entries: [entry('4560', 'Deeds are by intentions'), entry(WITHHELD.henc[0], 'A report since graded weak')],
    };
    mockPacks['books/malik'] = {
      book: 'malik',
      source: 'Open-Hadith-Data',
      license: 'ODbL-1.0',
      retrieved: '2026-11-25',
      hadiths: [[11, MALIK, 27, [[0, 'Mauquf Sahih']]]],
      grades: { source: 'fawazahmed0/hadith-api', rule: 'sound-by-all', graders: ['Salim al-Hilali'] },
      of: 1594,
    };
    mockPacks['books/bukhari'] = {
      book: 'bukhari',
      source: 'Open-Hadith-Data',
      license: 'ODbL-1.0',
      retrieved: '2026-11-25',
      hadiths: [[1, BUKHARI]],
    };
  });

  it('leaves out an entry that is not served, from a pack that still holds it', async () => {
    expect(entryServed({ id: WITHHELD.henc[0], g: 'Authentic' }, 'en')).toBe(false);
    expect(await loadItem(`h:${WITHHELD.henc[0]}`, 'en')).toBeNull();
    expect(await loadItem('h:4560', 'en')).not.toBeNull();
    const hits = await searchHadith('report graded weak', 'en');
    expect(hits).toEqual([]);
    // An Arabic pack says of each entry, in its own grade, whether it is sound.
    expect(entryServed({ id: '1', g: 'ضعيف' }, 'ar')).toBe(false);
    expect(entryServed({ id: '1', g: 'صحيح' }, 'ar')).toBe(true);
  });

  it("names a graded book's hadith by its place in the source, and shows each grader's verdict", async () => {
    expect((await bookRows('malik')).map(r => r.id)).toEqual(['b:malik:27']);
    const item = await loadItem('b:malik:27', 'en');
    expect(item?.arabic).toBe(MALIK);
    expect(item?.verdicts).toEqual([{ grader: 'Salim al-Hilali', grade: 'Mauquf Sahih' }]);
    expect(item?.grade).toBe('Salim al-Hilali: Mauquf Sahih');
    expect(item?.sahihCollection).toBeUndefined();
    // Where the row stands in the pack is not its id.
    expect(await loadItem('b:malik:0', 'en')).toBeNull();
    const found = await searchHadith('الظهر', 'en', { book: 'malik' });
    expect(found.map(h => h.id)).toEqual(['b:malik:27']);
  });

  it("says of al-Bukhari's that it is read on the collection's standing, and gives it no grade of ours", async () => {
    const item = await loadItem('b:bukhari:0', 'en');
    expect(item?.sahihCollection).toBe(true);
    expect(item?.grade).toBeUndefined();
    expect(item?.verdicts).toBeUndefined();
  });
});
