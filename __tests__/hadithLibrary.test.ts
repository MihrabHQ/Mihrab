/**
 * What the Hadith screens read from the packs (`src/hadith/library.ts`):
 * a book's rows, and search.
 *
 *   • A book's row is titled by an excerpt of its own text, from where the
 *     chain of narrators has reached the Prophet ﷺ — titled by their
 *     opening words, the seven thousand rows of al-Bukhārī all began
 *     "حدثنا …" and could not be told apart.
 *   • Search reads the explanation as well as the hadith, puts a hadith
 *     that says a thing before one whose commentary mentions it, and shows
 *     the words around the match as they are written.
 *   • A book's own field searches the whole text of that book only.
 *   • A long search steps aside for the screen and stops when a newer
 *     query replaces it.
 *
 * The Arabic here is from Open-Hadith-Data (Sahih al-Bukhari 1, 8, 9;
 * Muwatta Malik 11), as the packs hold it.
 */
const mockPacks: Record<string, unknown> = {};
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async (key: string) => mockPacks[key] ?? null),
  packStatus: jest.fn((key: string) => (mockPacks[key] ? { state: 'ready', bytes: 1 } : { state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => Object.keys(mockPacks),
}));

import {
  bookRows,
  bookRowTitle,
  foldedTitle,
  foldForSearch,
  latinDigits,
  searchHadith,
  snippetAround,
  warmSearch,
} from '../src/hadith/library';
import { listTitle } from '../src/screens/hadith/HadithListScreen';

const BUKHARI_1 = "حَدَّثَنَا الْحُمَيْدِيُّ عَبْدُ اللَّهِ بْنُ الزُّبَيْرِ قَالَ حَدَّثَنَا سُفْيَانُ قَالَ حَدَّثَنَا يَحْيَى بْنُ سَعِيدٍ الْأَنْصَارِيُّ قَالَ أَخْبَرَنِي مُحَمَّدُ بْنُ إِبْرَاهِيمَ التَّيْمِيُّ أَنَّهُ سَمِعَ عَلْقَمَةَ بْنَ وَقَّاصٍ اللَّيْثِيَّ يَقُولُ سَمِعْتُ عُمَرَ بْنَ الْخَطَّابِ رَضِيَ اللَّهُ عَنْهُ عَلَى الْمِنْبَرِ قَالَ سَمِعْتُ رَسُولَ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ يَقُولُ إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى فَمَنْ كَانَتْ هِجْرَتُهُ إِلَى دُنْيَا يُصِيبُهَا أَوْ إِلَى امْرَأَةٍ يَنْكِحُهَا فَهِجْرَتُهُ إِلَى مَا هَاجَرَ إِلَيْهِ";
const BUKHARI_8 = "حَدَّثَنَا عَبْدُ اللَّهِ بْنُ مُحَمَّدٍ الْجُعْفِيُّ قَالَ حَدَّثَنَا أَبُو عَامِرٍ الْعَقَدِيُّ قَالَ حَدَّثَنَا سُلَيْمَانُ بْنُ بِلَالٍ عَنْ عَبْدِ اللَّهِ بْنِ دِينَارٍ عَنْ أَبِي صَالِحٍ عَنْ أَبِي هُرَيْرَةَ رَضِيَ اللَّهُ عَنْهُ عَنْ النَّبِيِّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ قَالَ الْإِيمَانُ بِضْعٌ وَسِتُّونَ شُعْبَةً وَالْحَيَاءُ شُعْبَةٌ مِنْ الْإِيمَانِ";
const BUKHARI_9 = "حَدَّثَنَا آدَمُ بْنُ أَبِي إِيَاسٍ قَالَ حَدَّثَنَا شُعْبَةُ عَنْ عَبْدِ اللَّهِ بْنِ أَبِي السَّفَرِ وَإِسْمَاعِيلَ بْنِ أَبِي خَالِدٍ عَنْ الشَّعْبِيِّ عَنْ عَبْدِ اللَّهِ بْنِ عَمْرٍو رَضِيَ اللَّهُ عَنْهُمَا عَنْ النَّبِيِّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ قَالَ الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ وَالْمُهَاجِرُ مَنْ هَجَرَ مَا نَهَى اللَّهُ عَنْهُ قَالَ أَبُو عَبْد اللَّهِ وَقَالَ أَبُو مُعَاوِيَةَ حَدَّثَنَا دَاوُدُ هُوَ ابْنُ أَبِي هِنْدٍ عَنْ عَامِرٍ قَالَ سَمِعْتُ عَبْدَ اللَّهِ يَعْنِي ابْنَ عَمْرٍو عَنْ النَّبِيِّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ وَقَالَ عَبْدُ الْأَعْلَى عَنْ دَاوُدَ عَنْ عَامِرٍ عَنْ عَبْدِ اللَّهِ عَنْ النَّبِيِّ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ";
/** A report from the people of Madinah: the Prophet ﷺ is not named in it. */
const MALIK_11 = "و حَدَّثَنِي عَنْ مَالِك عَنْ رَبِيعَةَ بْنِ أَبِي عَبْدِ الرَّحْمَنِ عَنْ الْقَاسِمِ بْنِ مُحَمَّدٍ أَنَّهُ قَالَ مَا أَدْرَكْتُ النَّاسَ إِلَّا وَهُمْ يُصَلُّونَ الظُّهْرَ بِعَشِيٍّ";

