package com.prayer_times.contract

import java.util.Locale
import java.util.TimeZone
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The contract's dates are Gregorian whatever calendar the phone's locale
 * would pick. `Calendar.getInstance` follows the default locale, and on a
 * Thai one that is a BuddhistCalendar (year 2569 for 2026) — so a device key
 * built with it matched no payload day, and an instant built from a payload
 * key landed 543 years away. PrayerWidgetProvider.todayDateKey learned this
 * long ago; WallClock is where every new reader gets its dates from.
 */
class WallClockCalendarTest {
  private val saved = Locale.getDefault()
  private val zone = TimeZone.getTimeZone("Asia/Bangkok")

  @After
  fun restore() = Locale.setDefault(saved)

  private fun answers(): List<Any?> {
    val epoch = 1_790_000_000_000L // 2026-09-21T14:13:20Z
    return listOf(
      WallClock.dateKey(epoch, zone),
      WallClock.minutesOf(epoch, zone),
      WallClock.epochMs("2026-09-21", 21 * 60 + 13, zone),
      WallClock.utcOffsetMinutes("2026-09-21", zone),
    )
  }

  @Test
  fun sameAnswersUnderEveryCalendarALocaleCanPick() {
    Locale.setDefault(Locale.ROOT)
    val want = answers()
    assertEquals(listOf("2026-09-21", 21 * 60 + 13, 1_790_000_000_000L - 20_000L, 420), want)
    for (tag in listOf("th-TH", "th-TH-u-nu-thai", "ja-JP-u-ca-japanese", "fa-IR", "ar-SA-u-ca-islamic")) {
      Locale.setDefault(Locale.forLanguageTag(tag))
      assertEquals(tag, want, answers())
    }
  }
}
