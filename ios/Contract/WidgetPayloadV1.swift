// Payload v2 as the v1 JSON the widgets' renderers already draw.
//
// A port of `widgetPayloadV1FromV2` in src/widget/widgetPayloadV2.ts, held to
// the same answers by the contract fixtures (contract-tests/, the `adapt`
// cases), as its Kotlin twin is. While the app writes both payloads
// (docs/rewrite-plan.md, step 1.4) the widgets read this: the data arrives
// through the lenient generated reader, the text is written here from minutes
// and the payload's clock, and the existing `WidgetPayload` decoder and every
// view behind it are unchanged.
//
// Wall clock throughout — `todayKey` and `nowMinutes` are the device's local
// date and minutes since its midnight. The rules are the app's own:
//
//   - "today" is the day whose date is the device's; the day shown is today
//     while any of its times is still ahead, else the day after;
//   - "next" is the earliest of today's times still ahead and all of the next
//     day's — or, when the next day is an estimate, its Fajr.

import Foundation

enum WidgetPayloadV1 {
  private struct Event {
    let row: WidgetContract.Row
    let at: Int
  }

  /// The v1 payload as a JSON object, or nil when there are no days to draw from.
  static func object(from p: WidgetContract.Payload, todayKey: String, nowMinutes: Int) -> [String: Any]? {
    let days = p.days
    guard !days.isEmpty else { return nil }
    let clock = p.clock

    var todayIndex = days.firstIndex { $0.dateKey == todayKey }
    var now = nowMinutes
    if todayIndex == nil {
      // Written before today (the app has not run since) or after it (a clock
      // set back): take the first day not yet past, and if it is a later day,
      // everything on it is still ahead.
      if let later = days.firstIndex(where: { $0.dateKey > todayKey }) {
        todayIndex = later
        now = -1
      } else {
        todayIndex = days.count - 1
      }
    }
    let ti = todayIndex ?? 0
    let today = days[ti]
    let tomorrow: WidgetContract.Day? = ti + 1 < days.count ? days[ti + 1] : nil

    let ahead = events(of: today, offset: 0).filter { $0.at > now }
    let shown = (!ahead.isEmpty || tomorrow == nil) ? today : tomorrow!

    let next: Event?
    if let tomorrow, tomorrow.estimated {
      next = earliest(ahead) ?? earliest(events(of: tomorrow, offset: 1440).filter { $0.row.key == "Fajr" })
    } else {
      next = earliest(ahead + (tomorrow.map { events(of: $0, offset: 1440) } ?? []))
    }

    var out: [String: Any] = ["dayLabel": shown.label]
    putRows(&out, shown, clock)
    out["nextKey"] = next.map { $0.row.key as Any } ?? NSNull()
    if let next {
      out["nextPrayerName"] = next.row.name
      let pair = timePair(next.at, clock)
      out["nextPrayerTime"] = pair.time
      if let display = pair.display { out["nextPrayerDisplay"] = display }
    }
    if !p.locationName.isEmpty { out["locationName"] = p.locationName }
    if !p.language.isEmpty { out["language"] = p.language }
    if let s = p.seasonal {
      out["seasonal"] = [
        "jumuah": s.jumuah,
        "ramadan": s.ramadan,
        "eid": s.eid.map { $0.rawValue as Any } ?? NSNull(),
      ] as [String: Any]
    }
    out["days"] = days.filter { !$0.estimated }.map { d -> [String: Any] in
      var o: [String: Any] = ["dateKey": d.dateKey, "dayLabel": d.label]
      putRows(&o, d, clock)
      return o
    }
    if let t = p.today {
      out["today"] = [
        "dateKey": t.dateKey,
        "logged": t.logged,
        "loggable": t.loggable,
        "owed": t.owed,
        "prayers": t.prayers.map { pr -> [String: Any] in
          var o: [String: Any] = ["key": pr.key, "name": pr.name]
          putTime(&o, pr.minutes, clock)
          o["status"] = pr.status.map { $0.rawValue as Any } ?? NSNull()
          o["due"] = pr.due
          return o
        },
      ] as [String: Any]
    }
    if let pr = p.practice {
      var o: [String: Any] = [
        "streak": pr.streak,
        "bestStreak": pr.bestStreak,
        "loggedToday": pr.loggedToday,
        "owed": pr.owed,
        "sunnahRate": pr.sunnahRate.map { $0 as Any } ?? NSNull(),
        "fastsThisMonth": pr.fastsThisMonth,
        "days": pr.days.map { d -> [String: Any] in
          // `k` only because the decoder requires it; every renderer reads
          // `kw` first, and `kw` is absent only when the score is 0.
          var o: [String: Any] = ["d": d.d, "k": 0]
          if d.kw != 0 { o["kw"] = d.kw }
          if d.l != 0 { o["l"] = d.l }
          if d.m { o["m"] = true }
          if d.f { o["f"] = true }
          if d.s != 0 { o["s"] = d.s }
          return o
        },
      ]
      if let since = pr.since { o["since"] = since }
      out["practice"] = o
    }
    if let r = p.reading {
      var o: [String: Any] = [
        "surah": r.surah,
        "surahName": r.surahName,
        "ayah": r.ayah,
        "page": r.page,
        "juz": r.juz,
        "pagesRead": r.pagesRead,
        "totalPages": r.totalPages,
        "bookmarks": r.bookmarks,
        "lastReadAt": r.lastReadAt.map { $0 as Any } ?? NSNull(),
        "mode": r.mode.rawValue,
        "started": r.started,
        "downloaded": r.downloaded,
      ]
      if let k = r.khatmah {
        var kh: [String: Any] = [
          "day": k.day,
          "targetDays": k.targetDays,
          "pagesToday": k.pagesToday,
          "doneToday": k.doneToday,
          "behindBy": k.behindBy,
          "daysLeft": k.daysLeft,
        ]
        if k.skipped != 0 { kh["skipped"] = k.skipped }
        o["khatmah"] = kh
      }
      out["reading"] = o
    }
    if let h = p.hijri {
      out["hijri"] = [
        "day": h.day,
        "month": h.month,
        "year": h.year,
        "monthName": h.monthName,
        "label": h.label,
        "nextMonthName": h.nextMonthName,
        "nextMonthInDays": h.nextMonthInDays,
      ] as [String: Any]
    }
    if let t = p.tasbih {
      out["tasbih"] = [
        "presetId": t.presetId,
        "label": t.label,
        "arabic": t.arabic,
        "count": t.count,
        "target": t.target,
        "unbounded": t.unbounded,
        "index": t.index,
        "total": t.total,
        "counts": t.counts,
        "labels": t.labels,
        "targets": t.targets,
        "unboundedFlags": t.unboundedFlags,
        "todayTotal": t.todayTotal,
        "todayRounds": t.todayRounds,
      ] as [String: Any]
    }
    return out
  }

