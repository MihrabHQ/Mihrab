import com.prayer_times.cardfit.CardInk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Whatever colour a widget's card is, what is drawn on it can be read.
 *
 * The card is the reader's choice (Dark, Light, any #RRGGBB) or the app's
 * Sky page, which is a different colour every few minutes of the day. No
 * list of hours or of colours can stand for that, so the rules are swept
 * over the whole colour cube instead: every card, with every text and
 * highlight the settings offer.
 */
class CardInkTest {
  /** The app's swatches (PrayerWidgetConfigureActivity.TEXT_PRESETS). */
  private val texts = listOf(0xE8EAED, 0xFFFFFF, 0xF3E9D2, 0xE5C07B, 0xA8C7FA, 0x1C1C1E).map { it or 0xFF000000.toInt() }
  /** The highlights (HIGHLIGHTS), and the Log's emerald. */
  private val accents = listOf(0x46A081, 0x4EC9B0, 0x6BA3F5, 0xE5C07B, 0x6BC98A).map { it or 0xFF000000.toInt() }

  /** Every 15th level of each channel: 18 × 18 × 18 cards, black and white among them. */
  private fun cards(): Sequence<Int> = sequence {
    for (r in 0..255 step 15) for (g in 0..255 step 15) for (b in 0..255 step 15) {
      yield((0xFF shl 24) or (r shl 16) or (g shl 8) or b)
    }
  }

  @Test
  fun `the text reads on every card, whichever colour was chosen`() {
    var worst = 21.0
    for (card in cards()) for (text in texts) {
      val got = CardInk.text(text, card)
      val c = CardInk.contrast(got, card)
      worst = minOf(worst, c)
      assertTrue("card %08X text %08X -> %08X at %.2f".format(card, text, got, c), c >= CardInk.TEXT_MIN)
    }
    // The floor is the chosen colour's; the worst card for both fallbacks is a mid grey.
    assertTrue("worst $worst", worst >= 3.0)
  }

  @Test
  fun `where the chosen text does not read, what replaces it reads comfortably on any card`() {
    for (card in cards()) {
      val c = CardInk.contrast(CardInk.fallbackText(card), card)
      assertTrue("card %08X at %.2f".format(card, c), c >= 4.5)
    }
    // The soft pair where it is enough — the cards the settings name, and the Sky's.
    assertEquals(CardInk.LIGHT_TEXT, CardInk.fallbackText(0xFF1C1C1E.toInt()))
    assertEquals(CardInk.DARK_TEXT, CardInk.fallbackText(0xFFFAF7F2.toInt()))
    assertEquals(CardInk.DARK_TEXT, CardInk.fallbackText(0xFFEEF6FF.toInt()))
    assertEquals(CardInk.LIGHT_TEXT, CardInk.fallbackText(0xFF0F162F.toInt()))
  }

  @Test
  fun `a text that already reads is the reader's own`() {
    // The card as it always was, and the light text on it.
    assertEquals(CardInk.LIGHT_TEXT, CardInk.text(CardInk.LIGHT_TEXT, 0xFF1C1C1E.toInt()))
    // Gold on the dark card stays gold; on the Light card it cannot, and is dark.
    assertEquals(0xFFE5C07B.toInt(), CardInk.text(0xFFE5C07B.toInt(), 0xFF1C1C1E.toInt()))
    assertEquals(CardInk.DARK_TEXT, CardInk.text(0xFFE5C07B.toInt(), 0xFFFAF7F2.toInt()))
    assertEquals(CardInk.DARK_TEXT, CardInk.text(CardInk.LIGHT_TEXT, 0xFFFAF7F2.toInt()))
    assertEquals(CardInk.LIGHT_TEXT, CardInk.text(CardInk.DARK_TEXT, 0xFF0F162F.toInt()))
  }

  @Test
  fun `the highlight reads on every card`() {
    for (card in cards()) for (accent in accents) {
      val got = CardInk.accent(accent, card)
      val c = CardInk.contrast(got, card)
      assertTrue("card %08X accent %08X -> %08X at %.2f".format(card, accent, got, c), c >= CardInk.ACCENT_MIN)
    }
  }

  @Test
  fun `a highlight that already reads is not touched - every preset on the dark card`() {
    for (card in listOf(0xFF1C1C1E.toInt(), 0xFF0F162F.toInt(), 0xFF140F2A.toInt())) for (accent in accents) {
      assertEquals("card %08X accent %08X".format(card, accent), accent, CardInk.accent(accent, card))
    }
  }

