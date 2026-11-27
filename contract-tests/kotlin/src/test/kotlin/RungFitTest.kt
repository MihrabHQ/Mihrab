import com.prayer_times.cardfit.RungFit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The layout a launcher draws in a cell, of the ones a responsive widget offers. */
class RungFitTest {
  // The prayer-times strip's own (GlanceSupport, STRETCHABLE_SIZES), in part.
  private val sizes = listOf(
    370f to 66f, 370f to 92f, 370f to 112f, 370f to 134f, 370f to 176f,
    280f to 66f, 280f to 112f, 280f to 176f, 280f to 240f,
  )

  @Test
  fun `a 4x1 cell on a narrow phone is the short narrow layout, not one for its exact height`() {
    // 277x93dp: the cell the sample cut its last line in.
    assertEquals(280f to 66f, RungFit.bestFit(sizes, 277f, 93f))
  }

  @Test
  fun `a side may be a dp over the cell, as the launcher allows`() {
    assertEquals(280f to 66f, RungFit.bestFit(sizes, 279f, 65f))
    // Two over is not a fit: nothing fits, so the smallest there is.
    assertEquals(280f to 66f, RungFit.bestFit(sizes, 200f, 40f))
  }

  @Test
  fun `of the layouts that fit, the nearest to the cell`() {
    assertEquals(370f to 92f, RungFit.bestFit(sizes, 380f, 100f))
    assertEquals(370f to 112f, RungFit.bestFit(sizes, 380f, 120f))
    assertEquals(280f to 176f, RungFit.bestFit(sizes, 300f, 200f))
    // Nearest by distance, as the launcher measures it: in a tall cell the
    // narrow tall layout is nearer than the wide short one.
    assertEquals(280f to 240f, RungFit.bestFit(sizes, 400f, 400f))
  }

  @Test
  fun `what is chosen always fits the cell, wherever anything does`() {
    var w = 120f
    while (w <= 520f) {
      var h = 40f
      while (h <= 320f) {
        val (pw, ph) = RungFit.bestFit(sizes, w, h)!!
        val anyFits = sizes.any { it.first <= w + 1 && it.second <= h + 1 }
        if (anyFits) assertTrue("$w x $h drew $pw x $ph", pw <= w + 1 && ph <= h + 1)
        else assertEquals(280f to 66f, pw to ph)
        h += 7f
      }
      w += 9f
    }
  }

  @Test
  fun `nothing offered, nothing chosen`() {
    assertNull(RungFit.bestFit(emptyList(), 300f, 100f))
  }
}
