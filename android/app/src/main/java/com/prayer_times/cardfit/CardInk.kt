package com.prayer_times.cardfit

/**
 * What can be read on a widget's card, whatever colour the card is.
 *
 * Every card was dark, and everything drawn on it was chosen for that: a
 * light text, pastel highlights, a soft red. The card can be any colour now
 * — the widgets' background set to Light or to one of the reader's own, or
 * the app's Sky page, pale by day and ink by night — and it changes through
 * the day without anyone opening a settings screen. So what is drawn on it
 * is checked against it every time it is drawn, here, in arithmetic with no
 * Android in it: colours are ARGB ints, and the whole of it is swept over
 * every card colour off a device (contract-tests/kotlin, CardInkTest).
 *
 * The rules, and all of them leave a colour that already reads alone:
 *  - TEXT keeps the reader's colour where it reaches `TEXT_MIN` against the
 *    card; where it does not, the light text or the dark one, whichever the
 *    card holds better.
 *  - A HIGHLIGHT (the next prayer's time is drawn in it) keeps its hue and
 *    is moved toward black on a light card, toward white on a dark one,
 *    only as far as `ACCENT_MIN` needs.
 *
 * A see-through card is the wallpaper's to judge, not this file's: the
 * callers apply these from `MIN_OPACITY` up (PrayerWidgetDisplay,
 * PrayerWidgetProvider).
 */
object CardInk {
  /** The widgets' light text (PrayerWidgetDisplay.DEFAULT_TEXT) and the Dark preset. */
  const val LIGHT_TEXT = 0xFFE8EAED.toInt()
  const val DARK_TEXT = 0xFF1C1C1E.toInt()

  /** Under this a chosen text colour is replaced. */
  const val TEXT_MIN = 3.0
  /** Under this a highlight is moved until it reaches it. */
  const val ACCENT_MIN = 3.0
  /** The card's strength, 0–100, from which the card is what the text stands on. */
  const val MIN_OPACITY = 60

  private fun channel(v: Int): Double {
    val x = v / 255.0
    return if (x <= 0.03928) x / 12.92 else Math.pow((x + 0.055) / 1.055, 2.4)
  }

  /** WCAG relative luminance of a colour (its alpha ignored), 0 … 1. */
  fun luminance(c: Int): Double =
    0.2126 * channel((c shr 16) and 0xFF) + 0.7152 * channel((c shr 8) and 0xFF) + 0.0722 * channel(c and 0xFF)

  /** WCAG contrast ratio of two colours (their alpha ignored), 1 … 21. */
  fun contrast(a: Int, b: Int): Double {
    val la = luminance(a)
    val lb = luminance(b)
    return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
  }

  /**
   * The better of the light text and the dark one on `card` — and on the
   * few cards neither is comfortable on (the saturated mid blues: #0078D2
   * gives both under 3.8), plain white or black, one of which reaches 4.5
   * on any colour there is.
   */
  fun fallbackText(card: Int): Int = fallback(card)

  /** Does the light text read better on `card` than the dark one? (Which side of the card the ink is on.) */
  fun lightTextCard(card: Int): Boolean = contrast(LIGHT_TEXT, card) >= contrast(DARK_TEXT, card)

  private fun fallback(card: Int): Int {
    val soft = if (contrast(LIGHT_TEXT, card) >= contrast(DARK_TEXT, card)) LIGHT_TEXT else DARK_TEXT
    if (contrast(soft, card) >= 4.5) return soft
    val white = 0xFFFFFFFF.toInt()
    val black = 0xFF000000.toInt()
    // …on the side the soft one was: white for a light text's card.
    val hard = if (soft == LIGHT_TEXT) white else black
    return if (contrast(hard, card) > contrast(soft, card)) hard else soft
  }

  /** `text` where it reads on `card`; else the light or the dark text. Opaque. */
  fun text(text: Int, card: Int): Int =
    if (contrast(text, card) >= TEXT_MIN) text or 0xFF000000.toInt() else fallbackText(card)

  /** Is this text one for a light card? (A dark text is; the state colours follow it.) */
  fun onLight(text: Int): Boolean = luminance(text) < 0.4

  private fun mix(from: Int, to: Int, t: Double): Int {
    fun ch(shift: Int): Int {
      val a = (from shr shift) and 0xFF
      val b = (to shr shift) and 0xFF
      return Math.round(a + (b - a) * t).toInt().coerceIn(0, 255)
    }
    return (0xFF shl 24) or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
  }

  /**
   * `accent` where it reads on `card`; else the same hue moved toward black
   * (a light card) or white (a dark one), in twentieths, as far as
   * `ACCENT_MIN` needs and no further. Opaque.
   */
  fun accent(accent: Int, card: Int): Int = tint(accent, card, ACCENT_MIN)

  /** A text drawn in the accent must read as text does: this, not the highlight's 3. */
  const val ACCENT_TEXT_MIN = 4.5

  /** The accent as the widgets' text colour: its hue, moved as far as text needs. */
  fun accentText(accent: Int, card: Int): Int = tint(accent, card, ACCENT_TEXT_MIN)

  /** `color` where it reaches `min` on `card`; else its hue moved toward the text's end until it does. */
  fun tint(color: Int, card: Int, min: Double): Int {
    val accent = color
    val opaque = accent or 0xFF000000.toInt()
    if (contrast(opaque, card) >= min) return opaque
    // Toward the end the text is at: a light text's card takes a lighter
    // highlight, a dark text's a darker one. (Toward whichever end is
    // merely further from the card, a mid blue got a near-black time
    // beside its white text.)
    val toward = if (lightTextCard(card)) 0xFFFFFFFF.toInt() else 0xFF000000.toInt()
    for (step in 1..20) {
      val moved = mix(opaque, toward, step / 20.0)
      if (contrast(moved, card) >= min) return moved
    }
    return toward
  }

  /** `fg` as it lands on an opaque `card`: its alpha spent. */
  fun over(fg: Int, card: Int): Int {
    val a = ((fg ushr 24) and 0xFF) / 255.0
    return mix(card or 0xFF000000.toInt(), fg or 0xFF000000.toInt(), a)
  }

  /** Under this a quiet colour (secondary text, a passed time) is taken from the text instead. */
  const val QUIET_MIN = 2.2

  /**
   * A quiet colour on `card`: `base` — the grey chosen for the dark card —
   * where it still shows there, else the card's `text` at `alpha` (0–255),
   * which is quiet on any card the text reads on.
   */
  fun quiet(base: Int, text: Int, card: Int, alpha: Int): Int =
    if (contrast(over(base, card), card) >= QUIET_MIN) base else (text and 0x00FFFFFF) or (alpha.coerceIn(0, 255) shl 24)
}
