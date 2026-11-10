import com.prayer_times.cardfit.stripVariant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The prayer strip is never handed a layout its rows do not fit.
 *
 * The floors are the budgets the layouts were measured at (150 and 124dp);
 * the needs are what the widget sums from its own rows. At the measured
 * size nothing moves; with taller lines the tighter layout comes sooner.
 */
class StripVariantTest {
  private fun v(h: Int, roomyNeed: Int = 143, tightNeed: Int = 112) =
    stripVariant(h, roomyNeed, tightNeed, roomyFloorDp = 150, tightFloorDp = 124, bareBudgetDp = 96)

  @Test
  fun `at the size the budgets were measured at, the budgets decide`() {
    for (h in 1..400) {
      val got = v(h)
      assertEquals("h=$h", h < 150, got.tight)
      assertEquals("h=$h", h < 124, got.oneRow)
      assertEquals("h=$h", if (h < 124) 96 else if (h < 150) 124 else 150, got.budgetDp)
    }
  }

  @Test
  fun `an unmeasured card is the roomy one`() {
    val got = v(0)
    assertFalse(got.tight)
    assertFalse(got.oneRow)
    assertEquals(150, got.budgetDp)
  }

  @Test
  fun `taller rows bring the tighter layout sooner, never a layout that does not fit`() {
    // A larger font, or the night times under the row: the roomy layout
    // needs 165dp and the tight one 134.
    for (h in 1..400) {
      val got = v(h, roomyNeed = 165, tightNeed = 134)
      if (!got.tight) assertTrue("roomy at h=$h", h >= 165)
      if (got.tight && !got.oneRow) assertTrue("tight at h=$h", h >= 134)
      assertEquals("h=$h", h < 165, got.tight)
      assertEquals("h=$h", h < 134, got.oneRow)
    }
  }

  @Test
  fun `the layouts stay in order whatever the sums say`() {
    // A tight need over the roomy one (it cannot be, but a sum can be wrong):
    // one row is never chosen at a height the roomy layout already has.
    for (h in 1..400) {
      val got = v(h, roomyNeed = 140, tightNeed = 190)
      if (got.oneRow) assertTrue("h=$h", got.tight)
      assertTrue("h=$h", got.budgetDp <= maxOf(150, 140))
    }
  }

  @Test
  fun `the budget is the height the chosen layout begins at`() {
    assertEquals(165, v(200, roomyNeed = 165, tightNeed = 134).budgetDp)
    assertEquals(134, v(150, roomyNeed = 165, tightNeed = 134).budgetDp)
    assertEquals(96, v(100, roomyNeed = 165, tightNeed = 134).budgetDp)
  }
}
