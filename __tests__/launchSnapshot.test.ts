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
    expect(ACTIVITY).toMatch(/super\.onCreate\(null\)[\s\S]{0,400}?LaunchSnapshot\.show\(this\)/);
  });

  it('copies the window before React Native hears about the pause', () => {
    expect(ACTIVITY).toMatch(/override fun onPause\(\) \{\s*resumed = false\s*LaunchSnapshot\.capture\(this\)[\s\S]{0,200}super\.onPause\(\)/);
  });

  it('is used only when it is the screen about to open', () => {
    for (const check of [
      'version != BuildConfig.VERSION_CODE',
      'MAX_AGE_MS',
      'look == this.look',
      'UI_MODE_NIGHT_MASK',
      'fontScale != fontScale',
      'w == width && h == height',
      // A link opens something in the app, not the app — but the widgets'
      // `mihrab://today` lands where a plain launch does.
      '!isTodayLink(data)',
      'uri.host == "today" && uri.path.isNullOrEmpty() && uri.query == null',
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
      'abs(age) <= Self.maxAge',
      'look == meta.look',
      'userInterfaceStyle.rawValue == meta.style',
      'preferredContentSizeCategory.rawValue == meta.textSize',
      'guard todayOnly, options.notificationResponse == nil',
      'c.url.host == "today" && c.url.path.isEmpty && c.url.query == nil',
      'isExcludedFromBackup = true',
      '#if targetEnvironment(macCatalyst)',
    ]) {
      expect(SWIFT).toContain(check);
    }
  });

  it('without a picture, holds the launch screen until Today commits — once Today has been reached', () => {
    // Every guard that used to give up on a picture now covers instead.
    expect(SWIFT.match(/cover\(window\)\s*return/g)?.length).toBe(4);
    expect(SWIFT).toMatch(/private func cover\(_ window: UIWindow\) \{\s*guard defaults\.bool\(forKey: Self\.prefix \+ "coverWanted"\) else \{ return \}/);
    expect(SWIFT).toMatch(/view\.backgroundColor = Self\.launchColor/);
    expect(SWIFT).toMatch(/asyncAfter\(deadline: \.now\(\) \+ Self\.coverMax\) \{ self\.hide\(\) \}/);
    expect(SWIFT).toContain('private static let coverMax: TimeInterval = 2');
    // Set by a settled Today, marked eligible or kept by JS.
    expect(SWIFT).toMatch(/if value \{ LaunchSnapshotStore\.shared\.noteTodayReached\(\) \}/);
    expect(SWIFT).toMatch(/guard bounds\.width > 0, bounds\.height > 0 else \{ return \}[\s\S]{0,200}noteTodayReached\(\)/);
    // A link, a notification or a shortcut opens something else: no cover.
    expect(SWIFT).toMatch(/options\.userActivities\.isEmpty else \{ return \}/);
  });

  it('launches in the page\'s colour, not the React Native template', () => {
    const board = read('ios/PrayerApp/LaunchScreen.storyboard');
    expect(board).not.toContain('Powered by React Native');
    expect(board).not.toContain('<label');
    expect(board).toContain('<color key="backgroundColor" name="LaunchBackground"/>');
    const color = JSON.parse(read('ios/PrayerApp/Images.xcassets/LaunchBackground.colorset/Contents.json'));
    const hex = (c: { color: { components: Record<string, string> } }) =>
      ['red', 'green', 'blue'].map(k => c.color.components[k].slice(2)).join('');
    // The classic page's paper and its dark (theme/appPalette.ts).
    expect(hex(color.colors[0])).toBe('FAF7F2');
    expect(hex(color.colors[1])).toBe('141210');
    expect(DELEGATE).toMatch(/window\.rootViewController\?\.view\.backgroundColor = LaunchSnapshotStore\.launchColor/);
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

  it('asks native to hide on the commits of the first couple of seconds, then stops', () => {
    jest.resetModules();
    jest.useFakeTimers();
    const hide = jest.fn();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: { MihrabLaunchSnapshot: { hide, setEligible: jest.fn(), setLookKey: jest.fn() } },
    }));
    const m = require('../src/native/LaunchSnapshot');
    m.hideLaunchSnapshot();
    const asked = m.hideRequestedAt();
    jest.advanceTimersByTime(500);
    m.hideLaunchSnapshot();
    // Repeated — an ask that was lost is cheap to make again — and the
    // first ask's time is what the run is timed from.
    expect(hide).toHaveBeenCalledTimes(2);
    expect(m.hideRequestedAt()).toBe(asked);
    jest.advanceTimersByTime(m.HIDE_REPEAT_MS);
    m.hideLaunchSnapshot();
    expect(hide).toHaveBeenCalledTimes(2);
    // A new window asks afresh.
    m.newLaunchSnapshotWindow();
    m.hideLaunchSnapshot();
    expect(hide).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
    jest.dontMock('react-native');
  });

  it('keeps Today anew after a change of look, without waiting for the next prayer', () => {
    jest.resetModules();
    jest.useFakeTimers();
    const captureNow = jest.fn();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        MihrabLaunchSnapshot: { hide: jest.fn(), setEligible: jest.fn(), setLookKey: jest.fn(), captureNow },
      },
    }));
    const m = require('../src/native/LaunchSnapshot');
    m.setLaunchSnapshotLook('a', false);
    m._setPosedKeptForTests(true);
    m.setLaunchSnapshotEligible(true);
    jest.advanceTimersByTime(m.KEEP_AFTER_MS + 10);
    // A posed picture of this look is on disk: nothing to keep.
    expect(captureNow).not.toHaveBeenCalled();
    m.setLaunchSnapshotLook('b', false);
    jest.advanceTimersByTime(m.KEEP_AFTER_MS + 10);
    expect(captureNow).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
    jest.dontMock('react-native');
  });

  it('tells native what the app looks like, and whether the system\'s night mode is part of it', () => {
    expect(ROOT).toMatch(/setLaunchSnapshotLook\(lookKeyOf\(settings\), settings\.appearance === 'system'\);/);
    // A phone on a scheduled dark theme flips night mode at dusk and
    // dawn; under an explicit theme or the Sky theme that changes nothing
    // on screen, and the picture kept across it is still this screen.
    const kt = read('android/app/src/main/java/com/prayer_times/LaunchSnapshot.kt');
    const SWIFT = read('ios/PrayerApp/MihrabLaunchSnapshot.swift');
    const BRIDGE = read('ios/PrayerApp/MihrabLaunchSnapshot.m');
    expect(kt).toMatch(/if \(night >= 0 && \(c\.uiMode and Configuration\.UI_MODE_NIGHT_MASK\) != night\) return false/);
    expect(kt).toMatch(/val night = if \(p\.getBoolean\("look_night_matters", true\)\)/);
    expect(SWIFT).toMatch(/meta\.style < 0 \|\| scene\.traitCollection\.userInterfaceStyle\.rawValue == meta\.style/);
    expect(SWIFT).toMatch(/style: nightMatters \? scene\.traitCollection\.userInterfaceStyle\.rawValue : -1/);
    expect(BRIDGE).toContain('setLookKey:(NSString *)key nightMatters:(BOOL)nightMatters');
  });
});
