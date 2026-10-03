import CryptoKit
import Foundation
import React
#if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
import ActivityKit
import AlarmKit
import SwiftUI
#endif

/**
 Prayer alarms through AlarmKit (iOS 26) — issue #63.

 The iPhone half of "full-screen prayer alerts". A notification's sound obeys
 the silent switch and Focus, and a notification is a banner; an AlarmKit alarm
 is neither. Apple: it "presents at a pre-determined time … overrides both a
 device's focus and silent mode, if necessary", and takes the whole screen on
 a locked phone, with Stop and Snooze. That is what the issue asks for, and it
 is a public API any app may use — unlike Critical Alerts, which Apple grants
 to health and safety apps.

 WHAT IS AND IS NOT HERE

 - Only the five prayers, the same rule as Android. JS decides which and
   passes them in; this module draws nothing it was not handed.
 - Snooze is AlarmKit's own: the secondary button with `.countdown`
   behaviour re-rings after `postAlert`. That needs the widget extension's
   countdown face (`PrayerAlarmWidget`), which Apple says must exist.
 - The adhan is the bundled .caf, named WITH its extension (a bare name falls
   back to the system tone) and from the MAIN bundle (Library/Sounds is not
   read). It plays once, and the system caps it at 30 s — the same clips the
   notification already uses. The user's own imported adhan lives in
   Library/Sounds, so it cannot be used here and the alarm uses the system
   alarm tone instead.
 - No App Intents: Stop and Snooze are handled by the system. Logging the
   prayer stays on the (silent) notification that accompanies the alarm.

 DIFFING, NOT REPLACING

 JS calls `schedule` on every sync (every app focus). A blind
 cancel-and-recreate would STOP an alarm that is ringing at that moment — the
 phone is unlocked, Fajr is sounding, the person opens the app — so only
 alarms that are still merely scheduled are ever cancelled, and an alarm
 whose id is already registered is left alone. The id is a hash of everything
 the alarm says and sounds like, so a change of language, adhan or time makes
 a new id and the old one goes.
 */
