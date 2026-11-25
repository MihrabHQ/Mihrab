/**
 * Looking a hadith up (`src/hadith/library.ts`, `reference.ts`,
 * `sahihayn.ts`): one of Look up's tiles, the search's filters, a
 * reference typed into the field, and a Learn set's chosen entries.
 *
 *   • A tile is a few HadeethEnc topics under a name of the app's own:
 *     its rows are the first topic's, then the second's, each once, each
 *     saying who reported it.
 *   • The search keeps to a topic, to al-Bukhārī and Muslim, or to the
 *     books — and "al-Bukhārī and Muslim" means the two Ṣaḥīḥs, not
 *     another of al-Bukhārī's books and not a report without its chain.
 *   • "Bukhari 8" is the hadith numbered 8 in the book on the device, and
 *     a way to the book when it is not on the device.
 *   • A set is the entries chosen for it, in the order chosen.
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

import { entryNote, listRows, searchHadith, setRows } from '../src/hadith/library';
import { lookUpReference, NAWAWI_REF, parseReference } from '../src/hadith/reference';
import { reportedInSahihayn } from '../src/hadith/sahihayn';
import { packEntry } from '../src/hadith/origin';
import { findHub, HADITH_HUBS, type HadithSet } from '../src/hadith/catalog';

const entry = (id: string, t: string, c: string[], extra: Record<string, unknown> = {}) => ({
  id,
  t,
  h: `${t}. The hadith's own words about ${t.toLowerCase()}.`,
  x: [],
  c,
  ...extra,
});

beforeAll(() => {
  // HadeethEnc's own ids for these topics: Prayer 134 and Purification 133
  // under Acts of Worship 121 under Jurisprudence 4; Fasting 137 beside them.
  mockPacks['categories/en'] = {
    lang: 'en',
    retrieved: '2026-11-25',
    items: [
      ['4', null, 'Jurisprudence', 5],
      ['121', '4', 'Acts of Worship', 5],
      ['133', '121', 'Purification', 2],
      ['134', '121', 'Prayer', 2],
      ['300', '134', 'Times of Prayer', 1],
      ['137', '121', 'Fasting', 1],
    ],
  };
  mockPacks['henc/all/en'] = {
    pack: 'all',
    lang: 'en',
    source: 'HadeethEnc.com',
    retrieved: '2026-11-25',
    entries: [
      entry('10', 'Wudu before prayer', ['133'], { a: 'Narrated by Abu Daoud', g: 'Good hadith' }),
      entry('11', 'The prayer at its time', ['300'], { a: 'Narrated by Bukhari & Muslim', g: 'Authentic hadith', s: 1 }),
      entry('12', 'Fasting is a shield', ['137'], { a: 'Narrated by Bukhari', g: 'Authentic hadith', s: 1 }),
      entry('13', 'Siwak and prayer', ['133', '134'], { a: 'Narrated by Muslim', s: 1 }),
      entry('14', 'Rows in prayer', ['134']),
    ],
  };
  mockPacks['books/bukhari'] = {
    book: 'bukhari',
    source: 'Open-Hadith-Data',
    license: 'ODbL-1.0',
    retrieved: '2026-11-25',
    hadiths: [
      [1, 'حَدَّثَنَا فُلَانٌ قَالَ قَالَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ prayer'],
      [8, 'حَدَّثَنَا فُلَانٌ قَالَ قَالَ النَّبِيُّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ الْإِيمَانُ بِضْعٌ وَسِتُّونَ شُعْبَةً'],
    ],
  };
});

describe("one of Look up's tiles", () => {
  it('is its first topic, then its second, each hadith once', async () => {
    expect(findHub('prayer')!.topics).toEqual(['134', '133']);
    const rows = await listRows('hub:prayer', 'en');
    // Prayer (134, with what is under it) first, in the pack's order; then
    // Purification's own. "Siwak" is under both and is listed once.
    expect(rows.map(r => r.id)).toEqual(['h:11', 'h:13', 'h:14', 'h:10']);
  });

  it('says who reported each hadith and how it is graded, in HadeethEnc\'s words', async () => {
    const rows = await listRows('hub:prayer', 'en');
    expect(rows.find(r => r.id === 'h:11')!.note).toBe('Narrated by Bukhari & Muslim · Authentic hadith');
    expect(rows.find(r => r.id === 'h:13')!.note).toBe('Narrated by Muslim');
    expect(rows.find(r => r.id === 'h:14')!.note).toBeUndefined();
    // An attribution over several lines is one line of a row.
    expect(entryNote({ a: 'The first narration:\n agreed upon', g: ' Authentic ' })).toBe('The first narration: agreed upon · Authentic');
  });

  it('has an unknown tile as an empty list, not as everything', async () => {
    expect(await listRows('hub:nothing', 'en')).toEqual([]);
  });

  it('marks as rulings the tiles people read for what to do', () => {
    const fiqh = HADITH_HUBS.filter(h => h.fiqh).map(h => h.id);
    expect(fiqh).toEqual(expect.arrayContaining(['prayer', 'fasting', 'charity', 'hajj', 'family', 'food']));
    expect(fiqh).not.toContain('character');
    expect(fiqh).not.toContain('prophet');
  });
});

describe("the search's filters", () => {
  const ids = async (q: string, opts: Parameters<typeof searchHadith>[2]) => (await searchHadith(q, 'en', opts)).map(h => h.id);

  it('finds everything without one, the books included', async () => {
    expect(await ids('prayer', {})).toEqual(['h:10', 'h:11', 'h:13', 'h:14', 'b:bukhari:0']);
  });

  it('keeps to a topic and what is under it, and leaves the books out', async () => {
    expect(await ids('prayer', { topics: ['134'] })).toEqual(['h:11', 'h:13', 'h:14']);
    expect(await ids('prayer', { topics: ['133'] })).toEqual(['h:10', 'h:13']);
    expect(await ids('fasting', { topics: ['134', '133'] })).toEqual([]);
  });

  it('keeps to what al-Bukhari or Muslim reported', async () => {
    expect(await ids('prayer', { sahihayn: true })).toEqual(['h:11', 'h:13']);
    expect(await ids('prayer', { sahihayn: true, topics: ['133'] })).toEqual(['h:13']);
  });

  it('keeps to the books', async () => {
    expect(await ids('prayer', { booksOnly: true })).toEqual(['b:bukhari:0']);
  });

  it('carries the note to a result', async () => {
    const hits = await searchHadith('shield', 'en');
    expect(hits[0].note).toBe('Narrated by Bukhari · Authentic hadith');
  });
});

describe('"al-Bukhari or Muslim"', () => {
  it('is an attribution that opens with one of the two Sahihs', () => {
    for (const a of ['متفق عليه', 'رواه البخاري', 'رواه مسلم', 'رواه البخاري ومسلم', 'متفق عليه، واللفظ للبخاري', 'رواه مسلم وأحمد', 'رَوَاهُ مُسْلِمٌ']) {
      expect([a, reportedInSahihayn(a)]).toEqual([a, true]);
    }
  });

  it('is a list of narrations when every one of them is', () => {
    expect(reportedInSahihayn('الرواية الأولى: متفق عليها.\nالرواية الثانية: رواها مسلم')).toBe(true);
    expect(reportedInSahihayn('حديث أنس رواه مسلم.\nحديث جابر رواه مسلم')).toBe(true);
    expect(reportedInSahihayn('حديث جابر -رضي الله عنه- رواه البخاري.\nحديث ابن عمر -رضي الله عنهما- رواه أبو داود')).toBe(false);
  });

  it("is not another of al-Bukhari's books, Muslim's introduction, or a report without its chain", () => {
    for (const a of [
      'رواه البخاري في الأدب المفرد وأحمد والبيهقي',
      'رواه البخاري في خلق أفعال العباد والطبراني',
      'رواه مسلم في مقدمته',
      'رواه البخاري معلقًا ومسلم',
      'رواه ابن ماجه وأحمد، ورواه البخاري تعليقاً',
      'رواه أحمد، وأصله في صحيح مسلم',
      'رواه أبو داود',
      'رواه الترمذي وابن ماجه',
      '',
      undefined,
    ]) {
      expect([a, reportedInSahihayn(a)]).toEqual([a, false]);
    }
  });

  it('is read off the Arabic attribution when a pack is rebuilt from HadeethEnc', () => {
    const d = { id: 7, title: 't', hadeeth: 'h', attribution: 'Narrated by Muslim', attribution_ar: 'رواه مسلم', categories: [3] };
    expect(packEntry('en', d).s).toBe(1);
    expect(packEntry('ar', { ...d, attribution: 'رواه أبو داود' }).s).toBeUndefined();
    expect(packEntry('en', { ...d, attribution_ar: 'رواه البخاري في الأدب المفرد' }).s).toBeUndefined();
  });

  it('is one rule in the app and in the script that builds the packs', () => {
    const rule = (file: string) => {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      const body = src.slice(src.indexOf('// sahihayn-rule:start'), src.indexOf('// sahihayn-rule:end'));
      expect(body.length).toBeGreaterThan(200);
      // The same lines, but for the types and `export` a TypeScript file writes.
      return body
        .replace(/export /g, '')
        .replace(/: string \| null \| undefined\): boolean/, ')')
        .replace(/\s+/g, ' ');
    };
    expect(rule('src/hadith/sahihayn.ts')).toBe(rule('scripts/hadith/build-packs.js'));
  });
});

describe('a reference typed into the search field', () => {
  it('is a collection and one number, in either order, however they are written', () => {
    expect(parseReference('Bukhari 2345')).toEqual({ book: 'bukhari', n: 2345 });
    expect(parseReference('sahih al-bukhari no. 8')).toEqual({ book: 'bukhari', n: 8 });
    expect(parseReference('8 bukhari')).toEqual({ book: 'bukhari', n: 8 });
    expect(parseReference('Muslim #1599')).toEqual({ book: 'muslim', n: 1599 });
    expect(parseReference('abu dawud 4031')).toEqual({ book: 'abudawud', n: 4031 });
    expect(parseReference("Nasa'i 12")).toEqual({ book: 'nasai', n: 12 });
    expect(parseReference('Ibn Mājah 224')).toEqual({ book: 'ibnmajah', n: 224 });
    expect(parseReference('muwatta 11')).toEqual({ book: 'malik', n: 11 });
    expect(parseReference('musnad ahmad 3')).toEqual({ book: 'ahmad', n: 3 });
    expect(parseReference('Nawawi 14')).toEqual({ book: NAWAWI_REF, n: 14 });
  });

  it('is read in Arabic, with Arabic digits', () => {
    expect(parseReference('البخاري ٨')).toEqual({ book: 'bukhari', n: 8 });
    expect(parseReference('صحيح مسلم رقم ١٥٩٩')).toEqual({ book: 'muslim', n: 1599 });
    expect(parseReference('أبو داود 5')).toEqual({ book: 'abudawud', n: 5 });
    expect(parseReference('النووي ۱۴')).toEqual({ book: NAWAWI_REF, n: 14 });
  });

  it("is read by the name the app gives the collection in the reader's language", () => {
    const names = { tirmidhi: 'Tirmizî Câmii', [NAWAWI_REF]: "an-Nawawi's Forty" };
    expect(parseReference('tirmizi camii 40', names)).toEqual({ book: 'tirmidhi', n: 40 });
    expect(parseReference("an-nawawi's forty 5", names)).toEqual({ book: NAWAWI_REF, n: 5 });
  });

  it('is not a search for words that happens to hold a number or a name', () => {
    expect(parseReference('prayer 5 times')).toBeNull();
    expect(parseReference('bukhari')).toBeNull();
    expect(parseReference('2345')).toBeNull();
    expect(parseReference('bukhari 12 13')).toBeNull();
    expect(parseReference('a muslim gives 2 dirhams')).toBeNull();
    expect(parseReference('bukhari 0')).toBeNull();
  });

  it('finds the hadith under that number in the book on the device', async () => {
    const a = await lookUpReference({ book: 'bukhari', n: 8 }, 'en');
    expect(a.missing).toBe(false);
    expect(a.rows.map(r => [r.id, r.number, r.book])).toEqual([['b:bukhari:1', 8, 'bukhari']]);
    // Opened in its book, so the reader has the hadith before and after.
    expect(a.list).toBe('book:bukhari');
  });

  it('finds nothing under a number the edition does not hold, and says so rather than guess', async () => {
    const a = await lookUpReference({ book: 'bukhari', n: 2345 }, 'en');
    expect(a).toMatchObject({ rows: [], missing: false });
  });

  it('points to a book that is not on the device', async () => {
    const a = await lookUpReference({ book: 'muslim', n: 1599 }, 'en');
    expect(a).toMatchObject({ rows: [], missing: true, list: 'book:muslim' });
  });

  it("knows an-Nawawi's Forty by his numbers, and that there are forty-two", async () => {
    expect((await lookUpReference({ book: NAWAWI_REF, n: 43 }, 'en')).rows).toEqual([]);
    // The Forty are not in this test's packs: asked for, not invented.
    const a = await lookUpReference({ book: NAWAWI_REF, n: 1 }, 'en');
    expect(a).toMatchObject({ rows: [], missing: true, list: 'set:nawawi40' });
  });
});

describe('a Learn set', () => {
  it('is the entries chosen for it, in the order chosen', async () => {
    const set: HadithSet = { id: 'x', level: 'starting', ids: ['14', '10', '12'] };
    expect((await setRows(set, 'en')).map(r => r.id)).toEqual(['h:14', 'h:10', 'h:12']);
  });

  it('is shorter by an entry HadeethEnc no longer holds, and is not broken by it', async () => {
    const set: HadithSet = { id: 'x', level: 'starting', ids: ['14', '999', '12'] };
    expect((await setRows(set, 'en')).map(r => r.id)).toEqual(['h:14', 'h:12']);
  });

  it('is read through: its rows are titles, without the reference line', async () => {
    const set: HadithSet = { id: 'x', level: 'starting', ids: ['11'] };
    expect((await setRows(set, 'en'))[0].note).toBeUndefined();
  });
});
