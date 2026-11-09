package com.prayer_times.cardfit

/**
 * How a widget card spends the height the launcher actually gave it.
 *
 * ── WHY THIS IS A PACKAGE OF ITS OWN ──────────────────────────────────
 *
 * The Log card's height budgets read a 4×1 cell as about 112dp. Launchers
 * do not promise that — `minHeight` is 40dp and `targetCellHeight` is 1 —
 * and a Pixel's own launcher hands it 89dp, which is 65dp of content once
 * the inset and the padding come off. A 30dp pill, a name, a time and the
 * footer want 84dp, so the column ran past the bottom edge and Glance cut
 * it there: the footer, the line the countdown is on, was not drawn at all.
 *
 * `widgetHeightBudgets.test.ts` exists because of an EARLIER clipping bug
 * with the same symptom, and it did not catch this one — it pins that
 * bug's mechanism (the inset arithmetic, variant and slack agreeing)
 * rather than the property that matters: the content must fit whatever
 * height the launcher gives. Both of its invariants held at 89dp.
 *
 * The property is only worth pinning if a test can RUN it, and a Glance
 * composable cannot be run off a device. So the arithmetic lives here,
 * with no Android in it, and `contract-tests/kotlin` sweeps it over every
 * height a launcher might hand the card. The measuring stays in the
 * composable, because line heights need the device's own fonts: this
 * takes them as functions and does the spending.
 */

/** What one Log card's column may spend, once the cell's height is known. */
data class LogFit(
  val pillDp: Int,
  val topPadDp: Int,
  val botPadDp: Int,
  val gapDp: Int,
  val nameSp: Float,
  val timeSp: Float,
  val footSp: Float,
  /** False only when even the floor does not fit: dropped, never cut. */
  val showFoot: Boolean,
  /** The time under each chip: the first band to go after the footer. */
  val showTime: Boolean,
  /** The chip's name. Last to go — five unnamed pills say nothing. */
  val showName: Boolean,
)

/**
 * Fit the Log card's bands into `roomDp`.
 *
 * What gives, gives in order: the pill first, because it is the one band
 * with nothing written in it; then the air over the chips and under them;
 * then the type itself, half a point at a time, down to `minSp`.
 *
 * Below that, bands are dropped rather than cut, least useful first: the
 * footer, then the time under each chip, then the name. The pill itself
 * is never taken away — tapping it is what the card is for. A 4×1 cell
 * is 40dp at this provider's declared minimum, which is 16dp of content:
 * the sweep in `CardFitTest` found that before any launcher did.
 *
 * `roomDp <= 0` is an unmeasured card: it keeps every default, as the
 * composable did before any of this existed.
 *
 * @param nameDp the tallest chip name at a size, as the device draws it
 * @param lineDp one line at a size, as the device draws it
 */
fun fitLogCard(
  roomDp: Int,
  titleDp: Float,
  ruleDp: Float,
  slackDp: Int,
  startPillDp: Int,
  minPillDp: Int,
  minSp: Float,
  nameDp: (Float) -> Float,
  lineDp: (Float) -> Float,
  /** False for a card with no footer line at all (the 4×1 Log card). */
  foot: Boolean = true,
): LogFit {
  var pill = startPillDp
  var topPad = 6 + slackDp
  var botPad = slackDp
  var gap = 4
  var nameSp = 11f
  var timeSp = 15f
  var footSp = 11f
  var showFoot = foot
  var showTime = true
  var showName = true
  if (roomDp <= 0) {
    return LogFit(pill, topPad, botPad, gap, nameSp, timeSp, footSp, showFoot, showTime, showName)
  }

  fun need(): Float =
    titleDp + topPad + pill + botPad + ruleDp +
      (if (showName || showTime) gap.toFloat() else 0f) +
      (if (showName) nameDp(nameSp) else 0f) +
      (if (showTime) lineDp(timeSp) else 0f) +
      (if (showFoot) lineDp(footSp) else 0f)

  fun over(): Int = Math.ceil((need() - roomDp).toDouble()).toInt()

  if (over() > 0) pill = (pill - over()).coerceAtLeast(minPillDp)
  if (over() > 0) topPad = (topPad - over()).coerceAtLeast(0)
  if (over() > 0) botPad = (botPad - over()).coerceAtLeast(0)
  if (over() > 0) gap = (gap - over()).coerceAtLeast(1)
  while (over() > 0 && timeSp > minSp) timeSp -= 0.5f
  while (over() > 0 && nameSp > minSp) {
    nameSp -= 0.5f
    footSp -= 0.5f
  }
  if (over() > 0) showFoot = false
  if (over() > 0) showTime = false
  if (over() > 0) showName = false
  // The pill is never dropped: a card too short even for it is one the
  // launcher should not have offered, and a visible tick that overflows
  // by a point is still a tick you can tap.
  return LogFit(pill, topPad, botPad, gap, nameSp, timeSp, footSp, showFoot, showTime, showName)
}
