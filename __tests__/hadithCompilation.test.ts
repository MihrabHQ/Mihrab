/**
 * A compilation — Riyāḍ aṣ-Ṣāliḥīn — as an index into the hadith the app
 * already serves (docs/hadith-policy.md §1, the maintainer's clause of
 * 2026-11-26; `scripts/hadith/build-compilation.js`).
 *
 *   • The attribution is the COMPILER'S, and read strictly: his first
 *     "متفق عليه" or "رواه …", and in the second only the names before
 *     the sentence turns to something else. "رواه أبو داود بإسناد صحيح
 *     على شرط البخاري ومسلم" was once read as al-Bukhārī's and Muslim's
 *     (the first trial of this, 2026-11-26).
 *   • A hadith is paired with a row that holds its words in order AND
 *     close together: seven words are found in their order somewhere in
 *     a page-long row by chance.
 *   • The index holds numbers and nothing of the compilation's text.
 *   • In the app a row is the HadeethEnc entry where there is one here,
 *     the book's own row otherwise, under the compiler's number.
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
import RIYAD from '../src/hadith/compilations/riyad.json';
import WITHHELD from '../src/hadith/withheld.json';
import { COMPILATIONS, compilationBooks, compilationNeeds, findCompilation, parseList } from '../src/hadith/catalog';
import { compilationRows, listRows } from '../src/hadith/library';
import { packsForList } from '../src/hadith/useHadith';

const builder = require('../scripts/hadith/build-compilation.js') as {
  attribution: (body: string) => string[];
  attributionAround: (body: string) => string[];
  saysWeak: (body: string) => boolean;
  report: (body: string) => string;
  inOrder: (a: string[], b: string[]) => number;
  inOrderNear: (a: string[], b: string[]) => number;
  words: (s: string) => string[];
  PAIR_AT: number;
};

const REPO = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

describe('the compiler’s attribution', () => {
  const { attribution } = builder;

  it('is al-Bukhārī and Muslim for "agreed upon", however it is vowelled', () => {
    expect(attribution('… كان يتنفس في الشراب ثلاثاً. مُتَّفَقٌ عَلَيهِ.')).toEqual(['bukhari', 'muslim']);
    expect(attribution('… فهجرته إلى ما هاجر إليه ((متفق على صحته , رواه إماما المحدثين))')).toEqual(['bukhari', 'muslim']);
  });

  it('is the book he names', () => {
    expect(attribution('… الحديث. رَوَاهُ مُسلِمٌ.')).toEqual(['muslim']);
    expect(attribution('… الحديث. رَوَاهُ البُخَارِيُّ.')).toEqual(['bukhari']);
    expect(attribution('… الحديث. رواه البخاري ومسلم.')).toEqual(['bukhari', 'muslim']);
    expect(attribution('… الحديث. رواه مسلم. وفي رواية للبخاري: كذا')).toEqual(['muslim']);
  });

  it('is the Sunan he names, and not the Ṣaḥīḥs a later clause mentions', () => {
    expect(attribution('… الحديث. رَوَاهُ التِّرمِذِيُّ وَقَالَ حَدِيثٌ حَسَنٌ.')).toEqual(['tirmidhi']);
    expect(attribution('… الحديث. رواه أبو داود بإسناد صحيح على شرط البخاري ومسلم.')).toEqual(['abudawud']);
    expect(attribution('… الحديث. رواه أبو داود والترمذي والحاكم وقال: حديث صحيح على شرط البخاري ومسلم.')).toEqual([
      'abudawud',
      'tirmidhi',
    ]);
    expect(attribution('… الحديث. رواه أبو داود. وفي رواية لمسلم: كذا')).toEqual(['abudawud']);
    expect(attribution('… الحديث. رواه الترمذي، وقال: حديث حسن. وأصله في مسلم')).toEqual(['tirmidhi']);
    expect(attribution('… الحديث. رواه النسائي وابن ماجه.')).toEqual(['nasai', 'ibnmajah']);
    expect(attribution('… الحديث. رواه مالك في الموطأ.')).toEqual(['malik']);
  });

  it('is none, where he names no book the app serves, or none at all', () => {
    for (const body of ['… الحديث. رواه أحمد والحاكم والبيهقي.', '… الحديث. رواه الطبراني بإسناد جيد.', '… الحديث بلا عزو', '']) {
      expect(attribution(body)).toEqual([]);
    }
  });

  it('hears him say a hadith is weak — in the attribution’s own sentence, and nowhere after it', () => {
    const { saysWeak } = builder;
    expect(saysWeak('… الحديث. رواه أبو داود بإسناد ضعيف.')).toBe(true);
    expect(saysWeak('… رواه أبو داود بإسناد حسن إلا قيس بن بشر فاختلفوا في توثيقه وتضعيفه.')).toBe(true);
    expect(saysWeak('… رَوَاهُ التِّرمِذِيُّ وَقَالَ حَدِيثٌ حَسَنٌ.')).toBe(false);
    // His explanation of the hadith's words, after it: not a verdict.
    expect(saysWeak('… مُتَّفَقٌ عَلَيهِ. وتقدم شرحه في باب ضعفة المسلمين')).toBe(false);
    expect(saysWeak('… رَوَاهُ الْبُخَارِيُّ.\n\n(القائم في حدود اللَّه) معناه: المنكر لها. وفيه ضعيف')).toBe(false);
  });

  it('is neither, where it is not the Ṣaḥīḥ’s own report', () => {
    expect(attribution('… الحديث. رواه البخاري في الأدب المفرد.')).toEqual([]);
    expect(attribution('… الحديث. رواه مسلم في مقدمته.')).toEqual([]);
    expect(attribution('… الحديث. رواه البخاري تعليقا.')).toEqual([]);
  });

  it('cuts the report where the attribution begins', () => {
    expect(builder.report('إنما الأعمال بالنيات. متفق عليه. قوله كذا')).not.toMatch(/متفق|قوله/);
  });
});

describe('finding the row', () => {
  const { inOrder, inOrderNear, words } = builder;
  const hadith = words('كان إذا قدم من سفر بدأ بالمسجد فركع فيه ركعتين');

  it('counts a hadith’s words found in their order', () => {
    expect(inOrder(hadith, words('حدثنا فلان عن فلان قال كان إذا قدم من سفر بدأ بالمسجد فركع فيه ركعتين'))).toBe(1);
    expect(inOrder(hadith, words('ركعتين فيه فركع بالمسجد بدأ سفر قدم'))).toBeLessThan(0.3);
  });

  it('does not take words scattered through a long row for the hadith', () => {
    const filler = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
    // Each of its words is there, in order — a hundred words apart.
    const scattered = words(hadith.map((w, i) => `${w} ${filler(100, `ك${i}ف`)}`).join(' '));
    expect(inOrder(hadith, scattered)).toBe(1);
    expect(inOrderNear(hadith, scattered)).toBeLessThan(builder.PAIR_AT);
    // The same words together, inside a row as long.
    const together = words(`${filler(400, 'ا')} ${hadith.join(' ')} ${filler(400, 'ب')}`);
    expect(inOrderNear(hadith, together)).toBe(1);
  });

  it('sets aside the blessings and the small words, which are in every hadith', () => {
    expect(words('عن أنس رَضِيَ اللَّهُ عَنهُ أن رَسُول اللَّهِ صلى الله عليه وسلم كان يتنفس')).toEqual(['انس', 'يتنفس']);
  });
});

describe('the index', () => {
  type Row = [number, string, number, string | null];
  const rows = RIYAD.rows as Row[];

  it('is written by the script, and holds numbers — none of the compilation’s words', () => {
    expect(RIYAD.note).toContain('scripts/hadith/build-compilation.js');
    for (const [n, b, i, h] of rows) {
      expect(Number.isInteger(n) && n > 0 && n <= RIYAD.of).toBe(true);
      expect(['b', 'm', 'd', 't', 'n', 'j', 'k', 'h']).toContain(b);
      // With no book it is the HadeethEnc entry alone, and there is one.
      if (b === 'h') expect(h).not.toBeNull();
      expect(Number.isInteger(i) && i >= 0).toBe(true);
      expect(h === null || /^\d+$/.test(h)).toBe(true);
    }
  });

  it('is in the compiler’s order, each of his numbers once', () => {
    const ns = rows.map(r => r[0]);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
    expect(new Set(ns).size).toBe(ns.length);
  });

  it('accounts for every hadith of the book: served, or left out and why', () => {
    const left = Object.values(RIYAD.left).reduce((a, b) => a + b, 0);
    expect(rows.length + left).toBe(RIYAD.of);
    expect(rows.length).toBeGreaterThan(1000);
    expect(Object.keys(RIYAD.left).sort()).toEqual(['elsewhere', 'noText', 'notFound', 'saidWeak', 'tooShort']);
  });

  it('links no HadeethEnc entry the packs withhold', () => {
    for (const [, , , h] of rows) if (h) expect(WITHHELD.henc).not.toContain(h);
  });
});

describe('every compilation’s index', () => {
  type Raw = { id: string; of: number; note: string; numbered?: boolean; left: Record<string, number>; rows: Array<[number, string, number, string | null]> };
  const all = ['riyad', 'umdah', 'kalim'].map(id => JSON.parse(read(`src/hadith/compilations/${id}.json`)) as Raw);

  it('is written by the script, in the compiler’s order, and accounts for every hadith of the book', () => {
    for (const c of all) {
      expect([c.id, c.note.includes('scripts/hadith/build-compilation.js')]).toEqual([c.id, true]);
      const ns = c.rows.map(r => r[0]);
      expect(ns).toEqual([...ns].sort((a, b) => a - b));
      expect(new Set(ns).size).toBe(ns.length);
      expect([c.id, c.rows.length + Object.values(c.left).reduce((a, b) => a + b, 0)]).toEqual([c.id, c.of]);
      for (const [, b, i, h] of c.rows) {
        expect(['b', 'm', 'd', 't', 'n', 'j', 'k', 'h']).toContain(b);
        expect(Number.isInteger(i) && i >= 0).toBe(true);
        if (h) expect(WITHHELD.henc).not.toContain(h);
        if (b === 'h') expect(h).not.toBeNull();
      }
    }
  });

  it('ʿUmdat al-Aḥkām is from the two Ṣaḥīḥs alone — its compiler’s own condition', () => {
    const umdah = all.find(c => c.id === 'umdah')!;
    expect(umdah.of).toBe(414);
    expect(umdah.rows.length).toBeGreaterThan(300);
    for (const [, b] of umdah.rows) expect(['b', 'm', 'h']).toContain(b);
    expect(read('scripts/hadith/build-compilation.js')).toContain("attribution: () => ['bukhari', 'muslim'],");
  });

  it('al-Kalim aṭ-Ṭayyib has no numbers of its compiler’s, and shows none', async () => {
    expect(all.find(c => c.id === 'kalim')!.numbered).toBe(false);
    const kalim = findCompilation('kalim')!;
    expect(kalim.numbered).toBe(false);
    expect(findCompilation('riyad')!.numbered).toBe(true);
    for (const r of await compilationRows(kalim, 'en')) expect(r.number).toBeUndefined();
  });

  it('reads Ibn Taymiyyah’s attributions — after the hadith or before it — and only of his book', () => {
    const { attributionAround, attribution } = builder;
    expect(attributionAround('وقال أبو هريرة: [قال النبي: سبق المفردون] خرجه مسلم')).toEqual(['muslim']);
    expect(attributionAround('وعن أبي موسى قال: [مثل الذي يذكر ربه] أخرجه البخاري')).toEqual(['bukhari']);
    expect(attributionAround('في الصحيحين عن أبي هريرة [أن رسول الله قال: من قال لا إله إلا الله]')).toEqual(['bukhari', 'muslim']);
    expect(attributionAround('وقال أنس: [لا يرد الدعاء بين الأذان والإقامة] قال الترمذي: حديث حسن صحيح')).toEqual(['tirmidhi']);
    expect(attributionAround('[اللهم باعد بيني وبين خطاياي] متفق عليه')).toEqual(['bukhari', 'muslim']);
    expect(attributionAround('وذكر فلان [كلاما طويلا في الذكر] خرجه الحاكم')).toEqual([]);
    // In a hadith's own words "فأخرجه" is a man taking something out: not an attribution (Riyāḍ 518).
    expect(attribution('بعثنا رسول الله فأخرجه لنا ثم أكلنا. رواه مسلم.')).toEqual(['muslim']);
  });
});

describe('in the app', () => {
  const riyad = findCompilation('riyad')!;
  const withHenc = riyad.rows.find(r => r.henc)!;
  const fromBukhari = riyad.rows.find(r => !r.henc && r.book === 'bukhari')!;
  const fromMuslim = riyad.rows.find(r => !r.henc && r.book === 'muslim')!;

  beforeAll(() => {
    mockPacks['henc/all/en'] = {
      pack: 'all',
      lang: 'en',
      source: 'HadeethEnc.com',
      retrieved: '2026-11-25',
      entries: [{ id: withHenc.henc, t: 'In translation', h: 'The hadith.', c: ['1'], s: 1, q: 1 }],
    };
    const book = (id: string, index: number) => ({
      book: id,
      source: 'Open-Hadith-Data',
      license: 'ODbL-1.0',
      retrieved: '2026-11-25',
      // Its place in the source's file is its own index: the pack holds one row here.
      hadiths: [[7, 'حدثنا فلان عن النبي صلى الله عليه وسلم قال كلمة من الحديث هنا تكفي', index, []]],
    });
    mockPacks['books/bukhari'] = book('bukhari', fromBukhari.index);
    mockPacks['books/muslim'] = book('muslim', fromMuslim.index);
  });

  it('is a list of its own, read from HadeethEnc and the books it names', () => {
    expect(COMPILATIONS.map(c => c.id)).toEqual(['riyad', 'umdah', 'kalim']);
    expect(parseList('comp:riyad')).toEqual({ kind: 'comp', id: 'riyad' });
    expect(parseList('comp:nothing')).toBeNull();
    expect(compilationBooks(riyad)).toEqual(expect.arrayContaining(['bukhari', 'muslim', 'abudawud', 'tirmidhi']));
    // Opened with the two Ṣaḥīḥs; the Sunan are not asked for.
    expect(compilationNeeds(riyad).sort()).toEqual(['bukhari', 'muslim']);
    expect(packsForList('comp:riyad', 'en')).toEqual(['categories/en', 'henc/all/en', 'books/bukhari', 'books/muslim']);
  });

  it('shows the HadeethEnc entry where there is one, the book’s row otherwise, under his number', async () => {
    const rows = await compilationRows(riyad, 'en');
    expect(await listRows('comp:riyad', 'en')).toEqual(rows);
    const byId = new Map(rows.map(r => [r.id, r]));
    expect(byId.get(`h:${withHenc.henc}`)).toEqual({ id: `h:${withHenc.henc}`, title: 'In translation', number: withHenc.n });
    expect(byId.get(`b:bukhari:${fromBukhari.index}`)?.number).toBe(fromBukhari.n);
    expect(byId.get(`b:muslim:${fromMuslim.index}`)?.number).toBe(fromMuslim.n);
    // A hadith from a Sunan is not shown while that book is not on the device…
    const fromSunan = riyad.rows.find(r => !r.henc && r.book === 'tirmidhi')!;
    expect(byId.has(`b:tirmidhi:${fromSunan.index}`)).toBe(false);
    // …and a hadith told only by its HadeethEnc entry has no book to wait for.
    expect(riyad.rows.some(r => r.book === '' && r.henc)).toBe(true);
    // A row whose hadith is in no pack here is left out, not shown empty.
    expect(rows.length).toBeLessThan(riyad.rows.length);
    expect(rows.map(r => r.number)).toEqual([...rows.map(r => r.number)].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('is named by its own title in the reader, with the place in it — not the book’s number', () => {
    const reader = read('src/screens/hadith/HadithReaderScreen.tsx');
    expect(reader).toContain("const inCompilation = parseList(list)?.kind === 'comp';");
    expect(reader).toContain("item?.number != null && item.source !== 'hadeethenc' && !inCompilation");
    expect(reader).toContain("(item.source !== 'book' || inCompilation) && at >= 0 && ids.length > 1");
  });

  it('says on its list how many of the book it holds, and is not offered in a browser', () => {
    const list = read('src/screens/hadith/HadithListScreen.tsx');
    expect(list).toMatch(/t\('hadith\.comp\.note', \{[\s\S]{0,200}held: rows\.length,\s+of: comp\.of,/);
    expect(read('src/hadith/catalog.ts')).toContain('export const COMPILATIONS: readonly Compilation[] = IS_WEB_APP ? [] : ALL_COMPILATIONS;');
  });

  it('is under the policy’s clause for compilations', () => {
    const policy = read('docs/hadith-policy.md');
    expect(policy).toContain('A hadith in a compilation is served when its compiler attributes it');
    expect(policy).toContain('scripts/hadith/build-compilation.js');
  });
});
