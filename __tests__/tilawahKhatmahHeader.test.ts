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

it('every pushed page but the mushaf and onboarding drops the stack bottom reserve', () => {
  const nav = read('src/navigation/RootNavigator.tsx');
  expect(nav).toMatch(/const edgeToEdge = \{ backgroundColor: theme\.colors\.background, paddingBottom: 0 \}/);
  for (const route of [
    'QuranListen', 'Khatmah', 'QuranDownloads', 'QuranTajweed',
    'MonthTimes', 'ShareMonth', 'Compass', 'Backup', 'Sync', 'Fasting',
  ]) {
    const block = nav.slice(nav.indexOf(`name="${route}"`));
    const opts = block.slice(0, block.indexOf('/>'));
    expect(`${route}: ${/contentStyle: edgeToEdge/.test(opts)}`).toBe(`${route}: true`);
  }
});

it('those pages pad their own end', () => {
  for (const f of ['BackupScreen', 'FastingScreen', 'SyncScreen']) {
    const src = read(`src/screens/${f}.tsx`);
    expect(src).toMatch(/useScrollBottomInset\(\)/);
    expect(src).toMatch(/paddingBottom: SPACING\.lg \+ bottom/);
  }
  expect(read('src/screens/CompassScreen.tsx')).toMatch(/paddingBottom: SPACING\.xl \+ bottomInset/);
  expect(read('src/screens/ShareMonthScreen.tsx')).toMatch(/footerBottom = 16 \+ bottomInset/);
  expect(read('src/screens/MonthTimesScreen.tsx')).toMatch(/paddingBottom: insets\.bottom \+ 24/);
  // Sync now starts below the transparent iOS header.
  expect(read('src/screens/SyncScreen.tsx').match(/contentInsetAdjustmentBehavior="automatic"/g)).toHaveLength(2);
});

it('Tilawah pads its own list end on Android and lifts the to-top button', () => {
  const src = read('src/screens/quran/TilawahScreen.tsx');
  expect(src).toMatch(/listBottom = Platform\.OS === 'android' \? insets\.bottom : 0/);
  expect(src).toMatch(/bottom: 24 \+ insets\.bottom/);
});

it('every pushed page but the mushaf puts the back chevron on the trailing edge in RTL', () => {
  const nav = read('src/navigation/RootNavigator.tsx');
  expect(nav).toMatch(/screenOptions=\{\(\{ navigation \}\) => \(\{\s*\/\*\*[\s\S]*?\*\/\s*\.\.\.trailingBackOptions\(navigation, isRtlLocale\)/);
  const surah = nav.slice(nav.indexOf('name="QuranSurah"'));
  const opts = surah.slice(0, surah.indexOf('/>'));
  expect(opts).toMatch(/headerBackVisible: undefined/);
  expect(opts).toMatch(/headerLeft: undefined/);
  expect(opts).toMatch(/headerRight: undefined/);
  const f = read('src/navigation/trailingBackOptions.tsx');
  expect(f).toMatch(/Platform\.OS !== 'ios' \|\| !rtl/);
  expect(f).toMatch(/headerBackVisible: false/);
  // Glyph follows the app's direction, not the device's.
  expect(f).toMatch(/<TabBackButton onPress=\{\(\) => navigation\.goBack\(\)\} \/>/);
});

it('Khatmah content starts below the transparent iOS header', () => {
  expect(read('src/screens/quran/KhatmahScreen.tsx')).toMatch(
    /contentInsetAdjustmentBehavior="automatic"/,
  );
});
