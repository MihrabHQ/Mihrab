/**
 * Every `src/native/specs/Native*.ts` under Jest (jest.config.js).
 *
 * A spec asks `TurboModuleRegistry` for its module as it is imported.
 * There is no native side in a test, and many suites stand a pared-down
 * `react-native` in for the real one — with `NativeModules` and not much
 * else. So a spec is simply "not there", and `nativeModule()` goes on to
 * the old door: `NativeModules.X`, which is where a test puts a stand-in.
 *
 * What the specs themselves say is held by
 * __tests__/turboModulesAreTyped.test.ts, which reads them as text.
 */
module.exports = { __esModule: true, default: null };
