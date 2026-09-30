package com.prayer_times

import android.app.AlarmManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetPayloadV1
import org.json.JSONObject

/**
 * Mihrab Live Activity foreground service.
 *
 * Why a foreground service: the OS keeps the app process alive while
 * the service is up, so our internal Handler can re-post the rich
 * notification once a minute and the progress bar actually advances
 * without anyone opening the app.
 *
 * Dual-notification architecture (v2.1.0-beta.10+):
 *
 *   Notification A — FGS placeholder (FGS_NOTIF_ID, mihrab_fgs_v1 channel,
 *     IMPORTANCE_MIN): posted via startForeground(). This satisfies
 *     Android's foreground-service requirement and keeps the process alive.
 *     It is intentionally silent and hidden — users never see it.
 *
 *   Notification B — rich chip notification (NOTIF_ID, mihrab_live_activity_v3
 *     channel, IMPORTANCE_HIGH): posted via regular notify(). Because it is
 *     NOT the FGS notification, NMS does NOT add FLAG_FOREGROUND_SERVICE to
 *     it, which means NMS CAN set FLAG_PROMOTED_ONGOING on it — making it
 *     eligible for the Android 16 status-bar Live Update chip.
 *
 * KEY INSIGHT (confirmed by inspecting EasyPark's live StatusBarNotification):
 *   FLAG_PROMOTED_ONGOING and FLAG_FOREGROUND_SERVICE are mutually exclusive.
 *   NMS only promotes regular notify() notifications to the chip — never FGS
 *   notifications. EasyPark's chip works because their parking notification is
 *   posted via notify(), not startForeground().
 *
 * Lifecycle:
 *  - JS toggles Live Activity ON  → MihrabLiveActivityModule.display(json)
 *      → ContextCompat.startForegroundService(...) with the payload as
 *        an Intent extra. The service calls startForeground() with the
 *        FGS placeholder, then notify() with the rich chip notification,
 *        then schedules its own per-minute ticker.
 *  - Every minute the ticker re-posts the rich notification (NOTIF_ID)
 *    via notify() so the progress bar advances (progress value is
 *    recomputed each tick from prevEpochMs / nextEpochMs).
 *  - JS pushes a fresh payload (e.g. when a prayer time passes) →
 *      service updates its cached payload and re-posts immediately.
 *  - JS toggles Live Activity OFF → MihrabLiveActivityModule.cancel()
 *      → context.stopService(serviceIntent), service onDestroy() cancels
 *        the ticker and removes both notifications.
 *
 * Foreground service type: `specialUse` (Android 14+ requires a type).
 * The manifest declares the property with subtype `prayerCountdown` so
 * the platform / Play Store has a documented justification.
 */
