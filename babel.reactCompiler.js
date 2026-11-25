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
 * ON — and what it rests on.
 *
 * The compiler takes rendering to be pure: the same props, state and hook
 * results, the same output. It keeps the output until one of them changes.
 * A component that reads anything else while rendering goes stale when it
 * is compiled, silently: nothing throws, the screen is just yesterday's.
 *
 * That happened. The compiler went on 2026-11-24 and was switched off the
 * next day, before any release carried it, for two reads found by reading
 * its output:
 *
 *  - THE SHOWN RIWAYAH (AGENTS.md §3). `resolveRiwayah(prefs.riwayah)`
 *    answers from what the device can draw, which changes when a muṣḥaf's
 *    data arrives. The screen subscribed to that and rendered again — and
 *    compiled, kept the answer it had for the same preference: Ḥafṣ, for a
 *    reader of Warsh, until the preference itself changed.
 *  - THE DAY. `const today = dayKey()` in `usePracticeToday` was asked once
 *    for the component's life: Today's "logged today" read yesterday's
 *    date from the first midnight the app stayed open through.
 *
 * So it is on again under one condition, held by a test
 * (`__tests__/reactCompilerScope.test.ts`): `tools/compiler-impure.js`
 * finds NO compiled component that reads changing state while rendering —
 * the clock, a module-level value or cache that is written to, a live
 * singleton (the `i18n` instance, `Dimensions`), directly or through a
 * helper of ours. A component it finds has two ways out:
 *
 *  - make the read something React sees: the render's clock as an argument
 *    (`hooks/useRenderClock.ts`), a subscription (`hooks/useFontScale.ts`);
 *  - or say `'use no memo'` and be left exactly as written — which is what
 *    every component was before the compiler, and is right. Fifty-five do,
 *    the muṣḥaf's page and the recitation's controls among them; each says
 *    beside the directive what it reads.
 *
 * A cache that is a pure function of its key is not changing state; the
 * ones read and found to be so are named in `tools/compiler-pure-caches.json`.
 * The check errs toward reporting, and it cannot see everything — a method
 * on an object handed in as a prop, a native getter. `ON = false` is the
 * way back: the hand-written memoisation is all still in the code, so with
 * this off the app renders as 2.39 did.
 */
const ON = true;

/** Is `filename` (absolute) in a listed folder? */
function isListed(filename) {
  if (!filename || !filename.startsWith(ROOT)) return false;
  const rel = filename.slice(ROOT.length).split(path.sep).join('/');
  return COMPILED.some(p => rel.startsWith(p));
}

/**
 * What the compiler is told, apart from where to look.
 *
 * `eslintSuppressionRules`: by default the compiler leaves alone any
 * component that carries an `eslint-disable` for either React hooks rule,
 * on the reasoning that a suppressed rule may be a broken one. For
 * `rules-of-hooks` that stands. For `exhaustive-deps` it kept the compiler
 * out of twenty-one components — Today, the hero, the muṣḥaf's reader and
 * its page among them — nearly all for an EFFECT whose list is short on
 * purpose (run when this changes, read the rest as it is then). The
 * compiler does not rewrite an effect's list, so such an effect runs when
 * it did. Where the suppressed list is a `useMemo`'s or a `useCallback`'s
 * and really is short, the compiler's own check that existing memoisation
 * is kept (on by default) refuses the component, and it stays as written —
 * `tools/compiler-report.js` lists those.
 */
const OPTIONS = {
  target: '19',
  eslintSuppressionRules: ['react-hooks/rules-of-hooks'],
};

/** Is `filename` compiled? Listed, and the compiler on. */
function isCompiled(filename) {
  return ON && isListed(filename);
}

/** The Babel plugin entry. It must run before every other plugin. */
const reactCompiler = [
  require.resolve('babel-plugin-react-compiler'),
  { ...OPTIONS, sources: isCompiled },
];

module.exports = { COMPILED, ON, OPTIONS, isCompiled, isListed, reactCompiler };
