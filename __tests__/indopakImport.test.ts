/**
 * The IndoPak importer, on three real pages of the file.
 *
 * The parser is tested on the file's own shape (a trailing comma, single
 * quotes, no escapes); the conversion on the two things the print does
 * that nothing else does — al-Fātiḥah's unnumbered basmalah and its
 * printed 6 and 7 inside Ḥafṣ 1:7, and a medallion that carries a stop
 * sign — and the fold on the four spellings the shared check cannot read.
 * The whole file is `tools/indopak/check.test.ts`'s job.
 */
import { INDOPAK_FIXTURE } from './fixtures/indopakPages';
import {
  convertIndopak,
  foldIndopakSpelling,
  parseIndopakFile,
  printedNumber,
} from '../src/quran/indopakImport';
import { exactPageFor } from '../src/quran/mushafPrintedLines';
import { MUSHAF_PAGES } from '../src/quran/pages';
import { skeleton } from '../src/quran/juzCheck';

const END = '۝';

describe('parseIndopakFile', () => {
  it('reads the file in its own shape', () => {
    const pages = parseIndopakFile(INDOPAK_FIXTURE);
    expect(pages.map(p => p.length)).toEqual([8, 8, 10]);
    expect(pages[0][0]).toBe('سُورَةُ الفَاتِحَةِ');
  });

  it.each([
    ['a template literal', "let quranText = [\n[`x`],\n];\nexport { quranText };"],
    ['an expression', "let quranText = [\n[1 + 1],\n];\nexport { quranText };"],
    ['an identifier', "let quranText = [\n[foo],\n];\nexport { quranText };"],
    ['a call', "let quranText = [\n['a'].map(f),\n];\nexport { quranText };"],
    ['an unclosed page', "let quranText = [\n['a',\n];\nexport { quranText };"],
    ['a nested bracket', "let quranText = [\n[['a']],\n];\nexport { quranText };"],
    ['a different export', "let quranText = [\n['a'],\n];\nexport default quranText;"],
    ['a double-quoted string', 'let quranText = [\n["a"],\n];\nexport { quranText };'],
  ])('refuses %s', (_what, source) => {
    expect(() => parseIndopakFile(source)).toThrow();
  });
});

