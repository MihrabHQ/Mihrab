/**
 * The React Compiler is on for some folders and deliberately not for
 * others (babel.reactCompiler.js). This holds the line between them, and
 * that every platform compiles the same set.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
 
const { COMPILED, ON, isCompiled, isListed, reactCompiler } = require('../babel.reactCompiler');

describe('the React Compiler is on, and what it rests on', () => {
  // babel.reactCompiler.js has the story: compiled, a component that reads
  // changing state while rendering goes stale without a sound.
  const { analyse, unanswered } = require('../tools/compiler-impure');

  it('is on', () => {
    expect(ON).toBe(true);
    expect(isCompiled(path.join(ROOT, 'src/components/GlassSurface.tsx'))).toBe(true);
  });

  it('no compiled component reads the clock, a written-to module value or a live singleton while rendering', () => {
    // If this fails you have added such a read. Make it something React sees
    // change (hooks/useRenderClock.ts, a subscription), or give the component
    // `'use no memo'` with a line saying what it reads. Run
    // `node tools/compiler-impure.js --unanswered` for the list.
    const open = (unanswered() as Array<{ file: string; name: string; reads: Array<{ line: number; what: string }> }>).map(
      c => `${c.file}: ${c.name} reads ${c.reads[0].what} (line ${c.reads[0].line})`,
    );
    expect(open).toEqual([]);
  }, 120_000);

  it('the two reads that showed it are answered: the shown riwayah is in a component left as written, the day is the render clock\'s', () => {
    const found = analyse() as Array<{ file: string; name: string; optedOut: boolean }>;
    const screen = found.find(c => c.file === 'src/screens/quran/MushafSurahScreen.tsx' && c.name === 'MushafSurahScreen');
    expect(screen?.optedOut).toBe(true);
    const practice = readFileSync(path.join(ROOT, 'src/practice/practiceStore.ts'), 'utf-8');
    expect(practice).toContain('const today = dayKey(new Date(clock));');
    expect(practice).not.toContain('const today = dayKey();');
  }, 120_000);

  it('a cache named as pure is one that exists', () => {
    const pure: string[] = require('../tools/compiler-pure-caches.json');
    for (const entry of pure) {
      const [file, name] = entry.split(': ');
      expect(readFileSync(path.join(ROOT, file), 'utf-8')).toMatch(new RegExp(`\\b(const|let) ${name}\\b`));
    }
  });

  it('the render clock is not itself compiled, and the hooks folder is not listed', () => {
    const clock = readFileSync(path.join(ROOT, 'src/hooks/useRenderClock.ts'), 'utf-8');
    expect(clock).toMatch(/export function useRenderClock\(\): number \{\s+'use no memo';/);
    expect(isListed(path.join(ROOT, 'src/hooks/useRenderClock.ts'))).toBe(false);
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
