package com.prayer_times

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * The device's zone or clock changed: redraw every widget, now.
 *
 * Two things hang on it. The cards place every time by the device's clock,
 * so a card drawn before the change states times for a clock the phone no
 * longer keeps until something else wakes it. And the times themselves were
 * computed under the offset the app last saw: `WidgetPayloadSource` checks
 * that on every read and asks the app to rebuild when it no longer holds.
 * This is the moment that check most needs to run, and the one moment the
 * rebuild can reliably be started — both broadcasts are exempt from the
 * implicit-broadcast limits and put the app on the temporary allowlist that
 * a background service start needs. Before this, the check ran here only
 * because the Hijri card happens to listen for TIMEZONE_CHANGED, and only
 * when one was placed.
 *
 * `requestUpdate` is the one fan-out: every RemoteViews kind, and the
 * Glance cards through GlanceWidgetHook. It is a no-op with nothing placed.
 */
class WidgetClockChangeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED -> Unit
      else -> return
    }
    // Adapt again, and check the offset again, even if the minute reads the same.
    WidgetPayloadSource.invalidate()
    try {
      PrayerWidgetProvider.requestUpdate(context)
    } catch (t: Throwable) {
      Log.w(PrayerWidgetProvider.WIDGET_LOG_TAG, "redraw after ${intent.action} failed", t)
    }
  }
}
