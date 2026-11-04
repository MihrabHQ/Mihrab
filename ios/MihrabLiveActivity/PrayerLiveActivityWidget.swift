// Prayer Live Activity widget — task #128 (redesigned).
//
// Lives in the PrayerWidgetExtension target only. Declares the
// ActivityConfiguration<…> the OS reads to render the Live Activity on the
// Lock Screen and the Dynamic Island variants (compact / minimal / expanded).
// The host app starts/updates/ends the activity from PrayerLiveActivity.swift
// (main app target) — this file is purely presentation.
//
// Design goals (mirrors the Android Live Activity feature set):
//   • Live countdown to the next prayer via Text(timerInterval:) — ticks
//     every second on-device with no per-second pushes from the app.
//   • Auto-filling progress bar via ProgressView(timerInterval:) spanning the
//     previous → next prayer, so the bar advances on its own (the iOS analogue
//     of the Android foreground-service progress bar).
//   • A compact strip of the day's prayers with the upcoming one accented.
//
// WHAT THE CARD COUNTS DOWN TO IS DECIDED HERE, AT DRAW TIME — not taken
// from the state as pushed. The system redraws the card when its content is
// pushed and again when it goes stale (just after the next prayer); at that
// second redraw the pushed prayer has passed, and `ContentState.aim(at:)`
// finds the one after it from the rows, so the card moves on by itself
// instead of naming a prayer that has come and gone until the app is opened.
//
// Visual language: dark frosted card, a single accent colour (the user's app
// accent) used sparingly for the next-prayer name, countdown, progress bar and
// the highlighted strip cell. Everything else is white at graded opacity so it
// stays legible on the system's lock-screen material in any appearance.

import Foundation
import SwiftUI
import UIKit
import WidgetKit
// `canImport` alone is not enough: ActivityKit resolves on Mac Catalyst but
// none of it is usable there, and the attributes this file needs are already
// compiled out by the same guard in PrayerLiveActivityAttributes.swift. A Mac
// has no Lock Screen and no Dynamic Island, so there is nothing to render.
#if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
import ActivityKit

@available(iOS 16.1, *)
struct PrayerLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PrayerLiveActivityAttributes.self) { context in
      LockScreenLiveActivityView(state: context.state)
        .activityBackgroundTint(liveActivityBackgroundTint(state: context.state))
        .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          DynamicIslandLeading(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          DynamicIslandTrailing(state: context.state)
        }
        DynamicIslandExpandedRegion(.bottom) {
          DynamicIslandBottom(state: context.state)
        }
      } compactLeading: {
        DynamicIslandCompactLeading(state: context.state)
      } compactTrailing: {
        DynamicIslandCompactTrailing(state: context.state)
      } minimal: {
        DynamicIslandMinimal(state: context.state)
      }
      .keylineTint(liveActivityAccent(state: context.state))
    }
  }
}

// MARK: - Shared date helpers

@available(iOS 16.1, *)
private typealias Aim = PrayerLiveActivityAttributes.ContentState.Aim

/// now…next for the live countdown, or nil when nothing is ahead (an
/// invalid range would crash the extension).
@available(iOS 16.1, *)
private func countdownRange(_ aim: Aim, now: Date) -> ClosedRange<Date>? {
  guard aim.ahead else { return nil }
  let end = Date(timeIntervalSince1970: aim.epoch)
  guard end > now else { return nil }
  return now...end
}

/// previous…next for the progress bar, or nil when it would be empty.
@available(iOS 16.1, *)
private func progressRange(_ aim: Aim) -> ClosedRange<Date>? {
  guard aim.ahead else { return nil }
  var start = aim.prevEpoch
  if start >= aim.epoch { start = aim.epoch - 3600 }
  guard aim.epoch > start else { return nil }
  return Date(timeIntervalSince1970: start)...Date(timeIntervalSince1970: aim.epoch)
}

// MARK: - Reusable pieces

/// Live countdown text. Shows the running timer until the prayer time, then a
/// neutral "now" glyph-time once it has elapsed (until the app pushes the next
/// prayer).
@available(iOS 16.1, *)
private struct CountdownText: View {
  let aim: Aim
  let now: Date
  var font: Font
  var color: Color