  @Test
  fun `on the Light card the pastels are darkened, and no further than they need`() {
    val light = 0xFFFAF7F2.toInt()
    for (accent in accents) {
      val got = CardInk.accent(accent, light)
      assertTrue(CardInk.contrast(got, light) >= CardInk.ACCENT_MIN)
      // Darker than it was, or untouched — never lighter.
      assertTrue(CardInk.luminance(got) <= CardInk.luminance(accent) + 1e-9)
      // Not overshot: one step less would not have read (or it was untouched).
      if (got != accent) assertTrue("%08X -> %08X".format(accent, got), CardInk.contrast(got, light) < 4.2)
    }
  }

  @Test
  fun `a dark text means a light card, for the state colours`() {
    assertTrue(CardInk.onLight(CardInk.DARK_TEXT))
    assertTrue(!CardInk.onLight(CardInk.LIGHT_TEXT))
    for (text in texts.dropLast(1)) assertTrue(!CardInk.onLight(text))
  }

  @Test
  fun `a moved highlight goes the way the text went`() {
    for (card in cards()) for (accent in accents) {
      val got = CardInk.accent(accent, card)
      if (got == accent) continue
      val lightText = CardInk.lightTextCard(card)
      // Lighter than it was on a light text's card, darker on a dark text's.
      if (lightText) assertTrue("card %08X %08X -> %08X".format(card, accent, got), CardInk.luminance(got) >= CardInk.luminance(accent) - 1e-9)
      else assertTrue("card %08X %08X -> %08X".format(card, accent, got), CardInk.luminance(got) <= CardInk.luminance(accent) + 1e-9)
    }
    // The strong blue that showed it: white text, and a time that is not near-black.
    val blue = 0xFF0078D2.toInt()
    assertTrue(CardInk.luminance(CardInk.accent(0xFF46A081.toInt(), blue)) > CardInk.luminance(0xFF46A081.toInt()))
  }

  @Test
  fun `the quiet colours show on every card, and are the old greys on the dark one`() {
    val grey = 0xFF9AA0A6.toInt()
    val passed = 0xFF6B7076.toInt()
    for (card in listOf(0xFF1C1C1E.toInt(), 0xFF0F162F.toInt(), 0xFF140F2A.toInt())) {
      assertEquals(grey, CardInk.quiet(grey, CardInk.LIGHT_TEXT, card, 0xCC))
      assertEquals(passed, CardInk.quiet(passed, CardInk.LIGHT_TEXT, card, 0x8C))
    }
    for (card in cards()) {
      val text = CardInk.text(CardInk.LIGHT_TEXT, card)
      val muted = CardInk.quiet(grey, text, card, 0xCC)
      val c = CardInk.contrast(CardInk.over(muted, card), card)
      assertTrue("card %08X muted %08X at %.2f".format(card, muted, c), c >= 2.2)
      // Quieter than the text it sits beside, or the same grey as ever.
      assertTrue(c <= CardInk.contrast(text, card) + 1e-9 || muted == grey)
    }
  }

  // ── The text in the accent ─────────────────────────────────────────────

  private val appAccents = listOf(
    0xFF46A081.toInt(), 0xFF5EEAD4.toInt(), 0xFF7DD3FC.toInt(), 0xFFFBBF24.toInt(), 0xFFE58FA6.toInt(), 0xFFB4A6E8.toInt(),
    0xFF1F5F4A.toInt(), 0xFF2563EB.toInt(), 0xFFB45309.toInt(), 0xFF9F2D4D.toInt(), 0xFFFF0000.toInt(), 0xFF808080.toInt(),
  )

  @Test
  fun `a text in the accent reads as text on the Dark and the Light card, every accent`() {
    for (card in listOf(0xFF1C1C1E.toInt(), 0xFFFAF7F2.toInt())) {
      for (accent in appAccents) {
        val text = CardInk.accentText(accent, card)
        assertTrue("accent ${accent.toUInt().toString(16)} on ${card.toUInt().toString(16)}", CardInk.contrast(text, card) >= CardInk.ACCENT_TEXT_MIN)
      }
    }
  }

