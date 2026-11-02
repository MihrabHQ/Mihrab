package com.prayer_times

import org.json.JSONArray

/**
 * The Sky theme's day on the widgets, as JS hands it over
 * (`widgetSkySchedule`, src/widget/widgetSkySchedule.ts): `[[minuteOfDay,
 * "#RRGGBB" card, "#RRGGBB" accent], …]`, in order from the day's first
 * minute. A widget is drawn at the prayer boundaries, at midnight and on an
 * unlock, and takes the segment in force at that minute — the night's ink
 * at Isha, the dawn's at Fajr — rather than the colours of whatever hour
 * the app was last open in. One day stands for the days after it: prayer
 * times move a few minutes a day, which the sky cannot show.
 */
object WidgetSkySchedule {
  private val HEX = Regex("^#[0-9A-Fa-f]{6}$")

  /**
   * The card and the accent at `minuteOfDay` (0–1439), or null when the
   * schedule is empty or unreadable. Before the first segment's minute
   * the day's last segment holds, as the night does across midnight.
   */
  fun colorsAt(json: String, minuteOfDay: Int): Pair<String, String>? {
    if (json.isBlank()) return null
    return try {
      val arr = JSONArray(json)
      var hit: Pair<String, String>? = null
      var last: Pair<String, String>? = null
      for (i in 0 until arr.length()) {
        val seg = arr.optJSONArray(i) ?: continue
        val minute = seg.optInt(0, -1)
        val bg = seg.optString(1, "")
        val accent = seg.optString(2, "")
        if (minute < 0 || !HEX.matches(bg) || !HEX.matches(accent)) continue
        val pair = Pair(bg, accent)
        last = pair
        if (minute <= minuteOfDay) hit = pair
      }
      hit ?: last
    } catch (_: Exception) {
      null
    }
  }

  /** `colorsAt` for the clock now. */
  fun colorsNow(json: String): Pair<String, String>? {
    val cal = java.util.Calendar.getInstance()
    val minute = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE)
    return colorsAt(json, minute)
  }
}
