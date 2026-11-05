import com.prayer_times.cardfit.LogFit
import com.prayer_times.cardfit.fitLogCard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Log card fits the cell the launcher gives it — at EVERY height.
 *
 * ── WHAT THIS PINS, AND WHY IT IS NOT widgetHeightBudgets.test.ts ─────
 *
 * That file exists because of a clipping bug whose symptom was "the
 * countdown footer came out as a few points of clipped text". The same
 * symptom came back on 5 Nov 2026 on a Pixel 10 Pro, and that file did
 * not catch it: it pins the previous bug's MECHANISM — budgets carrying
 * the inset twice, the variant's budget being the one the slack is
 * measured against — and both of those held perfectly at the height that
 * broke. The launcher simply handed the card 89dp, below the smallest
 * budget the card knew about (112dp), and nothing said what to do then.
 *
 * So this pins the PROPERTY instead: whatever the room, the bands the
 * card draws must add up to no more than the room. It is a sweep, not a
 * case, because the bug was a height nobody thought to try.
 *
 * The line heights are the device's to measure, so they are passed in.
 * The factors below are Roboto's at the densities Mihrab ships on, taken
 * a little GENEROUS on purpose: a test that models thinner text than the
 * phone draws would pass on arithmetic the phone still clips.
 */
class CardFitTest {
  /** One line at `sp`, as a TextView draws it with font padding. */
  private fun line(sp: Float): Float = sp * 1.25f + 2f

  /** A name in a script whose lines are taller than Latin's (#118). */
  private fun tallName(sp: Float): Float = line(sp) * 1.3f

  private fun fit(
    room: Int,
    title: Float = 0f,
    rule: Float = 0f,
    slack: Int = 0,
    pill: Int = 30,
    name: (Float) -> Float = ::line,
  ): LogFit = fitLogCard(
    roomDp = room,
    titleDp = title,
    ruleDp = rule,
    slackDp = slack,
    startPillDp = pill,
    minPillDp = MIN_PILL,
    minSp = MIN_SP,
    nameDp = name,
    lineDp = ::line,
  )

  /** What the column actually spends, given what the fit decided. */
  private fun spent(f: LogFit, title: Float, rule: Float, name: (Float) -> Float): Float =
    title + f.topPadDp + f.pillDp + f.botPadDp + rule +
      (if (f.showName || f.showTime) f.gapDp.toFloat() else 0f) +
      (if (f.showName) name(f.nameSp) else 0f) +
      (if (f.showTime) line(f.timeSp) else 0f) +
      (if (f.showFoot) line(f.footSp) else 0f)

  /** Below this the pill alone is taller than the card; nothing can help. */
  private fun hopeless(room: Int, title: Float, rule: Float) = MIN_PILL + title + rule > room

  @Test
  fun `fits every height a launcher might hand it`() {
    // 40dp is the provider's own declared minHeight; 260 is past a 4x2.
    for (room in 40..260) {
      for (pill in listOf(30, 38)) {
        for (title in listOf(0f, line(11f))) {
          for (rule in listOf(0f, 15f)) {
            if (hopeless(room, title, rule)) continue
            val f = fit(room, title = title, rule = rule, pill = pill)
            val used = spent(f, title, rule, ::line)
            assertTrue(
              "room=$room pill=$pill title=$title rule=$rule spent=$used fit=$f",
              used <= room + 0.5f,
            )
          }
        }
      }
    }
  }

  @Test
  fun `fits a taller script too`() {
    // Arabic, Bengali and Hindi names fall back to a font whose line is
    // taller; #118 took that out of the chip, and it must still fit.
    for (room in 40..260) {
      if (hopeless(room, 0f, 0f)) continue
      val f = fit(room, pill = 30, name = ::tallName)
      val used = spent(f, 0f, 0f, ::tallName)
      assertTrue("room=$room spent=$used fit=$f", used <= room + 0.5f)
    }
  }

