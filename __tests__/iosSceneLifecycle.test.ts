/**
 * The iOS app has a scene, and keeps one.
 *
 * From the iOS 27 SDK on, an app with no scene life cycle does not launch
 * on iOS/iPadOS 27: UIKit stops it before the first frame with
 * "UIScene life cycle is required for apps built with this SDK". It is not
 * a crash anybody's code can catch, and it does not happen on the SDK
 * before, so nothing in development showed it.
 *
 * Every iOS build from 2.22.0 to 2.27.1 had the iOS 27 SDK and no scene —
 * 2.22.0 and 2.23.0 from Xcode Cloud, which moved to Xcode 27 on
 * 2026-09-16, and 2.24.1 on from this Mac; 2.24.0, built with Xcode 26,
 * was the only one in that run that opened on 27. App Review rejected
 * 2.27.1 on an iPad Air running iPadOS 27.0 (2026-09-28), by which time
 * App Store Connect had 38 opt-in crash reports from iOS 27.0 (2.25.1 and
 * 2.23.0) and 2.27.0 was live. Reproduced the same day in the iOS 27
 * simulator, with that exact message.
 *
 * So these are the three things that make it launch, and the two that make
 * a widget tap still land where it points once it does.
 */
import { readFileSync } from 'fs';
import path from 'path';

const IOS = path.join(__dirname, '..', 'ios', 'PrayerApp');
const plist = readFileSync(path.join(IOS, 'Info.plist'), 'utf8');
const swift = readFileSync(path.join(IOS, 'AppDelegate.swift'), 'utf8');

