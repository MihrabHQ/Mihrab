package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.prayer_times.glance.ReadingGlanceWidget

import android.content.Context
import android.content.Intent

/**
 * Continue Reading — the shortest path back into the habit.
 *
 * Two states and the card is only ever one of them: a khatmah is running, so
 * the headline is the plan's page and the side column is today's portion as
 * a fraction; or there is no plan, so it is the last page read and when.
 *
 * WHICH READER A TAP OPENS IS DECIDED BY THE APP. The payload's `mode` is
 * already resolved against both what the user last had open and whether the
 * ~180 MB mushaf is actually on disk — see buildReadingBlock. A widget that
 * promised "carry on from page 3" and delivered a download prompt would be
 * worse than one that opened the wrong reader.
 *
 * ── TWO INTENTS, NOT ONE (issue #25) ─────────────────────────────────
 *
 * Resuming with recitation meant opening the bookmark, finding the reciter
 * and pressing play — three steps for the thing people do most days. The
 * card's own tap still opens the page in silence, because that is what most
 * taps mean and turning all of them into sound would surprise everyone who
 * reads without it. The play disc beside the surah name is the other
 * intent, and it is the only one that sends `playFromAyah`.
 */
class PrayerWidgetReadingProvider : GlanceAppWidgetReceiver() {

  /** The card this component draws. Placed widgets kept this class name across
   *  the move to Glance, so they draw with Glance after an update. */
  override val glanceAppWidget: GlanceAppWidget = ReadingGlanceWidget()


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
