package com.prayer_times

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.prayer_times.glance.PrayerGlanceWidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.util.Log
import com.prayer_times.contract.NightMarks
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetInstants
import com.prayer_times.contract.WidgetPayloadV1
import org.json.JSONObject

private data class WidgetStyle(
  val bgOpacityPercent: Int,
  val highlightId: String,
  val highlightHex: String,
  /**
   * "Tinted surfaces" — the app-wide opt-in that promotes the accent to the
   * main colour (Appearance → Tinted surfaces). When on, the widget card is
   * no longer a neutral dark slab: its background is washed toward the
   * chosen accent, so the widget matches the app's tinted chrome. Off (the
   * default) keeps the neutral #1C1C1E exactly.
   */
  val tinted: Boolean,
) {
  fun backgroundArgb(): Int {
    val a = (bgOpacityPercent.coerceIn(0, 100) * 255 / 100f).toInt().coerceIn(0, 255)
    if (!tinted) return Color.argb(a, BASE_BG_R, BASE_BG_G, BASE_BG_B)
    // Wash the neutral card toward the accent. A modest fraction: the widget
    // draws light text on this dark card, so the card stays dark enough to
    // hold it — the accent reads as the card's temperament, not its value.
    val base = Color.rgb(BASE_BG_R, BASE_BG_G, BASE_BG_B)
    val mixed = mixRgb(base, highlightInt(), 0.24f)
    return Color.argb(a, Color.red(mixed), Color.green(mixed), Color.blue(mixed))
  }

  /**
   * The colour that was CHOSEN, never the wallpaper's. `context` is kept in
   * the signature because every caller has one and the swatch table is the
   * kind of thing that wants a resource lookup again one day; it is
   * deliberately unused now that Material You is out of the widgets.
   */
  fun highlightColorInt(
    @Suppress("UNUSED_PARAMETER") context: Context,
  ): Int = highlightInt()

  /** Context-free accent resolution, shared by the highlight and the tint. */
  private fun highlightInt(): Int {
    if (highlightId.equals("custom", ignoreCase = true)) {
      val h = highlightHex.trim()
      if (h.matches(Regex("^#([0-9A-Fa-f]{6})$"))) {
        return try {
          Color.parseColor(h)
        } catch (_: Exception) {
          Color.parseColor("#46A081")
        }
      }
      return Color.parseColor("#46A081")
    }
    val hex =
      when (highlightId.lowercase()) {
        "green" -> "#46A081"
        "teal" -> "#4EC9B0"
        "blue" -> "#6BA3F5"
        "amber" -> "#E5C07B"
        else -> "#46A081"
      }
    return try {
      Color.parseColor(hex)
    } catch (_: Exception) {
      Color.parseColor("#46A081")
    }
  }

  private fun mixRgb(base: Int, other: Int, t: Float): Int {
    val k = t.coerceIn(0f, 1f)
    val r = (Color.red(base) + (Color.red(other) - Color.red(base)) * k).toInt()
    val g = (Color.green(base) + (Color.green(other) - Color.green(base)) * k).toInt()
    val b = (Color.blue(base) + (Color.blue(other) - Color.blue(base)) * k).toInt()
    return Color.rgb(r.coerceIn(0, 255), g.coerceIn(0, 255), b.coerceIn(0, 255))
  }
}

// `resolveDynamicHighlightColor` lived here. It read the platform's
// wallpaper-derived Material You accent, and it is gone rather than merely
// unreachable, so that no future branch can find it and switch it back on
// by accident. The widget's colour comes from `highlightColorInt` and
// nowhere else.
//
// The Live Activity notification still follows Material You when the app's
// System-colours setting is on. That is a notification, not a widget, and
// it was not part of what was asked for.

