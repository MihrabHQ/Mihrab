/**
 * The React Compiler, one folder at a time.
 *
 * The compiler memoises components and hooks by itself, which the app does
 * by hand in some 690 places (useMemo, useCallback, memo). It is switched
 * on per folder — `COMPILED` below — so each step can be checked on its
 * own: add a folder, run the tests, look at its screens on a device.
 *
 * Shared by Metro and Jest (babel.config.js) and by the Windows, Linux and
 * web build (desktop/webpack.config.js), so every platform runs the same
 * code and the tests run what ships.
 *
 * NOT YET, AND ON PURPOSE. The places where a wasted or a missing render
 * has been felt and fixed by hand, each with its own measurements:
 *   src/screens/home    Today, the hero, the launch run
 *   src/quran           the muṣḥaf, its reader and its sheets
 *   src/screens/quran   the Qur'an tab's lists
 * They come last, one at a time, each with its device pass.
 *
 * A component the compiler cannot prove safe is left exactly as written
 * (it skips, it does not fail the build); hand-written memoisation in a
 * compiled file is kept where the compiler can see it is equivalent.
 */
const path = require('path');

const COMPILED = [
  'src/components/',
  'src/navigation/',
  'src/onboarding/',
  'src/polish/',
  'src/practice/',
  'src/responsive/',
  'src/tasbih/',
  'src/duas/',
  'src/screens/settings/',
  'src/screens/SettingsScreen.tsx',
  'src/screens/OnboardingScreen.tsx',
  'src/screens/TasbihScreen.tsx',
  'src/screens/DuasScreen.tsx',
];

const ROOT = `${__dirname}${path.sep}`;

/** Is `filename` (absolute) in a compiled folder? */
function isCompiled(filename) {
  if (!filename || !filename.startsWith(ROOT)) return false;
  const rel = filename.slice(ROOT.length).split(path.sep).join('/');
  return COMPILED.some(p => rel.startsWith(p));
}

/** The Babel plugin entry. It must run before every other plugin. */
const reactCompiler = [
  require.resolve('babel-plugin-react-compiler'),
  { target: '19', sources: isCompiled },
];

module.exports = { COMPILED, isCompiled, reactCompiler };
