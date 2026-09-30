package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import com.prayer_times.glance.PrayerGlanceWidget

/** "Next prayer": the compact line at every size. */
class PrayerWidgetSmallProvider : PrayerWidgetProvider() {
  override val glanceAppWidget: GlanceAppWidget = PrayerGlanceWidget(PrayerGlanceWidget.Entry.SMALL)
}
