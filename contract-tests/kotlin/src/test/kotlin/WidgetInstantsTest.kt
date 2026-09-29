package com.prayer_times.contract

import java.time.Instant
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The instant a card next changes — its boundary alarm and the target of its
 * countdown (WidgetInstants.next) — across the nights the clocks change.
 *
 * The countdown is a Chronometer, which counts elapsed time. It used to be
 * handed "next minus now" in minutes of the day, which on these two nights
 * is an hour away from elapsed time from ʿIshāʾ until the change: the
 * countdown reached zero an hour early in the spring and an hour late in
 * the autumn. Stockholm, whose 2026 changes are on 29 March (02:00 → 03:00)
 * and 25 October (03:00 → 02:00).
 */
class WidgetInstantsTest {
  private val zone = TimeZone.getTimeZone("Europe/Stockholm")

  private fun utc(iso: String): Long = Instant.parse(iso).toEpochMilli()

  private fun minutes(h: Int, m: Int) = h * 60 + m

  // A day's five and Sunrise, roughly Stockholm's; the numbers only need to be plausible.
  private val day = listOf(minutes(4, 50), minutes(6, 30), minutes(12, 20), minutes(15, 50), minutes(18, 35), minutes(20, 15))

  @Test
  fun afterIshaAimsAtTomorrowsFajrAcrossTheSpringChange() {
    val now = utc("2026-03-28T21:00:00Z") // 22:00 CET
    val tomorrow = listOf(minutes(4, 40)) + day.drop(1)
    val next = WidgetInstants.next(now, "2026-03-28", day, "2026-03-29", tomorrow, zone)!!
    assertTrue(next.nextDay)
    assertEquals(minutes(4, 40), next.minutes)
    assertEquals(utc("2026-03-29T02:40:00Z"), next.epochMs) // 04:40 CEST
    // 5 h 40 of elapsed time; wall minutes would have said 6 h 40.
    assertEquals(340L * 60_000L, next.epochMs - now)
  }

  @Test
  fun afterIshaAimsAtTomorrowsFajrAcrossTheAutumnChange() {
    val now = utc("2026-10-24T20:00:00Z") // 22:00 CEST
    val tomorrow = listOf(minutes(5, 30)) + day.drop(1)
    val next = WidgetInstants.next(now, "2026-10-24", day, "2026-10-25", tomorrow, zone)!!
    assertEquals(utc("2026-10-25T04:30:00Z"), next.epochMs) // 05:30 CET
    // 8 h 30 of elapsed time; wall minutes would have said 7 h 30.
    assertEquals(510L * 60_000L, next.epochMs - now)
  }

  @Test
  fun aTimeInTheHourThatHappensTwiceIsTheFirstOfTheTwo() {
    val lastThird = minutes(2, 30)
    val times = listOf(minutes(5, 30), lastThird)
    // 00:30 CEST: the Last Third is next, at the first 02:30 (CEST).
    val before = WidgetInstants.next(utc("2026-10-24T22:30:00Z"), "2026-10-25", times, null, emptyList(), zone)!!
    assertEquals(lastThird, before.minutes)
    assertEquals(utc("2026-10-25T00:30:00Z"), before.epochMs)
    // 02:15 CET, the second time round: that 02:30 has gone, and it is not
    // counted down to again — Fajr is next.
    val after = WidgetInstants.next(utc("2026-10-25T01:15:00Z"), "2026-10-25", times, null, emptyList(), zone)!!
    assertEquals(minutes(5, 30), after.minutes)
    assertEquals(utc("2026-10-25T04:30:00Z"), after.epochMs)
  }

  @Test
  fun aTimeInTheSpringGapMovesPastIt() {
    // 02:30 does not happen on 29 March; it lands at 03:30 CEST, as on iOS and in the app.
    val next = WidgetInstants.next(utc("2026-03-28T23:30:00Z"), "2026-03-29", listOf(minutes(2, 30)), null, emptyList(), zone)!!
    assertEquals(utc("2026-03-29T01:30:00Z"), next.epochMs)
  }

