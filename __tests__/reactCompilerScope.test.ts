/**
 * The React Compiler is on for some folders and deliberately not for
 * others (babel.reactCompiler.js). This holds the line between them, and
 * that every platform compiles the same set.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
 
const { COMPILED, isCompiled, reactCompiler } = require('../babel.reactCompiler');

describe('the React Compiler', () => {
  it('leaves the pager, Today, and the muṣḥaf alone until each has had its device pass', () => {
    for (const held of [
      'src/navigation/minimalPager.ts',
      'src/navigation/MinimalSwipe.tsx',
      'src/navigation/MainTabs.tsx',
      'src/screens/HomeScreen.tsx',
      'src/screens/home/TodayCard.tsx',
      'src/quran/MushafPhoneReader.tsx',
      'src/quran/mushaf/AyahActionSheet.tsx',
      'src/screens/quran/SurahList.tsx',
      'src/AppNavigationRoot.tsx',
    ]) {
      expect([held, isCompiled(path.join(ROOT, held))]).toEqual([held, false]);
    }
  });

  it('compiles what is listed, and only inside this repository', () => {
    expect(isCompiled(path.join(ROOT, 'src/components/GlassSurface.tsx'))).toBe(true);
    expect(isCompiled(path.join(ROOT, 'src/screens/settings/AppearanceCard.tsx'))).toBe(true);
    expect(isCompiled(path.join(ROOT, 'node_modules/react-native/index.js'))).toBe(false);
    expect(isCompiled('/elsewhere/src/components/X.tsx')).toBe(false);
    expect(isCompiled(undefined)).toBe(false);
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
