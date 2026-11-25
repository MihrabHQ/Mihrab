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

  it('a cache named as pure is as it was when it was read and found to be', () => {
    // If this fails, a function that reads or fills one of the caches in
    // tools/compiler-pure-caches.json has been edited (or the cache is gone).
    // "Pure" was a judgement about the code as it was: read the change, then
    // `node tools/compiler-pure-caches.js --update` — or take the cache off
    // the list. tools/compiler-pure-caches.js has the whole of it.
    const { check } = require('../tools/compiler-pure-caches');
    expect((check() as Array<{ entry: string; why: string }>).map(c => `${c.entry} ${c.why}`)).toEqual([]);
    expect(Object.keys(require('../tools/compiler-pure-caches.json')).length).toBeGreaterThan(0);
  });

  it('what the compiler leaves as written is what was last looked at, with the compiler it was looked at with', () => {
    // If this fails: a `'use no memo'` was added or removed, a new component
    // is one the compiler will not take, or the compiler itself changed.
    // tools/compiler-report.js ("WHAT IS LEFT AS WRITTEN, HELD") says what
    // to do: look, run the differential for anything newly compiled, then
    // `node tools/compiler-report.js --update`.
    const { snapshotDifference } = require('../tools/compiler-report');
    expect(snapshotDifference()).toEqual([]);
  }, 120_000);

  it('the compiler is one exact version: a new one arrives by a decision, not by an install', () => {
    const wanted = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).devDependencies['babel-plugin-react-compiler'];
    expect(wanted).toMatch(/^\d+\.\d+\.\d+$/);
    const installed = JSON.parse(
      readFileSync(path.join(ROOT, 'node_modules/babel-plugin-react-compiler/package.json'), 'utf-8'),
    ).version;
    expect(installed).toBe(wanted);
    expect(require('../tools/compiler-report.snapshot.json').compiler).toBe(wanted);
  });

  it('as written is a test run\'s to ask for, never a build\'s', () => {
    // MIHRAB_COMPILER=off is how tools/compiler-differential.js gets the
    // code as written to compare with. It must do nothing outside Jest.
    const config = readFileSync(path.join(ROOT, 'babel.reactCompiler.js'), 'utf-8');
    expect(config).toContain("const AS_WRITTEN = process.env.NODE_ENV === 'test' && process.env.MIHRAB_COMPILER === 'off';");
    expect(config).toContain('return ON && !AS_WRITTEN && isListed(filename);');
  });

  it('a release carries it only after a week on a phone, counted again when what is compiled changes', () => {
    // tools/compiler-soak.js; scripts/release.sh asks it.
    const { state, fingerprint, SOAK_DAYS } = require('../tools/compiler-soak');
    const kept = require('../tools/compiler-soak.json') as { onPhoneSince: string; compiled: string };
    expect(SOAK_DAYS).toBe(7);
    const after = (days: number) => new Date(Date.parse(kept.onPhoneSince) + days * 86_400_000).toISOString().slice(0, 10);
    if (kept.compiled === fingerprint()) {
      expect(state(after(SOAK_DAYS - 1)).ok).toBe(false);
      expect(state(after(SOAK_DAYS)).ok).toBe(true);
    } else {
      // What is compiled has changed since the build that was lived with:
      // no number of days makes that build this one.
      expect(state(after(365)).ok).toBe(false);
    }
    const release = readFileSync(path.join(ROOT, 'scripts/release.sh'), 'utf-8');
    expect(release).toContain('node tools/compiler-soak.js --check || die');
    expect(release).toContain('node tools/compiler-differential.js >/dev/null 2>&1 || die');
  });

  it('compiled and as written are compared wherever the tests are run', () => {
    // tools/compiler-differential.js: in preflight, and in CI beside Jest.
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts.preflight).toMatch(/jest --ci --silent && node tools\/compiler-differential\.js$/);
    expect(readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf-8')).toContain('run: node tools/compiler-differential.js');
    // …and its recorder is the first thing Jest sets up, and nothing at all
    // without the variable the tool sets.
    expect(readFileSync(path.join(ROOT, 'jest.config.js'), 'utf-8')).toContain(
      "setupFilesAfterEnv: ['<rootDir>/jest/differential.js', '<rootDir>/jest.setup.js']",
    );
    expect(readFileSync(path.join(ROOT, 'jest/differential.js'), 'utf-8')).toMatch(/const out = process\.env\.MIHRAB_DIFFERENTIAL;\s+if \(out\) \{/);
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
