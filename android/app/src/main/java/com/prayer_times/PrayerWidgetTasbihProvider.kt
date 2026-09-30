package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.prayer_times.glance.TasbihGlanceWidget

import android.content.Context
import android.content.Intent

/**
 * Tasbih — a counter, which is the best possible fit for an interactive
 * widget: one target, one number, no navigation.
 *
 * Like Log Today, a tap does not write. The counter lives in the app's own
 * storage and this process cannot reach it, so the tap is appended to a
 * queue and the app replays it — see WidgetTasbihQueue. The number moves on
 * the tap because the view projects the queue over the payload, which is the
 * same projection the app performs when it drains.
 *
 * The one rule that is easy to get wrong: a bounded preset stops at its
 * target. `unboundedAfterTarget` travels on the payload and this must honour
 * it rather than inventing its own — counting past the target here and not
 * in the app is the one way the two can disagree about a number the user is
 * actively watching.
 */
class PrayerWidgetTasbihProvider : GlanceAppWidgetReceiver() {

  /** The card this component draws. Placed widgets kept this class name across
   *  the move to Glance, so they draw with Glance after an update. */
  override val glanceAppWidget: GlanceAppWidget = TasbihGlanceWidget()


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
