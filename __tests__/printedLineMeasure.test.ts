/**
 * The printed riwāyah pages (Warsh, Qālūn, Shuʿbah, IndoPak) justify each
 * line from its measured width, by opening its word gaps. The width was read
 * from `onTextLayout`, which the web never sends, so the web did not justify
 * at all; the line is measured as the shrink-wrapped text box now, the same
 * everywhere. And the gaps were opened with letter spacing, which CoreText
 * ignores in Arabic, so on every Apple device the lines stopped short; there
 * each gap is a spacer of its width.
 */
import * as fs from 'fs';
import * as path from 'path';
import { openDammatanForFace } from '../src/quran/MushafUnicodePage';
import { FONTS } from '../src/theme/typography';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('a printed line is measured by its own width', () => {
  const page = read('src/quran/MushafUnicodePage.tsx');

  it('reads the box on the web and the laid-out line on the phones', () => {
    expect(page).toMatch(/const MEASURE_BY_LAYOUT = Platform\.OS === 'web';/);
    expect(page).toMatch(
      /MEASURE_BY_LAYOUT\s*\?\s*e => onLineLayout\(index, e\.nativeEvent\.layout\.width, spaceEm, gaps\)/,
    );
    expect(page).toMatch(/MEASURE_BY_LAYOUT\s*\?\s*undefined\s*:\s*e =>\s*onLineLayout\(\s*index,\s*e\.nativeEvent\.lines\.reduce/);
  });

  it('never lets a line break off the web', () => {
    // A shrink-wrapped line on iOS came back a hair too narrow and wrapped,
    // and with the gap spacers TextKit never finished laying it out.
    expect(page).toMatch(/!MEASURE_BY_LAYOUT && \{ width: measure \* PRINTED_BOX_SLACK \}/);
    const line = page.slice(page.indexOf('printedLine: {'), page.indexOf('body: {'));
    expect(line).not.toMatch(/^\s*(max)?[wW]idth:/m);
  });
});

describe('a word gap on Apple is a spacer of its width', () => {
  // CoreText switches letter spacing off in Arabic, so a gap widened with
  // it does not widen on iOS or the Mac — the lines stopped short.
  const page = read('src/quran/MushafUnicodePage.tsx');

  it('is a view of the gap width on iOS, the space elsewhere', () => {
    expect(page).toMatch(/const GAP_AS_SPACER = Platform\.OS === 'ios';/);
    expect(page).toMatch(
      /GAP_AS_SPACER \? \(\s*<View style=\{\{ width: spaceEm \* fontSize, height: 1 \}\} \/>\s*\) : \(\s*<Text style=\{gapStyle\}>\{NBSP\}<\/Text>/,
    );
  });
});

describe('the open dammatan on the web', () => {
  const word = 'غِشَٰوَةٞ';

  it('is handed to Amiri Quran at the code it draws', () => {
    expect(openDammatanForFace(word, FONTS.arabicQuran, 'web')).toBe('غِشَٰوَةࣱ');
  });

  it('is left alone on the phones and in a riwayah’s own face', () => {
    expect(openDammatanForFace(word, FONTS.arabicQuran, 'android')).toBe(word);
    expect(openDammatanForFace(word, FONTS.arabicQuran, 'ios')).toBe(word);
    expect(openDammatanForFace(word, 'MihrabRiwayah_indopak', 'web')).toBe(word);
  });
});
