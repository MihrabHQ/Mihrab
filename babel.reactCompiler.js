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
 * THE ORDER IT WENT ON IN. The plain folders first; then, one at a time
 * and each after a pass on a phone, the places where a wasted or a missing
 * render has been felt and tuned by hand: src/navigation (the tabs and
 * Minimal's pager, AGENTS.md §9), Today (src/screens/home), and the muṣḥaf
 * (src/quran, src/screens/quran). A new folder goes on the same way.
 *
 * A component the compiler cannot prove safe is left exactly as written
 * (it skips, it does not fail the build); hand-written memoisation in a
 * compiled file is kept where the compiler can see it is equivalent.
 */
const path = require('path');

const COMPILED = [
  'src/components/',
  'src/navigation/',
  'src/screens/home/',
  'src/screens/HomeScreen.tsx',
  'src/home/',
  'src/quran/',
  'src/screens/quran/',
  'src/screens/QuranScreen.tsx',
  'src/screens/QuranSurahScreen.tsx',
  'src/screens/QuranDownloadsScreen.tsx',
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

/**
 * OFF, since 2026-11-25, a day after it went on and before any release
 * carried it. Nothing is compiled while this is false; the list above is
 * kept as the list to come back to.
 *
 * WHY. The compiler takes rendering to be pure — the same props and state,
 * the same result — and keeps a result until a prop or state it was worked
 * out from changes. The app reads things while rendering that are neither,
 * and compiled, those reads go stale:
 *
 *  - THE SHOWN RIWAYAH (AGENTS.md §3). `resolveRiwayah(prefs.riwayah)`
 *    answers from what the device can draw, which changes when a muṣḥaf's
 *    data arrives. The screens subscribe to that and render again — and
 *    the compiled screen, rendering again, kept the answer it had for the
 *    same preference: Ḥafṣ, for a reader of Warsh, until the preference
 *    itself changed (src/screens/quran/MushafSurahScreen.tsx, and twenty
 *    more callers).
 *  - THE DAY. `const today = dayKey()` in `usePracticeToday` was asked once
 *    for the component's life: Today's "logged today" read yesterday's
 *    date from the first midnight the app stayed open through. The khatmah
 *    card's day, the Hifz review's, the verse of the day's the same.
 *  - And a hundred and more calls, from compiled components, into helpers
 *    that answer from a cache filled as data loads (a page's layout, a
 *    font, a reciter's table). Each is right only if what fills the cache
 *    is also something the component depends on, and none has been read
 *    for that.
 *
 * None of it is a fault in the compiler: the hand-written `useMemo`s it
 * was to replace name their dependencies and recompute everything else on
 * every render, which is what made those reads safe. They are all still in
 * the code, so with this off the app is what 2.39 was.
 *
 * BEFORE IT GOES BACK ON: the branch `compiler-hot` has the tools that
 * found these (tools/compiler-impure.js for the clock, a first cut of the
 * same for module state) and the clock handed on as a value
 * (`useRenderClock`). Every read of changing state while rendering has to
 * be found and made a dependency React can see — a subscription, a prop —
 * and held by a test, folder by folder, as it went on.
 */
const ON = false;

/** Is `filename` (absolute) in a listed folder? */
function isListed(filename) {
  if (!filename || !filename.startsWith(ROOT)) return false;
  const rel = filename.slice(ROOT.length).split(path.sep).join('/');
  return COMPILED.some(p => rel.startsWith(p));
}

/** Is `filename` compiled? Listed, and the compiler on. */
function isCompiled(filename) {
  return ON && isListed(filename);
}

/** The Babel plugin entry. It must run before every other plugin. */
const reactCompiler = [
  require.resolve('babel-plugin-react-compiler'),
  { target: '19', sources: isCompiled },
];

module.exports = { COMPILED, ON, isCompiled, isListed, reactCompiler };