class MihrabLiveActivityService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private var ticker: Runnable? = null
  /** Most recent JSON payload pushed by JS. The ticker rebuilds the
   *  notification from this every minute. */
  @Volatile private var lastPayload: String? = null

  /** True while the screen is interactive. With it on, the platform's
   *  chronometer ticks the seconds; with it off — the always-on display,
   *  where that chronometer freezes — the card shows hours and minutes as
   *  text and is re-posted at each minute (`ambient` in the payload). */
  @Volatile private var screenOn = true

  /** Next-prayer epoch the deep-sleep wake alarm is currently set for. Lets
   *  the per-second ticker skip re-arming the exact alarm every tick — it only
   *  reschedules when the upcoming prayer actually changes. */
  @Volatile private var lastAlarmEpoch = 0L

  /** Flips [screenOn] and re-posts immediately so the countdown switches
   *  between the per-second and per-minute formats the instant the screen
   *  turns on or off. */
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> screenOn = true
        Intent.ACTION_SCREEN_OFF -> screenOn = false
        else -> return
      }
      repostNow()
      scheduleTicker()
      scheduleMinuteAlarm()
    }
  }

  override fun onCreate() {
    super.onCreate()
    screenOn = (getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isInteractive ?: true
    runCatching {
      registerReceiver(
        screenReceiver,
        IntentFilter().apply {
          addAction(Intent.ACTION_SCREEN_ON)
          addAction(Intent.ACTION_SCREEN_OFF)
          addAction(Intent.ACTION_USER_PRESENT)
        },
      )
    }
  }

  /**
   * Material You wallpaper-colour changes (and light/dark switches) arrive as
   * a configuration change. Re-post immediately so a system-accent Live
   * Activity picks up the new colour without waiting for the next tick or the
   * app being reopened.
   */
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    repostNow()
  }

  /** Rebuild + re-post the rich notification from the cached payload now. */
  private fun repostNow() {
    val payload = lastPayload ?: return
    runCatching {
      NotificationManagerCompat.from(this)
        .notify(MihrabLiveActivityModule.NOTIF_ID, build(payload))
    }
  }

  /**
   * Write an advance down, whenever the card has moved on from what is
   * stored.
   *
   * THE WALK USED TO LIVE ONLY IN MEMORY. `lastPayload` is a field on this
   * service; everything that rebuilds the card from OUTSIDE it — both action
   * buttons, which re-post the moment they are pressed — reads the PERSISTED
   * payload, and that was whatever JS last wrote. Open the app at the First
   * Third, lock the phone, press the button an hour later and the card was
   * rebuilt from a payload naming an event that had already passed: it jumped
   * backwards onto a countdown running the wrong way (`-40:19`), and the
   * button went with it, aiming the override at an event nobody can be
   * alerted at any more. It also handed the headless task that event's name
   * for the title of the alert it was re-creating.
   *
   * Called from BOTH places that advance, because there are two and covering
   * one is the same bug with a smaller window. The ticker is the obvious one.
   * The other is `onStartCommand`: the exact wake alarm fires at a prayer
   * boundary and re-enters here, and in doze that is the ONLY one that runs —
   * the handler ticker is suspended, so for a phone in a pocket the alarm
   * path is the normal case and the ticker is the exception.
   *
   * Compares the instant rather than the string, and writes only when it has
   * changed, so this costs one prefs read a minute and a write a few times a
   * day.
   */
  private fun persistIfAdvanced(candidate: String) {
    runCatching {
      val next = JSONObject(candidate).optLong("nextEpochMs", 0L)
      if (next <= 0L) return
      val storedJson = MihrabLiveActivityModule.loadPayload(this)
      val stored = storedJson?.let { JSONObject(it).optLong("nextEpochMs", -1L) } ?: -1L
      if (stored == next) return
      MihrabLiveActivityModule.savePayload(this, candidate)
      Log.i(TAG, "persisted advance: nextEpochMs $stored -> $next")
    }.onFailure { Log.w(TAG, "persist advanced payload failed", it) }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Payload source: a fresh push from JS (EXTRA_PAYLOAD), or — when the OS or
    // our own wake-alarm restarted us with no extra — the stored one
    // (`currentPayload`). This is what lets the exact alarm below
    // revive/advance the notification during deep sleep without the app
    // being opened.
    val incoming = intent?.getStringExtra(EXTRA_PAYLOAD)
      ?: MihrabLiveActivityModule.currentPayload(this)
    if (incoming == null) {
      stopWithoutPayload(startId)
      return START_NOT_STICKY
    }
    // Advance to the interval that is current *right now* before the first
    // paint — critical when an exact alarm woke us at a prayer boundary
    // during doze (otherwise we'd briefly repaint the just-elapsed prayer).
    val payload = recomputeFromDays(incoming)
      ?: tryAdvanceToNextPrayer(incoming)
      ?: incoming
    lastPayload = payload
    // The wake-alarm path. In doze this is the only advance that runs.
    persistIfAdvanced(payload)
    // Channel safety net — required on Android 8+ before startForeground.
    // The JS bridge creates them too, but the service can run independent
    // of that path (system-restarted instance after OOM, etc.).
    MihrabLiveActivityModule.ensureChannelExists(this)
    MihrabLiveActivityModule.ensureFgsChannelExists(this)

    // Single-notification architecture (v2.5.0): the rich ProgressStyle
    // notification IS the foreground-service notification. On this platform
    // it is still eligible for the Android 16 status-bar Live Update chip.
    try {
      val richNotif = build(payload)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(
          MihrabLiveActivityModule.NOTIF_ID,
          richNotif,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
        )
      } else {
        startForeground(MihrabLiveActivityModule.NOTIF_ID, richNotif)
      }
      Log.i(TAG, "startForeground posted rich notification id=${MihrabLiveActivityModule.NOTIF_ID}")
    } catch (t: Throwable) {
      Log.w(TAG, "startForeground failed", t)
    }

    scheduleTicker()
    // Wake the device at the next prayer so the countdown advances even in
    // deep sleep, when the Handler ticker (uptime-based) is suspended.
    scheduleWakeAlarm(payload)
    // And, with the screen off, at the next minute: the always-on display
    // shows the hours and minutes as text, which only moves when re-posted.
    scheduleMinuteAlarm()
    // START_STICKY so the system restarts the service if the OS kills it
    // for memory. That restart has no extra, and draws from the stored
    // payload — the shared one adapted for that minute, else the last one
    // shown (`MihrabLiveActivityModule.currentPayload`).
    return START_STICKY
  }

  /**
   * Started with nothing to draw: the feature was turned off, or nothing is
   * ahead, and the wake alarm or the system started this anyway.
   *
   * A service started with `startForegroundService` MUST reach
   * `startForeground` before it stops: the system kills the app otherwise
   * (ForegroundServiceDidNotStartInTimeException), and stopping first counts
   * as not reaching it. So: a silent placeholder, then down, and the alarm
   * that may have started us is cancelled so it does not do it again.
   */
  private fun stopWithoutPayload(startId: Int) {
    Log.i(TAG, "started with no payload to draw; stopping")
    runCatching {
      MihrabLiveActivityModule.ensureFgsChannelExists(this)
      val placeholder = androidx.core.app.NotificationCompat.Builder(this, MihrabLiveActivityModule.FGS_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_prayer)
        .setSilent(true)
        .build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(MihrabLiveActivityModule.FGS_NOTIF_ID, placeholder, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(MihrabLiveActivityModule.FGS_NOTIF_ID, placeholder)
      }
    }.onFailure { Log.w(TAG, "placeholder startForeground failed", it) }
    cancelWakeAlarm(this)
    stopSelf(startId)
  }

  /** Re-post the notification once a minute so the progress bar /
   *  chronometer advance. The Notification's own chronometer ticks
   *  every second on its own via setUsesChronometer(true); the progress
   *  bar is what needs a fresh post.
   *
   *  Auto-advance: if the current `nextEpochMs` has passed (i.e. the
   *  prayer time has been reached), the ticker advances to the next
   *  prayer in `rows[]` so the notification updates without the user
   *  needing to open the app. */
  private fun scheduleTicker() {
    ticker?.let { handler.removeCallbacks(it) }
    val tick = Runnable {
      val payload = lastPayload
      if (payload != null) {
        // Recompute the current prayer interval from the absolute, dated
        // multi-day schedule (`days[]`) when present — this rolls the
        // countdown onto the correct day's times (including the overnight
        // Isha→Fajr interval) without the app being reopened, which is the
        // fix for the times going stale after ~24h. When no `days[]` is
        // present (older payloads), fall back to the single-day HH:MM advance.
        val advancedPayload = recomputeFromDays(payload) ?: tryAdvanceToNextPrayer(payload)
        val currentPayload = if (advancedPayload != null) {
          lastPayload = advancedPayload
          advancedPayload
        } else {
          payload
        }
        try {
          val notif = build(currentPayload)
          NotificationManagerCompat.from(this)
            .notify(MihrabLiveActivityModule.NOTIF_ID, notif)
          // Keep the wake alarm aligned with the next prayer, but only re-arm
          // it when that prayer actually changes (not every 1s screen-on tick).
          val nextEpoch = JSONObject(currentPayload).optLong("nextEpochMs", 0L)
          if (nextEpoch != lastAlarmEpoch) {
            lastAlarmEpoch = nextEpoch
            scheduleWakeAlarm(currentPayload)
          }
          // Outside that branch on purpose. `lastAlarmEpoch` is a field, so
          // it says "changed since THIS service instance last looked" — and
          // the alarm path above can have advanced and set it already, which
          // would leave the tick with nothing to do and the write unmade.
          // What decides here is the stored payload itself.
          persistIfAdvanced(currentPayload)
        } catch (t: Throwable) {
          Log.w(TAG, "ticker re-post failed", t)
        }
      }
      // Self-rescheduling tick, while it is still the current one.
      val next = ticker
      if (next != null) handler.postDelayed(next, tickInterval())
      if (!screenOn) scheduleMinuteAlarm()
    }
    ticker = tick
    handler.postDelayed(tick, tickInterval())
  }

  /**
   * A row's instant on `dateKey`, from its minutes (step 1.7) — the adapter
   * writes them, 1440 and past for a night mark after midnight — through
   * `WallClock`, which also takes the earlier instant on the night the
   * clocks go back. 0 without a time.
   */
  private fun epochOfRow(dateKey: String, row: JSONObject): Long {
    val minutes = WidgetPayloadV1.minutesOf(row) ?: return 0L
    return WallClock.epochMs(dateKey, minutes) ?: 0L
  }

  /** The first instant after `referenceMs` at `minutes` past a midnight: today's, or tomorrow's. */
  private fun nextEpochFor(minutes: Int, referenceMs: Long): Long {
    // A night mark after midnight carries 1440 and more; as a time of day it
    // is the same clock reading, and which day's is decided below. Unfolded,
    // it skipped tonight's occurrence and landed two days out.
    val m = Math.floorMod(minutes, WallClock.MINUTES_PER_DAY)
    val key = WallClock.dateKey(referenceMs)
    val today = WallClock.epochMs(key, m) ?: return 0L
    if (today > referenceMs) return today
    return WallClock.epochMs(key, m + WallClock.MINUTES_PER_DAY) ?: 0L
  }

  /**
   * Recompute the current prayer interval from the multi-day `days[]`
   * schedule. Builds a chronological, absolutely-dated list of every event
   * (the five salāh, Sunrise, and the night marks the user turned on, across
   * all supplied days), then picks the next event after `now` and the most
   * recent event at/before `now`. This is what lets the Live Activity advance
   * to the correct day's times — and render the correct overnight Isha→Fajr
   * progress — without the app being reopened.
   *
   * Returns an updated payload JSON, or null when there is no `days[]` data or
   * no future event remains in the window (caller then falls back to the
   * single-day HH:MM advance).
   */
  private fun recomputeFromDays(payload: String): String? {
    return try {
      val p = JSONObject(payload)
      val days = p.optJSONArray("days") ?: return null
      if (days.length() == 0) return null

      data class Ev(
        val epoch: Long,
        val key: String,
        val name: String,
        /** CANONICAL 24-hour `HH:mm` — text only; the instant is `epoch`. */
        val time: String,
        /** The same instant as the user reads it (issue #18). */
        val display: String,
        val dateKey: String,
      )
      val events = mutableListOf<Ev>()
      for (i in 0 until days.length()) {
        val day = days.optJSONObject(i) ?: continue
        val dateKey = day.optString("dateKey")
        if (dateKey.isEmpty()) continue
        day.optJSONArray("rows")?.let { rows ->
          for (j in 0 until rows.length()) {
            val r = rows.optJSONObject(j) ?: continue
            val t = r.optString("time")
            val e = epochOfRow(dateKey, r)
            if (e > 0L) {
              events.add(
                Ev(e, r.optString("key"), r.optString("name"), t, drawn(r, t), dateKey),
              )
            }
          }
        }
        day.optJSONObject("sunriseRow")?.let { sr ->
          val t = sr.optString("time")
          val e = epochOfRow(dateKey, sr)
          if (e > 0L) {
            events.add(
              Ev(
                e,
                sr.optString("key", "Sunrise"),
                sr.optString("name", "Sunrise"),
                t,
                drawn(sr, t),
                dateKey,
              ),
            )
          }
        }
        // The night marks the user turned on — First Third, Islamic Midnight,
        // the Last Third. They are only ever in the payload BECAUSE they were
        // enabled, and a toggle that means "tell me about the Last Third"
        // means this card counts down to it like anything else. Left out, the
        // ticker could neither land on one nor step off it: the card sat on a
        // time that had passed until the app was opened, which is exactly how
        // the First Third → Fajr hand-over was reported.
        day.optJSONArray("extraRows")?.let { extra ->
          for (j in 0 until extra.length()) {
            val r = extra.optJSONObject(j) ?: continue
            val t = r.optString("time")
            val e = epochOfRow(dateKey, r)
            if (e > 0L) {
              events.add(
                Ev(e, r.optString("key"), r.optString("name"), t, drawn(r, t), dateKey),
              )
            }
          }
        }
      }
      if (events.isEmpty()) return null
      events.sortBy { it.epoch }

      val now = System.currentTimeMillis()
      val next = events.firstOrNull { it.epoch > now } ?: return null
      val prev = events.lastOrNull { it.epoch <= now }

      val updated = JSONObject(payload)
      updated.put("nextEpochMs", next.epoch)
      if (prev != null) updated.put("prevEpochMs", prev.epoch)
      updated.put("nextKey", next.key)
      updated.put("nextLabel", next.name)
      updated.put("nextTime", next.time)
      updated.put("nextTimeDisplay", next.display)
      updated.put("title", "${next.name} · ${next.display}")
      // NOTHING TO CLEAR HERE ANY MORE. This used to switch off a payload
      // flag when the walk stepped onto Sunrise or a night mark, because the
      // action was a "Mute next adhan" button that JS had enabled for
      // whatever was next at sync time, and a hop it knew nothing about
      // could leave that button pointed at a time that must never sound the
      // adhan. The button is a three-way alert-mode control now and the
      // guard travels with the row instead: the modes an event may hold are
      // decided from its own key, on every build, by
      // LiveActivityAlertModes.modesFor. A hop cannot outrun that.

      // Swap the displayed prayer list to the day currently in progress so any
      // list rendering (and the notifee fallback path) reflects today's times.
      val currentDateKey = prev?.dateKey ?: next.dateKey
      for (i in 0 until days.length()) {
        val day = days.optJSONObject(i) ?: continue
        if (day.optString("dateKey") == currentDateKey) {
          day.optJSONArray("rows")?.let { updated.put("rows", it) }
          day.optJSONObject("sunriseRow")?.let { updated.put("sunriseRow", it) }
          day.optJSONArray("extraRows")?.let { updated.put("extraRows", it) }
          break
        }
      }

      // Roll the Hijri date with the day so it stays in step with the prayer
      // times across midnight without reopening the app. Keyed to the CIVIL
      // current date (not the in-progress prayer day) so it always matches the
      // home cards — e.g. between midnight and Fajr it shows today's Hijri, not
      // the previous day's.
      // WallClock's key: a Calendar.getInstance() and a locale's String.format
      // wrote 2569 on a Thai phone and Arabic-Indic digits on an Arabic or
      // Persian one, matched no day, and the Hijri date never rolled.
      val nowDateKey = WallClock.dateKey(now)
      for (i in 0 until days.length()) {
        val day = days.optJSONObject(i) ?: continue
        if (day.optString("dateKey") == nowDateKey) {
          val dayHijri = day.optString("hijriLabel", "")
          if (dayHijri.isNotEmpty()) updated.put("hijriLabel", dayHijri)
          break
        }
      }
      updated.toString()
    } catch (t: Throwable) {
      Log.w(TAG, "recomputeFromDays failed", t)
      null
    }
  }

  // A THIRD COPY OF "which of these is not a prayer" used to live here, for
  // the flag the two walks above no longer clear. Three copies of one list is
  // how the First Third came to be missing from one of them — the evening
  // mark was, for a while, the single event an auto-advance could still hand
  // the adhan. There are two copies now, LiveActivityAlertModes.kt and
  // src/types/prayer.ts, and a test holds them to each other.

  /**
   * If `nextEpochMs` in the cached payload has passed, find the next event
   * still ahead — across the five salāh, Sunrise and whichever night marks
   * the user turned on — and return an updated payload JSON string. Returns
   * null when no advance is needed or when nothing in the payload resolves
   * to a time at all.
   *
   * This is the fallback for payloads with no dated `days[]`; the ticker
   * prefers `recomputeFromDays`, which knows which day each time belongs to.
   */
  private fun tryAdvanceToNextPrayer(payload: String): String? {
    return try {
      val p = org.json.JSONObject(payload)
      val now = System.currentTimeMillis()
      val nextEpochMs = p.optLong("nextEpochMs", 0L)

      // Not yet time to advance — current prayer is still in the future.
      if (nextEpochMs > 0L && now < nextEpochMs) return null

      val rows = p.optJSONArray("rows") ?: return null
      val currentKey = p.optString("nextKey", "")

      // Collect rows into an ordered list.
      data class Row(
        val key: String,
        val name: String,
        /** CANONICAL 24-hour `HH:mm` — text only now. */
        val time: String,
        /** The same instant as the user reads it (issue #18). */
        val display: String,
        /** Minutes after midnight — what the walk places it by (step 1.7). */
        val minutes: Int?,
      )
      val rowList = mutableListOf<Row>()
      for (i in 0 until rows.length()) {
        val r = rows.getJSONObject(i)
        val t = r.optString("time")
        rowList.add(Row(r.optString("key"), r.optString("name"), t, drawn(r, t), WidgetPayloadV1.minutesOf(r)))
      }
      if (rowList.isEmpty()) return null

      // Sunrise and the enabled night marks are events like any other here.
      // They live outside `rows` in the payload only because the card draws
      // them differently; a walk that leaves them out cannot land on one, and
      // — worse — cannot step OFF one either, which left the card sitting on
      // a First Third that had already passed until the app was opened.
      p.optJSONObject("sunriseRow")?.let { sr ->
        val t = sr.optString("time", "")
        if (t.isNotEmpty()) {
          rowList.add(
            Row(
              sr.optString("key", "Sunrise"),
              sr.optString("name", "Sunrise"),
              t,
              drawn(sr, t),
              WidgetPayloadV1.minutesOf(sr),
            ),
          )
        }
      }
      p.optJSONArray("extraRows")?.let { extra ->
        for (i in 0 until extra.length()) {
          val r = extra.optJSONObject(i) ?: continue
          val t = r.optString("time", "")
          if (t.isNotEmpty()) {
            rowList.add(Row(r.optString("key"), r.optString("name"), t, drawn(r, t), WidgetPayloadV1.minutesOf(r)))
          }
        }
      }

      // The next event is the earliest one still ahead, not the next one in
      // the list. Display order is not the clock: Islamic Midnight and the
      // Last Third are drawn after Isha and belong to the small hours, the
      // First Third is drawn last and falls that same evening. And because
      // `nextEpochFor` rolls a time that has already passed forward a day,
      // "earliest still ahead" wraps onto tomorrow on its own — the walk no
      // longer freezes after Isha waiting for a Fajr special case.
      val next = rowList
        .mapNotNull { r -> r.minutes?.let { r to nextEpochFor(it, now) } }
        .filter { it.second > now }
        .minByOrNull { it.second }

      if (next != null) {
        val (row, epochMs) = next
        val updated = org.json.JSONObject(payload)
        updated.put("prevEpochMs", nextEpochMs)
        updated.put("nextEpochMs", epochMs)
        updated.put("nextKey", row.key)
        updated.put("nextLabel", row.name)
        updated.put("nextTime", row.time)
        updated.put("nextTimeDisplay", row.display)
        updated.put("title", "${row.name} · ${row.display}")
        // Same as the `days[]` walk above: the flag this used to clear is
        // gone, and the guard it stood for now travels on the row.
        Log.i(TAG, "Auto-advance: $currentKey → ${row.key} @ ${row.time} (epoch=$epochMs)")
        return updated.toString()
      }

      Log.i(TAG, "Auto-advance: nothing ahead of $currentKey — freezing")
      null
    } catch (t: Throwable) {
      Log.w(TAG, "tryAdvanceToNextPrayer failed", t)
      null
    }
  }

  /**
   * What a row should be DRAWN as — issue #18.
   *
   * Rows carry both: `time` is canonical 24-hour `HH:mm` (text only since
   * step 1.7 — the walks place a row by its minutes), and `display` is the
   * same instant written
   * the way the user reads a clock. Payloads from app builds before the
   * setting existed have no `display`, so the canonical string stands in.
   */
  private fun drawn(o: org.json.JSONObject, fallback: String): String =
    o.optString("display", "").ifEmpty { fallback }


  /** Build the notification fresh on each tick so the progress bar
   *  value reflects the current wall clock. Delegates to the module's
   *  static builder so the same code path is used as when JS posts
   *  the initial notification. */
  private fun build(payload: String): Notification {
    val o = JSONObject(payload)
    // No baked-in seconds, ever. The seconds are drawn by the platform now —
    // a chronometer counting down to `nextEpochMs` (Android 16) or a
    // system-ticked TimeDifference metric (Android 17) — so the text this
    // builds only has to survive until the next tick, and the next tick is a
    // minute away. See `tickInterval`.
    o.put("withSeconds", false)
    // Screen off: no chronometer (it freezes on the always-on display), the
    // hours and minutes as text instead. See `ambientCountdown`.
    o.put("ambient", !screenOn)
    return MihrabLiveActivityModule.buildNotificationFromPayload(this, o)
  }

  /**
   * Tick cadence: once a minute, screen on or off.
   *
   * It used to be once a SECOND while the screen was interactive, because
   * the H:MM:SS countdown was a string this service formatted and the only
   * way to advance it was to build and post the whole notification again.
   * That is 3600 posts an hour, each one parsing a thirty-day payload three
   * times, rebuilding a ProgressStyle and making a binder call into
   * NotificationManagerService — and it ran whenever the screen was on,
   * whether or not the app was in front, for as long as the feature was
   * enabled (audit, docs/design/background-power.md, 2026-08-24).
   *
   * The platform will animate a countdown for free. So the seconds are the
   * platform's job, and this ticker only exists for the things that really
   * do need rebuilding: the progress bar's position, which crawls across a
   * multi-hour interval, and the rollover onto the next prayer. A minute is
   * finer than either needs.
   */
  private fun tickInterval(): Long = if (screenOn) TICK_MS else untilNextMinute()

  /**
   * With the screen off the card says "2h 15m" as text, so it has to be
   * re-posted the moment that goes stale: when the time left crosses a whole
   * minute, not a minute after whenever the last post happened.
   */
  private fun untilNextMinute(): Long {
    val next = lastPayload?.let { runCatching { JSONObject(it).optLong("nextEpochMs", 0L) }.getOrNull() } ?: 0L
    val left = next - System.currentTimeMillis()
    val into = if (left > 0) left % 60_000L else 0L
    return (if (into == 0L) 60_000L else into) + 500L
  }

  /**
   * The minute re-post, when the phone sleeps. The Handler ticker runs on
   * uptime and stops while the CPU does, which on the always-on display is
   * most of the time; this alarm restarts the service at the next minute,
   * and onStartCommand re-posts from the stored payload and arms the next
   * one. Only with the screen off: with it on the chronometer ticks by
   * itself. In deep Doze Android may space allow-while-idle alarms out, so
   * the card can lag a few minutes there; it never shows a frozen second.
   */
  private fun scheduleMinuteAlarm() {
    runCatching {
      val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pi = minuteAlarmPendingIntent(this)
      if (screenOn || lastPayload == null) {
        am.cancel(pi)
        return
      }
      val triggerAt = System.currentTimeMillis() + untilNextMinute()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      } else {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      }
    }.onFailure { Log.w(TAG, "scheduleMinuteAlarm failed", it) }
  }

  /**
   * Schedule an exact, wake-the-device alarm at the next prayer instant. The
   * Handler ticker (SystemClock.uptimeMillis based) is suspended while the
   * device sleeps, so without this the countdown/progress would freeze
   * overnight until the screen next turned on. The alarm restarts this service
   * (no payload extra → it reloads the persisted payload and re-advances),
   * guaranteeing the notification rolls over exactly when a prayer passes.
   */
  private fun scheduleWakeAlarm(payload: String) {
    try {
      val nextEpochMs = JSONObject(payload).optLong("nextEpochMs", 0L)
      val now = System.currentTimeMillis()
      if (nextEpochMs <= now) return
      val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pi = wakeAlarmPendingIntent(this)
      val triggerAt = nextEpochMs + 1000L
      // setExactAndAllowWhileIdle fires even in Doze. Fall back to the inexact
      // allow-while-idle variant when the exact-alarm permission is withheld.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      } else {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "scheduleWakeAlarm failed", t)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    runCatching { unregisterReceiver(screenReceiver) }
    cancelWakeAlarm(this)
    ticker?.let { handler.removeCallbacks(it) }
    ticker = null
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    }
    runCatching {
      NotificationManagerCompat.from(this).cancel(MihrabLiveActivityModule.NOTIF_ID)
    }
    Log.i(TAG, "onDestroy — service stopped, both notifications cancelled")
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val TAG = "MihrabLiveActivitySvc"
    const val EXTRA_PAYLOAD = "payload"
    /** Request code for the deep-sleep wake alarm (distinct from the widget's
     *  alarm request codes in PrayerWidgetProvider). */
    const val ALARM_REQUEST_CODE = 0xA1B4
    /** Request code for the screen-off minute re-post. */
    const val MINUTE_ALARM_REQUEST_CODE = 0xA1B5
    /**
     * Tick cadence, screen on or off. The seconds are drawn by the platform
     * (chronometer / TimeDifference metric); this only moves the progress bar
     * and rolls onto the next prayer. See `tickInterval`.
     */
    const val TICK_MS = 60_000L

    /** PendingIntent that restarts this foreground service. Uses
     *  getForegroundService on API 26+ (exact alarms grant a brief FGS-start
     *  allowlist window). */
    fun wakeAlarmPendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, MihrabLiveActivityService::class.java)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        PendingIntent.getForegroundService(context, ALARM_REQUEST_CODE, intent, flags)
      } else {
        PendingIntent.getService(context, ALARM_REQUEST_CODE, intent, flags)
      }
    }

    /** The same restart as the wake alarm, under its own request code so the
     *  two never replace each other. */
    fun minuteAlarmPendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, MihrabLiveActivityService::class.java)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        PendingIntent.getForegroundService(context, MINUTE_ALARM_REQUEST_CODE, intent, flags)
      } else {
        PendingIntent.getService(context, MINUTE_ALARM_REQUEST_CODE, intent, flags)
      }
    }

    /**
     * Cancel the deep-sleep wake alarm. A companion function so turning the
     * feature off can cancel it without a live service: `stopService` on a
     * service that is not running reaches no `onDestroy`, and an alarm left
     * armed would later start one with nothing to draw.
     */
    fun cancelWakeAlarm(context: Context) {
      runCatching {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(wakeAlarmPendingIntent(context))
        // The screen-off minute re-post too, or it starts a service with
        // nothing to draw a minute after the feature was turned off.
        am.cancel(minuteAlarmPendingIntent(context))
      }.onFailure { Log.w(TAG, "cancel wake alarm failed", it) }
    }
  }
}
