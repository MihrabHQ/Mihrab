import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

/**
 The app, as the PROCESS: one React Native factory for as long as it runs.

 The WINDOW is not made here any more. It belongs to `SceneDelegate` below,
 because iOS 27 refuses to launch an app built with its SDK that has no
 scene: UIKit stops it at launch with "UIScene life cycle is required for
 apps built with this SDK". That is what every build from 2.22.0 to
 2.27.1 did on iOS/iPadOS 27 (all but 2.24.0 were built with Xcode 27) —
 App Review rejected 2.27.1 for it on an iPad Air, and 2.27.0 was live.

 What stays here is what is per-process, not per-window: the factory, and
 the background task, which iOS requires registered before launch ends.
 */
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  /// The scene's window, mirrored here for code that still asks the app
  /// delegate for "the" window. `SceneDelegate` sets it; nothing here does.
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // Register the Live Activity background-refresh task (local rollover, no
    // server). MUST run before launch finishes. No-op when no activity exists.
    LiveActivityRefresher.registerTask()

    return true
  }
}

/**
 The window, and the links that arrive at it.

 One scene, never more (`UIApplicationSupportsMultipleScenes` is false in
 Info.plist): Mihrab is one app with one navigation stack, and a second
 window would be a second React tree with its own idea of where you are.

 A LINK NOW ARRIVES IN TWO PLACES, and both are needed. A widget tap that
 LAUNCHES the app comes in `connectionOptions.urlContexts`; one that finds
 it already running comes to `scene(_:openURLContexts:)`. The app
 delegate's `application(_:open:options:)` is never called for a
 scene-based app, so without both a widget opens Mihrab on whatever screen
 it was last on — the link accepted by the system and silently dropped.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var app: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene, let app else { return }
    let window = UIWindow(windowScene: windowScene)

    // A scene can be disconnected while the process lives on — iPadOS
    // reclaiming a backgrounded app's scene, or the Mac window closed and
    // reopened from the Dock — and connected again later. The React tree
    // outlived it, so move it into the new window rather than starting a
    // second one beside it.
    if let existing = app.window?.rootViewController {
      app.window?.rootViewController = nil
      window.rootViewController = existing
      self.window = window
      app.window = window
      window.makeKeyAndVisible()
      if let url = connectionOptions.urlContexts.first?.url {
        RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
      }
      return
    }

    self.window = window
    app.window = window

    // `Linking.getInitialURL()` reads the launching link from the launch
    // options, as it always has — so that is where it is put.
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      if let source = context.options.sourceApplication {
        launchOptions[.sourceApplication] = source
      }
    }

    app.reactNativeFactory?.startReactNative(
      withModuleName: "PrayerApp",
      in: window,
      launchOptions: launchOptions.isEmpty ? nil : launchOptions
    )
  }

  /// Hand `mihrab://…` to React Native's Linking module, which turns it into
  /// the `url` event React Navigation's linking config listens for.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
      if let source = context.options.sourceApplication {
        options[.sourceApplication] = source
      }
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    // Queue the next Live Activity refresh as we background, so iOS has a
    // pending task to run while suspended (no-op when no activity is
    // running). This was `applicationDidEnterBackground`, which a
    // scene-based app never receives.
    LiveActivityRefresher.scheduleRefresh()
  }
}

/**
 The root view controller React Native would make — a plain
 `UIViewController` — with one addition: it hears about a rotation BEFORE
 UIKit animates it, which nothing in JavaScript can, and tells the
 muṣḥaf's rotation cover (MihrabRotationCover.swift).
 */
final class MihrabRootViewController: UIViewController {
  override func viewWillTransition(
    to size: CGSize,
    with coordinator: UIViewControllerTransitionCoordinator
  ) {
    MihrabRotationCover.shared.willTransition(
      from: view.bounds.size,
      to: size,
      in: view.window
    )
    super.viewWillTransition(to: size, with: coordinator)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func createRootViewController() -> UIViewController {
    MihrabRootViewController()
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
