// Shared ActivityAttributes — task #128.
//
// Defines the wire format between the React Native side (which packs a
// JSON payload via `setContentState`) and the SwiftUI Live Activity
// widget (which renders it). The file is a member of BOTH targets:
//   • PrayerApp (main app) — uses ActivityKit's Activity<…>.request /
//     update / end to drive the Activity from the JS bridge.
//   • MihrabLiveActivity (the Live Activity extension) — declares
//     ActivityConfiguration<…> in PrayerLiveActivityWidget.swift so the OS
//     knows how to render.
// Both targets must see the SAME type identity, hence the dual
// membership recorded in PrayerApp.xcodeproj/project.pbxproj.
//
// Decoding strategy: the JS side serialises a flat object whose keys
// match the property names below. We use the synthesised `Codable`
// conformance so a small JS-side payload change doesn't require a
// hand-written init.

import Foundation
#if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
import ActivityKit

@available(iOS 16.1, *)
public struct PrayerLiveActivityAttributes: ActivityAttributes {
  /// Mutable state pushed via `activity.update(using:)`.
  public struct ContentState: Codable, Hashable {
    /// Localised name for the upcoming prayer, e.g. "Fajr" / "الفجر".
    public var nextLabel: String
    /// 24-hour `HH:mm` for the upcoming prayer, kept for content from older
    /// builds; nothing parses it. The instant is `nextEpochSeconds`, and what
    /// the card draws is `nextTimeText`.
    public var nextTime: String
    /// The same instant written the way the user reads a clock (issue #18).
    /// Defaults to "" so payloads from older app builds still decode.
    public var nextTimeDisplay: String = ""
    /// Wall-clock target instant for the countdown, in seconds since
    /// 1970-01-01 00:00:00 UTC. Rendered client-side via
    /// Text(timerInterval:countsDown:) so the widget ticks without our
    /// pushes touching ActivityKit every second.
    public var nextEpochSeconds: Double
    /// Wall-clock instant of the PREVIOUS prayer (seconds since epoch). The
    /// start anchor for the auto-filling progress bar — the bar fills from
    /// `prevEpochSeconds` → `nextEpochSeconds` on-device, so progress advances
    /// without us pushing every minute (mirrors the Android progress bar).
    /// Defaults to 0 so older JS payloads still decode.
    public var prevEpochSeconds: Double = 0
    /// Stable row key for the upcoming prayer (matches WIDGET_ROW_KEYS).
    public var nextKey: String

    /// Full prayer-day rows, chronological order, with the FIVE salāh
    /// plus optionally Sunrise spliced in by the JS side at slot 1
    /// when `showSunrise` is true.
    public var rows: [Row]
    /// Sunrise row sent separately when the user has the sunrise toggle
    /// ON but expects the lock-screen widget to render it inline; we
    /// keep both for compatibility with the home-screen widget payload.
    public var sunriseRow: Row?

    /// The night marks — First Third / Islamic Midnight / the Last Third —
    /// present only when the user has turned them on. The JS side has always
    /// sent them; this field is what stops them being dropped on decode, and
    /// what lets the on-device roll-forward land on one and leave it again
    /// instead of counting past it to the next salāh.
    ///
    /// Optional, not an empty-array default: synthesized `Decodable` does not
    /// fall back to a property's default value, it throws on a missing key —
    /// and an activity already running when this build installs was archived
    /// by the previous one, which never wrote this field. Only an Optional
    /// decodes as absent.
    public var extraRows: [Row]?

    /// Empty string → omit.
    public var hijriLabel: String
    /// Empty string → omit.
    public var locationLabel: String

    /// "#RRGGBB" — drives keyline tint + accent colour. Ignored when
    /// `systemTinted` is true.
    public var accentHex: String

    /// When true (iOS Liquid Glass / system colours active in-app) the views
    /// ignore `accentHex` and use the dynamic iOS system tint, so the Live
    /// Activity matches the system theme and adapts to light/dark by itself.
    /// Defaults to false so older JS payloads still decode.
    public var systemTinted: Bool = false

