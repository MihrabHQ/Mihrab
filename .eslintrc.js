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
