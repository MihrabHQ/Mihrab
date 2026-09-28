package com.prayer_times.contract

import java.io.File
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The widget contract fixtures, read by the Kotlin the Android app compiles
 * (android/…/contract). Every answer must equal the one the app's own
 * TypeScript gave (contract-tests/fixtures.json).
 *
 * Each test gathers every mismatch in its section before failing, so one run
 * shows the whole disagreement rather than the first line of it.
 */
class ContractFixturesTest {
  private val fixtures: JSONObject =
    JSONObject(File(System.getProperty("contract.fixtures") ?: "../fixtures.json").readText())

  private fun section(name: String): List<JSONObject> {
    val a = fixtures.optJSONArray(name) ?: return emptyList()
    return (0 until a.length()).mapNotNull { a.optJSONObject(it) }
  }

  private fun intOrNull(o: JSONObject, k: String): Int? = if (o.isNull(k)) null else o.getInt(k)

  /** Sorted-key JSON text with numbers by value, so values compare by content. */
  private fun canonical(v: Any?): String =
    when (v) {
      null, JSONObject.NULL -> "null"
      is JSONObject ->
        v.keySet().sorted().joinToString(",", "{", "}") { JSONObject.quote(it) + ":" + canonical(v.get(it)) }
      is JSONArray -> (0 until v.length()).joinToString(",", "[", "]") { canonical(v.get(it)) }
      is Boolean -> v.toString()
      is Number -> {
        val d = v.toDouble()
        if (d.isFinite() && d == Math.floor(d) && Math.abs(d) < 9e15) d.toLong().toString() else d.toString()
      }
      is String -> JSONObject.quote(v)
      else -> v.toString()
    }

  private fun report(failures: List<String>, checked: Int) {
    assertTrue("nothing was checked — is the fixtures file empty?", checked > 0)
    assertEquals("${failures.size} of $checked checks failed", "", failures.joinToString("\n"))
  }

  @Test
  fun decode() {
    val failures = mutableListOf<String>()
    val cases = section("decode")
    for (c in cases) {
      val type = c.getString("type")
      val reader = contractReaders[type]
      if (reader == null) {
        failures += "decode: no Kotlin reader for $type"
        continue
      }
      val want = canonical(c.opt("expected"))
      val have = canonical(reader(c.getString("input")))
      if (want != have) failures += "decode $type — ${c.getString("name")}\n    want $want\n    have $have"
    }
    report(failures, cases.size)
  }

  @Test
  fun readsTheV1Clock() {
    val failures = mutableListOf<String>()
    val cases = section("hhmm")
    for (c in cases) {
      val text = c.getString("text")
      val want = intOrNull(c, "minutes")
      val have = WallClock.minutesFromHHmm(text)
      if (want != have) failures += "hhmm \"$text\": want $want, have $have"
    }
    report(failures, cases.size)
  }

  @Test
  fun writesTimes() {
    val failures = mutableListOf<String>()
    val cases = section("text")
    for (c in cases) {
      val clock = WidgetContract.Clock.fromJson(c.getJSONObject("clock"))
      if (clock == null) {
        failures += "text: unreadable clock ${c.get("clock")}"
        continue
      }
      val minutes = intOrNull(c, "minutes")
      val want = c.getString("text")
      val have = WallClock.text(minutes, clock)
      if (want != have) failures += "text $minutes ${c.get("clock")}: want \"$want\", have \"$have\""
    }
    report(failures, cases.size)
  }

  @Test
  fun placesInstants() {
    val failures = mutableListOf<String>()
    val cases = section("instants")
    for (c in cases) {
      val zone = TimeZone.getTimeZone(c.getString("zone"))
      val dateKey = c.getString("dateKey")
      val minutes = c.getInt("minutes")
      val want = c.getLong("epochMs")
      val have = WallClock.epochMs(dateKey, minutes, zone)
      if (want != have) failures += "instant ${zone.id} $dateKey +$minutes: want $want, have $have"
    }
    report(failures, cases.size)
  }

  @Test
  fun recordsOffsets() {
    val failures = mutableListOf<String>()
    val cases = section("offsets")
    for (c in cases) {
      val zone = TimeZone.getTimeZone(c.getString("zone"))
      val dateKey = c.getString("dateKey")
      val want = intOrNull(c, "utcOffsetMinutes")
      val have = WallClock.utcOffsetMinutes(dateKey, zone)
      if (want != have) failures += "offset ${zone.id} $dateKey: want $want, have $have"
    }
    report(failures, cases.size)
  }

  @Test
  fun readsLocalTime() {
    val failures = mutableListOf<String>()
    val cases = section("local")
    for (c in cases) {
      val zone = TimeZone.getTimeZone(c.getString("zone"))
      val epoch = c.getLong("epochMs")
      val wantKey = c.getString("dateKey")
      val wantMinutes = c.getInt("minutes")
      val haveKey = WallClock.dateKey(epoch, zone)
      val haveMinutes = WallClock.minutesOf(epoch, zone)
      if (wantKey != haveKey || wantMinutes != haveMinutes) {
        failures += "local ${zone.id} $epoch: want $wantKey +$wantMinutes, have $haveKey +$haveMinutes"
      }
    }
    report(failures, cases.size)
  }

  @Test
  fun noticesAMovedOffset() {
    val failures = mutableListOf<String>()
    val cases = section("stale")
    for (c in cases) {
      val zone = TimeZone.getTimeZone(c.getString("zone"))
      val day = WidgetContract.Day.fromJson(c.getJSONObject("day"))
      if (day == null) {
        failures += "stale: unreadable day ${c.get("day")}"
        continue
      }
      val want = c.getBoolean("stale")
      val have = WallClock.isStale(day, zone)
      if (want != have) failures += "stale ${zone.id} ${c.get("day")}: want $want, have $have"
    }
    report(failures, cases.size)
  }

  @Test
  fun everyContractTypeHasAReader() {
    val types = section("decode").map { it.getString("type") }.toSet()
    val missing = types - contractReaders.keys
    assertEquals("types in the fixtures without a Kotlin reader", emptySet<String>(), missing)
  }
}