describe('convertIndopak', () => {
  const pages = parseIndopakFile(INDOPAK_FIXTURE);
  const { verses, lines, counts } = convertIndopak(pages, MUSHAF_PAGES);
  const text = new Map(verses.map(v => [v.verse_key, v.text]));

  it('counts what the three pages hold', () => {
    expect(counts).toEqual({ pages: 3, headers: 4, basmalahs: 3, ayahs: 7 + 4 + 5 + 6 });
  });

  // The fixture's strings are compared against the fixture itself rather
  // than retyped: a basmalah carries stacked marks whose order an editor
  // may normalise, and a test that failed on mark order would be a lie.
  const basmalah = pages[0][1].slice(0, -2);

  it('maps al-Fātiḥah to the Ḥafṣ keys', () => {
    expect(text.get('1:1')).toBe(basmalah);
    expect(text.get('1:2')).toBe(pages[0][2].split(' ').slice(0, 4).join(' '));
    expect(text.get('1:6')).toBe(pages[0][5].split(' ').slice(0, 3).join(' '));
    // Printed 6 and 7 together, with no medallion text in the ayah.
    expect(text.get('1:7')?.split(' ')).toHaveLength(9);
    expect(text.get('1:7')).not.toContain(END);
    expect(text.get('1:7')).not.toContain('‮');
    expect(verses.find(v => v.verse_key === '1:7')?.number_in_hafs).toEqual([7]);
  });

  it('keeps every verse on one page, with its juz from the Ḥafṣ table', () => {
    // Headers are counted, not read, so the fixture's last page reads as
    // surahs 3 and 4 — which is also why the whole file must be checked.
    for (const v of verses) {
      expect(typeof v.page_number).toBe('number');
      const surah = Number(v.verse_key!.split(':')[0]);
      expect(v.juz_number).toBe({ 1: 1, 2: 1, 3: 3, 4: 4 }[surah]);
    }
    expect(verses.find(v => v.verse_key === '2:1')?.page_number).toBe(2);
    expect(verses.find(v => v.verse_key === '4:6')?.page_number).toBe(3);
  });

  it('lays page 1 out line by line, medallions as printed', () => {
    const page = lines.pages[0];
    expect(page[0]).toEqual(['h', 1]);
    // The basmalah IS 1:1, and its medallion has no number.
    expect(page[1]).toEqual([[1, 1, 4, 1, END]]);
    expect(page[2]).toEqual([
      [1, 2, 4, 1, `${END}١ۙ`],
      [1, 3, 1, 0],
    ]);
    // Printed 6, the bidi-override case, sits inside Ḥafṣ 1:7 — and is the
    // digit with the DISPUTED end sign after it, as the font composes it,
    // not a medallion.
    expect(page[6]).toEqual([
      [1, 7, 3, 1, '٦\u08E2ۙ'],
      [1, 7, 1, 0],
    ]);
    expect(page[7]).toEqual([[1, 7, 4, 1, `${END}٧ࣖ`]]);
    expect(printedNumber([1, 7, 3, 1, '٦\u08E2ۙ'])).toBe(6);
    expect(printedNumber([1, 1, 4, 1, END])).toBeNull();
    expect(printedNumber([2, 3, 2, 1])).toBe(3);
  });

  it('keeps a basmalah line as the print sets it, and a header where it falls', () => {
    const last = lines.pages[2];
    expect(last[0]).toEqual(['h', 3]);
    expect(last[1]).toEqual(['b', basmalah]);
    expect(last[5]).toEqual(['h', 4]);
  });

  it('refuses a number out of sequence', () => {
    const broken = pages.map(p => p.slice());
    broken[0][3] = broken[0][3].replace(`${END}٣`, `${END}٤`);
    expect(() => convertIndopak(broken, MUSHAF_PAGES)).toThrow(/printed where 3 was expected/);
  });

  it('sets a page from the table word for word', () => {
    const rows = exactPageFor(lines, 1, (s, a) => text.get(`${s}:${a}`) ?? null);
    expect(rows).not.toBeNull();
    expect(rows![0]).toMatchObject({ empty: true, band: 1 });
    expect(rows![1].ayahs).toEqual([
      { surah: 1, ayah: 1, text: basmalah, ends: true, mark: END },
    ]);
    // The line's words, without the out-of-order ayah end glued to the third.
    const line7 = pages[0][6].replace(/\u202E[\u0660-\u0669]+\u08E2\S*/, '').split(' ');
    expect(rows![6].ayahs.map(a => a.text)).toEqual([
      line7.slice(0, 3).join(' '),
      line7[line7.length - 1],
    ]);
    expect(rows![6].ayahs[0].ends).toBe(true);
    expect(rows![7].ayahs[0]).toMatchObject({ surah: 1, ayah: 7, ends: true });
    // Al-Fātiḥah ends at the foot of page 1 and the next page opens on a
    // band, so its last row closes the surah like any other.
    expect(rows![7].closes).toBe(true);
    // A page whose next page does NOT open on a band (here the fixture's
    // third page with its band and basmalah cut off) keeps its last row
    // a full line: the surah carries on.
    const carriesOn = { pages: [lines.pages[0], lines.pages[1], lines.pages[2].slice(2), lines.pages[2]] };
    const page2 = exactPageFor(carriesOn, 2, (s, a) => text.get(`${s}:${a}`) ?? null)!;
    expect(page2[page2.length - 1].closes).toBeUndefined();
    const lastRows = exactPageFor(lines, 3, (s, a) => text.get(`${s}:${a}`) ?? null)!;
    expect(lastRows[lastRows.length - 1].closes).toBe(true);
    expect(lastRows[4].closes).toBe(true); // al-Falaq's last line, before an-Nās's band
    expect(lastRows[6]).toMatchObject({ empty: true, basmalah: expect.any(String) });
  });
});

describe('foldIndopakSpelling', () => {
  it.each([
    ['a seated hamza on ya', 'بِاَعْدَآىِٕكُمْ', 'بِاَعْدَآئِكُمْ'],
    ['a seated hamza on waw', 'يُؤْمِنُوْنَ'.replace('ؤ', 'ؤ'), 'يُؤْمِنُوْنَ'],
    ['a hamza above alif', 'اَنْ'.replace('اَ', 'أَ'), 'أَنْ'],
    ['a joiner around the hamza', 'يُو\u034F\u0654\u034Fْمِنُوْنَ', 'يُؤ\u034Fْمِنُوْنَ'],
    ['the name of Allah', 'اللّٰهِ', 'اللّهِ'],
    ['a madd alif', 'اٰمَنُوْا', 'امَنُوْا'],
    ['a dagger alif before a final ya', 'عَلٰي', 'عَلَيٰ'.replace('َيٰ', 'يٰ')],
  ])('folds %s', (_what, given, wanted) => {
    expect(foldIndopakSpelling(given)).toBe(wanted);
  });

  it('brings the fixture ayahs to the Ḥafṣ skeleton', () => {
    expect(skeleton(foldIndopakSpelling('اَلْحَمْدُ لِلّٰهِ رَبِّ الْعٰلَمِيْنَ'))).toBe(
      skeleton('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ'),
    );
    expect(skeleton(foldIndopakSpelling('الَّذِيْنَ يُو͏ٔ͏ْمِنُوْنَ بِالْغَيْبِ'))).toBe(
      skeleton('ٱلَّذِينَ يُؤْمِنُونَ بِٱلْغَيْبِ'),
    );
  });
});