    /// "Tinted surfaces" — when true, the Lock Screen + Dynamic Island
    /// surfaces are washed toward the accent so the card matches the app's
    /// tinted chrome. Off keeps the neutral material with the accent only as a
    /// keyline / countdown tint.
    ///
    /// Optional, NOT `Bool = false`, for the reason spelled out on `extraRows`
    /// above: an activity started by the pre-upgrade binary is decoded by this
    /// build against this type, its archive has no `tinted` key, and
    /// synthesized `Decodable` throws on a missing key unless the property is
    /// Optional. Read it as `tinted ?? false`.
    public var tinted: Bool?

    /// Display knobs from the user's Settings → Live activity card.
    public var compactMode: Bool
    public var showSunrise: Bool
    public var showHijri: Bool
    public var showLocation: Bool

    /// The next prayer's time as it should be drawn. Never parsed.
    public var nextTimeText: String {
      nextTimeDisplay.isEmpty ? nextTime : nextTimeDisplay
    }

    fileprivate enum CodingKeys: String, CodingKey {
      case nextLabel, nextTime, nextTimeDisplay, nextEpochSeconds
      case prevEpochSeconds, nextKey, rows, sunriseRow, extraRows
      case hijriLabel, locationLabel, accentHex, systemTinted, tinted
      case compactMode, showSunrise, showHijri, showLocation
    }
  }

  /// One prayer row. `key` is canonical ("Fajr"/"Sunrise"/…) so the
  /// SwiftUI views can compare against `ContentState.nextKey` without
  /// worrying about localisation. `abbr` is the localised short label;
  /// `minutes` places the row and `text` draws it.
  public struct Row: Codable, Hashable {
    public var key: String
    public var abbr: String
    /// Localized full prayer name (e.g. "Dhuhr" / "الظهر"). Used by the
    /// background refresh task to rebuild the hero `nextLabel` when it rolls
    /// the activity forward, without needing localization tables in the
    /// extension. Defaults to "" so older payloads still decode (callers fall
    /// back to `abbr`).
    public var name: String = ""
    /// 24-hour `HH:mm`, read (through `at`) only when `minutes` is absent —
    /// content from a build before step 1.7. Draw `text`.
    public var time: String
    /// The same instant written the way the user reads a clock (issue #18).
    public var display: String = ""
    /// Minutes after the shown day's midnight, written by the v2 adapter
    /// (LiveActivityV1.swift) — what the card and its roll-forward place the
    /// row by (step 1.7). Nil in content from a build before it.
    public var minutes: Int? = nil

    /// What to put on screen. Never feed this to a parser.
    public var text: String { display.isEmpty ? time : display }

    /// Minutes after the shown day's midnight: the adapter's, or — content
    /// from a build before step 1.7 — `time` read once through WallClock.
    public var at: Int? { minutes ?? WallClock.minutes(fromHHmm: time) }

    fileprivate enum CodingKeys: String, CodingKey {
      case key, abbr, name, time, display, minutes
    }
  }
}

/**
 A DEFAULT IS NOT A FALLBACK UNLESS YOU WRITE ONE.

 Five properties across these two structs say "Defaults to X so older
 payloads still decode". They did not. Synthesized `Decodable` ignores a
 property's default and throws `keyNotFound` — the same trap already
 spelled out on `extraRows` and on `tinted`, which is why both of those
 are Optional. The rest were left as defaulted non-Optionals, and one of
 them broke the feature outright:

 `Row.display` is the clock-format string, and the payload builder only
 emits one when it differs from `time`. On a 24-hour clock the JS side
 sent no `display`, `JSON.stringify` dropped the key, this decoder threw
 on every payload, and `start` rejected into a caught promise — so NO
 Live Activity was ever created, silently, for anyone reading a 24-hour
 clock. The sender now always writes the key; these initialisers make
 its absence survivable anyway, which is what the comments promised.

 Required fields stay required. Without a next prayer there is nothing
 to draw, and failing loudly is the right answer there.

 Written in extensions so the memberwise initialisers survive for
 previews and tests.
 */
