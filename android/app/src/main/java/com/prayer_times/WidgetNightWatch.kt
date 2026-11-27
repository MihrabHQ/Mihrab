package com.prayer_times

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * The widgets redrawn when the phone goes into or out of dark mode.
 *
 * A card can follow the phone now: the widgets' background on System, or on
 * App under an app that itself follows the system
 * (PrayerWidgetProvider, `BG_SYSTEM`, `PREFS_WIDGET_APP_THEME`). The cards
 * are drawn in the colours of the moment they are drawn at, so when the
 * phone's mode turns they have to be drawn again.
 *
 * Nothing tells a widget that. ACTION_CONFIGURATION_CHANGED is delivered
 * only to receivers registered in a live process — a manifest receiver
 * never gets it — so this is registered when the app's process starts,
 * which it does for every widget update, alert and open, and it lives as
 * long as the process does. A process that is not alive when the mode
 * turns is caught by what already redraws the cards: the next unlock
 * (ACTION_USER_PRESENT), the next prayer's boundary, the half-hourly
 * update. So the card is right at once on a phone that has used Mihrab
 * lately, and by the next unlock on one that has not.
 *
 * THE BROADCAST CAN ARRIVE BEFORE THE NEW MODE HAS. The process's resources
 * take the new configuration on the same thread the broadcast is delivered
 * on, and not always first: asked at the moment of the broadcast, "is it
 * night?" was sometimes still the old answer, and the cards stayed as they
 * were (seen on an emulator, going from dark to light). So the question is
 * asked a moment later, and once more after that, and the cards are redrawn
 * whenever the answer differs from the one they were last drawn for.
 */
object WidgetNightWatch {
  @Volatile private var installed = false
  private val CHECKS_MS = longArrayOf(300L, 2_000L)

  fun install(context: Context) {
    if (installed) return
    installed = true
    val app = context.applicationContext
    try {
      var night = PrayerWidgetProvider.isNight(app)
      val main = Handler(Looper.getMainLooper())
      val check = Runnable {
        // The broadcast is for every configuration change — a rotation, a
        // font size. Only the mode turning redraws.
        val now = PrayerWidgetProvider.isNight(app)
        if (now != night) {
          night = now
          try {
            PrayerWidgetProvider.requestUpdate(app)
          } catch (e: Exception) {
            Log.w(PrayerWidgetProvider.WIDGET_LOG_TAG, "could not redraw the widgets for the new mode", e)
          }
        }
      }
      app.registerReceiver(
        object : BroadcastReceiver() {
          override fun onReceive(c: Context, intent: Intent) {
            main.removeCallbacks(check)
            for (ms in CHECKS_MS) main.postDelayed(check, ms)
          }
        },
        IntentFilter(Intent.ACTION_CONFIGURATION_CHANGED),
      )
    } catch (e: Exception) {
      Log.w(PrayerWidgetProvider.WIDGET_LOG_TAG, "could not watch for dark mode", e)
    }
  }
}
