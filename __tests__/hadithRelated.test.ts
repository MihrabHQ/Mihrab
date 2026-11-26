/**
 * "More hadith on: …" under a hadith (`relatedHadith`, src/hadith/library.ts).
 *
 * Related means filed by HadeethEnc under the same topic — nothing the app
 * judged alike. The narrowest topic that holds another hadith; the rows
 * that follow this one in it, round to the start; never the same hadith
 * filed twice; nothing for a book's row, which carries no topics.
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
import { relatedHadith } from '../src/hadith/library';

// Eight words of its own each: two entries alike in their words are one hadith filed twice.
const entry = (id: string, c: string[], h = Array.from({ length: 8 }, (_, i) => `word${id}n${i}`).join(' ')) => ({
  id,
  t: `Title ${id}`,
  h,
  a: 'Narrated by Muslim',
  g: 'Authentic',
  c,
  q: 1,
});

beforeAll(() => {
  mockPacks['henc/all/en'] = {
    pack: 'all',
    lang: 'en',
    source: 'HadeethEnc.com',
    retrieved: '2026-11-25',
    entries: [
      // Topic 10 is broad (eight), topic 11 narrow (three), topic 12 holds one alone.
      entry('1', ['10']),
      entry('2', ['10', '11']),
      entry('3', ['10']),
      entry('4', ['10', '11']),
      entry('5', ['10']),
      entry('6', ['10', '11']),
      entry('7', ['10']),
      entry('8', ['10', '12']),
      // Alone in its topic.
      entry('9', ['13']),
      // The same hadith filed twice, in a topic of their own with one other.
      entry('20', ['14'], 'Whoever believes in Allah and the Last Day should speak good or remain silent always.'),
      entry('21', ['14'], 'Whoever believes in Allah and the Last Day should speak good or remain silent always.'),
      entry('22', ['14']),
    ],
  };
});

const ids = async (id: string, max?: number) => (await relatedHadith(id, 'en', max))?.rows.map(r => r.id);

describe('related hadith', () => {
  it('are the others under the narrowest topic that holds any', async () => {
    const r = await relatedHadith('h:4', 'en');
    expect(r?.topic).toBe('11');
    // Those that follow it in the topic, then round to the start.
    expect(r?.rows.map(x => x.id)).toEqual(['h:6', 'h:2']);
    expect(r?.rows[0]).toEqual({ id: 'h:6', title: 'Title 6', note: 'Narrated by Muslim · Authentic' });
    // A topic it is alone in is passed over for the one that has company.
    expect((await relatedHadith('h:8', 'en'))?.topic).toBe('10');
  });

  it('are different for each hadith of a long topic, and no more than asked for', async () => {
    expect(await ids('h:1', 3)).toEqual(['h:2', 'h:3', 'h:4']);
    expect(await ids('h:5', 3)).toEqual(['h:6', 'h:7', 'h:8']);
    expect(await ids('h:7', 3)).toEqual(['h:8', 'h:1', 'h:2']);
    expect((await ids('h:1'))?.length).toBe(5);
  });

  it('never offer a hadith as related to itself, filed twice', async () => {
    expect(await ids('h:20')).toEqual(['h:22']);
    expect(await ids('h:22')).toEqual(['h:20', 'h:21']);
  });

  it('are none for a hadith alone in its topics, one not here, or a book’s row', async () => {
    expect(await relatedHadith('h:9', 'en')).toBeNull();
    expect(await relatedHadith('h:999', 'en')).toBeNull();
    expect(await relatedHadith('b:bukhari:1', 'en')).toBeNull();
  });

  it('are shown folded under the hadith, and read on through their topic', () => {
    const reader = fs.readFileSync(path.join(__dirname, '..', 'src/screens/hadith/HadithReaderScreen.tsx'), 'utf8');
    expect(reader).toContain("'related',");
    expect(reader).toContain("navigation.push('HadithReader', { id: r.id, list: `cat:${related.topic}` })");
    expect(reader).toContain("navigation.push('HadithList', { list: `cat:${related.topic}` })");
  });
});
