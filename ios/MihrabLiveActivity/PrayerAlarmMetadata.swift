// The metadata carried by a prayer alarm — issue #63.
//
// AlarmKit hands the widget extension the same `AlarmAttributes<Metadata>`
// the app scheduled with, so the type has to be one both targets can see.
// Like PrayerLiveActivityAttributes, this file is a member of BOTH the app
// (PrayerApp) and the Live Activity extension (MihrabLiveActivity).
//
// Nothing in it is read today beyond the prayer's name: the alarm's own text
// is drawn from the presentation. It exists because AlarmKit's generic
// parameter cannot be left empty, and so a later version can say more on the
// lock screen without a new wire format.

import Foundation
#if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
import AlarmKit

@available(iOS 26.0, *)
nonisolated public struct PrayerAlarmMetadata: AlarmMetadata {
  /// Canonical English key (Fajr, Dhuhr, …) — the same one the notification
  /// payload carries in `data.prayer`.
  public var prayer: String

  public init(prayer: String = "") {
    self.prayer = prayer
  }
}
#endif