@available(iOS 16.1, *)
extension PrayerLiveActivityAttributes.ContentState {
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    nextLabel = try c.decode(String.self, forKey: .nextLabel)
    nextTime = try c.decode(String.self, forKey: .nextTime)
    nextTimeDisplay =
      try c.decodeIfPresent(String.self, forKey: .nextTimeDisplay) ?? ""
    nextEpochSeconds = try c.decode(Double.self, forKey: .nextEpochSeconds)
    prevEpochSeconds =
      try c.decodeIfPresent(Double.self, forKey: .prevEpochSeconds) ?? 0
    nextKey = try c.decode(String.self, forKey: .nextKey)
    rows = try c.decode([PrayerLiveActivityAttributes.Row].self, forKey: .rows)
    sunriseRow = try c.decodeIfPresent(
      PrayerLiveActivityAttributes.Row.self, forKey: .sunriseRow)
    extraRows = try c.decodeIfPresent(
      [PrayerLiveActivityAttributes.Row].self, forKey: .extraRows)
    hijriLabel = try c.decodeIfPresent(String.self, forKey: .hijriLabel) ?? ""
    locationLabel =
      try c.decodeIfPresent(String.self, forKey: .locationLabel) ?? ""
    accentHex =
      try c.decodeIfPresent(String.self, forKey: .accentHex) ?? "#22c55e"
    systemTinted =
      try c.decodeIfPresent(Bool.self, forKey: .systemTinted) ?? false
    tinted = try c.decodeIfPresent(Bool.self, forKey: .tinted)
    compactMode = try c.decodeIfPresent(Bool.self, forKey: .compactMode) ?? true
    showSunrise = try c.decodeIfPresent(Bool.self, forKey: .showSunrise) ?? true
    showHijri = try c.decodeIfPresent(Bool.self, forKey: .showHijri) ?? false
    showLocation =
      try c.decodeIfPresent(Bool.self, forKey: .showLocation) ?? false
  }
}

// MARK: - What the card aims at, worked out when it is drawn

/**
 THE CARD FINDS ITS OWN NEXT PRAYER.

 The app pushes a state whose `nextKey` and `nextEpochSeconds` are right for
 the minute it pushed them. Then the phone goes into a pocket, the prayer
 comes and goes, and nothing redraws the card until the app is opened or the
 background refresh happens to run — which iOS does when it likes, often
 hours later. Until then the card counted down to 0:00 and sat there, with
 the prayer that had just come in still named as the one ahead.

 The one redraw the system does promise is at `staleDate`, which the app
 sets just after the next prayer. The rows carry every event of the shown
 day with its minutes, so at that redraw the card can find the event after
 now by itself and count down to THAT. The background refresh and `reassert`
 use the same arithmetic, so all three agree on what is next.

 In the extension and the app alike: this file is in both targets.
 */
@available(iOS 16.1, *)
extension PrayerLiveActivityAttributes.ContentState {
  /// One event of the shown day, placed on the clock.
  struct Event: Hashable {
    let row: PrayerLiveActivityAttributes.Row
    let date: Date
  }

  /// What the card counts down to.
  struct Aim: Hashable {
    let key: String
    let label: String
    /// The time as the user reads it. Never parsed.
    let timeText: String
    /// Canonical `HH:mm`, for content that still carries it.
    let time: String
    let epoch: Double
    /// Where the progress bar starts: the event before, or an hour earlier.
    let prevEpoch: Double
    /// False once the shown day's last event has passed: nothing is ahead,
    /// and the card names the event that came last rather than counting
    /// down to a time gone by.
    let ahead: Bool
  }

