module.exports = {
  root: true,
  extends: '@react-native',
  // Gradle's HTML test report for the widget contract's Kotlin tests
  // (contract-tests/kotlin) ships its own JavaScript; it is build output,
  // not ours to lint.
  ignorePatterns: [
    'contract-tests/kotlin/build/',
    'contract-tests/kotlin/.gradle/',
  ],
};
