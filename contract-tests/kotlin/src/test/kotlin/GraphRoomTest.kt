import com.prayer_times.cardfit.GraphRoom
import com.prayer_times.cardfit.graphBoxDp
import com.prayer_times.cardfit.graphRoom
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The practice graph is drawn where it has room, in the layout that gives
 * it room, and for the room it gets — at EVERY height.
 *
 * The widgets' graph came out stretched, squashed and floating in turn
 * while this decision lived in two cards as constants and conditions; the
 * tests then read the Kotlin for the lines that made it. This asks the
 * decision itself, over every height a launcher might hand a card.
 *
 * The chromes are the device's to measure (the rows' line heights), so
 * they are passed in: the figures here are a Pixel 10 Pro's, the prayer
 * times card at 160dp full and 106dp compact.
 */
class GraphRoomTest {
  private val full = 160
  private val compact = 106
  private val minBox = 36

  @Test
  fun `an unmeasured card draws no graph`() {
    assertEquals(GraphRoom.NONE, graphRoom(0, full, compact, minBox))
  }

  @Test
  fun `the full layout wherever it leaves the box, the compact one under that, nothing under both`() {
    for (h in 1..600) {
      val room = graphRoom(h, full, compact, minBox)
      when {
        h >= full + minBox -> assertEquals("h=$h", GraphRoom(true, false, full), room)
        h >= compact + minBox -> assertEquals("h=$h", GraphRoom(true, true, compact), room)
        else -> assertEquals("h=$h", GraphRoom.NONE, room)
      }
    }
  }

  @Test
  fun `a drawn graph always has at least its smallest box, and the box and chrome make the card`() {
    for (h in 1..600) {
      val room = graphRoom(h, full, compact, minBox)
      if (!room.graph) continue
      val box = graphBoxDp(h, room)
      assertTrue("h=$h box=$box", box >= minBox)
      assertEquals("h=$h", h, box + room.chromeDp)
    }
  }

  @Test
  fun `a card with no tighter layout goes without rather than compact`() {
    for (h in 1..600) {
      val room = graphRoom(h, full, null, minBox)
      assertFalse("h=$h", room.compact)
      assertEquals("h=$h", h >= full + minBox, room.graph)
    }
  }

  @Test
  fun `the layouts a phone is known to hand the tall card`() {
    // Nova at a row and a half, the Pixel launcher's two rows, Nova's two.
    assertEquals(GraphRoom(true, true, compact), graphRoom(190, full, compact, minBox))
    assertEquals(GraphRoom(true, false, full), graphRoom(223, full, compact, minBox))
    assertEquals(GraphRoom(true, false, full), graphRoom(259, full, compact, minBox))
    assertEquals(84, graphBoxDp(190, graphRoom(190, full, compact, minBox)))
    assertEquals(63, graphBoxDp(223, graphRoom(223, full, compact, minBox)))
  }

  @Test
  fun `past its cap the graph is the one it had there, and the line under it comes off the box`() {
    val cap = 270
    val at = graphBoxDp(cap, graphRoom(cap, full, compact, minBox), capDp = cap)
    for (h in cap..700) {
      assertEquals("h=$h", at, graphBoxDp(h, graphRoom(h, full, compact, minBox), capDp = cap))
    }
    val room = graphRoom(400, full, compact, minBox)
    assertEquals(graphBoxDp(400, room) - 19, graphBoxDp(400, room, footDp = 19))
  }

  @Test
  fun `a taller chrome moves the thresholds with it`() {
    // Night times on, or a larger font: 20dp more on the card.
    assertEquals(GraphRoom.NONE, graphRoom(compact + minBox + 19, full + 20, compact + 20, minBox))
    assertTrue(graphRoom(compact + minBox + 20, full + 20, compact + 20, minBox).compact)
  }
}
