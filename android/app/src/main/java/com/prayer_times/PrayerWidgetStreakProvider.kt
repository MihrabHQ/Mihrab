package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.prayer_times.glance.StreakGlanceWidget

import android.content.Context
import android.content.Intent

/**
 * Streak & Practice — the Log screen's four stat tiles, minus three.
 *
 * A SEPARATE receiver rather than a size of the prayer-times widget. The 4x4
 * prayer widget already carries the graph, which is right for someone who
 * wants both facts together; this is for someone who wants only this one and
 * should not have to put a prayer table on their home screen to get it.
 *
 * The graph is a Bitmap (see PracticeGridBitmap). RemoteViews has no loops,
 * so seventy cells as views would mean seventy generated ids and seventy
 * actions crossing the process boundary on every update.
 *
 * Draws nothing but the placeholder when the payload has no `practice`
 * block. An absent block is not a zero streak: on a home screen those look
 * identical and mean opposite things.
 */
class PrayerWidgetStreakProvider : GlanceAppWidgetReceiver() {

  /** The card this component draws. Placed widgets kept this class name across
   *  the move to Glance, so they draw with Glance after an update. */
  override val glanceAppWidget: GlanceAppWidget = StreakGlanceWidget()


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
