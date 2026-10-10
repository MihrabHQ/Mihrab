import Foundation
import UIKit

/**
 THE LAST SCREEN, AS THE FIRST FRAME — iOS's half of what
 `LaunchSnapshot.kt` does on Android; that file has the whole story.

 In short: a cold start drew the launch screen, then an empty window while
 React Native started, then a skeleton, then Today in pieces. Instead,
 when the app is left while Today is on screen (JS says when:
 `setEligible`), the window is drawn into a picture kept in Application
 Support (out of backups). On the next cold start that picture is decoded
 from the moment the process exists and laid over the window in
 `scene(_:willConnectTo:)`, so the app's first frame is the screen itself;
 React Native builds the live one underneath, and when Today has committed
 JS calls `hide` and the picture fades into it. The hero's numbers then run
 from the picture's to the live ones (src/boot/launchWarp.ts), which needs
 what the hero was counting to when the picture was taken (`setHeroState`,
 read back by `getShownState`).

 Used only when it is the screen the person is about to get: the same
 build, under a month old, the same window size and scale, the same system
 appearance and text size, the same in-app look (`setLookKey`), and a launch
 that opens the app rather than a link, a notification or a shortcut. Gone
 after a few seconds whatever JS does.

 Not on the Mac: a window there is any size the person last dragged it to.
 */
final class LaunchSnapshotStore {
  static let shared = LaunchSnapshotStore()

  private static let maxAge: TimeInterval = 30 * 24 * 60 * 60
  private static let decodeWait: TimeInterval = 0.6
  private static let safetyHide: TimeInterval = 5
  private static let mountGrace: TimeInterval = 0.12
  private static let fade: TimeInterval = 0.26
  private static let prefix = "mihrab.launchSnapshot."

  /** Main thread only. */
  var eligible = false
  private var overlay: UIImageView?
  private(set) var shownState = ""
  private var heroTarget: Int64 = 0
  private var heroFrom: Int64 = 0
  private var pending: DispatchSemaphore?
  private let lock = NSLock()
  private let io = DispatchQueue(label: "mihrab.launch-snapshot", qos: .userInitiated)
  private let defaults = UserDefaults.standard

  private struct Meta {
    var width: Double
    var height: Double
    var scale: Double
    var style: Int
    var textSize: String
    var version: String
    var at: Int64
    var look: String
    var heroTarget: Int64
    var heroFrom: Int64
    var file: String
  }

  // MARK: What JS tells us

  func setLookKey(_ key: String) {
    if defaults.string(forKey: Self.prefix + "lookCurrent") != key {
      defaults.set(key, forKey: Self.prefix + "lookCurrent")
    }
  }

  func setHeroState(targetAt: Int64, fromAt: Int64) {
    lock.lock()
    heroTarget = targetAt
    heroFrom = fromAt
    lock.unlock()
  }

  // MARK: Keeping the screen

