package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.prayer_times.glance.HijriGlanceWidget

import android.content.Context
import android.content.Intent

/**
 * Hijri Date — the cheapest widget in the plan and close to the most useful.
 *
 * The Hijri date is the one thing in this app people look UP rather than
 * read, and it was only available by opening Home. iOS has had this since
 * phase 1; Android had not, which is the whole of the change.
 *
 * The date comes from the payload. There is a tabular Umm al-Qura conversion
 * in the app (`hijri/convert.ts`) and duplicating it in Kotlin would mean two
 * implementations that can disagree about which day it is — and disagreeing
 * about the date is the only way this widget can be wrong.
 *
 * Deliberately NOT modelling the sunset turnover: the payload states the date
 * the APP believes it is, and the app is the thing the user is comparing
 * against. A widget that flipped to tomorrow at sunset while Home still said
 * today would be a bug report, not a feature.
 */
class PrayerWidgetHijriProvider : GlanceAppWidgetReceiver() {

  /** The card this component draws. Placed widgets kept this class name across
   *  the move to Glance, so they draw with Glance after an update. */
  override val glanceAppWidget: GlanceAppWidget = HijriGlanceWidget()


  // Every branch goes through PrayerWidgetProvider.requestUpdate rather than
  // this provider's own: one signal has to redraw every widget and re-arm the
  // alarm chain, or a home screen holding only this one stops moving. See the
  // comment on requestUpdate.
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      PrayerWidgetProvider.ACTION_PRAYER_TIME_ELAPSED ->
        PrayerWidgetProvider.requestUpdate(context)
    }
  }

  companion object {
    /**
     * Below this height the card is one line: the day and month, at their
     * own size, with the year and the next-month column gone rather than
     * cut through the middle. The layout's minimum is 40dp and the year
     * line alone needs the card to be past 52.
     */
    const val SHORT_HEIGHT_DP = 52

    /** Below this width the next-month column would push the date to its smallest size; it goes first. */
    const val NARROW_WIDTH_DP = 170

    /** Redraw every Glance card; kept under its old name for the callers. */
    fun requestUpdate(context: Context) = GlanceWidgetHook.requestUpdate(context)
  }
}
