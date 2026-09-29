package com.prayer_times.contract

/**
 * The night marks — Islamic Midnight, the Last Third and the First Third —
 * the times after ʿIshāʾ a user can turn on. Mirrors EXTRA_ROW_KEYS in
 * src/widget/buildWidgetPayload.ts.
 *
 * One list for every native reader. There used to be three copies of "is
 * this a night mark" (the prayer widget, its Glance port, the Live
 * Activity's alert modes), and three copies of one list is how the First
 * Third once came to be missing from one of them.
 */
object NightMarks {
  val KEYS: Set<String> = setOf("Midnight", "Lastthird", "Firstthird")

  /** Case-insensitive, as the rows' keys have always been compared. */
  fun isNightKey(key: String): Boolean = KEYS.any { it.equals(key, ignoreCase = true) }
}
