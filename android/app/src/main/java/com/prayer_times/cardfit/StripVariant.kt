package com.prayer_times.cardfit

/**
 * Which of the prayer strip's layouts a height gets.
 *
 * The strip has a roomy layout (14dp ends, a rule over the next-prayer
 * line), a tight one (6dp ends, no rule) and a one-row one (no header).
 * Each was chosen by a fixed height — 150dp and 124dp, measured with the
 * widgets' Latin face at the default font size — so a card whose lines
 * came out taller (a larger system font, a taller script, the night times
 * under the row) was handed a layout it did not fit, and its last line
 * was cut off at the card's edge.
 *
 * The fixed heights stay as FLOORS: at the size they were measured at,
 * nothing changes. A layout is chosen only at a height that also holds
 * what it draws (`roomyNeedDp`, `tightNeedDp`: the widget's own sums of
 * its rows), so taller lines move a card to the tighter layout instead of
 * off its edge.
 *
 * No Android in it; `contract-tests/kotlin` sweeps it.
 */
data class StripVariant(
  /** Shorter than the roomy layout needs: 6dp ends, no rule. */
  val tight: Boolean,
  /** Shorter than the tight layout needs: the times row and what the card puts with it. */
  val oneRow: Boolean,
  /** The height the chosen layout is filled against; the rest is spread as slack. */
  val budgetDp: Int,
)

fun stripVariant(
  heightDp: Int,
  roomyNeedDp: Int,
  tightNeedDp: Int,
  roomyFloorDp: Int,
  tightFloorDp: Int,
  bareBudgetDp: Int,
): StripVariant {
  val roomy = maxOf(roomyFloorDp, roomyNeedDp)
  // The tight layout is never asked for more than the roomy one.
  val tightAt = minOf(maxOf(tightFloorDp, tightNeedDp), roomy)
  // An unmeasured card (0) is the roomy one.
  val tight = heightDp in 1 until roomy
  val oneRow = heightDp in 1 until tightAt
  return StripVariant(tight, oneRow, if (oneRow) bareBudgetDp else if (tight) tightAt else roomy)
}
