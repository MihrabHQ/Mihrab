package com.prayer_times

import android.content.Context
import android.graphics.Color

/**
 * How the widgets' text looks and what the prayer-times card shows, as chosen
 * in the app (Settings → Widgets). The text colour is common: every widget
 * draws in it (through `Palette`). City, countdown, table and time size are
 * read only by the prayer-times card.
 *
 * Everything defaults to the card as it was: the light text, the city, the
 * countdown and the table all on, the times at their measured size.
 */
data class PrayerWidgetDisplay(
  /** The main text colour. */
  val text: Int,
  val showLocation: Boolean,
  val showCountdown: Boolean,
  val showTable: Boolean,
  /** The prayer times' size as a multiple of the measured one. */
  val timeScale: Float,
) {
  /** Secondary text: the same colour, faded, as the grey was to the white. */
  // The default text keeps the exact colours the card always had.
  val muted: Int get() = if (text == DEFAULT_TEXT) 0xFF9AA0A6.toInt() else withAlpha(text, 0xA6)
  /** The refresh glyph. */
  val refresh: Int get() = if (text == DEFAULT_TEXT) 0x80FFFFFF.toInt() else withAlpha(text, 0x80)
  val rule: Int get() = if (text == DEFAULT_TEXT) 0x1FFFFFFF else withAlpha(text, 0x1F)
  val ruleStrong: Int get() = if (text == DEFAULT_TEXT) 0x26FFFFFF else withAlpha(text, 0x26)

  companion object {
    const val KEY_TEXT_HEX = "widget_text_hex"
    const val KEY_SHOW_LOCATION = "widget_show_location"
    const val KEY_SHOW_COUNTDOWN = "widget_show_countdown"
    const val KEY_SHOW_TABLE = "widget_show_table"
    const val KEY_TIME_SCALE = "widget_time_scale"
    const val SCALE_MIN = 80
    const val SCALE_MAX = 150
    private const val DEFAULT_TEXT = 0xFFE8EAED.toInt()

    fun read(context: Context): PrayerWidgetDisplay {
      val p = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      val hex = p.getString(KEY_TEXT_HEX, "")?.trim().orEmpty()
      val text = if (hex.matches(Regex("^#[0-9A-Fa-f]{6}$"))) {
        try { Color.parseColor(hex) } catch (_: Exception) { DEFAULT_TEXT }
      } else DEFAULT_TEXT
      return PrayerWidgetDisplay(
        text = text,
        showLocation = p.getBoolean(KEY_SHOW_LOCATION, true),
        showCountdown = p.getBoolean(KEY_SHOW_COUNTDOWN, true),
        showTable = p.getBoolean(KEY_SHOW_TABLE, true),
        timeScale = p.getInt(KEY_TIME_SCALE, 100).coerceIn(SCALE_MIN, SCALE_MAX) / 100f,
      )
    }

    /** The card as it was, for a draw that cannot read the store. */
    val DEFAULT = PrayerWidgetDisplay(DEFAULT_TEXT, true, true, true, 1f)

    private fun withAlpha(c: Int, a: Int) = (c and 0x00FFFFFF) or (a shl 24)
  }
}
