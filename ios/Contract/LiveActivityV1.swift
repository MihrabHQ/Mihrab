// The shared Live Activity payload as the ActivityKit content iOS draws.
//
// A port of `liveActivityIosContent` in src/liveActivity/liveActivityV2.ts,
// held to the same answers by the contract fixtures (the `liveActivityIos`
// cases). The app builds ONE `LiveActivity` for both platforms
// (docs/rewrite-plan.md, step 1.5); this turns it into the JSON that
// `PrayerLiveActivityAttributes.ContentState` decodes, for the minute it is
// drawn at, so the ContentState type — which ActivityKit stores — and every
// view behind it are unchanged.
//
// JSON rather than the ContentState itself because this file is compiled
// into all three targets and the widget extension has no ActivityKit type.
//
// The next prayer is an instant from its day and minutes (`WallClock.date`),
// not a "HH:mm" re-parsed on today and pushed a day forward when past — which
// was an hour off on the night the clocks change.

import Foundation

enum LiveActivityV1 {
  /// The content at `todayKey` + `nowMinutes`, instants in `calendar`'s zone.
  /// Nil when nothing is ahead.
  static func iosContent(
    _ la: WidgetContract.LiveActivity,
    todayKey: String,
    nowMinutes: Int,
    calendar: Calendar = WallClock.localCalendar
  ) -> [String: Any]? {
    guard let m = WidgetPayloadV1.moment(la.days, todayKey: todayKey, nowMinutes: nowMinutes),
          let next = m.next,
          let nextDate = WallClock.date(dateKey: m.today.dateKey, minutes: next.at, calendar: calendar)
    else { return nil }
    let clock = la.clock
    let nextSeconds = nextDate.timeIntervalSince1970
    // With nothing passed at all, the bar starts an hour before the next.
    let prevSeconds = WidgetPayloadV1.previous(m)
      .flatMap { WallClock.date(dateKey: m.today.dateKey, minutes: $0.at, calendar: calendar) }
      .map { $0.timeIntervalSince1970 } ?? nextSeconds - 3600
    let pair = WidgetPayloadV1.timePair(next.at, clock)
    var out: [String: Any] = [
      "nextKey": next.row.key,
      "nextLabel": next.row.name,
      "nextTime": pair.time,
      "nextTimeDisplay": pair.display ?? pair.time,
      "nextEpochSeconds": nextSeconds,
      "prevEpochSeconds": prevSeconds,
      "rows": m.shown.prayers.map { row($0, clock) },
      "extraRows": m.shown.extras.map { row($0, clock) },
      "accentHex": la.appearance.accentHex,
      "systemTinted": la.appearance.systemTinted,
      "tinted": la.appearance.tinted,
    ]
    if let sunrise = m.shown.sunrise { out["sunriseRow"] = row(sunrise, clock) }
    return out
  }

  /// The same, serialized — what `ContentState`'s decoder reads.
  static func iosContentData(
    _ la: WidgetContract.LiveActivity,
    todayKey: String,
    nowMinutes: Int,
    calendar: Calendar = WallClock.localCalendar
  ) -> Data? {
    guard let o = iosContent(la, todayKey: todayKey, nowMinutes: nowMinutes, calendar: calendar)
    else { return nil }
    return try? JSONSerialization.data(withJSONObject: o)
  }

  /// A row with `display` always written: ContentState's `Row.display` is
  /// not optional, and one missing key once failed the whole payload.
  private static func row(_ r: WidgetContract.Row, _ clock: WidgetContract.Clock) -> [String: Any] {
    var o: [String: Any] = [
      "key": r.key, "abbr": r.abbr, "name": r.name,
      "time": WallClock.noTime, "display": WallClock.noTime,
    ]
    if let minutes = r.minutes {
      let pair = WidgetPayloadV1.timePair(minutes, clock)
      o["time"] = pair.time
      o["display"] = pair.display ?? pair.time
      // What the card places the row by (step 1.7).
      o["minutes"] = minutes
    }
    return o
  }
}
