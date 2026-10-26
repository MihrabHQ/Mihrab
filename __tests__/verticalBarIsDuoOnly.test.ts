/**
 * The iPhone vertical bar (iPhone Duo, iOS 27.1) changes the layout of the
 * iPhones that have one and of nothing else — AGENTS.md §8. Everything the
 * app does about the bar is keyed on `useVerticalBar()`, so these hold the
 * two ends of that: where the bar is read at all, and what the shared
 * helpers give when there is none.
 */
import * as fs from 'fs';
import * as path from 'path';
import { verticalBarFrom } from '../src/native/VerticalBar';
import { phonePageGeometry } from '../src/quran/phonePageGeometry';
import { sheetSides } from '../src/responsive/sheetSides';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

describe('the vertical bar is the iPhone Duo’s alone', () => {
  it('is read on an iPhone only — never Android, the iPad or the Mac', () => {
    expect(read('src/native/VerticalBar.ts')).toMatch(
      /Platform\.OS === 'ios' && !Platform\.isPad && !isMacCatalyst\s*\?\s*NativeModules\.MihrabVerticalBar\s*:\s*undefined/,
    );
  });

  it('is null where the system reports no bar', () => {
    expect(verticalBarFrom(null, 400)).toBeNull();
    expect(
      verticalBarFrom({ edge: null, safe: { top: 59, left: 0, bottom: 34, right: 0 } }, 400),
    ).toBeNull();
    // A side but no band taken from it is no bar either.
    expect(
      verticalBarFrom({ edge: 'right', safe: { top: 0, left: 0, bottom: 0, right: 0 } }, 400),
    ).toBeNull();
  });

  it('reads a bar as its side, its width and where the clock above it ends', () => {
    expect(
      verticalBarFrom(
        {
          edge: 'right',
          safe: { top: 0, left: 0, bottom: 20, right: 55 },
          regions: [{ x: 350, y: 20, width: 45, height: 100 }],
        },
        400,
      ),
    ).toEqual({ side: 'right', width: 55, occludedTo: 120 });
  });

  it('leaves the phone muṣḥaf page exactly as it was without the bar', () => {
    const portrait = { width: 393, height: 852, sideInset: 0, navPad: 100, listH: 700 };
    expect(phonePageGeometry({ ...portrait, fillWidth: false })).toEqual(
      phonePageGeometry(portrait),
    );
    expect(phonePageGeometry(portrait)?.scrolling).toBe(false);
    // Beside the bar the page takes the width and scrolls.
    expect(phonePageGeometry({ ...portrait, fillWidth: true })?.scrolling).toBe(true);
  });

  it('is used only where it has been looked at on the Duo', () => {
    // A new file reading the bar is new Duo behaviour: add it here once it
    // is keyed on the bar (null elsewhere) and has been checked on the Duo
    // simulator — AGENTS.md §8.
    const users = sourceFiles('src')
      .filter(f => /from '(\.\.\/)+native\/VerticalBar'|from '\.\/VerticalBar'/.test(read(f)))
      .map(f => f.split(path.sep).join('/'))
      .sort();
    expect(users).toEqual([
      'src/components/ResetScopePicker.tsx',
      'src/native/FoldPosture.ts',
      'src/navigation/MainTabs.tsx',
      'src/navigation/RootNavigator.tsx',
      'src/navigation/VerticalTabBar.tsx',
      'src/onboarding/OnboardingChrome.tsx',
      'src/onboarding/screens/SalamScreen.tsx',
      'src/quran/MushafPhoneReader.tsx',
      'src/quran/MushafReader.tsx',
      'src/quran/mushaf/AyahActionSheet.tsx',
      'src/quran/mushafReaderCore.tsx',
      'src/responsive/ResponsiveModal.tsx',
      'src/responsive/sheetSides.ts',
      'src/screens/HomeScreen.tsx',
      'src/screens/home/HeroSky.tsx',
      'src/screens/home/TodayCard.tsx',
      'src/screens/month/MonthTable.tsx',
      'src/screens/quran/MushafSurahScreen.tsx',
    ]);
  });

  it('keeps every sheet and dialog clear of the bar, and nothing else moves', () => {
    const base = { android: false, width: 430, rtl: false, book: null };
    // No bar: iOS sheets run edge to edge, as they always have.
    expect(sheetSides(base)).toEqual({ left: 0, right: 0 });
    expect(sheetSides({ ...base, bar: null })).toEqual({ left: 0, right: 0 });
    // A bar on the right takes its width off that side only.
    expect(sheetSides({ ...base, bar: { side: 'right', width: 74 } })).toEqual({ left: 0, right: 74 });
    expect(sheetSides({ ...base, bar: { side: 'left', width: 74 } })).toEqual({ left: 74, right: 0 });
    // Android's wide-window rule is untouched.
    expect(sheetSides({ android: true, width: 900, rtl: false, book: null })).toEqual({ left: 130, right: 130 });
  });

  it('gives the centred dialogs the bar too', () => {
    // RiwayahPicker, ConfirmModal, ShareAyahModal and LogPassedPrayerSheet
    // pad their scrim with this; beside the bar it must add the bar.
    const fold = read('src/native/FoldPosture.ts');
    expect(fold).toMatch(/const bar = useVerticalBar\(\);\s*if \(bar\) \{/);
    // The other Modal hosts carry the bar's padding on their dimmed root.
    expect(read('src/responsive/ResponsiveModal.tsx')).toContain('barPad,');
    expect(read('src/components/ResetScopePicker.tsx')).toContain('barPad]}');
    expect(read('src/quran/mushafReaderCore.tsx')).toContain('barPad,');
  });

  it('keeps the Today notices clear of the bar', () => {
    // The clocks-changed notice ran under the bar, its Dismiss with it.
    const home = read('src/screens/HomeScreen.tsx');
    const notices = home.slice(home.indexOf('permissionBannersShown({'), home.indexOf('<PermissionBanners'));
    expect(notices).toContain('vbarPad]');
  });

  it('leaves no Modal in the app without a way clear of the bar', () => {
    // Every file that presents a <Modal> applies one of the helpers that
    // know the bar. A new dialog has to pick one, or it runs in under it.
    const known = /useSheetSides|useSheetPadding|useBookPaneInset|useVerticalBarInsets|ResponsiveModal|<ReciterPickerSheet/;
    const hosts = sourceFiles('src')
      .filter(f => /<Modal[\s>]/.test(read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')))
      .filter(f => !known.test(read(f)));
    expect(hosts).toEqual([]);
  });
});