const strip = (s: string) => s.replace(/^… /, '').replace(/…$/, '');
/** Vowel marks can be typed in either order; what is compared is the words. */
const plain = (s: string | null | undefined) => foldForSearch(s ?? '');

beforeAll(() => {
  mockPacks['henc/starter/en'] = {
    pack: 'starter',
    lang: 'en',
    source: 'HadeethEnc.com',
    retrieved: '2026-11-25',
    entries: [
      {
        id: '1',
        t: 'Deeds are judged by intentions',
        h: 'ʿUmar reported: The Messenger of Allah said: "Deeds are judged by intentions, and each person will have what he intended."',
        e: 'Sincerity is the condition for a deed to be accepted.',
        x: ['Renew the intention before every act.'],
        c: ['88'],
        ar: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ',
      },
      {
        id: '2',
        t: 'Religion is sincerity',
        h: 'Tamīm ad-Dārī reported: The Prophet said: "The religion is sincerity." We said: To whom? He said: "To Allah, His Book, His Messenger, the leaders of the Muslims and their common folk."',
        e: 'Naṣīḥah means wishing good for the one advised.',
        x: [],
        c: ['88'],
        ar: 'الدِّينُ النَّصِيحَةُ',
      },
      {
        id: '3',
        t: 'The five daily prayers',
        h: 'He was asked about the ṣalāh, and said it is five in a day and a night.',
        e: 'The obligation of the five prayers.',
        x: [],
        c: ['88'],
        ar: 'خَمْسُ صَلَوَاتٍ',
      },
    ],
  };
  mockPacks['books/bukhari'] = {
    book: 'bukhari',
    source: 'Open-Hadith-Data',
    license: 'ODbL-1.0',
    retrieved: '2026-11-25',
    hadiths: [
      [1, BUKHARI_1],
      [8, BUKHARI_8],
      [9, BUKHARI_9],
    ],
  };
  mockPacks['books/malik'] = {
    book: 'malik',
    source: 'Open-Hadith-Data',
    license: 'ODbL-1.0',
    retrieved: '2026-11-25',
    // A graded book: the row's place in the source's file, and each grader's verdict.
    hadiths: [[11, MALIK_11, 27, [[0, 'Mauquf Sahih']]]],
    grades: { source: 'fawazahmed0/hadith-api', rule: 'sound-by-all', graders: ['Salim al-Hilali'] },
    of: 1594,
  };
});

