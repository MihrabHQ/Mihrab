/**
 * The surah-name drawings line up on their START (right edge) in every
 * layout direction, and the Tilawah list ends with its last row rather
 * than a divider and a band of padding.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  SURAH_NAME_COLUMN_WIDTH,
  SURAH_NAME_SIZE,
  surahNameColumnStyle,
} from '../src/quran/surahHeaderGlyph';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

it('is one fixed LTR box with the name at its right edge (Yoga, not textAlign)', () => {
  // iOS swaps textAlign left/right in a mirrored tree and Android does
  // not; flex-end inside an LTR box is the right edge on both.
  expect(surahNameColumnStyle()).toEqual({
    width: SURAH_NAME_COLUMN_WIDTH,
    flexShrink: 0,
    direction: 'ltr',
    alignItems: 'flex-end',
  });
  // Widest name ≈ 2.7 em at the base size must fit.
  expect(SURAH_NAME_COLUMN_WIDTH).toBeGreaterThanOrEqual(Math.ceil(2.7 * SURAH_NAME_SIZE));
});

it('both lists set the name as that column', () => {
  for (const f of ['src/screens/quran/TilawahScreen.tsx', 'src/screens/QuranScreen.tsx']) {
    expect(read(f)).toMatch(/Col: surahNameColumnStyle\(\)/);
  }
});

it('the Tilawah list has no lip under An-Nas', () => {
  const src = read('src/screens/quran/TilawahScreen.tsx');
  expect(src).toMatch(/list: \{ padding: SPACING\.lg, paddingBottom: 0 \}/);
  expect(src).toMatch(/!palette\.flatChrome && item\.number < SURAHS\.length/);
});
