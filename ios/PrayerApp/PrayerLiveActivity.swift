// PrayerLiveActivity native module — task #128.
//
// Bridges the JS-side syncLiveActivity orchestrator to ActivityKit on
// iOS 16.1+. Methods are idempotent and async-safe:
//
//   • start(json)      — decode ContentState, start a new Activity. If
//                        one is already running, update it in place.
//   • startV2(json)    — the same from the shared payload (the contract's
//                        `LiveActivity`, step 1.5), adapted for this minute
//                        and stored for the background refresh.
//   • update(json)     — push fresh content to every running activity.
//   • stop()           — end every running activity with .immediate
//                        dismissal so the lock-screen card disappears
//                        as soon as the user toggles the feature off.
//   • reassert()       — show the card again if it was swiped away while
//                        the feature is on.
//   • isAvailable()    — true when ActivityKit is available *and* the
//                        user hasn't disabled Live Activities for the
//                        app in Settings.
//
// We don't take a push token here — the activity is driven entirely by
// in-app updates from the React Native bridge. That's sufficient
// because the JS layer re-fires on AppState 'active', on focus, and
// when the underlying prayer-day payload changes; iOS keeps the
// previous content state pinned in between.
//
// On older OS versions the methods either no-op (start/update/stop) or
// resolve `false` (isAvailable) so the JS layer can probe and route.

import Foundation
import React
import BackgroundTasks
#if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
import ActivityKit
#endif

