// The folders the React Compiler is on for, as globs (babel.reactCompiler.js).
const COMPILED_GLOBS = require('./babel.reactCompiler').COMPILED.map(p =>
  p.endsWith('/') ? `${p}**/*.{ts,tsx}` : p,
);

module.exports = {
  root: true,
  extends: '@react-native',
  // Build output and generated bundles are not ours to lint: Gradle's HTML
  // test report (contract-tests/kotlin) and the desktop app's bundled
  // renderer ship their own JavaScript, minified — 75,000 warnings of it.
  ignorePatterns: [
    'contract-tests/kotlin/build/',
    'contract-tests/kotlin/.gradle/',
    'desktop/build/',
    'desktop/dist/',
    'desktop/node_modules/',
    'garmin/',
    'android/',
    'ios/',
    'branding/',
    // jest --coverage's report (git-ignored): generated JavaScript, and its
    // own eslint-disable lines failed `lint:errors` wherever the folder was.
    'coverage/',
  ],
  rules: {
    // Two the preset warns of that this codebase does on purpose, some six
    // hundred times between them: `void save()` marks a promise let go
    // deliberately, and the hashes, the QR code and the sync envelope are
    // bit arithmetic. Warnings nobody will act on only hide the others.
    'no-void': 'off',
    'no-bitwise': 'off',
    // A comment that turns a rule off for nothing is a rule turned off for
    // whatever is written there next.
    'eslint-comments/no-unused-disable': 'error',
    // `const { Sunrise: _hidden, ...rest } = full` is how a key is left
    // out: the named one is unused on purpose.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { ignoreRestSiblings: true, varsIgnorePattern: '^_', args: 'none', caughtErrors: 'none' },
    ],
  },
  overrides: [
    {
      // THE COMPILER'S OWN RULES, where the compiler is on — as warnings,
      // in the editor, at the line: this component reads a ref, calls an
      // impure function or changes a value while rendering, so the
      // compiler leaves it as written. That is safe (it is what the
      // component was before the compiler), and worth knowing while the
      // file is open. What is NOT safe — a read the compiler cannot see,
      // through a helper — is not these rules' to find:
      // tools/compiler-impure.js and tools/compiler-differential.js do,
      // and they fail the tests.
      files: COMPILED_GLOBS,
      rules: {
        'react-hooks/purity': 'warn',
        'react-hooks/refs': 'warn',
        'react-hooks/immutability': 'warn',
        'react-hooks/globals': 'warn',
        'react-hooks/set-state-in-render': 'warn',
      },
    },
    {
      // The build and data scripts run in Node.
      files: ['scripts/**/*.js', 'scripts/**/*.mjs', 'tools/**/*.js', 'tools/**/*.mjs', 'desktop/scripts/**/*.js'],
      env: { node: true, es2022: true },
      // One-off tooling: a leftover variable there is a note, not a failure.
      rules: { '@typescript-eslint/no-unused-vars': 'warn' },
    },
    {
      // The desktop shell runs in Node (Electron's main process, the build
      // and check scripts) and in a browser page (the web build's glue).
      files: ['desktop/**/*.js', 'desktop/**/*.mjs', 'desktop/**/*.cjs'],
      env: { node: true, browser: true, es2022: true },
      // Put in by the web build (desktop/web/webpack.config.js).
      globals: { __MIHRAB_WEB_BASE__: 'readonly' },
    },
  ],
};