  @Test
  fun beforeTheChangeTheCountdownIsElapsedTime() {
    // 00:30 CET on the spring night, Fajr at 04:40 CEST: 3 h 10 of elapsed
    // time, where 04:40 − 00:30 in wall minutes is 4 h 10.
    val now = utc("2026-03-28T23:30:00Z")
    val next = WidgetInstants.next(now, "2026-03-29", listOf(minutes(4, 40)), null, emptyList(), zone)!!
    assertFalse(next.nextDay)
    assertEquals(190L * 60_000L, next.epochMs - now)
  }

  @Test
  fun theFirstThirdAfterMidnightStaysOnItsDay() {
    // 1440 and more: the First Third at 01:00 belongs to the evening before,
    // and comes before tomorrow's Fajr.
    val now = utc("2026-06-10T19:00:00Z") // 21:00 CEST
    val next = WidgetInstants.next(
      now, "2026-06-10", day + minutes(25, 0), "2026-06-11", listOf(minutes(3, 0)), zone,
    )!!
    assertFalse(next.nextDay)
    assertEquals(minutes(25, 0), next.minutes)
    assertEquals(utc("2026-06-10T23:00:00Z"), next.epochMs) // 01:00 CEST on the 11th
  }

  @Test
  fun withNoDayAfterItTheDaysOwnFirstStandsIn() {
    val now = utc("2026-06-10T19:00:00Z") // 21:00 CEST, after Isha
    val next = WidgetInstants.next(now, "2026-06-10", day, null, emptyList(), zone)!!
    assertTrue(next.nextDay)
    assertEquals(utc("2026-06-11T02:50:00Z"), next.epochMs) // 04:50 CEST, a day on
  }

  @Test
  fun aStaleDayWithNothingAfterItHasNothingToCountDownTo() {
    assertNull(WidgetInstants.next(utc("2026-06-10T10:00:00Z"), "2026-06-01", day, null, emptyList(), zone))
  }

  @Test
  fun theEarliestAheadNotTheFirstListed() {
    // Display order is not the clock: the night marks are drawn after Isha.
    // At 02:00 CEST, Midnight (00:40) has gone and the Last Third (02:50) is next.
    val times = listOf(minutes(20, 15), minutes(0, 40), minutes(2, 50), minutes(22, 10))
    val next = WidgetInstants.next(utc("2026-06-10T00:00:00Z"), "2026-06-10", times, null, emptyList(), zone)!!
    assertEquals(minutes(2, 50), next.minutes)
  }
}

/** Calendar days for "Last read today / yesterday", the shared night marks, the practice day shape. */
class WidgetHelpersTest {
  private val zone = TimeZone.getTimeZone("Europe/Stockholm")

  private fun utc(iso: String): Long = Instant.parse(iso).toEpochMilli()

  @Test
  fun calendarDaysNotElapsedOnes() {
    // Read at 23:30, looked at 08:00 the next morning: yesterday, though
    // fewer than 24 hours have passed.
    assertEquals(1, WallClock.calendarDaysBetween(utc("2026-06-09T21:30:00Z"), utc("2026-06-10T06:00:00Z"), zone))
    assertEquals(0, WallClock.calendarDaysBetween(utc("2026-06-10T04:00:00Z"), utc("2026-06-10T20:00:00Z"), zone))
    // Across the 23-hour day of the spring change.
    assertEquals(2, WallClock.calendarDaysBetween(utc("2026-03-28T11:00:00Z"), utc("2026-03-30T10:00:00Z"), zone))
  }

  @Test
  fun nightMarksAreTheThreeAndOnlyThose() {
    for (k in listOf("Midnight", "Lastthird", "Firstthird", "lastthird")) assertTrue(k, NightMarks.isNightKey(k))
    for (k in listOf("Sunrise", "Fajr", "Isha", "")) assertFalse(k, NightMarks.isNightKey(k))
  }

  @Test
  fun aPracticeDayLeavesItsZerosOut() {
    // PracticeGridBitmap tells "no `l`" from "`l` is 0".
    val empty = WidgetPayloadV1.practiceDayJson(WidgetContract.PracticeDay(d = "2026-06-10"))
    assertEquals(setOf("d", "k"), empty.keys().asSequence().toSet())
    val full = WidgetPayloadV1.practiceDayJson(
      WidgetContract.PracticeDay(d = "2026-06-10", kw = 3, l = 5, m = true, f = true, s = 2),
    )
    assertEquals(setOf("d", "k", "kw", "l", "m", "f", "s"), full.keys().asSequence().toSet())
  }
}
