/**
 * Surah rows are never mirrored: the name drawings line up on their
 * start (right edge) at the end of an LTR row with nothing done to them,
 * and the Latin text starts at the other edge. And the Tilawah list ends
 * with its last row rather than a divider and a band of padding.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SURAH_ROW_DIRECTION } from '../src/quran/surahHeaderGlyph';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

it('the row direction is LTR', () => {
  expect(SURAH_ROW_DIRECTION).toEqual({ direction: 'ltr' });
});

it('the Tilawah surah row and the Quran surah and juz rows carry it', () => {
  expect(read('src/screens/quran/TilawahScreen.tsx')).toMatch(
    /surahRow: \{[^}]*\.\.\.SURAH_ROW_DIRECTION/,
  );
  const q = read('src/screens/QuranScreen.tsx');
  expect(q).toMatch(/nameRow: SURAH_ROW_DIRECTION/);
  expect(q.match(/styles\.nameRow,/g)).toHaveLength(2);
});

it('the Tilawah list has no lip under An-Nas', () => {
  const src = read('src/screens/quran/TilawahScreen.tsx');
  expect(src).toMatch(/list: \{ padding: SPACING\.lg, paddingBottom: 0 \}/);
  expect(src).toMatch(/!palette\.flatChrome && item\.number < SURAHS\.length/);
});