  var body: some View {
    Group {
      if let range = countdownRange(aim, now: now) {
        Text(timerInterval: range, countsDown: true)
          .font(font)
          .monospacedDigit()
          .foregroundColor(color)
          .lineLimit(1)
          .minimumScaleFactor(0.5)
      } else {
        Text(aim.timeText)
          .font(font)
          .monospacedDigit()
          .foregroundColor(color)
          .lineLimit(1)
          .minimumScaleFactor(0.5)
      }
    }
  }
}

/// Auto-filling linear progress bar from the previous → next prayer.
@available(iOS 16.1, *)
private struct PrayerProgressBar: View {
  let state: PrayerLiveActivityAttributes.ContentState
  let aim: Aim
  let now: Date
  var height: CGFloat = 5

  var body: some View {
    // The system's timer bar: it fills on its own, every second, with no
    // redraw — a bar drawn from `Date()` at draw time stood still between
    // pushes, for hours. Its labels are left out so only the bar shows.
    if let range = progressRange(aim) {
      ProgressView(
        timerInterval: range, countsDown: false,
        label: { EmptyView() }, currentValueLabel: { EmptyView() }
      )
      .progressViewStyle(.linear)
      .tint(liveActivityAccent(state: state))
      .frame(height: height)
    } else {
      Capsule()
        .fill(Color.white.opacity(0.18))
        .frame(height: height)
    }
  }
}

/// Horizontal strip of the day's prayers; the upcoming one is accented.
@available(iOS 16.1, *)
private struct PrayerStrip: View {
  let state: PrayerLiveActivityAttributes.ContentState
  let aim: Aim
  var nameSize: CGFloat = 10
  var timeSize: CGFloat = 11

  var body: some View {
    let rows = state.allRows
    // Nothing is lit once the day's last event has passed.
    let lit = aim.ahead ? aim.key : ""
    if !rows.isEmpty {
      HStack(spacing: 0) {
        ForEach(rows, id: \.key) { row in
          VStack(spacing: 2) {
            Text(row.abbr)
              .font(.system(size: nameSize, weight: .medium))
              .foregroundColor(
                row.key == lit
                  ? liveActivityAccent(state: state)
                  : Color.white.opacity(0.5)
              )
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            Text(row.text)
              .font(.system(size: timeSize, design: .monospaced))
              .fontWeight(row.key == lit ? .semibold : .regular)
              .foregroundColor(
                row.key == lit
                  ? Color.white
                  : Color.white.opacity(0.6)
              )
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          .frame(maxWidth: .infinity)
        }
      }
    }
  }
}

// MARK: - Lock-screen card

@available(iOS 16.1, *)
private struct LockScreenLiveActivityView: View {
  let state: PrayerLiveActivityAttributes.ContentState
  /// Drawn once per redraw, so every piece of the card agrees on `now`.
  private let now = Date()

  init(state: PrayerLiveActivityAttributes.ContentState) {
    self.state = state
  }

