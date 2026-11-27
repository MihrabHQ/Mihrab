import com.prayer_times.cardfit.LogSizes
import com.prayer_times.cardfit.RungFit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Log card is drawn with a layout about as tall as the cell it is in, on any launcher's grid. */
class LogSizesTest {
  private val row = LogSizes.ROW.map { it.first.toFloat() to it.second.toFloat() }

  @Test
  fun `the cells this was seen wrong in`() {
    // An Android 12 emulator's 4x1: 277x93. It drew the 66dp layout.
    assertEquals(220f to 92f, RungFit.bestFit(row, 277f, 93f))
    // A Pixel's own launcher: 89dp of height.
    assertEquals(80f, RungFit.bestFit(row, 380f, 89f)!!.second)
    assertEquals(80f, RungFit.bestFit(row, 300f, 89f)!!.second)
  }

  @Test
  fun `a one-row cell of any launcher is never drawn much shorter than it is`() {
    // 4 columns on screens from 320dp to 480dp wide and wider; one row from 66dp up.
    var w = 221f
    while (w <= 470f) {
      var h = 66f
      while (h <= 126f) {
        val (pw, ph) = RungFit.bestFit(row, w, h)!!
        assertTrue("$w x $h drew $pw x $ph: does not fit", pw <= w + 1 && ph <= h + 1)
        assertTrue("$w x $h drew $pw x $ph: ${h - ph}dp unused", h - ph <= 20f)
        h += 1f
      }
      w += 3f
    }
  }

  @Test
  fun `a cell narrower than every layout still gets the smallest, as the launcher does`() {
    assertEquals(220f to 56f, RungFit.bestFit(row, 180f, 70f))
  }

  @Test
  fun `no more sizes than one RemoteViews takes`() {
    assertTrue(LogSizes.ROW.size <= LogSizes.MAX_SIZES)
    assertEquals(LogSizes.ROW.size, LogSizes.ROW.toSet().size)
    // The tall card: the strip's sixteen, less what it drops, plus the narrow column.
    assertTrue(16 - LogSizes.TALL_DROPPED.size + LogSizes.TALL_NARROW.size <= LogSizes.MAX_SIZES)
  }

  @Test
  fun `the tall card on a narrow phone is a two-row layout, not the shortest one-row`() {
    // The strip's own list, with what the tall Log card drops and adds.
    val strip = buildList {
      for (h in listOf(66, 92, 112, 134, 176, 190, 206, 222, 238, 254, 270, 300)) add(370f to h.toFloat())
      for (h in listOf(66, 112, 176, 240)) add(280f to h.toFloat())
    }
    val f = { l: List<Pair<Int, Int>> -> l.map { it.first.toFloat() to it.second.toFloat() } }
    val tall = strip - f(LogSizes.TALL_DROPPED).toSet() + f(LogSizes.TALL_NARROW)
    assertEquals(16, tall.size)
    // 250x200: nothing of the strip's fits, and the fallback was 280x66.
    assertEquals(280f to 66f, RungFit.bestFit(strip, 250f, 200f))
    assertEquals(220f to 176f, RungFit.bestFit(tall, 250f, 200f))
    // Where the strip's own fitted, it still does.
    assertEquals(280f to 176f, RungFit.bestFit(tall, 300f, 190f))
    assertEquals(370f to 206f, RungFit.bestFit(tall, 380f, 210f))
    // Squeezed into one row, or into a cell nothing fits: the one-row layout it kept.
    assertEquals(370f to 66f, RungFit.bestFit(tall, 380f, 95f))
    assertEquals(370f to 66f, RungFit.bestFit(tall, 200f, 90f))
  }
}
