import CoreLocation
import Foundation
import React
import UIKit

/**
 "My location" kept up while the app is closed — the iPhone half, optional
 and off until asked for (Settings → Location). A PREVIEW: built to the
 same rules as Android's (`BackgroundLocation.kt`) and not yet proven on
 many iPhones.

 WHAT IT COSTS. It uses iOS's two low-power location services and nothing
 else. The significant-change service: iOS itself watches the cell towers
 the phone is already talking to and wakes the app when the phone has moved
 a long way — hundreds of metres at the least, usually kilometres. And the
 visits service: iOS tells the app when the phone has arrived somewhere and
 stayed — which is what reaches an iPad with no cellular radio, and a phone
 whose towers did not change hands on the way. Both are iOS's own
 watching, shared by every app that asks; this app never requests a
 position in the background, and nothing is polled. iOS starts the app again for such a change
 even after it was closed.

 WHAT IT DOES WITH ONE. Nothing, unless the reader turned the setting on
 and iOS allows "Always". Then: a position newer than the app's own place
 and twenty kilometres or more from it is handed to the app's JavaScript
 (`LocationMoved` in `location/backgroundLocation.ts`), which names the new
 town, moves "My location" and writes the alerts and the widgets again —
 the same code as when the app is opened. At most once in half an hour for
 the same destination. A walk across town is not a move.

 The store is separate from the React Native module on purpose: iOS may
 start the app for a change before any JavaScript exists, and the location
 manager must be there, with its delegate, when it does (`resume()` from
 the app delegate). The position waits in `pending` until JavaScript asks.
 */
@objc(MihrabBackgroundLocation)
final class MihrabBackgroundLocation: NSObject, CLLocationManagerDelegate {
  @objc static let shared = MihrabBackgroundLocation()

  static let moveMeters: CLLocationDistance = 20_000
  private static let handoffGap: TimeInterval = 30 * 60
  private let defaults = UserDefaults.standard
  private var manager: CLLocationManager?
  private var askDone: ((Bool) -> Void)?
  private var task: UIBackgroundTaskIdentifier = .invalid

  /// A move waiting for JavaScript: latitude, longitude, timestamp (ms).
  private(set) var pending: [String: Double]?
  /// Set while JavaScript is listening.
  var onMove: (([String: Double]) -> Void)?

  private enum Key {
    static let enabled = "mihrab.bgLocation.enabled"
    static let placeLat = "mihrab.bgLocation.placeLat"
    static let placeLng = "mihrab.bgLocation.placeLng"
    static let placeAt = "mihrab.bgLocation.placeAt"
    static let handoffAt = "mihrab.bgLocation.handoffAt"
    static let handoffLat = "mihrab.bgLocation.handoffLat"
    static let handoffLng = "mihrab.bgLocation.handoffLng"
  }

  /// iPhone and iPad only: the Mac has no significant-change service.
  var offered: Bool {
    #if targetEnvironment(macCatalyst)
    return false
    #else
    return CLLocationManager.significantLocationChangeMonitoringAvailable()
    #endif
  }

  var enabled: Bool { defaults.bool(forKey: Key.enabled) }

  private func locationManager() -> CLLocationManager {
    if let m = manager { return m }
    let m = CLLocationManager()
    m.delegate = self
    manager = m
    return m
  }

  var permitted: Bool {
    guard offered else { return false }
    return locationManager().authorizationStatus == .authorizedAlways
  }

  /// Called at every launch — also the launches iOS makes for a change.
  @objc func resume() {
    guard offered, enabled else { return }
    DispatchQueue.main.async { self.apply() }
  }

  private func apply() {
    guard offered else { return }
    let m = locationManager()
    if enabled && m.authorizationStatus == .authorizedAlways {
      m.startMonitoringSignificantLocationChanges()
      m.startMonitoringVisits()
    } else {
      m.stopMonitoringSignificantLocationChanges()
      m.stopMonitoringVisits()
    }
  }

  func setEnabled(_ on: Bool) {
    defaults.set(on, forKey: Key.enabled)
    DispatchQueue.main.async { self.apply() }
  }

  /// The place the app is on. The app says it at every launch, found or
  /// not, so the place it already has changes nothing — above all not WHEN
  /// it was found (`confirmPlace`). A new place is as of now.
  func setPlace(latitude: Double, longitude: Double) {
    if defaults.object(forKey: Key.placeLat) != nil,
       defaults.double(forKey: Key.placeLat) == latitude,
       defaults.double(forKey: Key.placeLng) == longitude {
      return
    }
    defaults.set(latitude, forKey: Key.placeLat)
    defaults.set(longitude, forKey: Key.placeLng)
    defaults.set(Date().timeIntervalSince1970, forKey: Key.placeAt)
  }

  /// A fresh position has just said the place is where the phone is:
  /// positions older than now are not news.
  func confirmPlace() {
    defaults.set(Date().timeIntervalSince1970, forKey: Key.placeAt)
  }

