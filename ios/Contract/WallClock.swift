// The one place a widget or Live Activity turns a contract time into text or
// an instant. Mirrors src/widget/wallClock.ts and android/…/contract/WallClock.kt;
// the three are held to the same answers by the contract tests.
//
// Contract times are wall clock: minutes after the local midnight that starts
// a day's `dateKey` (see scripts/contract/widget-contract.js for why not
// instants). Before this there were ten hand-written "HH:mm" parsers in Swift
// alone, each with its own idea of what a malformed time meant.

import Foundation

enum WallClock {
  static let minutesPerDay = 1440

  /// What a time that does not occur (high latitudes) is drawn as — the same
  /// dash the app draws.
  static let noTime = "—"

  // MARK: - Reading the v1 payload

  /// "05:12" → 312. Nil for anything that is not a clock ("—", "", "5:12 PM").
  ///
  /// Only for the v1 payload's canonical 24-hour strings, until payload v1 is
  /// retired; v2 carries minutes and never needs parsing.
  static func minutes(fromHHmm text: String) -> Int? {
    guard text.range(of: "^[0-9]{1,2}:[0-9]{2}$", options: .regularExpression) != nil else {
      return nil
    }
    let parts = text.split(separator: ":")
    guard let h = Int(parts[0]), let m = Int(parts[1]), (0..<24).contains(h), (0..<60).contains(m)
    else { return nil }
    return h * 60 + m
  }

  // MARK: - Text

  struct Parts: Equatable {
    /// "5:31" or "17:31" — Latin digits, never localised.
    let digits: String
    /// "PM" / "م" / "下午", or nil on a 24-hour clock.
    let period: String?
    /// The period is written before the digits.
    let periodFirst: Bool
  }

  /// The pieces of a time, for a layout that draws the marker smaller.
  static func parts(_ minutes: Int, clock: WidgetContract.Clock) -> Parts {
    let m = ((minutes % minutesPerDay) + minutesPerDay) % minutesPerDay
    let hour = m / 60
    let minute = String(format: "%02d", m % 60)
    guard clock.hour12 else {
      return Parts(digits: String(format: "%02d", hour) + ":" + minute, period: nil, periodFirst: false)
    }
    let h12 = hour % 12 == 0 ? 12 : hour % 12
    return Parts(
      digits: "\(h12):\(minute)",
      period: hour < 12 ? clock.am : clock.pm,
      periodFirst: clock.periodFirst
    )
  }

  /// A time as the app writes it (src/utils/clockFormat.ts); nil draws a dash.
  static func text(_ minutes: Int?, clock: WidgetContract.Clock) -> String {
    guard let minutes else { return noTime }
    let p = parts(minutes, clock: clock)
    guard let period = p.period, !period.isEmpty else { return p.digits }
    return p.periodFirst ? period + p.digits : p.digits + " " + period
  }

  // MARK: - Dates and instants

  /// "2026-09-28" → (2026, 9, 28). Nil for anything else.
  static func components(ofDateKey key: String) -> DateComponents? {
    let parts = key.split(separator: "-", omittingEmptySubsequences: false)
    guard key.count == 10, parts.count == 3,
          let y = Int(parts[0]), let mo = Int(parts[1]), let d = Int(parts[2]),
          (1...12).contains(mo), (1...31).contains(d)
    else { return nil }
    return DateComponents(year: y, month: mo, day: d)
  }

  /// The local calendar date of `date` as a contract date key.
  static func dateKey(_ date: Date, calendar: Calendar = .current) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  /// Minutes after local midnight of the day `date` falls on.
  static func minutes(of date: Date, calendar: Calendar = .current) -> Int {
    let c = calendar.dateComponents([.hour, .minute], from: date)
    return (c.hour ?? 0) * 60 + (c.minute ?? 0)
  }

  /// The instant `minutes` after local midnight of `dateKey`, in the
  /// calendar's zone. Minutes past the end of the day roll into the next.
  ///
  /// Built from hour and minute rather than by adding seconds to midnight,
  /// so a time inside a daylight-saving gap moves forward past the gap. A
  /// time the clock shows twice (the hour it goes back) is the earlier of
  /// the two instants — Foundation's choice, and JavaScript's; WallClock.kt
  /// corrects java.util.Calendar, which picks the later one.
  static func date(dateKey: String, minutes: Int, calendar: Calendar = .current) -> Date? {
    guard var c = components(ofDateKey: dateKey) else { return nil }
    let dayShift = Int((Double(minutes) / Double(minutesPerDay)).rounded(.down))
    let m = minutes - dayShift * minutesPerDay
    if dayShift != 0 {
      guard let base = calendar.date(from: c),
            let shifted = calendar.date(byAdding: .day, value: dayShift, to: base)
      else { return nil }
      c = calendar.dateComponents([.year, .month, .day], from: shifted)
    }
    c.hour = m / 60
    c.minute = m % 60
    c.second = 0
    return calendar.date(from: c)
  }

  /// The UTC offset the calendar's zone uses at local noon of `dateKey`, in
  /// minutes — what the app wrote into `Day.utcOffsetMinutes`.
  static func utcOffsetMinutes(dateKey: String, calendar: Calendar = .current) -> Int? {
    guard let noon = date(dateKey: dateKey, minutes: 12 * 60, calendar: calendar) else { return nil }
    return calendar.timeZone.secondsFromGMT(for: noon) / 60
  }

  /// True when the day's times were computed under an offset the device no
  /// longer uses for that date — the zone's rules changed (#56) or the device
  /// moved zones. A day that did not record its offset is taken on trust.
  static func isStale(_ day: WidgetContract.Day, calendar: Calendar = .current) -> Bool {
    guard let written = day.utcOffsetMinutes,
          let now = utcOffsetMinutes(dateKey: day.dateKey, calendar: calendar)
    else { return false }
    return written != now
  }
}
