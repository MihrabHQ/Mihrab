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
 * Phase 1), beside v1, in the same edit (`PrayerWidgetModule.setDataV2`).
 * When v2 is there and reads, it is turned into the v1 JSON the renderers
 * already draw (`WidgetPayloadV1`), for this minute: the text written here
 * from the payload's clock, "today" and "next" decided now rather than when
 * the app last ran. When it is absent — an older app, or the app's fallback
 * when v2 could not be built, which also removes it — or does not read, v1
 * is used exactly as written, as it always was.
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
        WidgetContract.Payload.parse(v2)?.let { WidgetPayloadV1.fromV2(it, todayKey, nowMinutes) }
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
}
