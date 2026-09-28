import Foundation
import UIKit

/**
 A sheet of page colour over the window, raised AT the rotation.

 The iOS half of `RotationCover.kt` — read that for the whole story. In
 short: the muṣḥaf's own cover is React, and React hears about a rotation
 after the platform has already drawn the old layout into the new shape,
 so the choppy frames showed before the fade could hide them.

 Here the moment is `viewWillTransition(to:with:)` on the root view
 controller (`MihrabRootViewController`, AppDelegate.swift), which UIKit
 calls BEFORE it animates the rotation. The cover goes on the window then,
 resizes with it through the turn, and the reader fades it off once its
 own layout has settled (`lift`, from `src/quran/rotationFade.ts`).

 Armed only while a muṣḥaf reader is in front, and raised only when the
 window actually turns between portrait and landscape. NOT ON THE MAC:
 there a window is resized, not rotated, and blanking it on every drag of
 its corner would be the opposite of smooth.
 */
@objc(MihrabRotationCover)
class MihrabRotationCover: NSObject {

  /// The one cover; the module instance and the root view controller share it.
  static let shared = Cover()

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc func constantsToExport() -> [AnyHashable: Any]! {
#if targetEnvironment(macCatalyst)
    return ["enabled": false]
#else
    return ["enabled": true]
#endif
  }

  @objc func arm(_ argb: NSNumber) {
    DispatchQueue.main.async { MihrabRotationCover.shared.arm(argb.uint32Value) }
  }

  @objc func disarm() {
    DispatchQueue.main.async { MihrabRotationCover.shared.disarm() }
  }

  @objc func lift(_ durationMs: NSNumber) {
    DispatchQueue.main.async {
      MihrabRotationCover.shared.lift(TimeInterval(durationMs.doubleValue) / 1000)
    }
  }

  /// Main thread throughout.
  final class Cover {
    /// The longest the cover may stay up without a lift.
    private static let maxSeconds: TimeInterval = 1.5

    private var color: UIColor?
    private var overlay: UIView?
    private var safety: DispatchWorkItem?

    func arm(_ argb: UInt32) {
      let c = UIColor(
        red: CGFloat((argb >> 16) & 0xFF) / 255,
        green: CGFloat((argb >> 8) & 0xFF) / 255,
        blue: CGFloat(argb & 0xFF) / 255,
        alpha: CGFloat((argb >> 24) & 0xFF) / 255
      )
      color = c
      overlay?.backgroundColor = c
    }

    func disarm() {
      color = nil
      remove()
    }

    /// From the root view controller, before UIKit animates the change.
    func willTransition(from old: CGSize, to new: CGSize, in window: UIWindow?) {
#if targetEnvironment(macCatalyst)
      return
#else
      guard let color, let window else { return }
      guard old.width > 0, old.height > 0,
            (old.width > old.height) != (new.width > new.height) else { return }
      let view = overlay ?? UIView(frame: window.bounds)
      view.layer.removeAllAnimations()
      view.backgroundColor = color
      view.alpha = 1
      view.isUserInteractionEnabled = false
      view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      if view.superview !== window {
        view.removeFromSuperview()
        view.frame = window.bounds
        window.addSubview(view)
      }
      window.bringSubviewToFront(view)
      overlay = view

      safety?.cancel()
      let item = DispatchWorkItem { [weak self] in self?.lift(0) }
      safety = item
      DispatchQueue.main.asyncAfter(deadline: .now() + Cover.maxSeconds, execute: item)
#endif
    }

    func lift(_ seconds: TimeInterval) {
      safety?.cancel()
      safety = nil
      guard let view = overlay else { return }
      guard seconds > 0 else {
        remove()
        return
      }
      UIView.animate(
        withDuration: seconds,
        delay: 0,
        options: [.beginFromCurrentState, .curveEaseInOut, .allowUserInteraction],
        animations: { view.alpha = 0 },
        completion: { [weak self] _ in
          if self?.overlay === view, view.alpha == 0 { self?.remove() }
        }
      )
    }

    private func remove() {
      safety?.cancel()
      safety = nil
      overlay?.layer.removeAllAnimations()
      overlay?.removeFromSuperview()
      overlay = nil
    }
  }
}
