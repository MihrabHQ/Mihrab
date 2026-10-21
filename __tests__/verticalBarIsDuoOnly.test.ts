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
      'src/navigation/MainTabs.tsx',
      'src/navigation/RootNavigator.tsx',
      'src/navigation/VerticalTabBar.tsx',
      'src/onboarding/OnboardingChrome.tsx',
      'src/onboarding/screens/SalamScreen.tsx',
      'src/quran/MushafPhoneReader.tsx',
      'src/quran/MushafReader.tsx',
      'src/quran/mushaf/AyahActionSheet.tsx',
      'src/screens/HomeScreen.tsx',
      'src/screens/home/HeroSky.tsx',
      'src/screens/home/TodayCard.tsx',
      'src/screens/month/MonthTable.tsx',
      'src/screens/quran/MushafSurahScreen.tsx',
    ]);
  });
});
