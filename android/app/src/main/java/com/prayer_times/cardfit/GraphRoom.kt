package com.prayer_times.cardfit

/**
 * Whether a card draws its practice graph at a height, and in which layout.
 *
 * A card tries its full layout first; where the graph would not have its
 * smallest box under that, a card that has a tighter layout (the tall
 * cards' `compact`) tries that; and where neither leaves the box, the
 * graph is left out rather than drawn as a line of dots.
 *
 * No Android in it, like `fitLogCard`: the chromes are measured by the
 * widget (its rows' own line heights) and passed in, so
 * `contract-tests/kotlin` can sweep the decision over every height a
 * launcher might hand a card.
 */
data class GraphRoom(
  /** The graph is drawn. */
  val graph: Boolean,
  /** …in the tighter layout. */
  val compact: Boolean,
  /** What the chosen layout costs in height, everything but the graph; 0 without one. */
  val chromeDp: Int,
) {
  companion object {
    val NONE = GraphRoom(graph = false, compact = false, chromeDp = 0)
  }
}

/**
 * @param heightDp        the card's height as the launcher hands it; 0 when unmeasured
 * @param fullChromeDp    everything but the graph in the full layout
 * @param compactChromeDp the same in the tighter layout, or null for a card that has none
 * @param minBoxDp        the smallest box a graph is drawn in
 */
fun graphRoom(heightDp: Int, fullChromeDp: Int, compactChromeDp: Int?, minBoxDp: Int): GraphRoom = when {
  heightDp <= 0 -> GraphRoom.NONE
  heightDp - fullChromeDp >= minBoxDp -> GraphRoom(graph = true, compact = false, chromeDp = fullChromeDp)
  compactChromeDp != null && heightDp - compactChromeDp >= minBoxDp ->
    GraphRoom(graph = true, compact = true, chromeDp = compactChromeDp)
  else -> GraphRoom.NONE
}

/**
 * The box the graph is drawn for: the card's height less its chrome and
 * any line under the graph. A card whose graph stops growing at a height
 * (`capDp`: the tall cards past their two rows) is reckoned at that height
 * from there on, so a card stretched taller keeps the graph it had.
 */
fun graphBoxDp(heightDp: Int, room: GraphRoom, capDp: Int? = null, footDp: Int = 0): Int =
  (if (capDp != null) minOf(heightDp, capDp) else heightDp) - room.chromeDp - footDp
