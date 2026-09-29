package com.prayer_times

import android.content.Context
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract
import com.prayer_times.contract.WidgetPayloadV1

/**
 * The payload every widget provider draws from — the one place that decides
 * which of the two the app wrote to read.
 *
 * The app writes payload v2, the widget contract (docs/rewrite-plan.md,
 * Phase 1) — alone since step 1.7 (`PrayerWidgetModule.setDataV2` with an
 * empty v1, which removes the old key). It is turned into the v1-shaped JSON
 * the renderers draw (`WidgetPayloadV1`), for this minute: the text written
 * here from the payload's clock, "today" and "next" decided now rather than
 * when the app last ran, and every row carrying its minutes, which is what
 * the renderers place a time by. A v1 is read only when there is no v2: one
 * the app wrote before this update, until it next runs, or its fallback
 * when v2 could not be built.
 */
object WidgetPayloadSource {
  const val PREFS_KEY_V2 = "payload_v2"

  private var cachedV2: String? = null
  private var cachedToday: String? = null
  private var cachedMinutes: Int = -1
  private var cachedJson: String? = null

  /** The v1-shaped payload JSON to draw now, or null when there is none. */
  @Synchronized
  fun json(context: Context): String? {
    val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val v2 = prefs.getString(PREFS_KEY_V2, null)
    if (v2 != null) {
      val now = System.currentTimeMillis()
      val todayKey = WallClock.dateKey(now)
      val nowMinutes = WallClock.minutesOf(now)
      // Several providers ask within the same redraw; the answer only moves
      // with the payload and the minute.
      if (v2 == cachedV2 && todayKey == cachedToday && nowMinutes == cachedMinutes) {
        cachedJson?.let { return it }
      }
      val adapted = try {
        WidgetContract.Payload.parse(v2)?.let { p ->
          p.days.firstOrNull { it.dateKey == todayKey }?.let { askForRebuildIfStale(context, v2, it) }
          WidgetPayloadV1.fromV2(p, todayKey, nowMinutes)
        }
      } catch (e: Exception) {
        android.util.Log.w("MihrabWidget", "payload v2 could not be adapted; drawing v1", e)
        null
      }
      if (adapted != null) {
        // Once per payload the app writes, not per redraw: enough to tell
        // from a bug report which of the two a widget was drawing.
        if (v2 != cachedV2) android.util.Log.i("MihrabWidget", "drawing from payload v2")
        val json = adapted.toString()
        cachedV2 = v2
        cachedToday = todayKey
        cachedMinutes = nowMinutes
        cachedJson = json
        return json
      }
    }
    return prefs.getString(PrayerWidgetProvider.PREFS_KEY, null)
  }

  /** The payload and offset a rebuild was last asked for, so it is asked once. */
  private var staleAskedFor: String? = null

  /**
   * TODAY'S TIMES WERE COMPUTED UNDER ANOTHER UTC OFFSET — ask the app for new
   * ones (the reason P1.1 chose wall clock plus the offset over instants).
   *
   * `Day.utcOffsetMinutes` is the offset the device used for the date when
   * the app built it. A device that has since moved zone, or a zone whose
   * rules changed (#56), draws a table for a clock it no longer keeps. A
   * widget cannot recompute prayer times, but it can start the app's own
   * refresh task headlessly — the same one its refresh glyph starts. Once
   * per payload and offset: if the app cannot run it, asking on every redraw
   * would not help. Best effort, as the glyph's is — a background start can
   * be refused.
   */
  private fun askForRebuildIfStale(context: Context, v2: String, today: WidgetContract.Day) {
    if (!WallClock.isStale(today)) return
    val key = "${v2.hashCode()}:${WallClock.utcOffsetMinutes(today.dateKey)}"
    if (key == staleAskedFor) return
    staleAskedFor = key
    android.util.Log.i(
      "MihrabWidget",
      "today's times were built at UTC${today.utcOffsetMinutes}; asking the app for new ones",
    )
    try {
      context.startService(android.content.Intent(context, WidgetRefreshHeadlessService::class.java))
    } catch (t: Throwable) {
      android.util.Log.w("MihrabWidget", "could not start the refresh task", t)
    }
  }
}
