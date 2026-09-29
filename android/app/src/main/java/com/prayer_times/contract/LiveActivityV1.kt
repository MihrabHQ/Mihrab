package com.prayer_times.contract

import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

/**
 * The shared Live Activity payload as the JSON the Android notification
 * draws from.
 *
 * A port of `liveActivityAndroidPayload` in
 * src/liveActivity/liveActivityV2.ts, held to the same answers by the
 * contract fixtures (the `liveActivityAndroid` cases). The app builds ONE
 * `LiveActivity` for both platforms (docs/rewrite-plan.md, step 1.5); this
 * turns it, for the minute it is drawn at, into the payload
 * `MihrabLiveActivityModule` and its service have always read, so neither
 * changes.
 *
 * The next prayer is an instant from its day and minutes (`WallClock.epochMs`)
 * rather than a "HH:mm" re-parsed on today — the app used to do that, an
 * hour off on the night the clocks change.
 */
object LiveActivityV1 {
  /** The payload at `todayKey` + `nowMinutes` in `zone`; null when nothing is ahead. */
  fun androidPayload(
    la: WidgetContract.LiveActivity,
    todayKey: String,
    nowMinutes: Int,
    zone: TimeZone = TimeZone.getDefault(),
  ): JSONObject? {
    val m = WidgetPayloadV1.moment(la.days, todayKey, nowMinutes) ?: return null
    val next = m.next ?: return null
    val nextEpochMs = WallClock.epochMs(m.today.dateKey, next.at, zone) ?: return null
    val prevEpochMs =
      WidgetPayloadV1.previous(m)?.let { WallClock.epochMs(m.today.dateKey, it.at, zone) } ?: 0L
    val clock = la.clock
    val modes = la.alertModes.associate { it.key to it.mode.wire }
    val hijri = la.hijri.associate { it.dateKey to it.text }
    val nextDateKey =
      if (next.at >= WallClock.MINUTES_PER_DAY && m.tomorrow != null) m.tomorrow.dateKey
      else m.today.dateKey

    fun row(r: WidgetContract.Row): JSONObject {
      val o = JSONObject()
      o.put("key", r.key)
      o.put("name", r.name)
      val minutes = r.minutes
      if (minutes == null) {
        o.put("time", WallClock.NO_TIME)
      } else {
        val (time, display) = WidgetPayloadV1.timePair(minutes, clock)
        o.put("time", time)
        display?.let { o.put("display", it) }
      }
      o.put("mode", modes[r.key] ?: "notification")
      return o
    }

    fun rows(list: List<WidgetContract.Row>): JSONArray =
      JSONArray().apply { list.forEach { put(row(it)) } }

    val (nextTime, nextDisplay) = WidgetPayloadV1.timePair(next.at, clock)
    val nextTimeDisplay = nextDisplay ?: nextTime
    val out = JSONObject()
    out.put("nextKey", next.row.key)
    out.put("nextLabel", next.row.name)
    out.put("nextTime", WidgetPayloadV1.hhmm(next.at))
    out.put("nextTimeDisplay", nextTimeDisplay)
    out.put("nextEpochMs", nextEpochMs)
    out.put("prevEpochMs", prevEpochMs)
    out.put("title", "${next.row.name} · $nextTimeDisplay")
    out.put("rows", rows(m.shown.prayers))
    m.shown.sunrise?.let { out.put("sunriseRow", row(it)) }
    out.put("extraRows", rows(m.shown.extras))
    out.put(
      "days",
      JSONArray().apply {
        la.days.filter { !it.estimated }.forEach { d ->
          val o = JSONObject()
          o.put("dateKey", d.dateKey)
          o.put("hijriLabel", hijri[d.dateKey] ?: "")
          o.put("rows", rows(d.prayers))
          d.sunrise?.let { o.put("sunriseRow", row(it)) }
          o.put("extraRows", rows(d.extras))
          put(o)
        }
      },
    )
    out.put("hijriLabel", hijri[nextDateKey] ?: "")
    out.put("showHijri", true)
    val a = la.appearance
    out.put("accentHex", a.accentHex)
    out.put("systemAccent", a.systemAccent)
    out.put("tinted", a.tinted)
    out.put("design", a.design.wire)
    out.put("secondMetric", "time")
    val android = la.android
    out.put("alertActionEnabled", android.alertActionEnabled)
    out.put("aodActionEnabled", android.aodActionEnabled)
    out.put("adhanChannelId", android.adhanChannelId)
    out.put("adhanSoundId", android.adhanSoundId)
    out.put("defaultChannelId", android.defaultChannelId)
    val w = la.words
    out.put("fgsText", w.fgsText)
    out.put("alertLabelAdhan", w.alertLabelAdhan)
    out.put("alertLabelNotification", w.alertLabelNotification)
    out.put("alertLabelSilent", w.alertLabelSilent)
    out.put("alertOnceWord", w.alertOnceWord)
    out.put("aodHideLabel", w.aodHideLabel)
    out.put("aodShowLabel", w.aodShowLabel)
    out.put("nowWord", w.nowWord)
    out.put("inWord", w.inWord)
    out.put("atWord", w.atWord)
    out.put("atPrayerBody", w.atPrayerBody)
    return out
  }
}
