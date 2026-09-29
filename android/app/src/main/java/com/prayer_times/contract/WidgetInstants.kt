package com.prayer_times.contract

import java.util.TimeZone

/**
 * The instant a home-screen card next changes, which is both when its alarm
 * has to fire and what its countdown aims at.
 *
 * An instant, not "minutes from now". The Chronometer a card counts down
 * with, and the alarm that redraws it, both run on elapsed time; wall-clock
 * minutes are not that on the two nights a year the clocks change, and a
 * countdown built from `next - now` in minutes of the day was an hour out
 * from ʿIshāʾ until the change. Every instant comes from `WallClock.epochMs`
 * on the time's own date, which also settles the hour that happens twice.
 *
 * Pure: the providers hand in the minutes they read, so the rules can be
 * held to their answers on the JVM (contract-tests/kotlin).
 */
object WidgetInstants {
  /** What comes next: its instant, its minutes on its own day, and which day. */
  data class Next(
    val epochMs: Long,
    /** Minutes after the midnight that starts the day it is on (may pass 1440). */
    val minutes: Int,
    /** True when it is the following day's, the day being done. */
    val nextDay: Boolean,
  )

  /**
   * The first of a day's times still ahead of `nowMs`. When the day is done,
   * the earliest time of the day after it (after ʿIshāʾ, tomorrow's Fajr);
   * when the window has no day after it, the day's own earliest a day
   * later — a minute or two out, and a countdown a minute out beats none.
   *
   * Null when nothing resolves to an instant after `nowMs`: a stale day with
   * no following one has nothing honest to count down to.
   *
   * @param dayMinutes minutes after the midnight that starts `dayKey`; a
   *   night mark after midnight carries 1440 and more.
   */
  fun next(
    nowMs: Long,
    dayKey: String,
    dayMinutes: Collection<Int>,
    nextDayKey: String?,
    nextDayMinutes: Collection<Int>,
    zone: TimeZone = TimeZone.getDefault(),
  ): Next? {
    var best: Next? = null
    for (m in dayMinutes) {
      val at = WallClock.epochMs(dayKey, m, zone) ?: continue
      if (at > nowMs && (best == null || at < best.epochMs)) best = Next(at, m, nextDay = false)
    }
    if (best != null) return best

    val wrapped =
      nextDayMinutes.minOrNull()?.let { first ->
        nextDayKey?.let { key -> WallClock.epochMs(key, first, zone)?.let { Next(it, first, nextDay = true) } }
      }
        ?: dayMinutes.minOrNull()?.let { first ->
          WallClock.epochMs(dayKey, first + WallClock.MINUTES_PER_DAY, zone)?.let { Next(it, first, nextDay = true) }
        }
    return wrapped?.takeIf { it.epochMs > nowMs }
  }
}
