package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.prayer_times.glance.LogGlanceWidget

import android.content.Context
import android.content.Intent

/**
 * Log Today — the one widget that changes what the app IS from the home
 * screen rather than being a better way to read something already readable.
 *
 * Five chips, one per salāh. Tapping a due one records it; tapping it again
 * within the undo window takes it back. Everything else opens the app: the
 * widget can express "prayed on time" and nothing more, and a control that
 * silently records a status the user did not choose is worse than one that
 * hands them the screen where they can choose it.
 *
 * ── What it draws, and from where ─────────────────────────────────────
 *
 * Two sources, merged. The `today` block of the payload is what the JOURNAL
 * says, and the queue is what has been TAPPED since the app last ran. A chip
 * is ticked if either says so, which is what lets the tick land on the tap
 * instead of on the next app launch. See widgetLogQueue.ts for why the tap
 * cannot write the journal directly.
 */
open class PrayerWidgetLogProvider : GlanceAppWidgetReceiver() {

  /** The card this component draws. Placed widgets kept this class name across
   *  the move to Glance, so they draw with Glance after an update. */
  override val glanceAppWidget: GlanceAppWidget = LogGlanceWidget()


  // Every branch goes through PrayerWidgetProvider.requestUpdate rather than
  // this provider's own: one signal has to redraw every widget and re-arm the
  // alarm chain, or a home screen holding only this one stops moving. See the
  // comment on requestUpdate.
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_BOOT_COMPLETED,
      PrayerWidgetProvider.ACTION_PRAYER_TIME_ELAPSED ->
        PrayerWidgetProvider.requestUpdate(context)
    }
  }

  companion object {
    /** Redraw every Glance card; kept under its old name for the callers. */
    fun requestUpdate(context: Context) = GlanceWidgetHook.requestUpdate(context)
  }
}
