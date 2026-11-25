package com.prayer_times

import android.content.Context
import android.os.Bundle
import android.util.Log
import io.invertase.notifee.BackgroundEvents

/**
 * A prayer alert is shown without starting the app.
 *
 * ── WHAT IT COST ───────────────────────────────────────────────────────
 *
 * The alerts' engine tells JavaScript of everything that happens to a
 * notification, and with the app closed that means starting it: for each
 * alert shown and each one swiped away, the whole of React Native — the
 * engine, the bundle, the stores — in a process nobody opened (measured on
 * the emulator, 2.39: 70 MB, at the minute of every prayer). JavaScript
 * then looked at the event and did nothing: on Android a shown or dismissed
 * alert is acted on only by an app that is already running.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────
 *
 * A PRESS and a button on a notification always reach JavaScript; they are
 * what it is there for. The rest — shown, dismissed, a trigger written —
 * reach it only when there is something for it to do:
 *
 *  - React Native is already running in this process: the event costs
 *    nothing to deliver, and a running app may be playing the adhan it has
 *    to stop.
 *  - A widget's taps are waiting (the Log and Tasbih queues): the journal
 *    is encrypted and written by JavaScript alone, and an alert is the one
 *    regular chance to write them for someone who never opens the app
 *    (src/notifications/adhanSafetyControls.ts).
 *  - The alerts are about to run out. They are written four days ahead,
 *    and each carries where that schedule ends (`coveredUntil`,
 *    src/notifications/alertCoverage.ts). With under two days left,
 *    JavaScript is started to write the next days — which nothing did
 *    before: a phone whose app was not opened for four days stopped
 *    alerting.
 *
 * Anything this cannot read is answered "yes": an event too many is the
 * old cost, an event too few is a lost tap or a missed prayer.
 */
object AlertEventGate : BackgroundEvents.Gate {
  private const val TAG = "MihrabAlertGate"

  // app.notifee.core.event.NotificationEvent
  private const val TYPE_DISMISSED = 0
  private const val TYPE_DELIVERED = 3
  private const val TYPE_TRIGGER_NOTIFICATION_CREATED = 7
  private const val TYPE_FG_ALREADY_EXIST = 8

  /** The alert's data key for the end of the schedule it was written in (epoch ms). */
  const val COVERED_UNTIL_KEY = "coveredUntil"

  /** With less than this left of the schedule, JavaScript is started to extend it. */
  const val TOP_UP_BELOW_MS = 2L * 24 * 60 * 60 * 1000

  @Volatile private var appContext: Context? = null

  fun install(context: Context) {
    appContext = context.applicationContext
    BackgroundEvents.setGate(this)
  }

  override fun wantsJavaScript(eventType: Int, notification: Bundle?): Boolean {
    if (!isPassive(eventType)) return true
    val context = appContext ?: return true
    if ((context as? MainApplication)?.reactIsRunning() != false) return true
    val reason = workWaiting(context, eventType, notification, System.currentTimeMillis())
    if (reason == null) {
      Log.i(TAG, "event $eventType: nothing for JavaScript, not started")
      return false
    }
    Log.i(TAG, "event $eventType: JavaScript started ($reason)")
    return true
  }

  fun isPassive(eventType: Int): Boolean =
    eventType == TYPE_DELIVERED ||
      eventType == TYPE_DISMISSED ||
      eventType == TYPE_TRIGGER_NOTIFICATION_CREATED ||
      eventType == TYPE_FG_ALREADY_EXIST

  /** Why JavaScript has something to do, or null when it has not. */
  fun workWaiting(context: Context, eventType: Int, notification: Bundle?, now: Long): String? {
    try {
      if (WidgetLogQueue.read(context).isNotEmpty()) return "log taps waiting"
      if (WidgetTasbihQueue.read(context).isNotEmpty()) return "tasbih taps waiting"
    } catch (t: Throwable) {
      return "queues unreadable"
    }
    if (eventType == TYPE_DELIVERED && coverageRunsLow(coveredUntil(notification), now)) {
      return "alerts end soon"
    }
    return null
  }

  /** The end of the schedule this alert was written in, or null when it does not say. */
  fun coveredUntil(notification: Bundle?): Long? =
    try {
      notification?.getBundle("data")?.getString(COVERED_UNTIL_KEY)?.toLongOrNull()
    } catch (t: Throwable) {
      null
    }

  /** An alert that does not say (written by an older build) asks for nothing. */
  fun coverageRunsLow(until: Long?, now: Long): Boolean =
    until != null && until > 0 && until - now < TOP_UP_BELOW_MS
}