  /** The scene is about to stop being active, or JS asked: keep the window. */
  func capture(_ window: UIWindow?) {
    #if targetEnvironment(macCatalyst)
    return
    #else
    guard eligible, overlay == nil, let window, let scene = window.windowScene else { return }
    let bounds = window.bounds
    guard bounds.width > 0, bounds.height > 0 else { return }
    let format = UIGraphicsImageRendererFormat()
    format.scale = window.screen.scale
    format.opaque = true
    let image = UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
      window.drawHierarchy(in: bounds, afterScreenUpdates: false)
    }
    lock.lock()
    let target = heroTarget
    let from = heroFrom
    lock.unlock()
    let at = Int64(Date().timeIntervalSince1970 * 1000)
    let meta = Meta(
      width: Double(bounds.width), height: Double(bounds.height), scale: Double(format.scale),
      style: scene.traitCollection.userInterfaceStyle.rawValue,
      textSize: scene.traitCollection.preferredContentSizeCategory.rawValue,
      version: Self.buildVersion, at: at,
      look: defaults.string(forKey: Self.prefix + "lookCurrent") ?? "",
      heroTarget: target, heroFrom: from, file: "snapshot-\(at).jpg")
    io.async { self.write(image, meta) }
    NSLog("[MihrabSnapshot] kept %.0fx%.0f", bounds.width, bounds.height)
    #endif
  }

  private func write(_ image: UIImage, _ meta: Meta) {
    guard let data = image.jpegData(compressionQuality: 0.9), let dir = Self.directory() else { return }
    let url = dir.appendingPathComponent(meta.file)
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      return
    }
    save(meta)
    if let others = try? FileManager.default.contentsOfDirectory(atPath: dir.path) {
      for name in others where name != meta.file {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
      }
    }
  }

  // MARK: Showing it

  /**
   At launch, before anything slow: start decoding the kept screen if it
   could still be the one coming, so the first frame need not wait.
   */
  func preload() {
    #if targetEnvironment(macCatalyst)
    return
    #else
    guard let meta = load(), stillCurrent(meta), let dir = Self.directory() else { return }
    let url = dir.appendingPathComponent(meta.file)
    let ready = DispatchSemaphore(value: 0)
    pending = ready
    io.async {
      let image = UIImage(contentsOfFile: url.path)?.preparingForDisplay()
      self.lock.lock()
      self.decoded = image
      self.lock.unlock()
      ready.signal()
    }
    #endif
  }
  private var decoded: UIImage?

  /** In scene(_:willConnectTo:), after React Native has its root: lay the picture on top. */
  func show(in window: UIWindow, options: UIScene.ConnectionOptions) {
    guard let pending else {
      NSLog("[MihrabSnapshot] nothing kept to show")
      return
    }
    self.pending = nil
    guard options.urlContexts.isEmpty, options.notificationResponse == nil,
          options.shortcutItem == nil, options.userActivities.isEmpty,
          let meta = load(), stillCurrent(meta), let scene = window.windowScene else { return }
    let size = window.bounds.size
    guard abs(Double(size.width) - meta.width) < 0.5, abs(Double(size.height) - meta.height) < 0.5,
          abs(Double(window.screen.scale) - meta.scale) < 0.01,
          scene.traitCollection.userInterfaceStyle.rawValue == meta.style,
          scene.traitCollection.preferredContentSizeCategory.rawValue == meta.textSize else { return }
    guard pending.wait(timeout: .now() + Self.decodeWait) == .success else { return }
    lock.lock()
    let image = decoded
    decoded = nil
    lock.unlock()
    guard let image else { return }
    let view = UIImageView(frame: window.bounds)
    view.image = image
    view.contentMode = .scaleToFill
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // A tap on a picture of a button must not reach what is half-built under it.
    view.isUserInteractionEnabled = true
    view.accessibilityElementsHidden = true
    window.addSubview(view)
    overlay = view
    NSLog("[MihrabSnapshot] showing the kept screen")
    shownState = "\(meta.at),\(meta.heroTarget),\(meta.heroFrom)"
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.safetyHide) { self.hide() }
  }

  /** The live screen is committed: fade the picture into it. Idempotent. */
  func hide() {
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.mountGrace) {
      guard let view = self.overlay else { return }
      self.overlay = nil
      view.isUserInteractionEnabled = false
      UIView.animate(withDuration: Self.fade, delay: 0, options: [.curveEaseOut], animations: {
        view.alpha = 0
      }, completion: { _ in
        view.removeFromSuperview()
        view.image = nil
      })
    }
  }

  // MARK: The record

  private static var buildVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
  }

  private func stillCurrent(_ meta: Meta) -> Bool {
    let now = Date().timeIntervalSince1970 * 1000
    let age = (now - Double(meta.at)) / 1000
    guard meta.version == Self.buildVersion, age >= 0, age <= Self.maxAge else { return false }
    guard let look = defaults.string(forKey: Self.prefix + "lookCurrent") else { return false }
    return look == meta.look
  }

  private func save(_ meta: Meta) {
    let record: [String: Any] = [
      "w": meta.width, "h": meta.height, "scale": meta.scale, "style": meta.style,
      "text": meta.textSize, "version": meta.version, "at": NSNumber(value: meta.at),
      "look": meta.look, "heroTarget": NSNumber(value: meta.heroTarget),
      "heroFrom": NSNumber(value: meta.heroFrom), "file": meta.file,
    ]
    defaults.set(record, forKey: Self.prefix + "meta")
  }

  private func load() -> Meta? {
    guard let r = defaults.dictionary(forKey: Self.prefix + "meta"),
          let file = r["file"] as? String else { return nil }
    return Meta(
      width: r["w"] as? Double ?? 0, height: r["h"] as? Double ?? 0,
      scale: r["scale"] as? Double ?? 0, style: r["style"] as? Int ?? -1,
      textSize: r["text"] as? String ?? "", version: r["version"] as? String ?? "",
      at: (r["at"] as? NSNumber)?.int64Value ?? 0, look: r["look"] as? String ?? "",
      heroTarget: (r["heroTarget"] as? NSNumber)?.int64Value ?? 0,
      heroFrom: (r["heroFrom"] as? NSNumber)?.int64Value ?? 0, file: file)
  }

  private static func directory() -> URL? {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
    else { return nil }
    var dir = base.appendingPathComponent("launch-snapshot", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? dir.setResourceValues(values)
    return dir
  }
}

/** JS's half of the store: see src/native/LaunchSnapshot.ts. */
@objc(MihrabLaunchSnapshot)
final class MihrabLaunchSnapshot: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func setEligible(_ value: Bool) {
    DispatchQueue.main.async { LaunchSnapshotStore.shared.eligible = value }
  }

  @objc func setLookKey(_ key: String) {
    LaunchSnapshotStore.shared.setLookKey(key)
  }

  @objc func hide() {
    LaunchSnapshotStore.shared.hide()
  }

  @objc func captureNow() {
    DispatchQueue.main.async {
      let window = (UIApplication.shared.delegate as? AppDelegate)?.window
      LaunchSnapshotStore.shared.capture(window)
    }
  }

  @objc func setHeroState(_ targetAt: Double, fromAt: Double) {
    LaunchSnapshotStore.shared.setHeroState(targetAt: Int64(targetAt), fromAt: Int64(fromAt))
  }

  @objc func getShownState() -> NSString {
    LaunchSnapshotStore.shared.shownState as NSString
  }
}
