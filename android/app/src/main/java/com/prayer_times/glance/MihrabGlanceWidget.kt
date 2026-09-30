package com.prayer_times.glance

import android.appwidget.AppWidgetManager
import android.content.Context
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import com.prayer_times.PrayerWidgetProvider
import com.prayer_times.R
import com.prayer_times.WidgetErrorCard

/**
 * What every Mihrab Glance widget is: one composition per size the launcher
 * can show, redrawn when the payload, a tap or the clock says so, and a
 * Mihrab error card — never Glance's own — when drawing fails.
 *
 * ── SIZE ──────────────────────────────────────────────────────────────
 *
 * `SizeMode.Exact` is `WidgetSizing.responsive` done by the library: on
 * Android 12+ one composition per size in OPTION_APPWIDGET_SIZES, handed
 * to the launcher as a size map so it picks per orientation and per resize
 * without asking again; below 12, the portrait and landscape pair. So every
 * `Content` is a function of `LocalSize` and nothing else, which is the
 * contract the RemoteViews `render(size)` functions already kept.
 */
internal abstract class MihrabGlanceWidget(private val what: String) :
  GlanceAppWidget(errorUiLayout = R.layout.glance_error_card) {

  override val sizeMode: SizeMode = SizeMode.Exact

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent {
      // `key` on the refresh counter: a payload write or a tap bumps it, and
      // the whole card is composed again from what is on disk now. Reading
      // it without the key would recompose only this lambda, and with strong
      // skipping `Content()` — same receiver, no parameters — would be
      // skipped.
      key(GlanceRefresh.observe()) { Content() }
    }
  }

  @Composable
  abstract fun Content()

  /**
   * A throw inside the composition. Glance would draw `errorUiLayout` and
   * stop there; this puts the exception's class name on it the way
   * `WidgetErrorCard` does for the RemoteViews widgets (#31: a screenshot
   * of that card is the only diagnosis a phone nobody here owns can give).
   */
  override fun onCompositionError(context: Context, glanceId: GlanceId, appWidgetId: Int, throwable: Throwable) {
    // Only exceptions, as WidgetErrorCard: an Error is not a rendering fault.
    if (throwable !is Exception) {
      super.onCompositionError(context, glanceId, appWidgetId, throwable)
      return
    }
    Log.e(PrayerWidgetProvider.WIDGET_LOG_TAG, "$what glance widget failed", throwable)
    AppWidgetManager.getInstance(context)
      .updateAppWidget(appWidgetId, WidgetErrorCard.errorCard(context, R.layout.glance_error_card, throwable))
  }
}