  /// The rows the card draws — the five, Sunrise, and the night marks the
  /// user turned on — in clock order.
  var allRows: [PrayerLiveActivityAttributes.Row] {
    var out = rows
    if let sun = sunriseRow {
      if out.isEmpty { out.append(sun) } else { out.insert(sun, at: 1) }
    }
    // The night marks fall in the small hours (Islamic Midnight, the Last
    // Third) and the evening (the First Third): placed by the clock, never
    // tacked onto the end, or the list runs backwards.
    let night = extraRows ?? []
    if !night.isEmpty {
      out.append(contentsOf: night)
      out.sort { ($0.at ?? 0) < ($1.at ?? 0) }
    }
    return out
  }

  /// The day the rows' minutes count from: the day the pushed next prayer
  /// is on, found by walking back from its instant by its own minutes — so
  /// an ʿIshāʾ written past midnight (1442) still names the day before.
  /// Falls back to the instant's own date when the pushed prayer is not
  /// among the rows.
  func shownDayKey(calendar: Calendar = WallClock.localCalendar) -> String {
    let nextDate = Date(timeIntervalSince1970: nextEpochSeconds)
    guard let at = allRows.first(where: { $0.key == nextKey })?.at else {
      return WallClock.dateKey(nextDate, calendar: calendar)
    }
    // Back to midnight, then into the day's middle: a clock change on that
    // day moves midnight by an hour, and noon is still the same date.
    let midday = nextDate.addingTimeInterval(TimeInterval(-at * 60 + 12 * 3600))
    return WallClock.dateKey(midday, calendar: calendar)
  }

  /// Every event of the shown day with its instant, in order.
  func events(calendar: Calendar = WallClock.localCalendar) -> [Event] {
    let day = shownDayKey(calendar: calendar)
    var out: [Event] = []
    for row in allRows {
      guard let m = row.at,
            let d = WallClock.date(dateKey: day, minutes: m, calendar: calendar)
      else { continue }
      out.append(Event(row: row, date: d))
    }
    out.sort { $0.date < $1.date }
    return out
  }

  /// What to count down to at `now`: the pushed next prayer while it is
  /// still ahead, otherwise the first event of the shown day after `now`.
  func aim(at now: Date, calendar: Calendar = WallClock.localCalendar) -> Aim {
    let pushed = Aim(
      key: nextKey, label: nextLabel, timeText: nextTimeText, time: nextTime,
      epoch: nextEpochSeconds, prevEpoch: prevEpochSeconds, ahead: true)
    if nextEpochSeconds > now.timeIntervalSince1970 { return pushed }
    let events = events(calendar: calendar)
    guard let next = events.first(where: { $0.date > now }) else {
      return Aim(
        key: pushed.key, label: pushed.label, timeText: pushed.timeText, time: pushed.time,
        epoch: pushed.epoch, prevEpoch: pushed.prevEpoch, ahead: false)
    }
    let prev = events.last { $0.date <= now }?.date ?? next.date.addingTimeInterval(-3600)
    let row = next.row
    return Aim(
      key: row.key,
      label: row.name.isEmpty ? row.abbr : row.name,
      timeText: row.text,
      time: row.time,
      epoch: next.date.timeIntervalSince1970,
      prevEpoch: prev.timeIntervalSince1970,
      ahead: true)
  }

  /// This state re-pointed at `aim` — what the app pushes when it rolls
  /// the card forward, so the stored state and the drawn card agree.
  func pointed(at aim: Aim) -> PrayerLiveActivityAttributes.ContentState {
    var s = self
    s.nextKey = aim.key
    s.nextLabel = aim.label
    s.nextTime = aim.time
    s.nextTimeDisplay = aim.timeText
    s.nextEpochSeconds = aim.epoch
    s.prevEpochSeconds = aim.prevEpoch
    return s
  }
}

@available(iOS 16.1, *)
extension PrayerLiveActivityAttributes.Row {
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    key = try c.decode(String.self, forKey: .key)
    abbr = try c.decode(String.self, forKey: .abbr)
    name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
    time = try c.decode(String.self, forKey: .time)
    display = try c.decodeIfPresent(String.self, forKey: .display) ?? ""
    minutes = try? c.decodeIfPresent(Int.self, forKey: .minutes)
  }
}
#endif