  @Test
  fun `a text in the accent reads on every card there is`() {
    for (card in cards()) {
      for (accent in appAccents) {
        val text = CardInk.accentText(accent, card)
        assertTrue("accent ${accent.toUInt().toString(16)} on ${card.toUInt().toString(16)}", CardInk.contrast(text, card) >= CardInk.TEXT_MIN)
      }
    }
  }

  @Test
  fun `an accent that already reads as text is left as it is`() {
    // The app's dark-theme green on the Dark card, its light-theme green on the Light one.
    assertEquals(0xFF46A081.toInt(), CardInk.accentText(0xFF46A081.toInt(), 0xFF1C1C1E.toInt()))
    assertEquals(0xFF1F5F4A.toInt(), CardInk.accentText(0xFF1F5F4A.toInt(), 0xFFFAF7F2.toInt()))
  }

  @Test
  fun `a text in the accent keeps its hue where it is moved - the pastel green on the Light card is still a green`() {
    val moved = CardInk.accentText(0xFF46A081.toInt(), 0xFFFAF7F2.toInt())
    val r = (moved shr 16) and 0xFF; val g = (moved shr 8) and 0xFF; val b = moved and 0xFF
    assertTrue("moved to ${moved.toUInt().toString(16)}", g > r && g > b)
  }

  @Test
  fun `the text in the accent and the highlight land on the same side of the card`() {
    for (card in cards()) {
      val light = CardInk.lightTextCard(card)
      for (accent in appAccents) {
        val text = CardInk.accentText(accent, card)
        val hl = CardInk.accent(accent, card)
        // Moved, if at all, the way the card's own text goes: never one up and one down.
        if (text != (accent or 0xFF000000.toInt())) {
          assertTrue("text of ${accent.toUInt().toString(16)} on ${card.toUInt().toString(16)}", (CardInk.luminance(text) >= CardInk.luminance(accent)) == light)
        }
        if (hl != (accent or 0xFF000000.toInt())) {
          assertTrue("highlight of ${accent.toUInt().toString(16)} on ${card.toUInt().toString(16)}", (CardInk.luminance(hl) >= CardInk.luminance(accent)) == light)
        }
      }
    }
  }

  /** `argb` at `percent` strength, as the widgets store a see-through card. */
  private fun at(rgb: Int, percent: Int): Int = ((255 * percent / 100) shl 24) or (rgb and 0xFFFFFF)

  /** `card` over `ground`, as the launcher draws it. */
  private fun over(card: Int, ground: Int): Int {
    val a = ((card ushr 24) and 0xFF) / 255.0
    fun ch(shift: Int): Int = Math.round(((card shr shift) and 0xFF) * a + ((ground shr shift) and 0xFF) * (1 - a)).toInt()
    return 0xFF000000.toInt() or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
  }

  @Test
  fun `a see-through card that is pale over any wallpaper takes the dark text`() {
    // The card a widget following the phone gets by day, at the strength
    // it was found unreadable at on a phone (50%).
    val day = at(0xFFFFFF, 50)
    val stands = CardInk.paleSeeThrough(day)
    assertTrue("half-strength white is pale whatever is behind it", stands != null)
    assertEquals(false, CardInk.lightTextCard(stands!!))
    // Where it is called pale, the dark text is the better one over every wallpaper there is.
    for (percent in 0..59) for (rgb in listOf(0xFFFFFF, 0xF2F2F7, 0xF3E9D2, 0xDDE6F0, 0x808080, 0x1C1C1E, 0x000000)) {
      val card = at(rgb, percent)
      CardInk.paleSeeThrough(card) ?: continue
      for (ground in cards()) {
        val shown = over(card, ground)
        assertTrue(
          "dark text on ${rgb.toString(16)} at $percent% over ${ground.toUInt().toString(16)}",
          CardInk.contrast(CardInk.DARK_TEXT, shown) >= CardInk.contrast(CardInk.LIGHT_TEXT, shown),
        )
      }
    }
  }

  @Test
  fun `a dark see-through card, or a faint one, is still the wallpaper's to judge`() {
    for (percent in 0..59) {
      assertEquals(null, CardInk.paleSeeThrough(at(0x000000, percent)))
      assertEquals(null, CardInk.paleSeeThrough(at(0x1C1C1E, percent)))
    }
    for (percent in 0..40) assertEquals(null, CardInk.paleSeeThrough(at(0xFFFFFF, percent)))
    assertEquals(null, CardInk.paleSeeThrough(0))
  }
}
