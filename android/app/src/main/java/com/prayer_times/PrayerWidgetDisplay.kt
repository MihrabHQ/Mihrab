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
    /**
     * Time since the adhan (#111), in minutes; 0 is off. The app also
     * publishes it in the payload, but the widget's own settings screen
     * can change it while the app is closed, so the stored value is the
     * one that counts and the payload's is what a store without it falls
     * back to (`sinceAdhanMinutes`).
     */
    const val KEY_SINCE_ADHAN = "widget_since_adhan"
    /** `WIDGET_SINCE_ADHAN_CHOICES` in src/settings/types.ts. */
    val SINCE_ADHAN_CHOICES = listOf(0, 10, 20, 30)
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
        text = legibleOnSky(context, text),
        showLocation = p.getBoolean(KEY_SHOW_LOCATION, true),
        showCountdown = p.getBoolean(KEY_SHOW_COUNTDOWN, true),
        showTable = p.getBoolean(KEY_SHOW_TABLE, true),
        timeScale = p.getInt(KEY_TIME_SCALE, 100).coerceIn(SCALE_MIN, SCALE_MAX) / 100f,
      )
    }

    /**
     * UNDER THE APP'S SKY THEME THE CARD IS THE HOUR'S, AND IT IS DARK
     * (theme/skyMoods.ts, `widgetSkyColors`): a dark card in the hour's hue
     * by day, the night's own page by night. A text colour chosen for
     * another card — the Dark preset, picked for a see-through card over a
     * pale wallpaper — is then dark on dark, and the times cannot be read.
     *
     * So where the Sky card is what the text stands on (drawn at
     * SKY_CARD_MIN_OPACITY or more) and the chosen colour does not reach
     * SKY_TEXT_MIN_CONTRAST against it, the card's own light text is used.
     * A see-through card is the wallpaper's to judge, and the choice
     * stands. Nothing is stored: with the theme off the choice is back.
     */
    internal fun legibleOnSky(context: Context, text: Int): Int {
      val card = try {
        PrayerWidgetProvider.skyCard(context)
      } catch (_: Exception) {
        null
      } ?: return text
      if (card.second < SKY_CARD_MIN_OPACITY) return text
      return if (contrast(text, card.first) < SKY_TEXT_MIN_CONTRAST) DEFAULT_TEXT else text
    }

    const val SKY_CARD_MIN_OPACITY = 60
    const val SKY_TEXT_MIN_CONTRAST = 3.0

    /** WCAG contrast ratio of two opaque colours, 1 … 21. */
    internal fun contrast(a: Int, b: Int): Double {
      fun channel(v: Int): Double {
        val c = v / 255.0
        return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
      }
      fun luminance(c: Int) =
        0.2126 * channel(Color.red(c)) + 0.7152 * channel(Color.green(c)) + 0.0722 * channel(Color.blue(c))
      val la = luminance(a)
      val lb = luminance(b)
      return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    /** The count-up window in force: the stored one, else what the app published. */
    fun sinceAdhanMinutes(context: Context, published: Int): Int {
      val p = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      val v = if (p.contains(KEY_SINCE_ADHAN)) p.getInt(KEY_SINCE_ADHAN, 0) else published
      return v.coerceIn(0, SINCE_ADHAN_CHOICES.last())
    }

    /** The card as it was, for a draw that cannot read the store. */
    val DEFAULT = PrayerWidgetDisplay(DEFAULT_TEXT, true, true, true, 1f)

    private fun withAlpha(c: Int, a: Int) = (c and 0x00FFFFFF) or (a shl 24)
  }
}
