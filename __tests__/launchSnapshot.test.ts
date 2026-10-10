/**
 * The last Today screen as a cold start's first frame (Android).
 *
 * Measured before (tools/startup-trace/video.sh, Pixel 10 Pro): after the
 * system's icon, an empty window, a skeleton and the screen arriving in
 * pieces — a median of about 0.6 s, up to 1.3 s. The kept screen replaces
 * all of that with the screen itself. These pin the parts that make it
 * safe: what is shown, when, and when it goes.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const NATIVE = read('android/app/src/main/java/com/prayer_times/LaunchSnapshot.kt');
const ACTIVITY = read('android/app/src/main/java/com/prayer_times/MainActivity.kt');
const APPLICATION = read('android/app/src/main/java/com/prayer_times/MainApplication.kt');
const HOME = read('src/screens/HomeScreen.tsx');
const FIRST_PAINT = read('src/boot/firstPaint.ts');
const ROOT = read('src/AppNavigationRoot.tsx');

describe('lookKeyOf', () => {
  const { lookKeyOf } = require('../src/native/LaunchSnapshot');

  it('is stable for the same settings and moves with any of them', () => {
    const a = { appearance: 'dark', language: 'sv', clockFormat: '24h' };
    expect(lookKeyOf(a)).toBe(lookKeyOf({ ...a }));
    expect(lookKeyOf(a)).not.toBe(lookKeyOf({ ...a, language: 'ar' }));
    expect(lookKeyOf(a)).not.toBe(lookKeyOf({ ...a, clockFormat: '12h' }));
  });

  it('ignores the last GPS fix, which moves without the screen moving', () => {
    const a = { appearance: 'dark', lastFetchedLatitude: 59.33, lastFetchedLongitude: 18.06 };
    expect(lookKeyOf(a)).toBe(lookKeyOf({ ...a, lastFetchedLatitude: 59.3301 }));
  });
});

describe('the native side', () => {
  it('decodes from process start and lays the picture on the first frame', () => {
    expect(APPLICATION).toMatch(/super\.onCreate\(\)[\s\S]{0,200}LaunchSnapshot\.preload\(this\)/);
    expect(ACTIVITY).toMatch(/super\.onCreate\(null\)\s*\/\/[^\n]*\n\s*LaunchSnapshot\.show\(this\)/);
  });

  it('copies the window before React Native hears about the pause', () => {
    expect(ACTIVITY).toMatch(/override fun onPause\(\) \{\s*LaunchSnapshot\.capture\(this\)\s*super\.onPause\(\)/);
  });

  it('is used only when it is the screen about to open', () => {
    for (const check of [
      'version != BuildConfig.VERSION_CODE',
      'MAX_AGE_MS',
      'look == this.look',
      'UI_MODE_NIGHT_MASK',
      'fontScale != fontScale',
      'w == width && h == height',
      'intent.data != null',
      'it.startsWith("android.")',
    ]) {
      expect(NATIVE).toContain(check);
    }
  });

  it('is used for days, up to a month', () => {
    expect(NATIVE).toContain('MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000L');
  });

  it('comes down by itself, and keeps out of backups', () => {
    expect(NATIVE).toMatch(/main\.postDelayed\(\{ hide\(\) \}, SAFETY_HIDE_MS\)/);
    expect(NATIVE).toContain('noBackupFilesDir');
  });
});

describe('the iOS side', () => {
  const SWIFT = read('ios/PrayerApp/MihrabLaunchSnapshot.swift');
  const DELEGATE = read('ios/PrayerApp/AppDelegate.swift');
  const BRIDGE = read('ios/PrayerApp/MihrabLaunchSnapshot.m');

  it('decodes at launch and lays the picture over the window as it connects', () => {
    expect(DELEGATE).toMatch(/LaunchSnapshotStore\.shared\.preload\(\)\s*let delegate = ReactNativeDelegate\(\)/);
    expect(DELEGATE).toMatch(/launchOptions: launchOptions\.isEmpty \? nil : launchOptions\s*\)[\s\S]{0,200}LaunchSnapshotStore\.shared\.show\(in: window, options: connectionOptions\)/);
  });

  it('keeps the window while it is still on screen', () => {
    expect(DELEGATE).toMatch(/func sceneWillResignActive\(_ scene: UIScene\) \{\s*LaunchSnapshotStore\.shared\.capture\(window\)/);
  });

  it('is used only when it is the screen about to open, and never on the Mac', () => {
    for (const check of [
      'meta.version == Self.buildVersion',
      'age <= Self.maxAge',
      'look == meta.look',
      'userInterfaceStyle.rawValue == meta.style',
      'preferredContentSizeCategory.rawValue == meta.textSize',
      'options.urlContexts.isEmpty, options.notificationResponse == nil',
      'isExcludedFromBackup = true',
      '#if targetEnvironment(macCatalyst)',
    ]) {
      expect(SWIFT).toContain(check);
    }
  });

  it('exposes the same module to JS as Android does', () => {
    for (const m of ['setEligible', 'setLookKey', 'hide)', 'captureNow', 'setHeroState', 'getShownState']) {
      expect(BRIDGE).toContain(m);
    }
  });
});

describe('the JS side', () => {
  it('keeps only a settled Today screen at the top', () => {
    expect(HOME).toMatch(
      /homeActive &&\s*afterFirstPaint &&\s*atTop &&\s*state\.phase === 'ready' &&\s*!state\.provisional/,
    );
    expect(HOME).toMatch(/return \(\) => setLaunchSnapshotEligible\(false\)/);
  });

  it('fades the picture into the first committed Today, with a fallback at the first paint', () => {
    expect(HOME).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(state\.phase === 'idle' \|\| state\.phase === 'loading'\) return;[\s\S]{0,80}hideLaunchSnapshot\(\);/);
    expect(FIRST_PAINT).toMatch(/reportBoot\(\);[\s\S]{0,300}settleThenHideSnapshot\(\);/);
  });

  it('asks native to hide once per process', () => {
    jest.resetModules();
    const hide = jest.fn();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: { MihrabLaunchSnapshot: { hide, setEligible: jest.fn(), setLookKey: jest.fn() } },
    }));
    const m = require('../src/native/LaunchSnapshot');
    m.hideLaunchSnapshot();
    m.hideLaunchSnapshot();
    expect(hide).toHaveBeenCalledTimes(1);
    jest.dontMock('react-native');
  });

  it('tells native what the app looks like', () => {
    expect(ROOT).toMatch(/setLaunchSnapshotLook\(lookKeyOf\(settings\)\)/);
  });
});
