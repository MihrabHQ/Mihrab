/**
 * Where a day sits along the Home day pager's scroll axis.
 *
 * The pager scrolls left to right in every language. In a right-to-left
 * language its pages are stored the other way round — the oldest day at the
 * right-hand end, so the day after this one is to the LEFT, as the chevrons
 * say — instead of letting the native list mirror itself. A mirrored
 * horizontal list reports its scroll offset from the physical left edge on
 * Android, while a FlatList works out where an item is from the item's
 * start; the two differ by the width of the content less one page, and the
 * card opened one page early: yesterday's times under today's date, and each
 * day after it showing the day before's log marks.
 *
 * The map is its own inverse: it takes a page's index in the list of days to
 * its position on the axis, and a position back to the page.
 */
export function pagerPosition(
  index: number,
  count: number,
  rtl: boolean,
): number {
  return rtl ? count - 1 - index : index;
}
