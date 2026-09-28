/**
 * The iOS app has a scene, and keeps one.
 *
 * From the iOS 27 SDK on, an app with no scene life cycle does not launch
 * on iOS/iPadOS 27: UIKit stops it before the first frame with
 * "UIScene life cycle is required for apps built with this SDK". It is not
 * a crash anybody's code can catch, and it does not happen on the SDK
 * before, so nothing in development showed it.
 *
 * 2.25.0 was the first build archived with Xcode 27, and it and every build
 * after it to 2.27.1 had no scene. App Review rejected 2.27.1 on an iPad
 * Air running iPadOS 27.0 (2026-09-28) — by which time 2.27.0 was live and
 * would not open for anyone on 27. Reproduced the same day in the iOS 27
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

  it('hands a launching link to Linking.getInitialURL', () => {
    expect(code).toMatch(/connectionOptions\.urlContexts/);
    expect(code).toMatch(/launchOptions\[\.url\]/);
  });

  it('hands a link that arrives while running to RCTLinkingManager', () => {
    expect(code).toMatch(/func scene\(_ scene: UIScene, openURLContexts/);
    expect(code).toMatch(/RCTLinkingManager\.application\(/);
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
