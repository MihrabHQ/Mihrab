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
    // First: the kept Today screen decodes while everything below runs, so
    // the window's first frame can be it (MihrabLaunchSnapshot.swift).
    LaunchSnapshotStore.shared.preload()
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // "My location" kept up while the app is closed (optional): iOS may be
    // starting the app for a change of place, and the location manager has
    // to be there, with its delegate, to be told (BackgroundLocation.swift).
    MihrabBackgroundLocation.shared.resume()

    // Register the Live Activity background-refresh task (local rollover, no
    // server). MUST run before launch finishes. No-op when no activity exists.
    LiveActivityRefresher.registerTask()

    // The time zone changed under a running app: start its JavaScript again.
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(timeZoneChanged),
      name: NSNotification.Name.NSSystemTimeZoneDidChange,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(becameActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )

    return true
  }

  /**
   The JavaScript engine works out the zone's offset once and keeps it
   (Hermes says so itself: its cache "does not automatically detect changes
   to the system timezone", and React Native never clears it). An app left
   in memory across a change of zone — a flight, the app not closed — goes
   on reading every prayer time on the OLD clock, an hour or more wrong,
   until the process happens to be restarted. Seen on Android (2.38.3,
   Nov 2026; `BackgroundLocation.kt` reloads there); the engine is the same
   one here. Nothing in JavaScript can see it — its own clock is the thing
   that is stale — so the native side, which is told, reloads React Native:
   a new engine, the right clock. iOS posts this for a new zone, not for
   the clocks going forward or back within one.
   */
  ///
  /// Away from the screen it is reloaded at once all the same — the
  /// background update for a move runs in this engine, and on the old clock
  /// would write the alerts an hour off — and once more when the app is
  /// next active: on Android a reload with the window not shown came back
  /// to a blank page, and a second reload in front mended it.
  @objc private func timeZoneChanged() {
    DispatchQueue.main.async {
      if UIApplication.shared.applicationState != .active {
        self.zoneReloadPending = true
      }
      RCTTriggerReloadCommandListeners("time zone changed")
    }
  }

  @objc private func becameActive() {
    guard zoneReloadPending else { return }
    zoneReloadPending = false
    RCTTriggerReloadCommandListeners("time zone changed while in the background")
  }

  private var zoneReloadPending = false
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
      if !connectionOptions.urlContexts.isEmpty {
        RCTLinkingManager.scene(scene, openURLContexts: connectionOptions.urlContexts)
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
    // The last Today screen over the window, as its first frame, until the
    // live one has committed under it — MihrabLaunchSnapshot.swift.
    LaunchSnapshotStore.shared.show(in: window, options: connectionOptions)
    // Between the launch screen and React Native's first frame the window
    // showed the root view's own ground — the system's white or black, not
    // the launch screen's colour. The same colour as the launch screen now,
    // so nothing changes until the app has something to show.
    window.backgroundColor = LaunchSnapshotStore.launchColor
    window.rootViewController?.view.backgroundColor = LaunchSnapshotStore.launchColor
  }

  /// Hand `mihrab://…` to React Native's Linking module, which turns it into
  /// the `url` event React Navigation's linking config listens for.
  ///
  /// BY THE SCENE'S OWN DOOR. React Native 0.88 gave RCTLinkingManager one
  /// (`scene:openURLContexts:`) and made the app delegate's
  /// (`application:openURL:options:`) answer NO and do nothing in an app
  /// that has a scene delegate — which this is. This method went on calling
  /// the old one: every link that found the app already running was
  /// accepted by the system and dropped, so a widget tap or a `mihrab://`
  /// link changed nothing unless it also launched the app. Found on an
  /// iPhone, with main installed over 2.39.0.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    RCTLinkingManager.scene(scene, openURLContexts: URLContexts)
  }

  /** Still on screen: the moment to keep it for the next launch's first frame. */
  func sceneWillResignActive(_ scene: UIScene) {
    LaunchSnapshotStore.shared.capture(window)
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
