// The practice record, as a widget can draw it: a row a prayer, a column a day.
//
// The shape the Log screen's graph took (src/practice/PracticeStrip.tsx),
// drawn here the same way. The grid this replaced summed a day into one
// depth of colour, and the number hid the one thing a prayer log is kept
// for: which prayer. Six rows — Fajr to Isha, and the fast — and every cell
// one fact: filled for on time, faint for late, hollow for a make-up, red
// for missed, the palest ink for nothing inside the record, nothing at all
// before it or after today. The sunnah, the qiyam and the unaccounted mark
// stay in the app: a home screen has no legend, and a cell that says one
// thing can be small.
//
// Drawn in INK — white, every widget card being dark — not the accent: the
// app's record is one colour at every hour under the Sky themes, and so is
// this. The accent means one thing here, a fast, and the danger red one
// thing, a missed prayer. A payload written before `p` existed draws each
// day as one column of the old summary, so an unreloaded widget still says
// something true.

import SwiftUI
import WidgetKit

struct PracticeGrid: View {
  let days: [WidgetPayload.PracticeDay]
  /// The first day the user ever logged a prayer, or nil. From it onwards an
  /// empty cell is the palest ink — a day inside the record; before it,
  /// nothing: there was no record yet.
  var since: String?
  /// Days to draw, newest last.
  let dayCount: Int
  let cell: CGFloat
  let spacing: CGFloat
  let accent: Color

  /// Danger red for a missed prayer. Not the accent at low alpha: missed is
  /// a different KIND of cell, not a weaker version of a kept one.
  private let owedColor = Color(red: 248 / 255, green: 113 / 255, blue: 113 / 255)
  private let ink = Color.white
  private let salahPerDay = 5

  var body: some View {
    let byDate = Dictionary(days.map { ($0.d, $0) }, uniquingKeysWith: { a, _ in a })
    let keys = dayKeys()
    let today = todayKey
    let radius = cell * 0.3

    HStack(spacing: spacing) {
      ForEach(Array(keys.enumerated()), id: \.offset) { _, key in
        let day = byDate[key]
        let inRecord = since.map { key >= $0 } ?? false
        let letters = day?.p.flatMap { $0.count == salahPerDay ? Array($0) : nil }
        VStack(spacing: spacing) {
          ForEach(0..<salahPerDay, id: \.self) { row in
            prayerCell(letters: letters, row: row, day: day, inRecord: inRecord, radius: radius)
              .frame(width: cell, height: cell)
          }
          // The fast, in the accent — the one colour the strip spends.
          RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(day?.f == true ? accent : (inRecord || day != nil ? ink.opacity(0.07) : Color.clear))
            .frame(width: cell, height: cell)
        }
        .padding(.horizontal, spacing / 2)
        .background {
          // Today's column, lit: a strip whose last cells are empty says
          // nothing about where now is without it.
          if key == today {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
              .fill(ink.opacity(0.10))
          }
        }
        .padding(.horizontal, -spacing / 2)
      }
    }
  }

  @ViewBuilder
  private func prayerCell(letters: [Character]?, row: Int, day: WidgetPayload.PracticeDay?, inRecord: Bool, radius: CGFloat) -> some View {
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    if let letters {
      switch letters[row] {
      case "o": shape.fill(ink.opacity(0.85))
      case "l": shape.fill(ink.opacity(0.38))
      case "m": shape.fill(owedColor.opacity(0.85))
      case "q": shape.strokeBorder(ink.opacity(0.85), lineWidth: max(1, cell * 0.14))
      default: shape.fill(ink.opacity(0.07))
      }
    } else if let day {
      // An older payload: the day's summary in every prayer's cell, so
      // the column still says how the day went.
      shape.fill(summary(for: day))
    } else if inRecord {
      shape.fill(ink.opacity(0.07))
    } else {
      shape.fill(Color.clear)
    }
  }

  /// The day keys drawn, oldest first and today last — nothing after it.
  private func dayKeys() -> [String] {
    let cal = WallClock.localCalendar
    let today = Date()
    var out: [String] = []
    for back in stride(from: dayCount - 1, through: 0, by: -1) {
      guard let date = cal.date(byAdding: .day, value: -back, to: today) else { continue }
      out.append(WallClock.dateKey(date, calendar: cal))
    }
    return out
  }

  /// Today's key, in the same shape the payload uses.
  private var todayKey: String { WallClock.dateKey(Date()) }

  /// The old ramp, for a payload that carries no `p`: the Log screen's
  /// `fillFor` of that time, in ink.
  private func summary(for day: WidgetPayload.PracticeDay) -> Color {
    let w = min(max(day.kw ?? (min(max(day.k, 0), 5) * 100), 0), 500)
    if w > 0 { return ink.opacity(0.22 + 0.63 * (Double(w) / 500.0)) }
    let logged = day.l ?? (day.m == true ? 1 : 0)
    if logged > 0 { return owedColor.opacity(0.30) }
    return ink.opacity(0.07)
  }
}
