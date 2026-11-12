package com.prayer_times.glance

import android.content.Context
import com.prayer_times.contract.WallClock

/**
 * The day the widgets hold, as the widget settings screen's sample card
 * shows it (WidgetPreviewCard): the day's label, the city, the row of
 * times with the next one marked, and the practice the tall card graphs. Read the way the cards read
 * it — the live payload, the schedule's own "next" — so the sample names
 * the user's prayers at the user's times, in the user's clock format.
 *
 * Null when the widgets hold no day (the app has not published one, or it
 * has run out); the screen then draws figures alone.
 */
internal class WidgetSample(
  val dayLabel: String,
  val location: String,
  val rows: List<Row>,
  /** What the tall card's graph and streak are drawn from; null with nothing logged or published. */
  val practice: com.prayer_times.contract.WidgetContract.Practice? = null,
) {
  class Row(val name: String, val time: String, val next: Boolean)

  companion object {
    /** As many times as the Prayer times card's row holds. */
    private const val SLOTS = 6

    fun of(context: Context): WidgetSample? {
      val now = Now.current()
      val p = GlancePayload.live(context, now) ?: return null
      val s = Schedule.of(p, now) ?: return null
      val day = s.table
      // Fajr, Sunrise, Dhuhr … Isha: the card's own order.
      val rows = (day.prayers.take(1) + listOfNotNull(day.sunrise) + day.prayers.drop(1)).take(SLOTS)
      if (rows.isEmpty()) return null
      val nextKey = s.next?.row?.key
      return WidgetSample(
        dayLabel = day.label.trim().ifEmpty { s.shown.label.trim() },
        location = p.locationName.trim(),
        practice = p.practice,
        rows = rows.map { r ->
          Row(
            name = r.name.trim().ifEmpty { r.abbr.trim() },
            time = WallClock.text(r.minutes, p.clock),
            next = r.key == nextKey,
          )
        },
      )
    }

    /** The count-up window the app last published (#111); 0 when off or unknown. */
    fun publishedSinceAdhan(context: Context): Int =
      try {
        GlancePayload.read(context)?.sinceAdhanMinutes ?: 0
      } catch (_: Exception) {
        0
      }
  }
}
