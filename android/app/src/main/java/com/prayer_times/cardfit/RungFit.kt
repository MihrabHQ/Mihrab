package com.prayer_times.cardfit

import kotlin.math.ceil

/**
 * Which of a responsive widget's layouts a launcher draws in a cell.
 *
 * A widget on `SizeMode.Responsive` hands the launcher one layout per size
 * it was composed for, and the launcher picks among them
 * (android.widget.RemoteViews, `findBestFitLayout`): of the layouts that
 * fit the cell — each side no more than a dp over it — the one nearest the
 * cell's size; and where none fits, the smallest there is.
 *
 * A sample of the widget has to make the same choice. Composed for the
 * cell's exact size instead, it showed a layout the home screen never
 * does: a 277×93dp cell is drawn with the 280×66 layout, and the sample
 * drew the one for 93dp of height, whose last line ran off the card.
 *
 * Plain numbers (dp), no Android: swept off a device in RungFitTest.
 */
object RungFit {
  /** The layout size, of `sizes`, a launcher shows in a `width`×`height` cell. */
  fun bestFit(sizes: Collection<Pair<Float, Float>>, width: Float, height: Float): Pair<Float, Float>? {
    if (sizes.isEmpty()) return null
    val fitting = sizes.filter { (w, h) -> w <= ceil(width) + 1 && h <= ceil(height) + 1 }
    if (fitting.isEmpty()) return sizes.minByOrNull { (w, h) -> w * h }
    return fitting.minByOrNull { (w, h) -> (w - width) * (w - width) + (h - height) * (h - height) }
  }
}
