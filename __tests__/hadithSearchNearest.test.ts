/**
 * A search puts the nearest match first (`matchDistance`, library.ts).
 *
 * "intention" was answered with "…falsely and intentionally, he is as he
 * has said" at the top, above "…Jihad and good intention…" and above
 * "Verily, the reward of deeds depends on the intentions…", which was not
 * on the first screen at all: all three hold the letters, and the pack had
 * them in that order (Pixel 10 Pro, 2026-11-26). The word itself comes
 * first, then a word that runs on from it, then a word that only holds
 * it; equal matches keep the packs' order.
 */
const mockPacks: Record<string, unknown> = {};
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async (key: string) => mockPacks[key] ?? null),
  packStatus: jest.fn((key: string) => (mockPacks[key] ? { state: 'ready', bytes: 1 } : { state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => Object.keys(mockPacks),
}));

import { foldForSearch, matchDistance, searchHadith } from '../src/hadith/library';

const hay = (s: string) => ` ${foldForSearch(s)} `;

describe('matchDistance', () => {
  it('is nothing for the word itself', () => {
    expect(matchDistance(hay('Jihad and good intention, and whenever'), ['intention'])).toBe(0);
  });

  it('counts the letters a word runs on by', () => {
    expect(matchDistance(hay('depends on the intentions'), ['intention'])).toBe(1);
    expect(matchDistance(hay('falsely and intentionally'), ['intention'])).toBe(4);
  });

  it('puts a word that only holds it after one that begins with it', () => {
    const inside = matchDistance(hay('unintentional'), ['intention']);
    expect(inside).toBeGreaterThan(matchDistance(hay('intentionally'), ['intention']));
  });

  it('takes the nearest of several places, and adds the words up', () => {
    expect(matchDistance(hay('intentionally, with a good intention'), ['intention'])).toBe(0);
    expect(matchDistance(hay('good intentions in prayers'), ['intention', 'prayer'])).toBe(2);
  });

  it('reads Arabic the same way: the word before the word with its article', () => {
    const w = [foldForSearch('نية')];
    expect(matchDistance(hay('نِيَّة صالحة'), w)).toBe(0);
    expect(matchDistance(hay('بِالنِّيَّاتِ'), w)).toBeGreaterThan(0);
  });
});

describe('a search, nearest first', () => {
  // Each with an Arabic of its own, so none is taken for another entered twice.
  const entry = (id: string, t: string) => ({ id, t, h: `${t}.`, e: '', x: [], c: ['88'], ar: `حديث ${id}` });
  beforeAll(() => {
    mockPacks['henc/starter/en'] = {
      pack: 'starter',
      lang: 'en',
      source: 'HadeethEnc.com',
      retrieved: '2026-11-26',
      entries: [
        entry('1', 'If anyone swears by a religion other than Islam falsely and intentionally, he is as he has said'),
        entry('2', 'Verily, the reward of deeds depends on the intentions'),
        entry('3', 'There is no emigration after the Conquest, but there is Jihad and good intention'),
        entry('4', 'A second hadith that speaks of intention'),
      ],
    };
  });

  it('answers "intention" with the word, then "intentions", then "intentionally"', async () => {
    const hits = await searchHadith('intention', 'en');
    expect(hits.map(h => h.id)).toEqual(['h:3', 'h:4', 'h:2', 'h:1']);
  });
});
