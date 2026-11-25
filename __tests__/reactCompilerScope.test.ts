/**
 * The React Compiler is on for some folders and deliberately not for
 * others (babel.reactCompiler.js). This holds the line between them, and
 * that every platform compiles the same set.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
 
const { COMPILED, ON, isCompiled, isListed, reactCompiler } = require('../babel.reactCompiler');

describe('the React Compiler is off', () => {
  it('compiles nothing — not even what is listed — until every read of changing state while rendering is found', () => {
    // babel.reactCompiler.js has why: the shown riwayah (AGENTS.md §3), the
    // day, and the caches. Turning it back on is a decision with a test for
    // each of those, not a change to this line alone.
    expect(ON).toBe(false);
    for (const file of ['src/screens/quran/MushafSurahScreen.tsx', 'src/practice/practiceStore.ts', 'src/screens/HomeScreen.tsx', 'src/components/GlassSurface.tsx']) {
      expect([file, isListed(path.join(ROOT, file)), isCompiled(path.join(ROOT, file))]).toEqual([file, true, false]);
    }
  });

  it('and the two reads that showed it are still plain reads, right on every render with it off', () => {
    const screen = readFileSync(path.join(ROOT, 'src/screens/quran/MushafSurahScreen.tsx'), 'utf-8');
    expect(screen).toMatch(/useRiwayahAvailability\(\);\s+const riwayah = resolveRiwayah\(quranPrefs\.riwayah\);/);
    const practice = readFileSync(path.join(ROOT, 'src/practice/practiceStore.ts'), 'utf-8');
    expect(practice).toContain('const today = dayKey();');
  });
});

describe('the React Compiler', () => {
  it('is not on for what has not been listed: a new folder is switched on deliberately', () => {
    for (const held of ['src/AppNavigationRoot.tsx', 'src/screens/LogScreen.tsx', 'src/screens/CompassScreen.tsx', 'src/quranx/X.tsx']) {
      expect([held, isListed(path.join(ROOT, held))]).toEqual([held, false]);
    }
  });

  it('has the muṣḥaf on, after its pass on a phone', () => {
    expect(isListed(path.join(ROOT, 'src/quran/MushafPhoneReader.tsx'))).toBe(true);
    expect(isListed(path.join(ROOT, 'src/quran/mushaf/AyahActionSheet.tsx'))).toBe(true);
    expect(isListed(path.join(ROOT, 'src/screens/quran/SurahList.tsx'))).toBe(true);
  });

  it('has src/navigation on, after its pass on a phone (the pager’s own files read refs while rendering, so the compiler leaves those three as written)', () => {
    expect(isListed(path.join(ROOT, 'src/navigation/RootNavigator.tsx'))).toBe(true);
    expect(COMPILED).toContain('src/navigation/');
  });

  it('has Today on, after its pass on a phone', () => {
    expect(isListed(path.join(ROOT, 'src/screens/home/TodayCard.tsx'))).toBe(true);
    expect(isListed(path.join(ROOT, 'src/screens/HomeScreen.tsx'))).toBe(true);
  });

  it('compiles what is listed, and only inside this repository', () => {
    expect(isListed(path.join(ROOT, 'src/components/GlassSurface.tsx'))).toBe(true);
    expect(isListed(path.join(ROOT, 'src/screens/settings/AppearanceCard.tsx'))).toBe(true);
    expect(isListed(path.join(ROOT, 'node_modules/react-native/index.js'))).toBe(false);
    expect(isListed('/elsewhere/src/components/X.tsx')).toBe(false);
    expect(isListed(undefined)).toBe(false);
    for (const p of COMPILED) expect(p.startsWith('src/')).toBe(true);
  });

  it('runs first, for React 19, on the phones and under Jest', () => {
     
    const config = require('../babel.config.js');
    expect(config.plugins[0]).toBe(reactCompiler);
    expect(reactCompiler[1]).toMatchObject({ target: '19', sources: isCompiled });
  });

  it('and on Windows, Linux and the web, from the same list', () => {
    expect(readFileSync(path.join(ROOT, 'desktop/webpack.config.js'), 'utf-8')).toMatch(
      /plugins: \[require\(path\.join\(ROOT, 'babel\.reactCompiler\.js'\)\)\.reactCompiler\]/,
    );
  });
});
