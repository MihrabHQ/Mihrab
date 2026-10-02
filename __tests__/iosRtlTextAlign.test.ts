/**
 * Arabic and Urdu on iOS: text starts on the right.
 *
 * The app mirrors itself with Yoga `direction: 'rtl'`, not
 * `I18nManager.forceRTL`. Rows mirrored, but an unaligned <Text> on iOS is
 * drawn with NSTextAlignmentNatural, which follows the app's localization —
 * so every unaligned label sat on the left of its box (titles beside the
 * chevron, "Dhuhr in" beside the heart, surah details hugging the name).
 * React Native is patched (patches/react-native+0.87.1.patch) to give an
 * unaligned root Text 'left', which iOS resolves against the layout
 * direction. And the Quran tab's pager tells its cards where it starts,
 * since iOS sends no scroll event for an initial offset.
 */
import { readFileSync } from 'fs';
import path from 'path';

const read = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('iOS text alignment in a mirrored layout', () => {
  it('is patched into React Native and applied on install', () => {
    const patch = read('patches/react-native+0.87.1.patch');
    expect(patch).toMatch(/Libraries\/Text\/Text\.js/);
    expect(patch).toMatch(/Platform\.OS === 'ios' &&\s*\n\+\s*!hasTextAncestor/);
    expect(patch).toMatch(/iosLayoutStartAlign: \{textAlign: 'left'\} = \{textAlign: 'left'\}/);
    expect(read('package.json')).toMatch(/"postinstall": "patch-package"/);
  });

  it('is what the installed Text does', () => {
    const text = read('node_modules/react-native/Libraries/Text/Text.js');
    expect(text).toMatch(/_style = \[_style, iosLayoutStartAlign\]/);
  });
});

describe('the Quran pager on first open', () => {
  it('tells the cards where it starts', () => {
    expect(read('src/screens/QuranScreen.tsx')).toMatch(
      /pagerRef\.current\?\.scrollTo\(\{ x, y: 0, animated: false \}\);[\s\S]{0,700}scrollX\.setValue\(x\);/,
    );
  });
});