  var body: some View {
    let aim = state.aim(at: now)
    VStack(alignment: .leading, spacing: 10) {
      // Headline: accent dot · prayer name · time, with the live countdown
      // pinned to the trailing edge.
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Circle()
          .fill(liveActivityAccent(state: state))
          .frame(width: 8, height: 8)
          .alignmentGuide(.firstTextBaseline) { d in d[.bottom] - 1 }

        Text(aim.label)
          .font(.system(size: 17, weight: .semibold))
          .foregroundColor(.white)
          .lineLimit(1)

        Text(aim.timeText)
          .font(.system(size: 13, design: .monospaced))
          .foregroundColor(Color.white.opacity(0.6))

        Spacer(minLength: 6)

        CountdownText(
          aim: aim, now: now,
          font: .system(.title3, design: .rounded).weight(.semibold),
          color: liveActivityAccent(state: state)
        )
      }

      // Auto-filling progress toward the next prayer.
      PrayerProgressBar(state: state, aim: aim, now: now)

      // The day's prayer strip with the next one accented.
      PrayerStrip(state: state, aim: aim)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(aim.ahead ? "\(aim.label), \(aim.timeText)" : aim.label)
  }
}

// MARK: - Dynamic Island regions

@available(iOS 16.1, *)
private struct DynamicIslandCompactLeading: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    Image(systemName: "moon.stars.fill")
      .imageScale(.medium)
      .foregroundColor(liveActivityAccent(state: state))
      .padding(.leading, 2)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandCompactTrailing: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    let now = Date()
    CountdownText(
      aim: state.aim(at: now), now: now,
      font: .system(.body, design: .rounded).weight(.semibold),
      color: liveActivityAccent(state: state)
    )
    .padding(.trailing, 2)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandMinimal: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    let now = Date()
    CountdownText(
      aim: state.aim(at: now), now: now,
      font: .system(.caption, design: .rounded).weight(.semibold),
      color: liveActivityAccent(state: state)
    )
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandLeading: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    let aim = state.aim(at: Date())
    HStack(spacing: 8) {
      Image(systemName: "moon.stars.fill")
        .font(.system(size: 18))
        .foregroundColor(liveActivityAccent(state: state))
      VStack(alignment: .leading, spacing: 1) {
        Text(aim.label)
          .font(.system(size: 16, weight: .semibold))
          .lineLimit(1)
        Text(aim.timeText)
          .font(.system(size: 12, design: .monospaced))
          .foregroundColor(.secondary)
      }
    }
    .padding(.leading, 6)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandTrailing: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    let now = Date()
    CountdownText(
      aim: state.aim(at: now), now: now,
      font: .system(.title2, design: .rounded).weight(.semibold),
      color: liveActivityAccent(state: state)
    )
    .padding(.trailing, 6)
  }
}

@available(iOS 16.1, *)
private struct DynamicIslandBottom: View {
  let state: PrayerLiveActivityAttributes.ContentState
  var body: some View {
    let now = Date()
    let aim = state.aim(at: now)
    VStack(spacing: 8) {
      PrayerProgressBar(state: state, aim: aim, now: now, height: 6)
      PrayerStrip(state: state, aim: aim, nameSize: 11, timeSize: 12)
    }
    .padding(.horizontal, 4)
    .padding(.top, 6)
  }
}

// MARK: - Helpers

@available(iOS 16.1, *)
private func liveActivityAccent(
  state: PrayerLiveActivityAttributes.ContentState
) -> Color {
  // Liquid Glass / system colours active in-app: use the dynamic iOS system
  // tint (the same systemBlue the app's system theme uses), which adapts to
  // light/dark on its own — so the Live Activity matches the selected theme.
  if state.systemTinted {
    return Color(uiColor: .systemBlue)
  }
  return Color(hex: state.accentHex) ?? Color(red: 0.13, green: 0.77, blue: 0.37) // green-500
}

/// The Lock Screen card's background tint.
///
/// Neutral (a dark scrim) by default. When "Tinted surfaces" is on, the scrim
/// is washed toward the accent so the card matches the app's tinted chrome —
/// modest, because the card draws light text on it, and darkened so it stays a
/// backdrop rather than a fill. `tinted` is Optional (see the attributes
/// file); a running activity from before the upgrade reads as `false`.
@available(iOS 16.1, *)
private func liveActivityBackgroundTint(
  state: PrayerLiveActivityAttributes.ContentState
) -> Color {
  guard state.tinted == true else { return Color.black.opacity(0.45) }
  let accent = liveActivityAccent(state: state)
  // Accent at low opacity over the same dark scrim: a coloured backdrop that
  // still holds white text.
  return accent.opacity(0.38)
}

extension Color {
  init?(hex: String) {
    let trimmed = hex.trimmingCharacters(in: .whitespaces)
    let body = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
    guard body.count == 6, let v = UInt32(body, radix: 16) else { return nil }
    self = Color(
      red: Double((v >> 16) & 0xff) / 255.0,
      green: Double((v >> 8) & 0xff) / 255.0,
      blue: Double(v & 0xff) / 255.0
    )
  }
}
#endif