private fun readWidgetStyle(prefs: SharedPreferences): WidgetStyle {
  val opacity = prefs.getInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, 88)
  val hid =
    prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, "green")?.trim()
      ?: "green"
  val hex =
    prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, "")?.trim()
      ?: ""
  // DYNAMIC COLOUR IS GONE FROM THE WIDGETS (2026-08-27, by request).
  //
  // Material You gave the widget whatever hue the wallpaper happened to
  // produce, which on a lot of wallpapers is nothing like the app and on
  // some is barely distinguishable from the card it sits on. The widget
  // now takes the colour the user actually chose — the accent from the
  // widget settings, or green.
  //
  // The stored flag is not read at all: a widget can be drawn before JS has
  // ever run (boot, a restore, an unlock straight to the home screen), so
  // ignoring it HERE is what makes the change true immediately rather than
  // after the app is next opened. The KEY is left in the store so that a
  // downgrade still finds what it wrote.
  //
  // `hid` of "dynamic" is a value only older builds could have stored; it
  // resolves to green like any other unknown id.
  val tinted =
    prefs.getBoolean(PrayerWidgetProvider.PREFS_WIDGET_TINTED, false)
  return WidgetStyle(
    opacity.coerceIn(0, 100),
    hid.ifEmpty { "green" },
    hex,
    tinted,
  )
}

/** Neutral dark surface (#1C1C1E), opacity from settings. */
private const val BASE_BG_R = 28
private const val BASE_BG_G = 28
private const val BASE_BG_B = 30

/**
 * Neutral dark widget: only the next prayer row uses an accent color.
 * Background opacity and accent are configurable from app settings (Android).
 */
open class PrayerWidgetProvider : GlanceAppWidgetReceiver() {

