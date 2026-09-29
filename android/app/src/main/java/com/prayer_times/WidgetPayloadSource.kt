package com.prayer_times

import android.content.Context
import android.content.Intent
import android.util.Log
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

  /** When a rebuild for a stale offset was last started, epoch ms (see `askForRebuildIfStale`). */
  private const val PREFS_STALE_ASK_MS = "stale_rebuild_ask_ms"

  /** At most one rebuild per this long, across processes. */
  private const val STALE_ASK_MIN_INTERVAL_MS = 15 * 60_000L

  private const val TAG = "MihrabWidget"

  private var cachedV2: String? = null
  private var cachedToday: String? = null
  private var cachedMinutes: Int = -1
  private var cachedJson: String? = null

  /** A v2 that did not adapt, so it is not re-parsed (and re-logged) on every read. */
  private var failedV2: String? = null

  /** The v1-shaped payload JSON to draw now, or null when there is none. */
  @Synchronized
  fun json(context: Context): String? {
    val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val v2 = prefs.getString(PREFS_KEY_V2, null)
    if (v2 != null && v2 != failedV2) {
      val now = System.currentTimeMillis()
      val todayKey = WallClock.dateKey(now)
      val nowMinutes = WallClock.minutesOf(now)
      // Several providers ask within the same redraw; the answer only moves
      // with the payload and the minute.
      if (v2 == cachedV2 && todayKey == cachedToday && nowMinutes == cachedMinutes) {
        cachedJson?.let { return it }
      }
      val adapted = try {
        // A later schema is a different contract, not a lenient read of this one.
        WidgetContract.Payload.parse(v2)?.takeIf { it.schemaVersion == WidgetContract.VERSION }?.let { p ->
          p.days.firstOrNull { it.dateKey == todayKey }?.let { askForRebuildIfStale(context, v2, it) }
          WidgetPayloadV1.fromV2(p, todayKey, nowMinutes)
        }
      } catch (e: Exception) {
        Log.w(TAG, "payload v2 could not be adapted", e)
        null
      }
      if (adapted != null) {
        // Once per payload the app writes, not per redraw: enough to tell
        // from a bug report which of the two a widget was drawing.
        if (v2 != cachedV2) Log.i(TAG, "drawing from payload v2")
        val json = adapted.toString()
        cachedV2 = v2
        cachedToday = todayKey
        cachedMinutes = nowMinutes
        cachedJson = json
        return json
      }
      failedV2 = v2
      Log.w(
        TAG,
        "payload v2 did not read; falling back to v1 (" +
          (if (prefs.contains(PrayerWidgetProvider.PREFS_KEY)) "present" else "absent") + ")",
      )
    }
    return prefs.getString(PrayerWidgetProvider.PREFS_KEY, null)
  }

  /**
   * Forget the adapted payload, so the next read adapts again — and checks
   * the offset again. For a clock or zone change (WidgetClockChangeReceiver):
   * the cache is keyed on the date and minute, and a change that lands on
   * the same reading would otherwise be answered from before it.
   */
  @Synchronized
  fun invalidate() {
    cachedV2 = null
    cachedJson = null
    cachedMinutes = -1
    cachedToday = null
    staleAskedFor = null
  }

  /** The payload and offset a rebuild was last started for, so it is started once. */
  private var staleAskedFor: String? = null

  /**
   * TODAY'S TIMES WERE COMPUTED UNDER ANOTHER UTC OFFSET — ask the app for new
   * ones (the reason P1.1 chose wall clock plus the offset over instants).
   *
   * `Day.utcOffsetMinutes` is the offset the device used for the date when
   * the app built it. A device that has since moved zone, or a zone whose
   * rules changed (#56), draws a table for a clock it no longer keeps. A
   * widget cannot recompute prayer times, but it can start the app's own
   * refresh task headlessly — the same one its refresh glyph starts.
   *
   * WHEN IT CAN BE STARTED. The refresh task is a plain started service, so
   * Android 8's background limits apply (not Android 12's foreground-service
   * ones). It starts from a redraw inside a temp-allowlisted broadcast — the
   * zone or clock change itself (WidgetClockChangeReceiver), the
   * allow-while-idle boundary alarm — and is refused with an
   * IllegalStateException from APPWIDGET_UPDATE or an unlock. So it is only
   * marked asked once a start is accepted: a refusal leaves the next redraw
   * free to try.
   *
   * Once per payload and offset, and at most once per
   * [STALE_ASK_MIN_INTERVAL_MS] across processes: a rebuild that cannot fix
   * the offset (the JS engine still on the old zone) writes a payload that is
   * still stale, and without the throttle each one would start another sync.
   */
  private fun askForRebuildIfStale(context: Context, v2: String, today: WidgetContract.Day) {
    if (!WallClock.isStale(today)) return
    val key = "${v2.hashCode()}:${WallClock.utcOffsetMinutes(today.dateKey)}"
    if (key == staleAskedFor) return
    val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    if (now - prefs.getLong(PREFS_STALE_ASK_MS, 0L) in 0 until STALE_ASK_MIN_INTERVAL_MS) return
    try {
      if (context.startService(Intent(context, WidgetRefreshHeadlessService::class.java)) != null) {
        staleAskedFor = key
        prefs.edit().putLong(PREFS_STALE_ASK_MS, now).apply()
        Log.i(TAG, "today's times were built at UTC${today.utcOffsetMinutes}; asked the app for new ones")
      }
    } catch (e: IllegalStateException) {
      Log.i(TAG, "rebuild for a stale offset refused in the background; will ask again from an allowed wake-up")
    } catch (t: Throwable) {
      Log.w(TAG, "could not start the refresh task", t)
    }
  }
}