  /// The same, serialized — what a `WidgetPayload` decoder reads.
  static func data(from p: WidgetContract.Payload, todayKey: String, nowMinutes: Int) -> Data? {
    guard let o = object(from: p, todayKey: todayKey, nowMinutes: nowMinutes) else { return nil }
    return try? JSONSerialization.data(withJSONObject: o)
  }

  // MARK: - Pieces

  /// Every time on a day, placed `offset` minutes from today's midnight.
  private static func events(of day: WidgetContract.Day, offset: Int) -> [Event] {
    let rows = day.prayers + (day.sunrise.map { [$0] } ?? []) + day.extras
    return rows.compactMap { r in r.minutes.map { Event(row: r, at: offset + $0) } }
  }

  private static func earliest(_ events: [Event]) -> Event? {
    var best: Event?
    for e in events where best == nil || e.at < best!.at { best = e }
    return best
  }

  /// Canonical 24-hour "HH:mm", as v1 carried every time.
  private static func hhmm(_ minutes: Int) -> String {
    let m = ((minutes % WallClock.minutesPerDay) + WallClock.minutesPerDay) % WallClock.minutesPerDay
    return String(format: "%02d:%02d", m / 60, m % 60)
  }

  /// `time`, and `display` when it reads differently — the v1 pair.
  private static func timePair(_ minutes: Int, _ clock: WidgetContract.Clock) -> (time: String, display: String?) {
    let time = hhmm(minutes)
    let display = WallClock.text(minutes, clock: clock)
    return (time, display == time ? nil : display)
  }

  private static func putTime(_ o: inout [String: Any], _ minutes: Int?, _ clock: WidgetContract.Clock) {
    guard let minutes else {
      o["time"] = WallClock.noTime
      return
    }
    let pair = timePair(minutes, clock)
    o["time"] = pair.time
    if let display = pair.display { o["display"] = display }
  }

  private static func rowObject(_ r: WidgetContract.Row, _ clock: WidgetContract.Clock) -> [String: Any] {
    var o: [String: Any] = ["key": r.key, "abbr": r.abbr, "name": r.name]
    putTime(&o, r.minutes, clock)
    return o
  }

  private static func putRows(_ o: inout [String: Any], _ day: WidgetContract.Day, _ clock: WidgetContract.Clock) {
    o["rows"] = day.prayers.map { rowObject($0, clock) }
    if let sunrise = day.sunrise { o["sunriseRow"] = rowObject(sunrise, clock) }
    if !day.extras.isEmpty { o["extraRows"] = day.extras.map { rowObject($0, clock) } }
  }
}
