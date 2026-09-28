package com.prayer_times.contract

import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/**
 * Payload v2 as the v1 JSON the widgets' renderers already draw.
 *
 * A port of `widgetPayloadV1FromV2` in src/widget/widgetPayloadV2.ts, held
 * to the same answers by the contract fixtures (contract-tests/, the `adapt`
 * cases). While the app writes both payloads (docs/rewrite-plan.md, step
 * 1.4) the providers read this: the data arrives through the lenient
 * generated reader, the text is written here from minutes and the payload's
 * clock, and not one renderer had to change to get either.
 *
 * Wall clock throughout — `todayKey` and `nowMinutes` are the device's local
 * date and minutes since its midnight — so the answer does not depend on
 * which zone the question is asked in. The rules are the app's own:
 *
 *   - "today" is the day whose date is the device's; the day shown is today
 *     while any of its times is still ahead, else the day after;
 *   - "next" is the earliest of today's times still ahead and all of the
 *     next day's — or, when the next day is an estimate, its Fajr.
 */
object WidgetPayloadV1 {
  private class Event(val row: WidgetContract.Row, val at: Int)

  /** The v1 payload, or null when there are no days to draw from. */
  fun fromV2(p: WidgetContract.Payload, todayKey: String, nowMinutes: Int): JSONObject? {
    val days = p.days
    if (days.isEmpty()) return null
    val clock = p.clock

    var todayIndex = days.indexOfFirst { it.dateKey == todayKey }
    var now = nowMinutes
    if (todayIndex < 0) {
      // Written before today (the app has not run since) or after it (a clock
      // set back): take the first day not yet past, and if it is a later day,
      // everything on it is still ahead.
      todayIndex = days.indexOfFirst { it.dateKey > todayKey }
      if (todayIndex < 0) todayIndex = days.size - 1 else now = -1
    }
    val today = days[todayIndex]
    val tomorrow = days.getOrNull(todayIndex + 1)

    val ahead = eventsOf(today, 0).filter { it.at > now }
    val shown = if (ahead.isNotEmpty() || tomorrow == null) today else tomorrow

    val next: Event? =
      if (tomorrow?.estimated == true) {
        earliest(ahead) ?: earliest(eventsOf(tomorrow, 1440).filter { it.row.key == "Fajr" })
      } else {
        earliest(ahead + (tomorrow?.let { eventsOf(it, 1440) } ?: emptyList()))
      }

    val out = JSONObject()
    out.put("dayLabel", shown.label)
    putRows(out, shown, clock)
    out.put("nextKey", next?.row?.key ?: JSONObject.NULL)
    if (next != null) {
      out.put("nextPrayerName", next.row.name)
      val (time, display) = timePair(next.at, clock)
      out.put("nextPrayerTime", time)
      display?.let { out.put("nextPrayerDisplay", it) }
    }
    if (p.locationName.isNotEmpty()) out.put("locationName", p.locationName)
    if (p.language.isNotEmpty()) out.put("language", p.language)
    p.seasonal?.let { s ->
      out.put(
        "seasonal",
        JSONObject()
          .put("jumuah", s.jumuah)
          .put("ramadan", s.ramadan)
          .put("eid", s.eid?.wire ?: JSONObject.NULL),
      )
    }
    out.put(
      "days",
      JSONArray().apply {
        for (d in days) {
          if (d.estimated) continue
          val o = JSONObject().put("dateKey", d.dateKey).put("dayLabel", d.label)
          putRows(o, d, clock)
          put(o)
        }
      },
    )
    p.today?.let { t ->
      out.put(
        "today",
        JSONObject()
          .put("dateKey", t.dateKey)
          .put("logged", t.logged)
          .put("loggable", t.loggable)
          .put("owed", t.owed)
          .put(
            "prayers",
            JSONArray().apply {
              for (pr in t.prayers) {
                val o = JSONObject().put("key", pr.key).put("name", pr.name)
                putTime(o, pr.minutes, clock)
                o.put("status", pr.status?.wire ?: JSONObject.NULL).put("due", pr.due)
                put(o)
              }
            },
          ),
      )
    }
    p.practice?.let { pr ->
      out.put(
        "practice",
        JSONObject()
          .put("streak", pr.streak)
          .put("bestStreak", pr.bestStreak)
          .put("loggedToday", pr.loggedToday)
          .put("owed", pr.owed)
          .put("sunnahRate", pr.sunnahRate ?: JSONObject.NULL)
          .put("fastsThisMonth", pr.fastsThisMonth)
          .put(
            "days",
            JSONArray().apply {
              for (d in pr.days) {
                // `k` only because the iOS decoder requires it; every renderer
                // reads `kw` first, and `kw` is absent only when the score is 0.
                val o = JSONObject().put("d", d.d).put("k", 0)
                if (d.kw != 0) o.put("kw", d.kw)
                if (d.l != 0) o.put("l", d.l)
                if (d.m) o.put("m", true)
                if (d.f) o.put("f", true)
                if (d.s != 0) o.put("s", d.s)
                put(o)
              }
            },
          )
          .apply { pr.since?.let { put("since", it) } },
      )
    }
    p.reading?.let { r ->
      val o = JSONObject()
        .put("surah", r.surah)
        .put("surahName", r.surahName)
        .put("ayah", r.ayah)
        .put("page", r.page)
        .put("juz", r.juz)
        .put("pagesRead", r.pagesRead)
        .put("totalPages", r.totalPages)
        .put("bookmarks", r.bookmarks)
        .put("lastReadAt", r.lastReadAt ?: JSONObject.NULL)
        .put("mode", r.mode.wire)
        .put("started", r.started)
        .put("downloaded", r.downloaded)
      r.khatmah?.let { k ->
        val kh = JSONObject()
          .put("day", k.day)
          .put("targetDays", k.targetDays)
          .put("pagesToday", k.pagesToday)
          .put("doneToday", k.doneToday)
          .put("behindBy", k.behindBy)
          .put("daysLeft", k.daysLeft)
        if (k.skipped != 0) kh.put("skipped", k.skipped)
        o.put("khatmah", kh)
      }
      out.put("reading", o)
    }
    p.hijri?.let { h ->
      out.put(
        "hijri",
        JSONObject()
          .put("day", h.day)
          .put("month", h.month)
          .put("year", h.year)
          .put("monthName", h.monthName)
          .put("label", h.label)
          .put("nextMonthName", h.nextMonthName)
          .put("nextMonthInDays", h.nextMonthInDays),
      )
    }
    p.tasbih?.let { t -> out.put("tasbih", t.toJson()) }
    return out
  }

