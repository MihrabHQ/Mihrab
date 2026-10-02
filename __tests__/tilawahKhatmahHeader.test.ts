/**
 * Tilawah and Khatmah: the back control is a bare chevron (no "Home"
 * title), sits on the trailing edge in a right-to-left app on iOS like the
 * settings pages, and the pages run to the bottom edge instead of the
 * stack reserving a band there. The muṣḥaf reader keeps its own header.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

it('pushed pages show the chevron without a back title', () => {
  expect(read('src/navigation/RootNavigator.tsx')).toMatch(
    /headerBackButtonDisplayMode: 'minimal'/,
  );
});

it('Tilawah and Khatmah drop the stack bottom reserve', () => {
  const nav = read('src/navigation/RootNavigator.tsx');
  for (const route of ['QuranListen', 'Khatmah']) {
    const block = nav.slice(nav.indexOf(`name="${route}"`));
    const opts = block.slice(0, block.indexOf('/>'));
    expect(opts).toMatch(/paddingBottom: 0/);
  }
});

it('Tilawah pads its own list end on Android and lifts the to-top button', () => {
  const src = read('src/screens/quran/TilawahScreen.tsx');
  expect(src).toMatch(/listBottom = Platform\.OS === 'android' \? insets\.bottom : 0/);
  expect(src).toMatch(/bottom: 24 \+ insets\.bottom/);
});

it('Tilawah and Khatmah put the back chevron on the trailing edge in RTL', () => {
  for (const f of ['src/screens/quran/TilawahScreen.tsx', 'src/screens/quran/KhatmahScreen.tsx']) {
    expect(read(f)).toMatch(/useTrailingBackInRtl\(navigation\)/);
  }
  expect(read('src/screens/quran/MushafSurahScreen.tsx')).not.toMatch(/useTrailingBackInRtl/);
  const hook = read('src/navigation/useTrailingBackInRtl.tsx');
  expect(hook).toMatch(/Platform\.OS !== 'ios'/);
  expect(hook).toMatch(/headerBackVisible: false/);
  // Glyph follows the app's direction, not the device's.
  expect(hook).toMatch(/<TabBackButton onPress=\{\(\) => navigation\.goBack\(\)\} \/>/);
});
