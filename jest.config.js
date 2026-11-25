// Jest defaults NODE_ENV to 'test' ONLY when it is unset, and takes an
// inherited value otherwise. A shell left with NODE_ENV=production — the
// release script exports it, and so does the desktop tooling this repo is
// driven from — therefore hands every suite React's PRODUCTION build,
// which does not export `act`. The run does not error; it reports 195
// failures across 35 suites, all of them `(0, _react.act) is not a
// function`, and every one of them is a lie. Pinned here so the suite
// means the same thing whatever shell starts it.
process.env.NODE_ENV = 'test';

// Our own modules' contracts, by name: a library's `./specs/Native…` (a
// component of react-native-safe-area-context, say) is not ours to stand in for.
const OUR_SPECS = require('fs')
  .readdirSync(require('path').join(__dirname, 'src', 'native', 'specs'))
  .filter(f => /^Native\w+\.ts$/.test(f))
  .map(f => f.replace(/\.ts$/, ''));

module.exports = {
  preset: '@react-native/jest-preset',
  // The first does nothing in an ordinary run: it is the recorder of
  // tools/compiler-differential.js (compiled and as written, held equal).
  // First, so that its end-of-test hook runs before jest.setup.js unmounts
  // the trees it has to look at.
  setupFilesAfterEnv: ['<rootDir>/jest/differential.js', '<rootDir>/jest.setup.js'],
  // notifee_fork is a vendored submodule (notifee core source, built only by
  // the F-Droid Android build); its own test suite isn't ours to run.
  // `__tests__/fixtures/` holds data, not tests. Jest's default testMatch
  // treats everything under __tests__ as a suite, so a fixture module there
  // fails the run with "your test suite must contain at least one test".
  // Keeping fixtures beside the tests that use them is worth one line here.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/',
    '/notifee_fork/',
    '/__tests__/fixtures/',
  ],
  modulePathIgnorePatterns: ['/notifee_fork/'],
  // The typed contracts of the native modules are "not there" in a test,
  // and the wrappers fall back to `NativeModules.X` — jest/nativeSpecStandIn.js.
  // (With the preset's own mappings: a key here replaces the preset's, it
  // is not merged with it.)
  moduleNameMapper: {
    ...require('@react-native/jest-preset/jest-preset.js').moduleNameMapper,
    [`/specs/(${OUR_SPECS.join('|')})$`]: '<rootDir>/jest/nativeSpecStandIn.js',
  },
  // Bundled sounds — the drill's silent rests (src/quran/audio/rest.ts) —
  // are `require`d like images, and stand in for themselves the same way.
  // Merged with the preset's own transforms, not in place of them.
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
    '^.+\\.(mp3|wav)$': require.resolve(
      '@react-native/jest-preset/jest/assetFileTransformer.js',
    ),
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-safe-area-context|react-native-screens|react-native-gesture-handler|@react-navigation/|react-native-sensors|react-native-svg|rxjs))',
  ],
};