  /** The card this component draws. Placed widgets kept this class name across
   *  the move to Glance, so they draw with Glance after an update. */
  override val glanceAppWidget: GlanceAppWidget = PrayerGlanceWidget(PrayerGlanceWidget.Entry.STRIP)


  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    // SCREEN_ON and WALLPAPER_CHANGED used to be listed here and in the
    // manifest. Neither can arrive: SCREEN_ON is documented as deliverable
    // only to a receiver registered with registerReceiver, and
    // WALLPAPER_CHANGED has been dead since API 16. Declaring them made the
    // refresh story look far better covered than it was, which is how four
    // widgets ended up with no working unattended refresh at all while the
    // manifest suggested six triggers each.
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_BOOT_COMPLETED,
      ACTION_PRAYER_TIME_ELAPSED -> requestUpdate(context)
    }
  }

  companion object {
    private const val TAG = "MihrabWidget"

    const val PREFS_NAME = "prayer_widget"
    const val PREFS_KEY = "payload_v1"
    const val PREFS_UI_STYLE_KEY = "widget_ui_style"
    const val PREFS_UI_OLED = "widget_oled"
    const val PREFS_WIDGET_BG_OPACITY = "widget_bg_opacity"
    const val PREFS_WIDGET_HIGHLIGHT_ID = "widget_highlight_id"
    const val PREFS_WIDGET_HIGHLIGHT_HEX = "widget_highlight_hex"
    const val PREFS_WIDGET_HIGHLIGHT_DYNAMIC = "widget_highlight_dynamic"
    /** "Tinted surfaces": wash the widget card toward the accent. */
    const val PREFS_WIDGET_TINTED = "widget_tinted_surfaces"
    /**
     * The language tag Mihrab itself is running in, copied out of the payload
     * when JS saves it. See `localized`.
     */
    const val PREFS_LANGUAGE = "widget_language"
    /** Internal broadcast fired by AlarmManager at each prayer time transition. */
    const val ACTION_PRAYER_TIME_ELAPSED = "com.prayer_times.ACTION_PRAYER_TIME_ELAPSED"

    /**
     * A context whose resources speak the language *Mihrab* is set to, rather
     * than the one the phone is set to.
     *
     * The two are usually the same — the app now defaults to the system
     * language — but a user who picked a different one in Settings would
     * otherwise get a widget in two languages at once: the rows and prayer
     * names come from the payload, which JS localizes before it sends, while
     * every label the provider draws itself came from the phone's string
     * table. Only the picker's own entry (the receiver's `android:label`) is
     * still out of reach; the launcher reads that without ever calling us.
     *
     * Returns the context unchanged when no language has been recorded yet,
     * which is the case until the app has run once.
     */
    fun localized(context: Context): Context {
      val tag =
        context
          .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .getString(PREFS_LANGUAGE, null)
          ?.trim()
          .orEmpty()
      if (tag.isEmpty()) return context
      val locale = java.util.Locale.forLanguageTag(tag)
      if (locale.language.isEmpty()) return context
      // Already speaking it — createConfigurationContext is not free, and this
      // runs on every widget redraw.
      val current = context.resources.configuration.locales
      if (!current.isEmpty && current[0].language == locale.language) return context
      val config = android.content.res.Configuration(context.resources.configuration)
      config.setLocale(locale)
      return context.createConfigurationContext(config)
    }

    /**
     * The background and accent colours the user has configured, for widgets
     * declared in other files.
     *
     * Exposed rather than duplicated: the configure screen writes one set of
     * preferences and every widget this app draws has to look like the same
     * app. A second reader that fell behind on, say, the dynamic-accent flag
     * would show one widget in Material You and the one beside it in green.
     */
    fun resolvedColors(context: Context): Pair<Int, Int> {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val style = readWidgetStyle(prefs)
      return Pair(style.backgroundArgb(), style.highlightColorInt(context))
    }

    /** Where the "which device wrote these" marker lives. */
    private const val INSTALL_KEY = "widget_install_id"

    /**
     * Throw away taps that were queued on a DIFFERENT device.
     *
     * `prayer_widget.xml` is inside the `sharedpref` include in both backup
     * rule files, so a cloud restore or a device-to-device transfer carries
     * the widget's tap queues across with everything else. The log queue
     * survives that honestly enough — its entries name the date they belong
     * to, and the same person's prayers on the same days are the same facts.
     * The tasbih queue does not: its entries are counts, so a queue that had
     * already been drained on the old phone is counted a second time on the
     * new one, and the user's dhikr total quietly gains a few hundred beads
     * they never told anyone about.
     *
     * The payload itself is left alone deliberately: a restored one that has
     * gone stale is caught by `payloadHasExpired`, and one that has not is
     * still true.
     */
    fun dropQueuesFromAnotherDevice(context: Context) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val current = try {
        android.provider.Settings.Secure.getString(
          context.contentResolver,
          android.provider.Settings.Secure.ANDROID_ID,
        )
      } catch (_: Exception) {
        null
      } ?: return
      val seen = prefs.getString(INSTALL_KEY, null)
      if (seen == current) return
      // First run on this device — including the very first run ever, where
      // there is nothing to drop and this only writes the marker.
      prefs.edit()
        .remove(WidgetTasbihQueue.PREFS_QUEUE_KEY)
        .putString(INSTALL_KEY, current)
        .apply()
      if (seen != null) {
        Log.i(TAG, "Restored from another device — dropped the queued tasbih taps")
      }
    }

    /**
     * Every widget class this app ships. Kept in one place because two
     * different questions ask it: "is anything placed at all" below, and the
     * drawing fan-out further down.
     */
    private val ALL_WIDGET_CLASSES = arrayOf(
      PrayerWidgetProvider::class.java,
      PrayerWidgetSmallProvider::class.java,
      PrayerWidgetLargeProvider::class.java,
      PrayerWidgetLogProvider::class.java,
      PrayerWidgetLogLargeProvider::class.java,
      PrayerWidgetStreakProvider::class.java,
      PrayerWidgetReadingProvider::class.java,
      PrayerWidgetHijriProvider::class.java,
      PrayerWidgetTasbihProvider::class.java,
    )

    /** Whether the user has any Mihrab widget on a home screen at all. */
    private fun anyWidgetPlaced(context: Context): Boolean {
      val mgr = AppWidgetManager.getInstance(context)
      return ALL_WIDGET_CLASSES.any {
        try {
          mgr.getAppWidgetIds(ComponentName(context, it)).isNotEmpty()
        } catch (t: Throwable) {
          // A class the launcher cannot resolve is not a placed widget, and
          // is certainly not a reason to fail the whole check.
          false
        }
      }
    }

    fun requestUpdate(context: Context) {
      // FIRST, and outside everything that can fail. The chain that will ask
      // again must not be contingent on this round of drawing succeeding —
      // that contingency is exactly what used to make one bad payload
      // permanent.
      try {
        dropQueuesFromAnotherDevice(context)
      } catch (t: Throwable) {
        Log.w(TAG, "Could not check the restore marker", t)
      }
      // Nothing placed means nothing to draw and no boundary worth holding an
      // alarm for. This used to run regardless: every unlock armed two alarms
      // and made ~72 binder calls looking for widgets that were not there,
      // for every user who had never placed one
      // (docs/design/background-power.md).
      //
      // The check is "any widget of ANY class", not "any of this class" — the
      // alarms below refresh all of them at the prayer boundary, so a single
      // placed Hijri card still needs the chain armed.
      if (!anyWidgetPlaced(context)) return
      try {
        armWidgetAlarms(context)
      } catch (t: Throwable) {
        Log.w(TAG, "Could not arm the widget alarms", t)
      }
      // An update from before payload v2 leaves the Glance cards with nothing
      // to read; have the app write it without being opened.
      try {
        WidgetPayloadSource.askForV2IfMissing(context)
      } catch (t: Throwable) {
        Log.w(TAG, "Could not ask for payload v2", t)
      }

      // Every widget is a Glance card, and each old provider class name is
      // its receiver: one redraw for all of them (GlanceWidgets).
      draw(context) { GlanceWidgetHook.requestUpdate(context) }
    }

    /** One widget's redraw, contained. */
    private inline fun draw(context: Context, block: () -> Unit) {
      try {
        block()
      } catch (t: Throwable) {
        Log.w(TAG, "A widget failed to redraw", t)
      }
    }

    /**
     * Arm the next-boundary and midnight alarms, from the payload alone.
     *
     * This used to sit at the bottom of `applyJson`, which made the whole
     * chain contingent on a prayer-times widget being placed AND on its
     * render succeeding. Neither is safe to assume. Someone whose home
     * screen holds only a Streak widget never armed a single alarm, so
     * nothing on their phone ever moved the widget onto a new day. And
     * because `buildViews` catches a throwing `applyJson` and falls back to
     * the error card, one bad payload killed the chain permanently — the
     * card could not refresh, and nothing was scheduled to ask it to.
     *
     * Arming from the payload instead means it runs whatever is placed and
     * whatever went wrong, and re-arms on every signal that reaches us.
     */
    fun armWidgetAlarms(context: Context) {
      scheduleMidnightRollover(context)

      val json = WidgetPayloadSource.json(context) ?: return
      val next = try {
        nextBoundaryMillis(JSONObject(json))
      } catch (_: Exception) {
        null
      } ?: return

      val intent = Intent(context, PrayerWidgetProvider::class.java).apply {
        action = ACTION_PRAYER_TIME_ELAPSED
      }
      val pi = PendingIntent.getBroadcast(
        context, 1001, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      // RTC_WAKEUP, and idle-allowed. Both matter, and neither used to be
      // set: a plain RTC alarm does not wake the device, and an exact one
      // is still held back by Doze. Fajr is the hour of the day a phone is
      // most reliably asleep, so the one boundary that most needed to land
      // was the one guaranteed not to — the countdown ran to zero and past
      // it, and the card kept naming a prayer that had already been called
      // until someone picked the phone up.
      //
      // This is ONE alarm at a time, re-armed by the refresh it triggers:
      // six wake-ups a day, at moments the adhan notification is usually
      // waking the device anyway. See docs/design/background-power.md.
      val am = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
        am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, next, pi)
      } else {
        am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, next, pi)
      }
    }

    /**
     * When the card next says something different: the first time still
     * ahead, as epoch millis. WRAPS PAST MIDNIGHT.
     *
     * Every row on the card counts, the night marks included: they can be
     * the headline, and a card that says "Last Third" has to be woken when
     * the Last Third arrives.
     *
     * IT USED TO RETURN NULL AFTER THE LAST PRAYER, and that null was the
     * hole the countdown fell through: the card wrapped its countdown to
     * tomorrow's Fajr, but nothing was scheduled to fire when that countdown
     * ran out, so it reached zero and kept going until something else woke
     * the app. So: today's remaining times first, and when there are none,
     * the first time of the next day in the window (`WidgetInstants.next`,
     * which the countdown aims with too — one answer for both). Instants
     * from `WallClock`, so the night the clocks go back lands on the first
     * of the two readings, as iOS and the app do.
     */
    private fun nextBoundaryMillis(o: JSONObject): Long? {
      val todayKey = todayDateKey()
      val tomorrow = dayAfter(o, todayKey)
      return WidgetInstants.next(
        nowMs = System.currentTimeMillis(),
        dayKey = todayKey,
        dayMinutes = boundaryMinutes(selectTodayDay(o), o),
        nextDayKey = tomorrow?.optString("dateKey"),
        nextDayMinutes = tomorrow?.let { boundaryMinutes(it, o) }.orEmpty(),
      )?.epochMs
    }

    /**
     * Every boundary in a day, as minutes since local midnight — the times
     * the widget has to wake up and redraw at.
     *
     * The night times are in here because they can be the headline: leave
     * them out and the card sits on "Isha" until something else happens to
     * wake it, which between Isha and Fajr can be hours.
     */
    private fun boundaryMinutes(day: JSONObject?, root: JSONObject): List<Int> =
      boundaryRows(day, root).mapNotNull { WidgetPayloadV1.minutesOf(it) }

    /** A day's rows, Sunrise and the night marks the user turned on. */
    private fun boundaryRows(day: JSONObject?, root: JSONObject): List<JSONObject> {
      val rows = day?.optJSONArray("rows") ?: root.optJSONArray("rows") ?: return emptyList()
      val out = mutableListOf<JSONObject>()
      for (i in 0 until rows.length()) rows.optJSONObject(i)?.let { out.add(it) }
      (day?.optJSONObject("sunriseRow") ?: root.optJSONObject("sunriseRow"))?.let { out.add(it) }
      (day?.optJSONArray("extraRows") ?: root.optJSONArray("extraRows"))?.let { extra ->
        for (i in 0 until extra.length()) extra.optJSONObject(i)?.let { out.add(it) }
      }
      return out
    }

    /** The day after `key` in the payload's window, or null past its end. */
    private fun dayAfter(o: JSONObject, key: String): JSONObject? {
      val days = o.optJSONArray("days") ?: return null
      if (key.isEmpty()) return null
      var found = false
      for (i in 0 until days.length()) {
        val day = days.optJSONObject(i) ?: continue
        if (found) return day
        if (day.optString("dateKey") == key) found = true
      }
      return null
    }

    /*
     * THE THREE STRIP BUDGETS, and the bug they exist to end.
     *
     * Each number below is what one variant of the no-graph strip needs of
     * `heightDp` — the height the LAUNCHER reports, which is the height of
     * the host view, NOT of the card drawn inside it. That distinction is
     * the whole reason this section was rewritten.
     *
     * The old constants (132 for the content, 145 and 110 for the two
     * thresholds) were measured in August against the card, when the card
     * WAS the host view. `widget_card_inset` then gave every widget a 6dp
     * gutter on all four sides so two cards in adjacent cells could not
     * touch — 12dp of height that the layout no longer has and that none of
     * these numbers were told about. Everything downstream inherited the
     * error: a card was called roomy 12dp before it was, and the leftover
     * handed to `slack` was 12dp more than existed. LinearLayout does not
     * report an overflow, it takes it out of the last child, so on any phone
     * whose launcher row is around 147dp — every 480dpi Pixel — the strip
     * drew its full-height variant into a card 12dp too short and the
     * next-prayer line came out as a 7dp sliver of clipped text.
     *
     * So: measured on the device, host-view relative, at 480dpi. 12dp of
     * inset, 28 or 12dp of root padding, the header row at 19, the six
     * columns at 40, the rule and its two margins at 17, the next-prayer
     * line at 19, and the night row's margin at 4. Each is rounded UP —
     * `slack` is spent on padding, and padding that overshoots is exactly
     * how the footer went off the bottom.
     *
     * They are budgets and thresholds at once, which is the point: the
     * variant is chosen by asking which budget fits, and the slack is the
     * leftover against THAT SAME budget. A variant can no longer be picked
     * on one number and filled against another.
     */

    /** Today's local date as yyyy-MM-dd, matching the JS `dateKey` format. */
    /** The tag a `adb logcat -s` can be pointed at. See the catch in `buildViews`. */
    const val WIDGET_LOG_TAG = "MihrabWidget"

    fun todayDateKey(): String {
      // WallClock's, the one Gregorian reading of "today" every widget and
      // the Live Activity share. `Calendar.getInstance()` follows the
      // default locale — a BuddhistCalendar on a Thai phone, year 2569 —
      // and the payload's keys are always Gregorian, so on those phones no
      // day would ever match. The device's TIME ZONE still decides the day.
      return WallClock.dateKey(System.currentTimeMillis())
    }

    /**
     * Has this payload's schedule run out?
     *
     * The payload is only ever written from the foreground — there is no
     * background refresh on any platform — so it describes a window that
     * ends. This was reported on the Mac build, where an app installed from
     * Homebrew can sit unopened for weeks; a phone gets opened, so it is
     * rarer here, but "rarer" is not "never" and the consequences differ per
     * widget. Log Today is the one that matters: a stale payload still
     * carries a `today` block dated whenever the app was last opened, so it
     * would offer that day's prayers as today's AND queue a write against
     * that date. Putting a status on a day the user never touched is not a
     * cosmetic bug.
     *
     * True when there is no `days[]` at all: a payload from a build older
     * than the multi-day window cannot be checked and is by now certainly
     * older than this problem.
     */
    /**
     * The published payload, parsed at most once per version of it.
     *
     * Every widget that draws reads this string and calls `JSONObject(raw)`
     * on it, and a tap on the Tasbih widget redraws every one of them. The
     * payload carries a month of days, so that parse is the largest single
     * cost in a redraw, and it was being paid per widget per tap to produce
     * an object identical to the one produced a millisecond earlier.
     *
     * Keyed on the raw string by IDENTITY OF CONTENT, so a stale answer is
     * not possible: if the app has republished, the string differs and the
     * cache misses. That is the only invalidation rule there is, and it does
     * not depend on anyone remembering to clear anything.
     *
     * Widgets run in the app's own process here, so this is one field, not
     * an IPC. Synchronized because a broadcast receiver and the app's own
     * republish can both land on it.
     */
    private var cachedRaw: String? = null
    private var cachedPayload: JSONObject? = null

    @Synchronized
    fun payload(context: Context): JSONObject? {
      // v2 adapted for this minute when the app wrote it, else v1 as written.
      val raw = WidgetPayloadSource.json(context) ?: return null
      if (raw == cachedRaw) return cachedPayload
      val parsed = try {
        JSONObject(raw)
      } catch (_: Exception) {
        null
      }
      cachedRaw = raw
      cachedPayload = parsed
      return parsed
    }

    fun payloadHasExpired(o: JSONObject): Boolean {
      val days = o.optJSONArray("days") ?: return true
      if (days.length() == 0) return true
      val todayKey = todayDateKey()
      for (i in 0 until days.length()) {
        val key = days.optJSONObject(i)?.optString("dateKey") ?: continue
        // Lexicographic works on yyyy-MM-dd and avoids parsing 30 dates.
        if (key >= todayKey) return false
      }
      return true
    }

    /** The entry in `days[]` that applies to the current local date, or null
     *  when there is no `days[]` / no match. */
    fun selectTodayDay(o: JSONObject): JSONObject? {
      val days = o.optJSONArray("days") ?: return null
      if (days.length() == 0) return null
      val todayKey = todayDateKey()
      for (i in 0 until days.length()) {
        val day = days.optJSONObject(i) ?: continue
        if (day.optString("dateKey") == todayKey) return day
      }
      return null
    }

    /** Schedule a refresh just after the next local midnight so the date
     *  line, the Hijri date and the day's rows roll over by themselves.
     *
     *  Deliberately the weak one of the two alarms: inexact, no wake-up, and
     *  independent of the exact-alarm permission. It used to be the only
     *  thing standing between Isha and morning, which is why the countdown
     *  could sit at zero for hours; the boundary alarm now wraps past
     *  midnight and lands on tomorrow's Fajr, so this is what it was always
     *  described as — a backstop. Nobody is looking at a home screen at
     *  00:00:30, and anybody who does has just unlocked the phone, which
     *  refreshes every widget through ACTION_USER_PRESENT. */
    private fun scheduleMidnightRollover(context: Context) {
      val midnight = java.util.Calendar.getInstance().apply {
        add(java.util.Calendar.DAY_OF_MONTH, 1)
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 30)
        set(java.util.Calendar.MILLISECOND, 0)
      }
      val intent = Intent(context, PrayerWidgetProvider::class.java).apply {
        action = ACTION_PRAYER_TIME_ELAPSED
      }
      val pi = PendingIntent.getBroadcast(
        context, 1002, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val am = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      am.set(android.app.AlarmManager.RTC, midnight.timeInMillis, pi)
    }

    /**
     * The three optional night times. They can be the headline — this only
     * decides how a row that is *not* the headline is painted: muted, the
     * way Sunrise has always been, so the five salāh stay the loudest thing
     * on the card.
     */
    private fun isNightKey(key: String): Boolean = NightMarks.isNightKey(key)

  }
}
