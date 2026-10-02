import AVFoundation
import Foundation
import React

/**
 "Headphones out, playback pauses" — the iOS half of a rule the app already
 keeps on Android.

 Android: `handleAudioBecomingNoisy` in `setupPlayer` makes track-player
 listen for `ACTION_AUDIO_BECOMING_NOISY` and pause. iOS has the same
 convention — Apple's AVAudioSession guide: "if the user unplugs the
 headphones, you should pause playback" — but neither track-player nor
 SwiftAudioEx observes `AVAudioSession.routeChangeNotification`, so a
 recitation playing through earbuds would have gone on playing through the
 speaker when they were pulled out.

 This module observes the notification and forwards only the reason that
 matters, `.oldDeviceUnavailable`: the previous output route (headphones,
 a Bluetooth speaker, CarPlay) stopped being available. Every other reason
 (`.newDeviceAvailable`, `.categoryChange`, ...) is one where playback
 should carry on. The decision about WHAT to pause stays in `playback.ts`,
 which is the only place that knows whether anything is playing.
 */
@objc(AudioRouteWatcher)
class AudioRouteWatcher: RCTEventEmitter {
  static let eventName = "AudioRouteLost"
  private var hasListeners = false
  private var observer: NSObjectProtocol?

  @objc override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    return [AudioRouteWatcher.eventName]
  }

  override func startObserving() {
    hasListeners = true
    if observer == nil {
      observer = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] note in
        self?.routeChanged(note)
      }
    }
  }

  override func stopObserving() {
    hasListeners = false
    if let o = observer {
      NotificationCenter.default.removeObserver(o)
      observer = nil
    }
  }

  private func routeChanged(_ note: Notification) {
    guard hasListeners,
          let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: raw),
          reason == .oldDeviceUnavailable
    else { return }
    // Name the route that went away, for the log line in JS only; the
    // decision does not depend on it.
    let previous = note.userInfo?[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription
    let port = previous?.outputs.first?.portType.rawValue ?? ""
    sendEvent(withName: AudioRouteWatcher.eventName, body: ["previousPort": port])
  }
}
