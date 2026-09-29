package com.prayer_times.contract

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.Locale
import java.util.TimeZone

/**
 * The one place a widget or the Live Activity turns a contract time into
 * text or an instant. Mirrors src/widget/wallClock.ts and
 * ios/Contract/WallClock.swift; the three are held to the same answers by
 * the contract tests.
 *
 * Contract times are wall clock: minutes after the local midnight that
 * starts a day's `dateKey` (see scripts/contract/widget-contract.js for why
 * not instants). Before this there were six hand-written "HH:mm" parsers in
 * Kotlin, two of them copies of each other, each with its own idea of what a
 * malformed time meant.
 *
 * java.util.Calendar rather than java.time: minSdk is 24 and the app does
 * not desugar. Always a GregorianCalendar (`gregorian`), never
 * `Calendar.getInstance`: that follows the default locale, and for a Thai
 * one the JVM hands back a BuddhistCalendar — today's key came out as
 * 2569-09-21, matched no payload day, and an instant built from a payload
 * key landed 543 years out. The payload's keys are Gregorian, always.
 */
object WallClock {
  const val MINUTES_PER_DAY = 1440

  /** What a time that does not occur (high latitudes) is drawn as. */
  const val NO_TIME = "—"

  private val HHMM = Regex("^([0-9]{1,2}):([0-9]{2})$")
  /** The calendar every date here is read and built on; see the note above. */
  private fun gregorian(zone: TimeZone): Calendar = GregorianCalendar(zone, Locale.ROOT)

  private val DATE_KEY = Regex("^([0-9]{4})-([0-9]{2})-([0-9]{2})$")

  // ── Reading the v1 payload ────────────────────────────────────────────

  /**
   * "05:12" → 312. Null for anything that is not a clock ("—", "", "5:12 PM").
   *
   * Only for the v1 payload's canonical 24-hour strings, until payload v1 is
   * retired; v2 carries minutes and never needs parsing.
   */
  fun minutesFromHHmm(text: String?): Int? {
    val m = HHMM.find(text ?: return null) ?: return null
    val h = m.groupValues[1].toInt()
    val min = m.groupValues[2].toInt()
    if (h !in 0..23 || min !in 0..59) return null
    return h * 60 + min
  }

  // ── Text ──────────────────────────────────────────────────────────────

  data class Parts(
    /** "5:31" or "17:31" — Latin digits, never localised. */
    val digits: String,
    /** "PM" / "م" / "下午", or null on a 24-hour clock. */
    val period: String?,
    /** The period is written before the digits. */
    val periodFirst: Boolean,
  )

  /** The pieces of a time, for a layout that draws the marker smaller. */
  fun parts(minutes: Int, clock: WidgetContract.Clock): Parts {
    val m = Math.floorMod(minutes, MINUTES_PER_DAY)
    val hour = m / 60
    val minute = String.format(Locale.ROOT, "%02d", m % 60)
    if (!clock.hour12) {
      return Parts(String.format(Locale.ROOT, "%02d", hour) + ":" + minute, null, false)
    }
    val h12 = if (hour % 12 == 0) 12 else hour % 12
    return Parts("$h12:$minute", if (hour < 12) clock.am else clock.pm, clock.periodFirst)
  }

  /** A time as the app writes it (src/utils/clockFormat.ts); null draws a dash. */
  fun text(minutes: Int?, clock: WidgetContract.Clock): String {
    if (minutes == null) return NO_TIME
    val p = parts(minutes, clock)
    val period = p.period
    if (period.isNullOrEmpty()) return p.digits
    return if (p.periodFirst) period + p.digits else p.digits + " " + period
  }

  // ── Dates and instants ────────────────────────────────────────────────

  /** "2026-09-28" → [2026, 9, 28]. Null for anything else. */
  fun parseDateKey(key: String?): IntArray? {
    val m = DATE_KEY.find(key ?: return null) ?: return null
    val y = m.groupValues[1].toInt()
    val mo = m.groupValues[2].toInt()
    val d = m.groupValues[3].toInt()
    if (mo !in 1..12 || d !in 1..31) return null
    return intArrayOf(y, mo, d)
  }

  /** The local calendar date of `epochMs` as a contract date key. */
  fun dateKey(epochMs: Long, zone: TimeZone = TimeZone.getDefault()): String {
    val c = gregorian(zone).apply { timeInMillis = epochMs }
    return String.format(
      Locale.ROOT,
      "%04d-%02d-%02d",
      c.get(Calendar.YEAR),
      c.get(Calendar.MONTH) + 1,
      c.get(Calendar.DAY_OF_MONTH),
    )
  }

  /** Minutes after local midnight of the day `epochMs` falls on. */
  fun minutesOf(epochMs: Long, zone: TimeZone = TimeZone.getDefault()): Int {
    val c = gregorian(zone).apply { timeInMillis = epochMs }
    return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
  }

  /**
   * The instant `minutes` after local midnight of `dateKey`, in `zone`.
   * Minutes past the end of the day roll into the next.
   *
   * Set through the calendar's fields rather than added to midnight, so a
   * time inside a daylight-saving gap moves forward past the gap, as it does
   * on iOS and in the app.
   *
   * A time the clock shows twice (the hour it goes back) is the EARLIER of
   * the two instants. That is what Foundation and JavaScript's Date choose;
   * java.util.Calendar chooses the later one, which put Android an hour
   * behind the other two on that one night (measured 2026-09-28, Stockholm,
   * 2026-10-25 02:30).
   */
  fun epochMs(dateKey: String?, minutes: Int, zone: TimeZone = TimeZone.getDefault()): Long? {
    val ymd = parseDateKey(dateKey) ?: return null
    val dayShift = Math.floorDiv(minutes, MINUTES_PER_DAY)
    val m = Math.floorMod(minutes, MINUTES_PER_DAY)
    val t = gregorian(zone).apply {
      clear()
      set(ymd[0], ymd[1] - 1, ymd[2], m / 60, m % 60, 0)
      if (dayShift != 0) add(Calendar.DAY_OF_MONTH, dayShift)
    }.timeInMillis
    val wall = t + zone.getOffset(t)
    for (back in longArrayOf(120, 60, 30)) {
      val earlier = t - back * 60_000L
      if (earlier + zone.getOffset(earlier) == wall) return earlier
    }
    return t
  }

  /**
   * The UTC offset `zone` uses at local noon of `dateKey`, in minutes —
   * what the app wrote into `Day.utcOffsetMinutes`.
   */
  fun utcOffsetMinutes(dateKey: String?, zone: TimeZone = TimeZone.getDefault()): Int? {
    val noon = epochMs(dateKey, 12 * 60, zone) ?: return null
    return zone.getOffset(noon) / 60_000
  }

  /**
   * True when the day's times were computed under an offset the device no
   * longer uses for that date — the zone's rules changed (#56) or the device
   * moved zones. A day that did not record its offset is taken on trust.
   */
  fun isStale(day: WidgetContract.Day, zone: TimeZone = TimeZone.getDefault()): Boolean {
    val written = day.utcOffsetMinutes ?: return false
    val now = utcOffsetMinutes(day.dateKey, zone) ?: return false
    return written != now
  }
}