  @Test
  fun `the Pixel cell that clipped now fits, with the footer kept`() {
    // 89dp host view, 6dp inset and 6dp padding on each side: 65dp.
    val f = fit(65)
    assertTrue("the footer is the line the countdown is on", f.showFoot)
    assertTrue("spent ${spent(f, 0f, 0f, ::line)}", spent(f, 0f, 0f, ::line) <= 65.5f)
  }

  @Test
  fun `the old fixed-pill arithmetic is what this would have caught`() {
    // Not a test of the card — a test of the test. The card used to spend
    // a flat 30dp pill with 6dp over it and a 4dp gap, and never looked at
    // the room. In the cell above that is 84dp of bands in 65dp of card.
    val old = 6 + 30 + 4 + line(11f) + line(15f) + line(11f)
    assertTrue("the old arithmetic really did overflow: $old", old > 65f)
  }

  @Test
  fun `gives nothing away that it does not have to`() {
    // A roomy card keeps every default: no shrinking where there is space.
    val f = fit(140, pill = 38)
    assertEquals(38, f.pillDp)
    assertEquals(6, f.topPadDp)
    assertEquals(4, f.gapDp)
    assertEquals(11f, f.nameSp, 0f)
    assertEquals(15f, f.timeSp, 0f)
    assertTrue(f.showFoot)
  }

  @Test
  fun `an unmeasured card keeps its defaults`() {
    // The launcher has not said yet; 0 is not "no room at all".
    val f = fit(0, pill = 38)
    assertEquals(38, f.pillDp)
    assertTrue(f.showFoot)
  }

  @Test
  fun `never sets type below the floor, nor a pill below its own`() {
    for (room in 20..260) {
      val f = fit(room)
      assertTrue("nameSp ${f.nameSp} at room=$room", f.nameSp >= MIN_SP)
      assertTrue("timeSp ${f.timeSp} at room=$room", f.timeSp >= MIN_SP)
      assertTrue("footSp ${f.footSp} at room=$room", f.footSp >= MIN_SP)
      assertTrue("pill ${f.pillDp} at room=$room", f.pillDp >= MIN_PILL)
      assertTrue("gap ${f.gapDp} at room=$room", f.gapDp >= 1)
    }
  }

  @Test
  fun `drops bands least-useful first, and only at the floor`() {
    for (room in 20..260) {
      val f = fit(room)
      // The ladder never skips a rung: no card loses its names while it
      // still draws the times, or loses its times while it draws a footer.
      if (!f.showTime) assertTrue("room=$room dropped the time, kept the footer", !f.showFoot)
      if (!f.showName) assertTrue("room=$room dropped the name, kept the time", !f.showTime)
      // And nothing is dropped that the floor would have held.
      if (!f.showFoot) {
        val atFloor = MIN_PILL + 1 + line(MIN_SP) * 3
        assertTrue("room=$room could have held the footer at the floor", atFloor > room)
      }
    }
  }

  @Test
  fun `the smallest cell the provider allows still draws a tappable chip`() {
    // minHeight is 40dp: 16dp of content once the inset and padding go.
    val f = fit(16)
    assertEquals(MIN_PILL, f.pillDp)
    assertTrue("nothing but the pill fits", !f.showFoot && !f.showTime && !f.showName)
  }

  @Test
  fun `shrinks in order, the pill before the type`() {
    // A card one point short loses it off the pill, not off the words.
    val roomy = fit(140)
    var shrankPillFirst = false
    for (room in 60..139) {
      val f = fit(room)
      if (f.pillDp < roomy.pillDp && f.nameSp == roomy.nameSp && f.timeSp == roomy.timeSp) {
        shrankPillFirst = true
        break
      }
    }
    assertTrue("there is a height that costs the pill and nothing else", shrankPillFirst)
  }

  private companion object {
    /** LogGlanceWidget.CHIP_MIN_HEIGHT_DP and CARD_MIN_SP. */
    const val MIN_PILL = 22
    const val MIN_SP = 9f
  }
}
