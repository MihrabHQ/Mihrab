/**
 * The muṣḥaf's header floats over the page on Android as well as iOS
 * (MushafSurahScreen sets `headerTransparent` on both), so every reader
 * that draws under it has to pad below it on both. The phone reader did;
 * the spread reader still padded on iOS only, and on an Android tablet in
 * landscape the facing pages and the index sidebar began under the bar.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

it('the Android muṣḥaf header is transparent', () => {
  const screen = read('src/screens/quran/MushafSurahScreen.tsx');
  expect(screen).toMatch(/THE ANDROID HEADER FLOATS OVER THE PAGE[\s\S]*?headerTransparent: true/);
});

it('the spread reader pads below the header on every platform', () => {
  const spread = read('src/quran/MushafSpreadReader.tsx');
  expect(spread).toMatch(/const navPad = !isFullscreen && !props\.chromeCleared \? headerHeight : 0;/);
  expect(spread).not.toMatch(/Platform\.OS === 'ios' && !props\.chromeCleared/);
});

it('the phone reader does too', () => {
  expect(read('src/quran/MushafPhoneReader.tsx')).toMatch(
    /const chromePad = !isFullscreen && !props\.chromeCleared \? headerHeight : 0;/,
  );
});
