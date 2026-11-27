package com.prayer_times.cardfit

/**
 * The sizes the Log cards are composed for (dp), as plain numbers so the
 * choice a launcher makes among them can be swept off a device
 * (LogSizesTest, with RungFit).
 *
 * ── WHY THE LOG CARD HAS ITS OWN ──────────────────────────────────────
 *
 * It shared the prayer strip's list, which has two faults for this card.
 *
 * ITS STEPS ARE THE STRIP'S. At 280dp wide the list goes 66, then 112.
 * A one-row cell is about 80–100dp on most launchers (a Pixel's is 89,
 * an Android 12 emulator's 93), so the card was composed for 66dp — a
 * pill and a name, the time dropped — and shown in a cell a third
 * taller, with the difference left empty above and below it. The one-row
 * card's heights here step by 12–20dp, so a cell is never drawn with a
 * layout much shorter than itself.
 *
 * IT HAS NOTHING NARROWER THAN 280dp. A launcher draws the layout that
 * FITS the cell, and where none fits, the smallest there is. A 4-column
 * cell is under 280dp on a great many phones (277dp on a 411dp-wide
 * screen; nearer 250dp on a 360dp one), so nothing fitted and every such
 * cell — whatever its height, a two-row one included — got the shortest
 * layout. The 220dp column is for those. The card's own layout does not
 * care which width it was composed for: its five chips share the row by
 * weight, so the width here only decides which HEIGHT is offered.
 *
 * SIXTEEN IS ALL THERE IS. RemoteViews takes at most sixteen sizes in one
 * map, and the strip's list already has sixteen: every size added here is
 * one given up somewhere else, and LogSizesTest counts them.
 */
object LogSizes {
  /** RemoteViews' own limit on the sizes in one map. */
  const val MAX_SIZES = 16

  /** The one-row card (4×1, and stretched). Width to height. */
  val ROW: List<Pair<Int, Int>> = buildList {
    for (h in listOf(66, 80, 92, 112, 134, 176, 240)) add(370 to h)
    for (h in listOf(66, 80, 92, 112)) add(280 to h)
    for (h in listOf(56, 66, 80, 92, 112)) add(220 to h)
  }

  /** What the tall card (4×2) adds to the strip's list: the narrow column. */
  val TALL_NARROW: List<Pair<Int, Int>> = listOf(220 to 112, 220 to 176)

  /**
   * …and what it gives up for them: two layouts for a two-row card squeezed
   * into one row, which keeps the 370×66 one (and so the smallest there is,
   * for a cell nothing fits).
   */
  val TALL_DROPPED: List<Pair<Int, Int>> = listOf(370 to 92, 280 to 66)
}