  /** Every time on a day, placed `offset` minutes from today's midnight. */
  private fun eventsOf(day: WidgetContract.Day, offset: Int): List<Event> {
    val rows = day.prayers + listOfNotNull(day.sunrise) + day.extras
    return rows.mapNotNull { r -> r.minutes?.let { Event(r, offset + it) } }
  }

  private fun earliest(events: List<Event>): Event? {
    var best: Event? = null
    for (e in events) if (best == null || e.at < best.at) best = e
    return best
  }

  /** Canonical 24-hour 'HH:mm', as v1 carried every time. */
  private fun hhmm(minutes: Int): String {
    val m = Math.floorMod(minutes, WallClock.MINUTES_PER_DAY)
    return String.format(Locale.ROOT, "%02d:%02d", m / 60, m % 60)
  }

  /** `time`, and `display` when it reads differently — the v1 pair. */
  private fun timePair(minutes: Int, clock: WidgetContract.Clock): Pair<String, String?> {
    val time = hhmm(minutes)
    val display = WallClock.text(minutes, clock)
    return time to display.takeIf { it != time }
  }

  private fun putTime(o: JSONObject, minutes: Int?, clock: WidgetContract.Clock) {
    if (minutes == null) {
      o.put("time", WallClock.NO_TIME)
      return
    }
    val (time, display) = timePair(minutes, clock)
    o.put("time", time)
    display?.let { o.put("display", it) }
  }

  private fun rowJson(r: WidgetContract.Row, clock: WidgetContract.Clock): JSONObject {
    val o = JSONObject().put("key", r.key)
    putTime(o, r.minutes, clock)
    return o.put("abbr", r.abbr).put("name", r.name)
  }

  private fun putRows(o: JSONObject, day: WidgetContract.Day, clock: WidgetContract.Clock) {
    o.put("rows", JSONArray().apply { day.prayers.forEach { put(rowJson(it, clock)) } })
    day.sunrise?.let { o.put("sunriseRow", rowJson(it, clock)) }
    if (day.extras.isNotEmpty()) {
      o.put("extraRows", JSONArray().apply { day.extras.forEach { put(rowJson(it, clock)) } })
    }
  }
}
