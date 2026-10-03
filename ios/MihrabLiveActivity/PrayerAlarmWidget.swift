// The non-alerting faces of a prayer alarm — issue #63.
//
// AlarmKit draws the alert itself (the full-screen "Fajr — Stop / Snooze"
// takeover) from the presentation the app gave it. What it cannot draw is
// what comes AFTER a Snooze: the countdown to the alarm ringing again, on the
// Lock Screen and in the Dynamic Island. That is this widget's whole job, and
// Apple is explicit that it must exist — "AlarmKit expects a widget extension
// if an app supports a countdown presentation. Otherwise, the system may
// unexpectedly dismiss alarms and fail to alert." A snoozed Fajr that quietly
// never rings again is the one failure this feature cannot have.
//
// Deliberately plain. The app's Live Activity (PrayerLiveActivityWidget) is
// the designed surface; this one says what is counting down and to when.

import SwiftUI
import WidgetKit
#if canImport(AlarmKit) && !targetEnvironment(macCatalyst)
import AlarmKit
import ActivityKit

@available(iOS 26.0, *)
struct PrayerAlarmWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AlarmAttributes<PrayerAlarmMetadata>.self) { context in
      lockScreen(context.attributes, context.state)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(title(context.attributes))
            .font(.headline)
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          countdown(context.state)
            .font(.title2.monospacedDigit())
        }
      } compactLeading: {
        Image(systemName: "bell.fill")
      } compactTrailing: {
        countdown(context.state)
          .monospacedDigit()
          .frame(maxWidth: 52)
      } minimal: {
        Image(systemName: "bell.fill")
      }
    }
  }

  private func title(_ attributes: AlarmAttributes<PrayerAlarmMetadata>) -> String {
    // The alert's title is the prayer's name in the app's language.
    String(localized: attributes.presentation.alert.title)
  }

  @ViewBuilder
  private func countdown(_ state: AlarmPresentationState) -> some View {
    switch state.mode {
    case .countdown(let countdown):
      Text(timerInterval: Date.now ... max(Date.now, countdown.fireDate), countsDown: true)
    case .paused:
      Image(systemName: "pause.fill")
    default:
      Image(systemName: "bell.fill")
    }
  }

  private func lockScreen(
    _ attributes: AlarmAttributes<PrayerAlarmMetadata>,
    _ state: AlarmPresentationState
  ) -> some View {
    HStack {
      Image(systemName: "bell.fill")
      Text(title(attributes))
        .font(.headline)
      Spacer()
      countdown(state)
        .font(.title2.monospacedDigit())
    }
    .padding()
  }
}
#endif