@objc(PrayerAlarms)
class PrayerAlarms: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// Whether this build and this OS can schedule alarms at all.
  @objc(isAvailable:rejecter:)
  func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 26.0, *) {
      resolve(true)
      return
    }
    #endif
    resolve(false)
  }

  /// "authorized" | "denied" | "notDetermined" | "unavailable".
  @objc(authorizationState:rejecter:)
  func authorizationState(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 26.0, *) {
      resolve(Self.name(of: AlarmManager.shared.authorizationState))
      return
    }
    #endif
    resolve("unavailable")
  }

  /// Ask for permission (the system prompt shows once; afterwards this just
  /// reports the answer). Resolves with the resulting state.
  @objc(requestAccess:rejecter:)
  func requestAccess(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 26.0, *) {
      Task {
        do {
          let state = try await AlarmManager.shared.requestAuthorization()
          resolve(Self.name(of: state))
        } catch {
          resolve("denied")
        }
      }
      return
    }
    #endif
    resolve("unavailable")
  }

  /// Make the registered prayer alarms be exactly `alarms`.
  ///
  /// Each: `{ at (epoch ms), title, prayer, sound (".caf" name or ""),
  /// stopLabel, snoozeLabel, snoozeMinutes, tint ("#rrggbb") }`.
  /// Resolves with the number of alarms now registered.
  @objc(schedule:resolver:rejecter:)
  func schedule(
    _ alarms: [[String: Any]],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 26.0, *) {
      Self.serially {
        do {
          resolve(try await Self.reconcile(alarms))
        } catch {
          reject("alarm_schedule", error.localizedDescription, error)
        }
      }
      return
    }
    #endif
    resolve(0)
  }

  /// Cancel every alarm that has not rung yet.
  @objc(clear:rejecter:)
  func clear(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 26.0, *) {
      Self.serially {
        _ = try? await Self.reconcile([])
        resolve(nil)
      }
      return
    }
    #endif
    resolve(nil)
  }

  #if canImport(AlarmKit) && !targetEnvironment(macCatalyst)

  /// One reconcile at a time. JS syncs on every focus and on several
  /// settings changes, and two reconciles interleaving would each see the
  /// other's half-registered set and register the same alarm twice.
  private static let lock = NSLock()
  private static var tail: Task<Void, Never>?

  private static func serially(_ work: @escaping @Sendable () async -> Void) {
    lock.lock()
    let previous = tail
    tail = Task {
      await previous?.value
      await work()
    }
    lock.unlock()
  }

  @available(iOS 26.0, *)
  private static func name(of state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "denied"
    }
  }

  /// A stable UUID from a string, so the same alarm has the same id on every
  /// sync (UUID version-5 style: SHA-256, first 16 bytes, version/variant set).
  @available(iOS 26.0, *)
  private static func uuid(for key: String) -> UUID {
    var bytes = Array(SHA256.hash(data: Data(key.utf8)).prefix(16))
    bytes[6] = (bytes[6] & 0x0F) | 0x50
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    return UUID(uuid: (
      bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
      bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    ))
  }

  @available(iOS 26.0, *)
  private static func color(_ hex: String?) -> Color {
    guard let hex, hex.count == 7, hex.hasPrefix("#"),
          let v = UInt32(hex.dropFirst(), radix: 16)
    else { return Color(red: 0.12, green: 0.37, blue: 0.29) }
    return Color(
      red: Double((v >> 16) & 0xFF) / 255,
      green: Double((v >> 8) & 0xFF) / 255,
      blue: Double(v & 0xFF) / 255
    )
  }

  /// The alert's face. From iOS 26.1 the system supplies Stop; 26.0 still
  /// requires the app to describe it, through an initialiser Apple has since
  /// deprecated — so both are here, and the one the OS has is the one used.
  @available(iOS 26.0, *)
  private static func alert(
    title: String,
    stopLabel: String,
    stopTint: Color,
    secondary: AlarmButton
  ) -> AlarmPresentation.Alert {
    let resource = LocalizedStringResource(stringLiteral: title)
    if #available(iOS 26.1, *) {
      return AlarmPresentation.Alert(
        title: resource,
        secondaryButton: secondary,
        secondaryButtonBehavior: .countdown
      )
    }
    return legacyAlert(resource, stopLabel: stopLabel, stopTint: stopTint, secondary: secondary)
  }

  @available(iOS, introduced: 26.0, deprecated: 26.1)
  private static func legacyAlert(
    _ title: LocalizedStringResource,
    stopLabel: String,
    stopTint: Color,
    secondary: AlarmButton
  ) -> AlarmPresentation.Alert {
    AlarmPresentation.Alert(
      title: title,
      stopButton: AlarmButton(
        text: LocalizedStringResource(stringLiteral: stopLabel),
        textColor: .white,
        systemImageName: "checkmark"
      ),
      secondaryButton: secondary,
      secondaryButtonBehavior: .countdown
    )
  }

  @available(iOS 26.0, *)
  private static func reconcile(_ wanted: [[String: Any]]) async throws -> Int {
    let manager = AlarmManager.shared
    let existing = (try? manager.alarms) ?? []

    var desired: [UUID: [String: Any]] = [:]
    for item in wanted {
      guard let at = (item["at"] as? NSNumber)?.doubleValue,
            let title = item["title"] as? String
      else { continue }
      let fingerprint = [
        String(Int64(at)), title,
        item["sound"] as? String ?? "",
        item["snoozeLabel"] as? String ?? "",
        String((item["snoozeMinutes"] as? NSNumber)?.intValue ?? 10),
      ].joined(separator: "|")
      desired[uuid(for: fingerprint)] = item
    }

    // Only what has not rung yet may be taken away. An alarm that is
    // alerting, or counting down a snooze, belongs to the person now.
    for alarm in existing where alarm.state == .scheduled && desired[alarm.id] == nil {
      try? manager.cancel(id: alarm.id)
    }

    if desired.isEmpty { return 0 }
    guard manager.authorizationState == .authorized else { return 0 }

    let have = Set(existing.map { $0.id })
    var count = existing.filter { desired[$0.id] != nil }.count
    for (id, item) in desired where !have.contains(id) {
      guard let at = (item["at"] as? NSNumber)?.doubleValue else { continue }
      let date = Date(timeIntervalSince1970: at / 1000)
      if date <= Date().addingTimeInterval(1) { continue }
      let title = item["title"] as? String ?? ""
      let snoozeLabel = item["snoozeLabel"] as? String ?? "Snooze"
      let minutes = max(1, (item["snoozeMinutes"] as? NSNumber)?.intValue ?? 10)
      let tint = color(item["tint"] as? String)
      let sound = (item["sound"] as? String) ?? ""

      let snoozeButton = AlarmButton(
        text: LocalizedStringResource(stringLiteral: snoozeLabel),
        textColor: .white,
        systemImageName: "clock.arrow.circlepath"
      )
      let alert = Self.alert(
        title: title,
        stopLabel: (item["stopLabel"] as? String) ?? "Stop",
        stopTint: tint,
        secondary: snoozeButton
      )
      // Counting down after a Snooze needs a countdown face and a paused
      // face; the widget extension draws them (PrayerAlarmWidget).
      let countdown = AlarmPresentation.Countdown(
        title: LocalizedStringResource(stringLiteral: title),
        pauseButton: AlarmButton(
          text: LocalizedStringResource(stringLiteral: "Pause"),
          textColor: tint,
          systemImageName: "pause.fill"
        )
      )
      let paused = AlarmPresentation.Paused(
        title: LocalizedStringResource(stringLiteral: title),
        resumeButton: AlarmButton(
          text: LocalizedStringResource(stringLiteral: "Resume"),
          textColor: tint,
          systemImageName: "play.fill"
        )
      )
      let attributes = AlarmAttributes(
        presentation: AlarmPresentation(alert: alert, countdown: countdown, paused: paused),
        metadata: PrayerAlarmMetadata(prayer: item["prayer"] as? String ?? ""),
        tintColor: tint
      )
      let configuration = AlarmManager.AlarmConfiguration(
        countdownDuration: Alarm.CountdownDuration(preAlert: nil, postAlert: TimeInterval(minutes * 60)),
        schedule: .fixed(date),
        attributes: attributes,
        stopIntent: nil,
        secondaryIntent: nil,
        sound: sound.isEmpty ? .default : .named(sound)
      )
      do {
        _ = try await manager.schedule(id: id, configuration: configuration)
        count += 1
      } catch {
        // One refused alarm (a limit, a bad date) must not lose the rest.
        NSLog("[PrayerAlarms] schedule failed with \(count) registered: \(error)")
        // The limit is per app and is the same for every later alarm, which
        // are further away than the ones already in.
        if let e = error as? AlarmManager.AlarmError, e == .maximumLimitReached { break }
      }
    }
    NSLog("[PrayerAlarms] registered \(count) of \(desired.count) wanted")
    return count
  }

  #endif
}