  /// Ask iOS for "Always". iOS shows its question once; after that only
  /// the Settings app can change the answer, and this reports what it is.
  func requestAlways(_ done: @escaping (Bool) -> Void) {
    DispatchQueue.main.async {
      guard self.offered else { return done(false) }
      let m = self.locationManager()
      switch m.authorizationStatus {
      case .authorizedAlways:
        done(true)
      case .denied, .restricted:
        done(false)
      default:
        self.askDone = done
        m.requestAlwaysAuthorization()
        // No answer comes back when iOS decides not to ask again.
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
          self.answerAsk()
        }
      }
    }
  }

  private func answerAsk() {
    guard let done = askDone else { return }
    askDone = nil
    done(locationManager().authorizationStatus == .authorizedAlways)
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    // "When in use" while the question is up is not the answer yet: iOS
    // reports it first when "Always" is asked of a reader who had none.
    if manager.authorizationStatus != .notDetermined,
       !(askDone != nil && manager.authorizationStatus == .authorizedWhenInUse) {
      answerAsk()
    }
    apply()
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else { return }
    consider(location)
  }

  func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
    // An arrival (no departure yet) at a place iOS could put on the map.
    guard visit.departureDate == Date.distantFuture,
          CLLocationCoordinate2DIsValid(visit.coordinate),
          visit.horizontalAccuracy >= 0 else { return }
    // As of now, not of the arrival: iOS tells of a visit some minutes in,
    // and the phone is still there.
    consider(CLLocation(
      coordinate: visit.coordinate,
      altitude: 0,
      horizontalAccuracy: visit.horizontalAccuracy,
      verticalAccuracy: -1,
      timestamp: Date()
    ))
  }

  /// A position iOS has handed over: is it a move the app should update for?
  private func consider(_ location: CLLocation) {
    guard enabled else { return }
    guard defaults.object(forKey: Key.placeLat) != nil else { return }
    // Older than the app's own place: not news.
    guard location.timestamp.timeIntervalSince1970 > defaults.double(forKey: Key.placeAt) else { return }
    let place = CLLocation(
      latitude: defaults.double(forKey: Key.placeLat),
      longitude: defaults.double(forKey: Key.placeLng)
    )
    guard location.distance(from: place) >= MihrabBackgroundLocation.moveMeters else { return }
    let now = Date().timeIntervalSince1970
    // Only while the place is still the one the app was updated for: moved
    // since (the app opened somewhere else), that destination is news again.
    let handoffAt = defaults.double(forKey: Key.handoffAt)
    if now - handoffAt < MihrabBackgroundLocation.handoffGap,
       defaults.double(forKey: Key.placeAt) <= handoffAt {
      let last = CLLocation(
        latitude: defaults.double(forKey: Key.handoffLat),
        longitude: defaults.double(forKey: Key.handoffLng)
      )
      if location.distance(from: last) < MihrabBackgroundLocation.moveMeters { return }
    }
    defaults.set(now, forKey: Key.handoffAt)
    defaults.set(location.coordinate.latitude, forKey: Key.handoffLat)
    defaults.set(location.coordinate.longitude, forKey: Key.handoffLng)

    let move: [String: Double] = [
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
    ]
    // iOS gives a woken app a few seconds; ask for the half minute the
    // update needs, and give it back when JavaScript says it is done.
    beginTask()
    // Kept until JavaScript says the update is written (`finish`), not
    // only until it is handed over: a reload of the JavaScript in between
    // (a new time zone, on landing) ends the update half done, and the
    // new engine asks for it again (`takePending`).
    pending = move
    onMove?(move)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Nothing to do: the next change is delivered as usual.
  }

  /// The move waiting for JavaScript, if any. Left in place until `finish`.
  func takePending() -> [String: Double]? {
    pending
  }

  private func beginTask() {
    guard task == .invalid else { return }
    task = UIApplication.shared.beginBackgroundTask(withName: "MihrabLocationMoved") { [weak self] in
      self?.endTask()
    }
  }

  func endTask() {
    DispatchQueue.main.async {
      self.pending = nil
      guard self.task != .invalid else { return }
      UIApplication.shared.endBackgroundTask(self.task)
      self.task = .invalid
    }
  }
}

/// The React Native face of `MihrabBackgroundLocation`. The same name and
/// calls as Android's module, so the JavaScript is one piece.
@objc(BackgroundLocation)
final class BackgroundLocation: RCTEventEmitter {
  static let eventName = "BackgroundLocationMoved"
  private let store = MihrabBackgroundLocation.shared

  @objc override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { [BackgroundLocation.eventName] }

  override func startObserving() {
    store.onMove = { [weak self] move in
      self?.sendEvent(withName: BackgroundLocation.eventName, body: move)
    }
  }

  override func stopObserving() {
    store.onMove = nil
  }

  @objc(status:rejecter:)
  func status(_ resolve: @escaping RCTPromiseResolveBlock, rejecter _: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      resolve([
        "offered": self.store.offered,
        "enabled": self.store.enabled,
        "permitted": self.store.permitted,
      ])
    }
  }

  @objc(setEnabled:resolver:rejecter:)
  func setEnabled(_ on: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter _: @escaping RCTPromiseRejectBlock) {
    store.setEnabled(on)
    DispatchQueue.main.async {
      resolve(self.store.enabled && self.store.permitted)
    }
  }

  @objc(setPlace:longitude:)
  func setPlace(_ latitude: Double, longitude: Double) {
    store.setPlace(latitude: latitude, longitude: longitude)
  }

  @objc func confirmPlace() {
    store.confirmPlace()
  }

  @objc(requestAlways:rejecter:)
  func requestAlways(_ resolve: @escaping RCTPromiseResolveBlock, rejecter _: @escaping RCTPromiseRejectBlock) {
    store.requestAlways { resolve($0) }
  }

  @objc(takePending:rejecter:)
  func takePending(_ resolve: @escaping RCTPromiseResolveBlock, rejecter _: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { resolve(self.store.takePending()) }
  }

  @objc func finish() {
    store.endTask()
  }
}
