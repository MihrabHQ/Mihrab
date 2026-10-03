package com.prayer_times

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import androidx.core.widget.TextViewCompat
import com.facebook.react.HeadlessJsTaskService

/**
 * The full-screen prayer alert — issue #63.
 *
 * Android raises this over the lock screen when a prayer alert that carries a
 * full-screen intent is posted while the phone is locked or its screen is off
 * (with the phone in hand and unlocked, Android shows the ordinary heads-up
 * instead — that is the platform's rule, not ours). Notifee launches it with
 * the posted notification's bundle under the "notification" extra.
 *
 * NATIVE, NOT A REACT SCREEN, on purpose:
 *
 *  - It must draw the moment the alarm fires, including with the app's process
 *    dead. A React screen would boot the whole JS bundle first.
 *  - It is shown OVER THE KEYGUARD. A React screen would be the app itself,
 *    and one tap from there is the journal of a phone nobody has unlocked.
 *    This activity has its own task, shows four lines and three buttons, and
 *    can reach nothing else.
 *
 * Everything it prints was translated by JS when the alert was scheduled and
 * travels in the notification's data (`fs*` keys), so it speaks the app's
 * language rather than the system's, with no i18n of its own.
 *
 * The sound is the notification channel's, exactly as without this screen.
 * Stopping is therefore cancelling the notification. Snooze and Log are the
 * same JS code the notification's own buttons run, reached through
 * [PrayerAlarmHeadlessService] so they work with the app closed.
 */
class PrayerAlarmActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var notificationId: String? = null

  /**
   * The screen lives as long as its notification does. Stopped from the shade,
   * logged from a watch, timed out at the next prayer: the alert is gone, and a
   * screen still asking about it would be the app contradicting itself.
   */
  private val watchNotification = object : Runnable {
    override fun run() {
      if (!isNotificationPosted()) {
        finish()
        return
      }
      handler.postDelayed(this, WATCH_INTERVAL_MS)
    }
  }

  private val giveUp = Runnable { finish() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    bind(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    bind(intent)
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  /** Back is "stop", as on an alarm clock: the screen going away means quiet. */
  @Deprecated("Activity#onBackPressed is deprecated on newer APIs")
  override fun onBackPressed() {
    stop()
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun bind(intent: Intent?) {
    val notification = intent?.getBundleExtra("notification")
    val id = notification?.getString("id")
    if (notification == null || id.isNullOrEmpty()) {
      finish()
      return
    }
    notificationId = id
    val data = notification.getBundle("data") ?: Bundle()
    setContentView(buildView(notification, data))

    handler.removeCallbacksAndMessages(null)
    // A grace before the first look: the full-screen intent is sent as the
    // notification is posted, and the two can land in either order.
    handler.postDelayed(watchNotification, FIRST_WATCH_MS)
    handler.postDelayed(giveUp, MAX_ON_SCREEN_MS)
  }

  private fun isNotificationPosted(): Boolean {
    val id = notificationId ?: return false
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return runCatching {
      // Notifee posts with no tag and the id string's hashCode.
      nm.activeNotifications.any { it.id == id.hashCode() && it.tag == null }
    }.getOrDefault(true) // can't tell: keep the screen rather than drop it
  }

  private fun cancelNotification() {
    val id = notificationId ?: return
    // Cancelling the notification is what stops the channel's sound.
    runCatching { NotificationManagerCompat.from(this).cancel(null, id.hashCode()) }
  }

  private fun stop() {
    cancelNotification()
    finish()
  }

  /** Hand a press to the JS that owns it, then go quiet straight away. */
  private fun dispatch(action: String, notification: Bundle, data: Bundle, minutes: Int = 0) {
    // Only the plain fields JS reads. Notifee's own bundle carries arrays and
    // nested models that Arguments.fromBundle cannot always convert, and the
    // headless task needs none of them.
    val plainData = Bundle()
    for (key in data.keySet()) {
      data.getString(key)?.let { plainData.putString(key, it) }
    }
    val svc = Intent(this, PrayerAlarmHeadlessService::class.java).apply {
      putExtra("action", action)
      putExtra("minutes", minutes)
      putExtra("id", notification.getString("id"))
      putExtra("title", notification.getString("title"))
      putExtra("body", notification.getString("body"))
      putExtra("subtitle", notification.getString("subtitle"))
      putExtra(
        "channelId",
        notification.getBundle("android")?.getString("channelId"),
      )
      putExtra("data", plainData)
    }
    runCatching {
      startService(svc)
      HeadlessJsTaskService.acquireWakeLockNow(this)
    }
    stop()
  }

  // ── The screen ─────────────────────────────────────────────────────────

  private fun buildView(notification: Bundle, data: Bundle): View {
    val prayer = notification.getString("title").orEmpty()
    val time = notification.getString("subtitle").orEmpty()
    val body = notification.getString("body").orEmpty()
    val stopLabel = data.getString("fsStop") ?: "Stop"
    val snoozeLabel = data.getString("fsSnooze")
    val logLabel = data.getString("fsLog")
    val snoozeMinutes = data.getString("fsSnoozeMinutes")?.toIntOrNull() ?: 10
    val rtl = data.getString("fsRtl") == "1"

    // The Today hero's sky for this prayer, sent by JS; the night sky is the
    // fallback for an alert scheduled by an older build.
    val skyTop = parseColor(data.getString("fsSkyTop"), NIGHT_TOP)
    val skyBottom = parseColor(data.getString("fsSkyBottom"), NIGHT_BOTTOM)
    // Reset every time: a second alert can arrive on this same screen
    // (onNewIntent) with a different sky, and the ink must follow it.
    val darkInk = data.getString("fsInk") == "dark"
    ink = if (darkInk) Color.BLACK else CREAM
    inkSoft = if (darkInk) Color.argb(168, 0, 0, 0) else CREAM_SOFT
    inkLine = if (darkInk) Color.argb(140, 0, 0, 0) else CREAM_LINE
    buttonText = skyTop
    // Dark ink means a pale sky, so the clock and battery up top must be dark
    // too or they vanish into it.
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility =
      if (darkInk) {
        window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
      } else {
        window.decorView.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
      }

    val root = FrameLayout(this).apply {
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(skyTop, skyBottom),
      )
      fitsSystemWindows = true
      layoutDirection = if (rtl) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR
    }

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(28), dp(48), dp(28), dp(40))
    }
    root.addView(
      column,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    )

    // Upper half: what is happening.
    val head = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
    }
    column.addView(head, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

    head.addView(
      ImageView(this).apply {
        setImageResource(R.drawable.ic_stat_prayer)
        setColorFilter(ink)
        alpha = 0.9f
      },
      LinearLayout.LayoutParams(dp(56), dp(56)).apply { bottomMargin = dp(24) },
    )
    if (time.isNotEmpty()) {
      head.addView(text(time, 22f, inkSoft, bold = false))
    }
    head.addView(
      text(prayer, 56f, ink, bold = true).apply {
        setPadding(0, dp(4), 0, dp(8))
      },
    )
    if (body.isNotEmpty()) {
      head.addView(text(body.lineSequence().first(), 19f, inkSoft, bold = false))
    }
    // "Next: Isha at 20:18" — what the notification's expanded card also says.
    val nextLine = data.getString("fsNext").orEmpty()
    if (nextLine.isNotEmpty()) {
      head.addView(
        text(nextLine, 17f, inkSoft, bold = false).apply {
          setPadding(0, dp(12), 0, 0)
        },
      )
    }

    // Lower part: what to do about it. Stop is the big one — it is the button
    // a hand finds in the dark.
    column.addView(
      button(stopLabel, filled = true) { stop() },
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(64)),
    )
    val secondary = listOfNotNull(
      snoozeLabel?.let { label -> label to { dispatch("snooze", notification, data, snoozeMinutes) } },
      logLabel?.let { label -> label to { dispatch("log", notification, data) } },
    )
    if (secondary.isNotEmpty()) {
      val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
      secondary.forEachIndexed { i, (label, onClick) ->
        row.addView(
          button(label, filled = false, onClick = onClick),
          LinearLayout.LayoutParams(0, dp(56), 1f).apply {
            if (i > 0) marginStart = dp(12)
          },
        )
      }
      column.addView(
        row,
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
          .apply { topMargin = dp(12) },
      )
    }
    return root
  }

  private fun text(value: String, sp: Float, color: Int, bold: Boolean) = TextView(this).apply {
    text = value
    setTextColor(color)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
    gravity = Gravity.CENTER
    if (bold) typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }

  private fun button(label: String, filled: Boolean, onClick: () -> Unit) = TextView(this).apply {
    text = label
    gravity = Gravity.CENTER
    setTextSize(TypedValue.COMPLEX_UNIT_SP, if (filled) 20f else 16f)
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    setTextColor(if (filled) buttonText else ink)
    maxLines = 1
    // A long translation shrinks to fit rather than being cut off.
    TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(
      this, 11, if (filled) 20 else 16, 1, TypedValue.COMPLEX_UNIT_SP,
    )
    background = GradientDrawable().apply {
      cornerRadius = dp(32).toFloat()
      if (filled) setColor(ink) else setStroke(dp(2), inkLine)
    }
    isClickable = true
    isFocusable = true
    contentDescription = label
    setOnClickListener { onClick() }
  }

  // The ink on the sky: cream on a dark sky, black on a pale one — the same
  // switch the hero makes. `buttonText` is the sky showing through the Stop
  // button's fill.
  private var ink = CREAM
  private var inkSoft = CREAM_SOFT
  private var inkLine = CREAM_LINE
  private var buttonText = NIGHT_TOP

  private fun parseColor(value: String?, fallback: Int): Int =
    try {
      if (value.isNullOrEmpty()) fallback else Color.parseColor(value)
    } catch (_: IllegalArgumentException) {
      fallback
    }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

  companion object {
    // The Today screen's night sky, so the alarm looks like the app at night.
    private val NIGHT_TOP = Color.rgb(16, 27, 68)
    private val NIGHT_BOTTOM = Color.rgb(34, 51, 107)
    private val CREAM = Color.rgb(246, 239, 226)
    private val CREAM_SOFT = Color.argb(200, 246, 239, 226)
    private val CREAM_LINE = Color.argb(140, 246, 239, 226)

    private const val FIRST_WATCH_MS = 3_000L
    private const val WATCH_INTERVAL_MS = 2_000L
    /** An unanswered alarm screen goes away; the notification stays in the shade. */
    private const val MAX_ON_SCREEN_MS = 10 * 60_000L
  }
}