describe("a book's rows", () => {
  it('are titled from where the chain has reached the Prophet ﷺ', () => {
    const title = bookRowTitle(BUKHARI_1);
    expect(title.startsWith('… ')).toBe(true);
    expect(plain(title).startsWith('انما الاعمال بالنيات وانما لكل امري ما نوي')).toBe(true);
    expect(bookRowTitle(BUKHARI_8).startsWith('… ')).toBe(true);
    // Three rows, three titles: none of them the chain's "حدثنا".
    const titles = [BUKHARI_1, BUKHARI_8, BUKHARI_9].map(t => bookRowTitle(t));
    expect(new Set(titles).size).toBe(3);
    for (const t of titles) expect(t).not.toMatch(/^… ?حَدَّثَنَا/);
  });

  it('are the text\'s own words, in order, with nothing added', () => {
    for (const text of [BUKHARI_1, BUKHARI_8, BUKHARI_9, MALIK_11]) {
      expect(text).toContain(strip(bookRowTitle(text)));
    }
  });

  it('keep their opening words where the Prophet ﷺ is not named', () => {
    const title = bookRowTitle(MALIK_11);
    expect(title.startsWith('…')).toBe(false);
    expect(MALIK_11.startsWith(strip(title))).toBe(true);
  });

  it('keep their opening words when nothing follows the blessing', () => {
    const text = 'عَنْ أَنَسٍ قَالَ رَأَيْتُ رَسُولَ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ';
    expect(bookRowTitle(text).startsWith('…')).toBe(false);
  });

  it('know the blessing vowelled, unvowelled, and as one sign', () => {
    const after = 'مَنْ كَذَبَ عَلَيَّ مُتَعَمِّدًا فَلْيَتَبَوَّأْ مَقْعَدَهُ';
    for (const blessing of ['صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ', 'صلى الله عليه وسلم', 'صلي الله عليه وسلم', '\uFDFA']) {
      expect(bookRowTitle(`حَدَّثَنَا فُلَانٌ قَالَ قَالَ النَّبِيُّ ${blessing} ${after}`)).toBe(`… ${after}`);
    }
  });

  it('are made once for a book and carry its numbers', async () => {
    const rows = await bookRows('bukhari');
    expect(rows.map(r => [r.id, r.number])).toEqual([
      ['b:bukhari:0', 1],
      ['b:bukhari:1', 8],
      ['b:bukhari:2', 9],
    ]);
    expect(await bookRows('bukhari')).toBe(rows);
    expect(foldedTitle(rows[0])).toContain(' انما الاعمال بالنيات ');
  });
});

describe('the words around a match', () => {
  it('are shown as written: accents, vowels and capitals kept', () => {
    expect(snippetAround('He was asked about the ṣalāh, and said it is five.', ['salah'])).toContain('ṣalāh,');
    const arabic = snippetAround(BUKHARI_1, ['بالنيات'])!;
    expect(plain(arabic)).toContain('انما الاعمال بالنيات');
    // Its vowels are still on it: cut from the text, not from the folded copy.
    expect(arabic).toMatch(/[\u064B-\u0652]/);
    expect(BUKHARI_1).toContain(arabic.replace(/^… /, '').replace(/ …$/, ''));
  });

  it('are cut from the middle with a mark at each cut end', () => {
    const text = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ').replace('w30', 'needle');
    const s = snippetAround(text, ['needle'])!;
    expect(s.startsWith('… ')).toBe(true);
    expect(s.endsWith(' …')).toBe(true);
    expect(s).toContain('needle');
    expect(text).toContain(s.slice(2, -2));
    expect(snippetAround('needle at the start', ['needle'])).toBe('needle at the start');
    expect(snippetAround('nothing here', ['needle'])).toBeNull();
  });
});

