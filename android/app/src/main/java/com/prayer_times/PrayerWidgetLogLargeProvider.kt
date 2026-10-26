package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import com.prayer_times.glance.LogGlanceWidget

/**
 * Log Today, placed three rows tall.
 *
 * The same provider under a second name, so the picker can carry a second
 * entry for it. Everything this widget draws it decides from the measured
 * height, so an instance placed from here is the same card as one placed
 * from the short entry and dragged — it simply starts at the size where the
 * date line, the full-height chips and the practice graph are all there.
 *
 * See glance_log_tall_info.xml.
 */
class PrayerWidgetLogLargeProvider : PrayerWidgetLogProvider() {
  /** The 4×4: today's row and the practice graph. */
  override val glanceAppWidget: GlanceAppWidget = LogGlanceWidget(tall = true)
}
