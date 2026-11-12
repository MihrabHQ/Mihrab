/**
 * The Android Baseline Profile (tools/baseline-profile/README.md) and the
 * two things found while recording it on 2026-11-11:
 *  - the libraries' profileinstaller 1.3.1 installs nothing on Android 15
 *    and later (RESULT_UNSUPPORTED_ART_VERSION), so an APK installed from
 *    a file had no profile at all there;
 *  - restartApp finished the activity before starting the new one, and
 *    Android then sometimes refused the start: the app closed for good.
 */
import fs from 'fs';
import path from 'path';

const android = path.join(__dirname, '..', 'android', 'app');
const read = (...p: string[]) => fs.readFileSync(path.join(android, ...p), 'utf8');

describe('the Baseline Profile', () => {
  const rules = read('src', 'main', 'baseline-prof.txt').split('\n').filter(Boolean);

  it('is made of class and method rules only', () => {
    expect(rules.length).toBeGreaterThan(5000);
    for (const rule of rules) expect(rule).toMatch(/^[HSP]*L[^;]+;(->.+)?$/);
  });

  it('covers the start: the application, the activity, React Native and the widget', () => {
    const has = (s: string) => rules.some(r => r.includes(s));
    expect(has('Lcom/prayer_times/MainApplication;')).toBe(true);
    expect(has('Lcom/prayer_times/MainActivity;')).toBe(true);
    expect(has('Lcom/facebook/react/fabric/')).toBe(true);
    expect(has('Lcom/prayer_times/contract/WidgetContract')).toBe(true);
  });

  it('has an installer that knows Android 15 and later', () => {
    const m = read('build.gradle').match(/androidx\.profileinstaller:profileinstaller:(\d+)\.(\d+)\.\d+/);
    expect(m).not.toBeNull();
    expect(Number(m![1]) * 100 + Number(m![2])).toBeGreaterThanOrEqual(104);
  });

  it('is recorded from a build with R8 off, which is never the default', () => {
    expect(read('build.gradle')).toContain('def enableProguardInReleaseBuilds = !fdroidWithoutR8 && !profileBuild');
  });
});

describe('restartApp', () => {
  it('starts the new activity from the one on screen, before anything is finished', () => {
    const src = read('src', 'main', 'java', 'com', 'prayer_times', 'SystemThemeModule.kt');
    const body = src.slice(src.indexOf('fun restartApp()'), src.indexOf('exitProcess(0)'));
    expect(body).toContain('activity.startActivity(intent)');
    expect(body).not.toMatch(/^\s*activity\.finishAffinity\(\)/m);
    expect(body).not.toContain('reactContext.startActivity(intent)');
  });
});
