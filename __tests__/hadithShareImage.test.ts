/**
 * A hadith as a picture (`ShareHadithModal.tsx`).
 *
 * The picture carries what the text share carries — the grade and who
 * reported it in the source's words, the reference, the source — and the
 * text is whole or there is no picture: a hadith is never cut to fit.
 */
jest.mock('../src/hadith/packs', () => ({
  loadPack: jest.fn(async () => null),
  packStatus: jest.fn(() => ({ state: 'absent' })),
  packsRevision: () => 0,
  readyPackKeys: () => [],
  usePackStatuses: () => ({}),
  usePacksReadyKey: () => '',
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('react-native-share', () => ({ __esModule: true, default: { open: jest.fn() } }));

import fs from 'fs';
import path from 'path';
import type { TFunction } from 'i18next';
import type { HadithItem } from '../src/hadith/library';
import { hadithCardLines, hadithShareText } from '../src/screens/hadith/HadithReaderScreen';
import { CARD_MAX_CHARS, fitsACard } from '../src/screens/hadith/ShareHadithModal';

const t = ((key: string, o?: Record<string, string>) => (o?.book ? `${key}:${o.book}` : key)) as unknown as TFunction;
const base: Pick<HadithItem, 'hints' | 'words' | 'categories' | 'fallback'> = { hints: [], words: [], categories: [], fallback: false };
const henc: HadithItem = {
  ...base,
  id: 'h:1',
  source: 'hadeethenc',
  title: 'T',
  arabic: 'إنما الأعمال بالنيات',
  text: 'Deeds are by intentions.',
  textLang: 'en',
  attribution: 'Narrated by al-Bukhari and Muslim',
  grade: 'Authentic',
};
const book: HadithItem = { ...base, id: 'b:bukhari:0', source: 'book', title: 'T', arabic: 'حدثنا', text: null, textLang: null, book: 'bukhari', number: 1, sahihCollection: true };

describe('a hadith as a picture', () => {
  it('carries who reported it and its grade first, in the source’s words, then where it is from', () => {
    const lines = hadithCardLines(henc, t);
    expect(lines[0]).toBe('Narrated by al-Bukhari and Muslim · Authentic');
    expect(lines[lines.length - 1]).toMatch(/hadith\.source/);
    // Every line of it is in the text share too: the picture says nothing the text does not.
    const text = hadithShareText(henc, t);
    for (const line of lines) expect(text).toContain(line);
  });

  it('carries a book’s hadith’s reference, which stands where a grade of ours would', () => {
    const lines = hadithCardLines(book, t);
    expect(lines.some(l => /hadith\.book\.bukhari 1/.test(l))).toBe(true);
    for (const line of lines) expect(hadithShareText(book, t)).toContain(line);
  });

  it('is offered only where the hadith is whole on one card — never cut to fit', () => {
    expect(fitsACard(henc)).toBe(true);
    expect(fitsACard({ arabic: 'ا'.repeat(CARD_MAX_CHARS), text: null })).toBe(true);
    expect(fitsACard({ arabic: 'ا'.repeat(CARD_MAX_CHARS), text: 'a' })).toBe(false);
    expect(fitsACard({ arabic: '', text: null })).toBe(false);
    const modal = fs.readFileSync(path.join(__dirname, '..', 'src/screens/hadith/ShareHadithModal.tsx'), 'utf8');
    expect(modal).not.toMatch(/numberOfLines|ellipsizeMode|\.slice\(|substring/);
    const reader = fs.readFileSync(path.join(__dirname, '..', 'src/screens/hadith/HadithReaderScreen.tsx'), 'utf8');
    expect(reader).toContain("Platform.OS !== 'web' && fitsACard(item)");
    expect(reader).toContain('lines={hadithCardLines(item, t)}');
  });
});
