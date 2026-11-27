package com.prayer_times

import android.content.Context
import android.graphics.Color
import com.prayer_times.cardfit.CardInk

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
  /**
   * The card the text stands on (opaque), where it is one: drawn at
   * CardInk.MIN_OPACITY or more. Null for a see-through card, which is the
   * wallpaper's to judge.
   */
  val card: Int? = null,
) {
  /**
   * Is the card a light one? Read off the card where there is one — a text
   * in the app's accent can be mid in tone on either — and off the text on
   * a see-through card. The state colours (a missed prayer's red, a passed
   * time's grey) and the ink of the marks follow it.
   */
  val onLight: Boolean get() = card?.let { !CardInk.lightTextCard(it) } ?: CardInk.onLight(text)

  /** Secondary text: the same colour, faded, as the grey was to the white. */
  // The default text keeps the exact colours the card always had.
  // …and on a card that grey does not show on (a colour of the reader's
  // own, mid in tone), the text's own colour, quieter (CardInk.quiet).
  val muted: Int get() {
    val base = if (text == DEFAULT_TEXT) 0xFF9AA0A6.toInt() else withAlpha(text, 0xA6)
    return card?.let { CardInk.quiet(base, text, it, 0xCC) } ?: base
  }
  /** What has passed or cannot be pressed: the dark card's grey, or the text at half. */
  val disabled: Int get() {
    val base = if (onLight) 0xFF7A8087.toInt() else 0xFF6B7076.toInt()
    return card?.let { CardInk.quiet(base, text, it, 0x8C) } ?: base
  }
  /** The refresh glyph. */
  val refresh: Int get() = if (text == DEFAULT_TEXT) 0x80FFFFFF.toInt() else withAlpha(text, 0x80)
  val rule: Int get() = if (text == DEFAULT_TEXT) 0x1FFFFFFF else withAlpha(text, 0x1F)
  val ruleStrong: Int get() = if (text == DEFAULT_TEXT) 0x26FFFFFF else withAlpha(text, 0x26)

  companion object {
    const val KEY_TEXT_HEX = "widget_text_hex"
    /** The text is drawn in the highlight's colour (the app's accent, unless the widgets have their own). */
    const val KEY_TEXT_ACCENT = "widget_text_accent"
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

    /**
     * PER WIDGET (issue #144). City, countdown, table and time size were
     * one answer for every prayer-times widget: two placed side by side —
     * the day's times on one, the countdown alone on the other — both took
     * whichever was saved last. A widget saved from its own settings screen
     * now keeps these four under its own id (`ownKey`), and is drawn from
     * them; a widget that has none of its own follows the common ones, which
     * are the app's (Settings → Widgets) — so every widget placed before
     * this looks as it did, and the app's page is the default for new ones.
     * Colours, the background and the time since the adhan stay common.
     */
    val PER_WIDGET_KEYS = listOf(KEY_SHOW_LOCATION, KEY_SHOW_COUNTDOWN, KEY_SHOW_TABLE, KEY_TIME_SCALE)

    /** The key one widget's own value is stored under. */
    fun ownKey(key: String, appWidgetId: Int): String = "$key#$appWidgetId"

    /** A placed widget's id; anything else (a sample, a card not placed) has no choices of its own. */
    private fun placed(appWidgetId: Int): Boolean = appWidgetId > 0

    /** Drop the choices of widgets that are gone. */
    fun forget(context: Context, appWidgetIds: IntArray) {
      val e = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE).edit()
      for (id in appWidgetIds) for (key in PER_WIDGET_KEYS) e.remove(ownKey(key, id))
      e.apply()
    }

    /** Widgets given new ids (a restored home screen): their choices under the new ones. */
    fun moved(context: Context, oldIds: IntArray, newIds: IntArray) {
      val p = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      val all = p.all
      val e = p.edit()
      for (i in oldIds.indices) {
        val to = newIds.getOrNull(i) ?: continue
        for (key in PER_WIDGET_KEYS) {
          val from = ownKey(key, oldIds[i])
          when (val v = all[from]) {
            is Boolean -> e.putBoolean(ownKey(key, to), v)
            is Int -> e.putInt(ownKey(key, to), v)
            else -> {}
          }
          e.remove(from)
        }
      }
      e.apply()
    }

    fun read(
      context: Context,
      appWidgetId: Int = 0,
      /** The mode to answer for: the phone's own, or the other one (`DayNight`). */
      night: Boolean = PrayerWidgetProvider.isNight(context),
    ): PrayerWidgetDisplay {
      val p = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      // This widget's own answer where it has one, else the common one.
      fun bool(key: String): Boolean {
        val own = ownKey(key, appWidgetId)
        return if (placed(appWidgetId) && p.contains(own)) p.getBoolean(own, true) else p.getBoolean(key, true)
      }
      val scaleOwn = ownKey(KEY_TIME_SCALE, appWidgetId)
      val scale = if (placed(appWidgetId) && p.contains(scaleOwn)) p.getInt(scaleOwn, 100) else p.getInt(KEY_TIME_SCALE, 100)
      val hex = p.getString(KEY_TEXT_HEX, "")?.trim().orEmpty()
      val text = if (hex.matches(Regex("^#[0-9A-Fa-f]{6}$"))) {
        try { Color.parseColor(hex) } catch (_: Exception) { DEFAULT_TEXT }
      } else DEFAULT_TEXT
      // The card the text stands on, and the highlight as it is drawn on
      // it: one reading of the widgets' look for the text to be judged by.
      val (cardArgb, accent) = try {
        PrayerWidgetProvider.resolvedColors(context, night)
      } catch (_: Exception) {
        Pair(0, 0)
      }
      val card = cardArgb
        .takeIf { ((it ushr 24) and 0xFF) >= 255 * CardInk.MIN_OPACITY / 100 }
        ?.let { it or 0xFF000000.toInt() }
      // THE TEXT IN THE APP'S ACCENT (`KEY_TEXT_ACCENT`): the highlight's
      // colour, as the app's own headings are — on any background, and kept
      // readable on it as text must be (CardInk.accentText: its hue, moved
      // only as far as the card needs). On a see-through card, as chosen.
      val inAccent = p.getBoolean(KEY_TEXT_ACCENT, false) && accent != 0
      val resolved = when {
        inAccent -> card?.let { CardInk.accentText(accent, it) } ?: (accent or 0xFF000000.toInt())
        // Automatic on a see-through card that is pale over any wallpaper
        // (CardInk.paleSeeThrough) is the dark text: the light one cannot
        // be read on it. A colour of the reader's own stands, as it did.
        else -> legible(text, card ?: if (text == DEFAULT_TEXT) CardInk.paleSeeThrough(cardArgb) else null)
      }
      return PrayerWidgetDisplay(
        card = card,
        text = resolved,
        showLocation = bool(KEY_SHOW_LOCATION),
        showCountdown = bool(KEY_SHOW_COUNTDOWN),
        showTable = bool(KEY_SHOW_TABLE),
        timeScale = scale.coerceIn(SCALE_MIN, SCALE_MAX) / 100f,
      )
    }

    /**
     * UNDER THE APP'S SKY THEME THE CARD IS THE APP'S OWN PAGE AT THAT HOUR
     * (theme/skyMoods.ts, `widgetSkyColors` with `appsOwn`): pale by day —
     * the midday's blue-white, the golden hour's cream — and the night's
     * ink by night. No one text colour reads on both. A light text on the
     * day's card, or the Dark preset (picked for a see-through card over a
     * pale wallpaper) on the night's, cannot be read.
     *
     * So where the Sky card is what the text stands on (drawn at
     * SKY_CARD_MIN_OPACITY or more) and the chosen colour does not reach
     * SKY_TEXT_MIN_CONTRAST against it, the light text or the dark is used,
     * whichever the card holds better.
     * A see-through card is the wallpaper's to judge, and the choice
     * stands. Nothing is stored: with the theme off the choice is back.
     *
     * THE SAME FOR A CARD OF ITS OWN COLOUR (`PrayerWidgetProvider.fixedCard`):
     * Light, or a pale colour of the reader's, under the default light text
     * would be a card nobody can read the moment it is chosen. There the
     * text is the light one or the dark one, whichever the card holds
     * better. The neutral dark card that follows the app is left alone, as
     * it was: a dark text on it is a choice made for a see-through card.
     */
    internal fun legible(text: Int, card: Int?): Int {
      // A see-through card (`card` null) is the wallpaper's to judge.
      card ?: return text
      // The rules themselves, swept off a device over every card colour:
      // cardfit/CardInk. Automatic (the light text every card had, which is
      // what is stored for it) is whichever of the light and the dark the
      // card holds better — so on a mid-toned card the text and the
      // highlight, which is moved the same way, land on the same side. A
      // colour of the reader's own is kept wherever it can be read.
      return if (text == DEFAULT_TEXT) CardInk.fallbackText(card) else CardInk.text(text, card)
    }

    const val SKY_CARD_MIN_OPACITY = CardInk.MIN_OPACITY
    const val SKY_TEXT_MIN_CONTRAST = 3.0

    /** WCAG contrast and luminance: cardfit/CardInk's. */
    internal fun contrast(a: Int, b: Int): Double = CardInk.contrast(a, b)
    internal fun luminance(c: Int): Double = CardInk.luminance(c)

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