@objc(PrayerLiveActivity)
final class PrayerLiveActivity: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  // Serial queue — prevents concurrent start() calls from racing each other
  // into a create/destroy spiral when multiple React effects fire at once.
  private let queue = DispatchQueue(label: "com.hassan.prayerapp.liveactivity", qos: .userInitiated)
  private var isStarting = false

  // Last content pushed while the feature was enabled. Used by `reassert()` to
  // revive the card after the user swipes it away / clears it. Cleared by
  // `stop()` so a disabled feature never revives. iOS forbids starting a Live
  // Activity from the background, so revival only happens on app foreground.
  private static var cachedStateJSON: String?

  // MARK: - start

  @objc
  func start(
    _ json: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 16.1, *) {
      // Coalesce rapid concurrent calls: if a start is already in flight,
      // resolve immediately. The in-flight call will apply the same (or
      // newer) state. This prevents the create/dismiss race when the state,
      // nextInfo, and focusEffect all fire simultaneously at app launch.
      queue.sync {
        if isStarting {
          resolve(nil)
          return
        }
        isStarting = true
      }

      guard let data = json.data(using: .utf8) else {
        queue.sync { isStarting = false }
        reject("BAD_JSON", "ContentState JSON could not be encoded as UTF-8", nil)
        return
      }
      let state: PrayerLiveActivityAttributes.ContentState
      do {
        state = try JSONDecoder().decode(
          PrayerLiveActivityAttributes.ContentState.self,
          from: data
        )
      } catch {
        queue.sync { isStarting = false }
        reject("DECODE_FAILED", error.localizedDescription, error)
        return
      }

      // Remember the latest content so `reassert()` can revive the card if the
      // user dismisses it while the feature is still enabled.
      Self.cachedStateJSON = json

      // staleDate = just after the next prayer, so once the countdown elapses
      // the system knows the content is out of date (and dims/refreshes it)
      // rather than showing a frozen 0:00 indefinitely. nil when we don't have
      // a valid future target.
      let staleDate = Self.staleDate(for: state)

      // If there are already running activities, update them in place.
      // Do NOT stop-then-restart: that pattern races when called concurrently
      // and causes the card to flash off the lock screen.
      let existing = Activity<PrayerLiveActivityAttributes>.activities

      if !existing.isEmpty {
        Task {
          // Update all running activities with fresh state.
          for act in existing {
            if #available(iOS 16.2, *) {
              await act.update(ActivityContent(state: state, staleDate: staleDate))
            } else {
              await act.update(using: state)
            }
          }
          LiveActivityRefresher.scheduleRefresh()
          self.queue.sync { self.isStarting = false }
          resolve(nil)
        }
        return
      }

      // No existing activity — request a fresh one.
      // Local-first: pushType is nil (no APNs / no server). The next-prayer
      // pointer advances via (a) the always-live on-device countdown/progress
      // views, (b) foreground updates, and (c) a BGTaskScheduler background
      // refresh — see LiveActivityRefresher below and docs/ios-live-activity-push.md.
      do {
        if #available(iOS 16.2, *) {
          let _ = try Activity<PrayerLiveActivityAttributes>.request(
            attributes: PrayerLiveActivityAttributes(),
            content: ActivityContent(state: state, staleDate: staleDate),
            pushType: nil
          )
        } else {
          let _ = try Activity<PrayerLiveActivityAttributes>.request(
            attributes: PrayerLiveActivityAttributes(),
            contentState: state,
            pushType: nil
          )
        }
        LiveActivityRefresher.scheduleRefresh()
        queue.sync { isStarting = false }
        resolve(nil)
      } catch {
        queue.sync { isStarting = false }
        reject("REQUEST_FAILED", error.localizedDescription, error)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - startV2

  /// UserDefaults key of the last shared payload (the contract's
  /// `LiveActivity`, step 1.5). Kept across launches: the background refresh
  /// runs in a process the app did not start, and re-adapting the stored days
  /// is what lets it roll the card forward — past ʿIshāʾ into tomorrow, which
  /// the old re-parse of the activity's own "HH:mm" rows could not.
  static let storedV2Key = "PrayerLiveActivity.payloadV2"

  /// Start or update from the shared payload. Adapted here, for this minute,
  /// into the content `start` has always decoded (LiveActivityV1.swift), and
  /// stored for the refresh and for `reassert`.
  @objc
  func startV2(
    _ json: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let data = json.data(using: .utf8),
          let la = try? JSONDecoder().decode(WidgetContract.LiveActivity.self, from: data)
    else {
      reject("DECODE_FAILED", "LiveActivity payload could not be read", nil)
      return
    }
    guard let content = Self.contentJSON(from: la, now: Date()) else {
      // Nothing ahead to count down to: end the card, as the JS path does,
      // rather than leave it counting down to a time that has passed. The
      // app starts it again with the next days on its next sync.
      stop(resolve, rejecter: reject)
      return
    }
    UserDefaults.standard.set(json, forKey: Self.storedV2Key)
    start(content, resolver: resolve, rejecter: reject)
  }

  /// The ContentState JSON the shared payload stands for at `now`.
  static func contentJSON(from la: WidgetContract.LiveActivity, now: Date) -> String? {
    guard let data = LiveActivityV1.iosContentData(
      la,
      todayKey: WallClock.dateKey(now),
      nowMinutes: WallClock.minutes(of: now)
    ) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// The stored shared payload's content at `now`, or nil when there is none
  /// (an activity started by a build from before step 1.5) or nothing ahead.
  static func storedContentJSON(now: Date) -> String? {
    guard let json = UserDefaults.standard.string(forKey: storedV2Key),
          let data = json.data(using: .utf8),
          let la = try? JSONDecoder().decode(WidgetContract.LiveActivity.self, from: data)
    else { return nil }
    return contentJSON(from: la, now: now)
  }

  #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
  /// `storedContentJSON`, decoded: the card the stored shared payload stands
  /// for at `now`.
  @available(iOS 16.1, *)
  static func storedContentState(now: Date) -> PrayerLiveActivityAttributes.ContentState? {
    guard let json = storedContentJSON(now: now), let data = json.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(PrayerLiveActivityAttributes.ContentState.self, from: data)
  }
  #endif

  // MARK: - update

  @objc
  func update(
    _ json: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 16.1, *) {
      guard let data = json.data(using: .utf8) else {
        reject("BAD_JSON", "ContentState JSON could not be encoded as UTF-8", nil)
        return
      }
      let state: PrayerLiveActivityAttributes.ContentState
      do {
        state = try JSONDecoder().decode(
          PrayerLiveActivityAttributes.ContentState.self,
          from: data
        )
      } catch {
        reject("DECODE_FAILED", error.localizedDescription, error)
        return
      }
      Self.cachedStateJSON = json
      let staleDate = Self.staleDate(for: state)
      Task {
        for activity in Activity<PrayerLiveActivityAttributes>.activities {
          if #available(iOS 16.2, *) {
            await activity.update(ActivityContent(state: state, staleDate: staleDate))
          } else {
            await activity.update(using: state)
          }
        }
        LiveActivityRefresher.scheduleRefresh()
        resolve(nil)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - staleDate helper

  /// How long after the next prayer the content goes stale. The stale redraw
  /// is the one the card uses to move itself on to the prayer after (see
  /// `ContentState.aim`), so it comes soon after the prayer rather than a
  /// minute of 0:00 later. Not at the instant itself: the system's timing
  /// is approximate, and a redraw a moment early would find the prayer
  /// still ahead and change nothing.
  static let staleAfter: TimeInterval = 5

  /// Just after `epoch`, as a stale date.
  static func staleDate(nextEpoch epoch: Double) -> Date {
    Date(timeIntervalSince1970: epoch + staleAfter)
  }

  #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
  /// Just after the next prayer instant, or nil when there is no valid future
  /// target (so we don't mark fresh content immediately stale).
  @available(iOS 16.1, *)
  private static func staleDate(
    for state: PrayerLiveActivityAttributes.ContentState
  ) -> Date? {
    let target = Date(timeIntervalSince1970: state.nextEpochSeconds)
    return target > Date() ? staleDate(nextEpoch: state.nextEpochSeconds) : nil
  }
  #endif

  // MARK: - stop

  @objc
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // Feature turned off — forget the cached content so `reassert()` won't
    // revive the card, nor the refresh roll it forward.
    Self.cachedStateJSON = nil
    UserDefaults.standard.removeObject(forKey: Self.storedV2Key)
    #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 16.1, *) {
      LiveActivityRefresher.cancelScheduledRefresh()
      Task {
        for activity in Activity<PrayerLiveActivityAttributes>.activities {
          await activity.end(dismissalPolicy: .immediate)
        }
        resolve(nil)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - reassert
  //
  // Re-show the Live Activity if it was dismissed (swiped away / "Clear all")
  // while the feature is still enabled. Called from JS whenever the app comes
  // to the foreground. iOS does NOT allow apps to start a Live Activity from
  // the background or to prevent the user from dismissing one, so this is the
  // closest we can get to "always shown while enabled": it reappears every time
  // the app is opened. No-op when the feature is off (no cached content), when a
  // card is already showing, or when there's no remaining prayer today.
  @objc
  func reassert(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 16.2, *) {
      guard let json = Self.cachedStateJSON,
            let data = json.data(using: .utf8),
            var state = try? JSONDecoder().decode(
              PrayerLiveActivityAttributes.ContentState.self, from: data)
      else { resolve(nil); return }

      // Already showing → nothing to do.
      guard Activity<PrayerLiveActivityAttributes>.activities.isEmpty else {
        resolve(nil)
        return
      }

      let now = Date()
      // From the shared payload when there is one: the whole card as it
      // stands now, the day shown included.
      if let freshState = Self.storedContentState(now: now) {
        do {
          let _ = try Activity<PrayerLiveActivityAttributes>.request(
            attributes: PrayerLiveActivityAttributes(),
            content: ActivityContent(
              state: freshState,
              staleDate: Self.staleDate(nextEpoch: freshState.nextEpochSeconds)),
            pushType: nil
          )
          LiveActivityRefresher.scheduleRefresh()
        } catch {
          NSLog("[PrayerLiveActivity] reassert request failed: \(error.localizedDescription)")
        }
        resolve(nil)
        return
      }
      // Re-point to the current next prayer so the revived card isn't stale.
      let aim = state.aim(at: now)
      guard aim.ahead else {
        // No remaining event today — let the foreground sync re-arm with
        // tomorrow's data instead of reviving a past countdown.
        resolve(nil)
        return
      }
      state = state.pointed(at: aim)
      do {
        let _ = try Activity<PrayerLiveActivityAttributes>.request(
          attributes: PrayerLiveActivityAttributes(),
          content: ActivityContent(state: state, staleDate: Self.staleDate(nextEpoch: aim.epoch)),
          pushType: nil
        )
        LiveActivityRefresher.scheduleRefresh()
      } catch {
        NSLog("[PrayerLiveActivity] reassert request failed: \(error.localizedDescription)")
      }
      resolve(nil)
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: - isAvailable

  @objc
  func isAvailable(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 16.1, *) {
      resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
      return
    }
    #endif
    resolve(false)
  }
}

// MARK: - LiveActivityRefresher (BGTaskScheduler — local, no server)
//
// Advances the Live Activity's highlighted prayer while the app is
// backgrounded, with no push / no server. A BGAppRefreshTask re-adapts the
// stored shared payload (step 1.5) for the minute it runs in — falling back
// to the activity's own rows when there is none — and calls
// `Activity.update`. iOS runs these opportunistically (timing
// is best-effort), which is fine: the on-device countdown/progress views stay
// live regardless, and the foreground path covers the rest. Lives in this file
// (already in the main app target) so no new file / pbxproj entry is needed.
//
// Registration MUST happen before the app finishes launching — see
// AppDelegate.registerLiveActivityRefresh(). The identifier must also be listed
// under BGTaskSchedulerPermittedIdentifiers in Info.plist.

enum LiveActivityRefresher {
  static let taskIdentifier = "com.hassan.prayerapp.liveactivity.refresh"

  /// Register the BG task handler. Call once from AppDelegate before launch
  /// finishes. Safe to call when ActivityKit is unavailable (handler no-ops).
  static func registerTask() {
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: taskIdentifier,
      using: nil
    ) { task in
      guard let refresh = task as? BGAppRefreshTask else {
        task.setTaskCompleted(success: false)
        return
      }
      handle(refresh)
    }
  }

  /// Queue the next background refresh (no-op when no activity is running).
  /// earliestBeginDate is the next prayer instant when known, else +15 min.
  static func scheduleRefresh() {
    #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 16.2, *) {
      guard !Activity<PrayerLiveActivityAttributes>.activities.isEmpty else { return }
      let earliest = soonestNextPrayerDate() ?? Date().addingTimeInterval(15 * 60)
      let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
      request.earliestBeginDate = earliest
      do {
        try BGTaskScheduler.shared.submit(request)
      } catch {
        NSLog("[LiveActivityRefresher] submit failed: \(error.localizedDescription)")
      }
    }
    #endif
  }

  static func cancelScheduledRefresh() {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
  }

  private static func handle(_ task: BGAppRefreshTask) {
    // Reschedule first so the chain continues even if the work below is cut off.
    scheduleRefresh()
    #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
    if #available(iOS 16.2, *) {
      let work = Task {
        await refreshRunningActivities()
        task.setTaskCompleted(success: true)
      }
      task.expirationHandler = { work.cancel() }
      return
    }
    #endif
    task.setTaskCompleted(success: true)
  }

  #if canImport(ActivityKit) && !targetEnvironment(macCatalyst)
  @available(iOS 16.2, *)
  private static func refreshRunningActivities() async {
    let now = Date()
    // The shared payload's days, when the app stored them: the card as it
    // stands now, rows and all — after ʿIshāʾ that is tomorrow's.
    if let state = PrayerLiveActivity.storedContentState(now: now) {
      let stale = PrayerLiveActivity.staleDate(nextEpoch: state.nextEpochSeconds)
      for activity in Activity<PrayerLiveActivityAttributes>.activities
      where activity.content.state != state {
        await activity.update(ActivityContent(state: state, staleDate: stale))
      }
      return
    }
    for activity in Activity<PrayerLiveActivityAttributes>.activities {
      let state = activity.content.state
      // The same arithmetic the card draws by (`ContentState.aim`), so the
      // pushed state and the drawn card agree. Nothing to do while the
      // activity already points at a future prayer, or nothing is ahead.
      let aim = state.aim(at: now)
      guard aim.ahead, aim.key != state.nextKey || aim.epoch != state.nextEpochSeconds
      else { continue }
      await activity.update(ActivityContent(
        state: state.pointed(at: aim),
        staleDate: PrayerLiveActivity.staleDate(nextEpoch: aim.epoch)))
    }
  }

  @available(iOS 16.2, *)
  private static func soonestNextPrayerDate() -> Date? {
    let now = Date()
    if let state = PrayerLiveActivity.storedContentState(now: now) {
      return Date(timeIntervalSince1970: state.nextEpochSeconds)
    }
    var soonest: Date?
    for activity in Activity<PrayerLiveActivityAttributes>.activities {
      let aim = activity.content.state.aim(at: now)
      guard aim.ahead else { continue }
      let d = Date(timeIntervalSince1970: aim.epoch)
      if soonest == nil || d < soonest! { soonest = d }
    }
    return soonest
  }

  #endif
}