/** The source without its comments, so a comment cannot satisfy a check. */
const code = swift.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('iOS scene life cycle', () => {
  it('declares a scene manifest, one scene, delegated to SceneDelegate', () => {
    const manifest = plist.slice(plist.indexOf('<key>UIApplicationSceneManifest</key>'));
    expect(plist).toContain('<key>UIApplicationSceneManifest</key>');
    expect(manifest).toMatch(
      /<key>UIApplicationSupportsMultipleScenes<\/key>\s*<false\/>/,
    );
    expect(manifest).toContain('<key>UIWindowSceneSessionRoleApplication</key>');
    expect(manifest).toMatch(
      /<key>UISceneDelegateClassName<\/key>\s*<string>\$\(PRODUCT_MODULE_NAME\)\.SceneDelegate<\/string>/,
    );
  });

  it('has the SceneDelegate the manifest names, and it makes the window', () => {
    expect(code).toMatch(/class SceneDelegate: UIResponder, UIWindowSceneDelegate/);
    expect(code).toMatch(/UIWindow\(windowScene: windowScene\)/);
    expect(code).toMatch(/startReactNative\(/);
  });

  it('no longer makes a window in the app delegate', () => {
    const appDelegate = code.slice(code.indexOf('class AppDelegate'), code.indexOf('class SceneDelegate'));
    expect(appDelegate).not.toMatch(/UIWindow\(/);
    expect(appDelegate).not.toMatch(/startReactNative/);
  });

  it('starts the engine for a move that finds none, and no window with it', () => {
    // iOS may start a closed app in the background for a change of place
    // and give it no scene: React Native starts where the window is made,
    // so the move waited for an engine that never came, and the alerts
    // stayed on the town left behind until the app was opened.
    const bg = readFileSync(path.join(IOS, 'BackgroundLocation.swift'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(bg).toMatch(/pending = move\s*if let onMove \{\s*onMove\(move\)\s*\} else \{\s*needsEngine\?\(\)/);
    const appDelegate = code.slice(code.indexOf('class AppDelegate'), code.indexOf('class SceneDelegate'));
    expect(appDelegate).toMatch(/needsEngine = \{ \[weak self\] in\s*self\?\.startEngineWithoutWindow\(\)/);
    // Only when there is no engine and a move is waiting; the JavaScript, no view.
    expect(appDelegate).toMatch(/guard !factory\.rootViewFactory\.hasEngine else \{ return \}/);
    expect(code).toMatch(/var hasEngine: Bool \{ value\(forKey: "reactHost"\) != nil \}/);
    // …and the library still has the property that is asked for by name.
    expect(
      readFileSync(
        path.join(__dirname, '..', 'node_modules/react-native/Libraries/AppDelegate/RCTRootViewFactory.h'),
        'utf8',
      ),
    ).toMatch(/@property \(nonatomic, strong, nullable\) RCTHost \*reactHost;/);
    expect(appDelegate).toMatch(/guard MihrabBackgroundLocation\.shared\.pending != nil else \{ return \}/);
    expect(appDelegate).toMatch(/rootViewFactory\.startEngine\(/);
    // As Objective-C calls it, so the dev menu's configuration can be nil —
    // it is, in a release build, and a made-up one crashed the app.
    expect(code).toMatch(
      /NSSelectorFromString\(\s*"initializeReactHostWithLaunchOptions:bundleConfiguration:devMenuConfiguration:"/,
    );
    expect(code).not.toMatch(/RCTDevMenuConfiguration\.default/);
    expect(
      readFileSync(
        path.join(__dirname, '..', 'node_modules/react-native/Libraries/AppDelegate/RCTRootViewFactory.h'),
        'utf8',
      ),
    ).toMatch(/- \(void\)initializeReactHostWithLaunchOptions:\(NSDictionary \*__nullable\)launchOptions\s+bundleConfiguration:\(RCTBundleConfiguration \*\)bundleConfiguration\s+devMenuConfiguration:\(RCTDevMenuConfiguration \*\)devMenuConfiguration;/);
    // The link that later opens the app is not that engine's launch link:
    // it is handed over when the first screen is up.
    expect(code).toMatch(/let engineWasRunning = app\.reactNativeFactory\?\.rootViewFactory\.hasEngine == true/);
    expect(code).toMatch(/RCTContentDidAppearNotification[\s\S]{0,260}RCTLinkingManager\.scene\(scene, openURLContexts: contexts\)/);
    // And the entry of the JavaScript listens before any screen.
    const index = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    expect(index).toMatch(/startBackgroundMoveListener\(\)/);
  });

  it('hands a launching link to Linking.getInitialURL', () => {
    expect(code).toMatch(/connectionOptions\.urlContexts/);
    expect(code).toMatch(/launchOptions\[\.url\]/);
  });

  it('hands a link that arrives while running to RCTLinkingManager', () => {
    expect(code).toMatch(/func scene\(_ scene: UIScene, openURLContexts/);
    // By the scene's door. From React Native 0.88 the app delegate's
    // (`RCTLinkingManager.application(_:open:options:)`) answers NO and does
    // nothing in an app with a scene delegate: called from here, as it was,
    // every link that found the app running was dropped.
    expect(code).toMatch(/RCTLinkingManager\.scene\(scene, openURLContexts: URLContexts\)/);
    expect(code).toMatch(/RCTLinkingManager\.scene\(scene, openURLContexts: connectionOptions\.urlContexts\)/);
    expect(code).not.toMatch(/RCTLinkingManager\.application\(/);
    // …and the library still has that door, and still shuts the other.
    const rn = readFileSync(
      path.join(__dirname, '..', 'node_modules/react-native/Libraries/LinkingIOS/RCTLinkingManager.mm'),
      'utf8',
    );
    expect(rn).toMatch(/\+ \(void\)scene:\(UIScene \*\)scene openURLContexts:/);
  });

  it('is checked on the archived bundle before the App Store build is exported', () => {
    const sh = readFileSync(
      path.join(__dirname, '..', 'scripts', 'build-ios-appstore.sh'),
      'utf8',
    );
    const gate = sh.indexOf('UIApplicationSceneManifest:UISceneConfigurations');
    const exported = sh.indexOf('xcodebuild -exportArchive');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(exported);
    expect(sh).toMatch(/runtime_name="_TtC\$\{#module\}\$\{module\}\$\{#class\}\$\{class\}"/);
  });

  it('still queues the Live Activity refresh on the way to the background', () => {
    expect(code).toMatch(/func sceneDidEnterBackground[\s\S]*?LiveActivityRefresher\.scheduleRefresh\(\)/);
    expect(code).toMatch(/LiveActivityRefresher\.registerTask\(\)/);
  });
});