describe('search', () => {
  it('puts a hadith that says it before one whose explanation mentions it', async () => {
    const hits = await searchHadith('sincerity', 'en');
    expect(hits.map(h => [h.id, !!h.inExplanation])).toEqual([
      ['h:2', false],
      ['h:1', true],
    ]);
    expect(hits[1].snippet).toContain('Sincerity is the condition');
  });

  it('reads the lessons as well as the explanation', async () => {
    const hits = await searchHadith('renew', 'en');
    expect(hits.map(h => h.id)).toEqual(['h:1']);
    expect(hits[0].inExplanation).toBe(true);
  });

  it('shows where in the text the words are, unless the title already does', async () => {
    const inTitle = await searchHadith('intentions', 'en');
    expect(inTitle[0].id).toBe('h:1');
    expect(inTitle[0].snippet).toBeUndefined();
    const inText = await searchHadith('salah', 'en');
    expect(inText[0].id).toBe('h:3');
    expect(inText[0].snippet).toContain('ṣalāh');
  });

  it('finds Arabic typed without its vowels, in the books too', async () => {
    const hits = await searchHadith('الاعمال بالنيات', 'en');
    expect(hits.map(h => h.id)).toEqual(['h:1', 'b:bukhari:0']);
    const book = hits[1];
    expect(book.where).toBe('book');
    expect(book.book).toBe('bukhari');
    expect(book.number).toBe(1);
    expect(plain(book.snippet)).toContain('انما الاعمال بالنيات');
  });

  it("keeps to one book when it is that book's own field", async () => {
    const hits = await searchHadith('قال', 'en', { book: 'malik' });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.id.startsWith('b:malik:')).toBe(true);
    expect(await searchHadith('sincerity', 'en', { book: 'bukhari' })).toEqual([]);
  });

  it('hands over what one source found before reading the next', async () => {
    const partial: string[][] = [];
    await searchHadith('الاعمال بالنيات', 'en', { onPartial: h => partial.push(h.map(x => x.id)) });
    expect(partial[0]).toEqual(['h:1']);
    expect(partial[partial.length - 1]).toEqual(['h:1', 'b:bukhari:0']);
  });

  it('still takes a limit as its third argument', async () => {
    expect(await searchHadith('the', 'en', 1)).toHaveLength(1);
  });

  it('steps aside for the screen, and stops for a newer query', async () => {
    mockPacks['books/muslim'] = {
      book: 'muslim',
      source: 'Open-Hadith-Data',
      license: 'ODbL-1.0',
      retrieved: '2026-11-25',
      hadiths: Array.from({ length: 200 }, (_, i) => [i + 1, `${BUKHARI_9} ${i}`]),
    };
    let clock = 1_000_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => (clock += 20));
    try {
      let cancelled = false;
      const found: string[][] = [];
      const run = searchHadith('المسلم', 'en', {
        book: 'muslim',
        limit: 500,
        isCancelled: () => cancelled,
        onPartial: h => found.push(h.map(x => x.id)),
      });
      cancelled = true;
      await expect(run).resolves.toEqual([]);
      expect(found).toEqual([]);
      // Left alone, the same search answers in full.
      const all = await searchHadith('المسلم', 'en', { book: 'muslim', limit: 500 });
      expect(all).toHaveLength(200);
    } finally {
      now.mockRestore();
      delete mockPacks['books/muslim'];
    }
  });

  it('can be made ready ahead of the first query', async () => {
    await expect(warmSearch('en')).resolves.toBeUndefined();
    await expect(warmSearch('en', () => true)).resolves.toBeUndefined();
  });
});

describe("a list's field and title", () => {
  it("reads a hadith's number however the keyboard writes it", () => {
    expect(latinDigits('٢٣٤٥')).toBe('2345');
    expect(latinDigits('۲۳۴۵')).toBe('2345');
    expect(latinDigits('2345')).toBe('2345');
    expect(latinDigits('باب ١٢')).toBe('باب 12');
  });

  it('never shows a translation key as a title', () => {
    const t = (k: string, o?: { defaultValue: string }) =>
      ({ 'nav.hadith': 'Hadith', 'hadith.topic.5': 'Virtues and manners' } as Record<string, string>)[k] ?? o?.defaultValue ?? k;
    expect(listTitle('cat:5', t, null)).toBe('Virtues and manners');
    // A topic under a root has no name of the app's own: the tree names it, or the tab does.
    expect(listTitle('cat:267', t, null)).toBe('Hadith');
  });

  it("names one of Look up's tiles in the app's words, not HadeethEnc's", () => {
    const t = (k: string) => ({ 'hadith.hub.prayer': 'Prayer and purification' } as Record<string, string>)[k] ?? k;
    expect(listTitle('hub:prayer', t, null)).toBe('Prayer and purification');
  });
});
