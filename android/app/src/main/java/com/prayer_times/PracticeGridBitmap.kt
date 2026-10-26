package com.prayer_times

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import java.util.Calendar
import org.json.JSONArray
import org.json.JSONObject

/**
 * The practice graph, drawn once into a Bitmap.
 *
 * RemoteViews has a fixed view vocabulary and no loops: seventy squares means
 * seventy TextViews declared by hand in XML, each addressed by a generated id,
 * and every update crossing the process boundary as seventy separate actions.
 * A Bitmap is one action and one object, and the drawing is a dozen lines.
 *
 * THE GRID IS A CALENDAR, NOT A LIST. `practice.days` is SPARSE — the payload
 * writer omits days with nothing recorded and stamps every entry it does send
 * with its own date (`d`), because a dense ninety-eight-day array costs more
 * than the payload budget allows. This used to walk the array positionally and
 * pack entry `i` into cell `i`, which is only ever right for an unbroken run:
 * one skipped day slid every square after it one place along, and the widget
 * drew a record the Log screen had never shown. Look the day up by its date,
 * the way iOS's PracticeGrid does, and a gap is a gap.
 *
 * A RUN OF DAYS, READ LIKE A SENTENCE. It was seven rows of week-columns —
 * the shape the in-app heatmap uses — and on a home screen that shape costs
 * more than it returns: seven rows in the height a card can spare makes
 * every day a speck, and to reach the card's far edge it takes six months of
 * them, so the graph was mostly a wall of history nobody was looking at,
 * drawn too small to read. The days run left to right now and wrap like
 * text, the last cell is today, and the cell is big enough to have a mark on
 * it that means something. The weekly rhythm is gone; on a surface with no
 * legend and no tap, being able to see last week at all is worth more.
 *
 * THE WIDTH DECIDES THE CELL AND THE HEIGHT DECIDES THE ROWS. Those are the
 * two things a card can say about its shape, and the one it can say
 * accurately is its width — the height it reports is the launcher's figure
 * for the host view less whatever chrome the card believes it draws. So the
 * cell is the width divided among as many columns as fit, which lands the
 * grid flush on both edges whatever the height turns out to be, and the
 * height only decides how many rows of that cell there is room for. Shrink
 * the card and it loses a row rather than shrinking every day in it. The
 * few dp the last row does not divide into are given back to the rows, up
 * to an eighth of a cell, so the graph fills the box instead of floating
 * in a band of empty card at each end.
 *
 * A ROW A PRAYER, A COLUMN A DAY — the shape the Log screen's graph took
 * (src/practice/PracticeStrip.tsx), drawn here the same way. The run of
 * days above is how the widget used to read; it summed a day into one
 * depth of colour, and the number hid the one thing a prayer log is kept
 * for: which prayer. Six rows now — Fajr to Isha, and the fast — and every
 * cell one fact: filled for on time, faint for late, hollow for a make-up,
 * red for missed, the palest ink for nothing (before the record too: a
 * strip whose first weeks are holes reads as misplaced), nothing after today. The sunnah, the qiyam and the unaccounted
 * mark stay in the app: a home screen has no legend, and a cell that says
 * one thing can be small.
 *
 * Drawn in INK — white, every widget card being dark — not the accent: the
 * app's record is one colour at every hour under the Sky themes, and so is
 * this. The accent means one thing here, a fast, and the danger red one
 * thing, a missed prayer. A payload written before the field existed (no
 * `p`) draws each day as one column of the old summary, so an unreloaded
 * widget still says something true.
 */
object PracticeGridBitmap {

  /**
   * A sanity bound on the rows, not a design number.
   *
   * The row count is the height divided by a cell — make the card taller
   * and it grows a row, shorter and it loses one, and the cells stay the
   * size they were either way. That is the difference between a shorter
   * widget and a smaller one. This only stops a nonsense height from asking
   * for a grid with more rows than the payload has days to fill.
   */
  const val MAX_ROWS = 12

  /** The strip's rows: the five prayers, then the fast. */
  const val STRIP_ROWS = 6

  /** The cells' ink. Every widget card is dark. */
  private const val INK = 0xFFFFFFFF.toInt()

  /** Everything the grid needs to be drawn into a particular box. */
  data class Layout(
    val rows: Int,
    val columns: Int,
    val cellWPx: Int,
    val cellHPx: Int,
    val gapPx: Int,
  ) {
    /** Days the grid will show. */
    val days: Int get() = rows * columns
  }

  private const val OWED_COLOR = "#F87171"

  /** The five salāh — what a complete day accounts for. */
  private const val SALAH_PER_DAY = 5

  /**
   * A RemoteViews carrying bitmaps has to cross a Binder transaction, and
   * the AppWidget host applies its own ceiling on top of that — OEMs vary,
   * and the failure is the whole widget refusing to draw rather than a
   * warning. Ten weeks of 7dp cells is ~150 KB at 2.75x and ~300 KB at 4x,
   * and there are two of these in a 4x4. Clamping the cell keeps the pair
   * comfortably inside the budget on any density, at the cost of a grid
   * that stops growing on the very densest screens — where it is already
   * more pixels than the eye is using.
   *
   * Raised from 14 with the fold to three rows, and now a backstop rather
   * than the working limit: `layoutFor` sizes the bitmap against an AREA
   * budget, which is the thing the transaction actually cares about, and a
   * per-cell ceiling of 14px only ever meant a big cell arriving as a blur.
   */
  private const val MAX_CELL_PX = 96

  /**
   * The margin the grid keeps inside its own bitmap, so an edge square is a
   * whole square.
   *
   * Every ring here is drawn CENTRED on a cell's boundary, and two of them
   * reach outside it: the empty square's hairline by half its width, and
   * today's ring — which is itself drawn on a rect outset by half a stroke —
   * by a whole one. The first column starts at x=0 and the last ends at the
   * bitmap's width, so the outer half of those rings fell off the edge: the
   * leftmost column came out with a flat left side and a hairline half as
   * thick as its neighbours', which on a home screen reads as a graph the
   * card is clipping rather than a graph drawn to its own edge.
   *
   * A bitmap is not a canvas with room around it, so the room has to be part
   * of the bitmap. One ring's width on all four sides is the widest anything
   * reaches; the ~1dp it costs is invisible next to a square that is whole.
   */
  private fun padFor(cellPx: Int): Int =
    Math.ceil(ringWidth(cellPx).toDouble()).toInt()

  /** Today's ring — the widest stroke the grid draws, and the outermost. */
  private fun ringWidth(cellPx: Int): Float = ringWidthOf(cellPx.toFloat())

  /**
   * The same number in whatever unit the cell was given in.
   *
   * `layoutFor` needs it in dp, to count the margin against the box before
   * it decides how many rows fit; `padFor` needs it in pixels, to leave that
   * margin in the bitmap. One formula, so the row that is counted as fitting
   * is the row that fits.
   */
  private fun ringWidthOf(cell: Float): Float = (cell * RING_RATIO).coerceAtLeast(1.5f)

  private const val RING_RATIO = 0.14f

  /**
   * @param days    the payload's `practice.days` array, sparse, each entry
   *                carrying its own `d` date key
   * @param columns how many days each row holds. The grid draws
   *                `rows * columns` days, oldest at the top left and TODAY in
   *                the last cell.
   * @param cellWPx cell width in pixels
   * @param cellHPx cell height in pixels — not the same number, because the
   *                box a card gives the grid is not three cells tall for
   *                every width it is cells wide
   * @param gapPx   space between cells
   * @param since   the payload's `practice.since` — the first day the user
   *                ever logged a prayer, or null. Days from it onwards that
   *                do not account for all five carry the unaccounted dot;
   *                days before it carry nothing, because there was nothing
   *                to record yet.
   * @param now     the moment the grid describes — injectable so the shape
   *                can be asserted against a fixed date
   */
  @JvmOverloads
  fun render(
    days: JSONArray?,
    rows: Int,
    columns: Int,
    cellWPx: Int,
    cellHPx: Int,
    gapPx: Int,
    accent: Int,
    since: String? = null,
    now: Calendar = Calendar.getInstance(),
  ): Bitmap {
    @Suppress("NAME_SHADOWING") val cellWPx = cellWPx.coerceIn(3, MAX_CELL_PX)
    @Suppress("NAME_SHADOWING") val cellHPx = cellHPx.coerceIn(3, MAX_CELL_PX)
    @Suppress("NAME_SHADOWING") val gapPx = gapPx.coerceIn(1, 24)
    @Suppress("NAME_SHADOWING") val columns = columns.coerceAtLeast(1)
    // The strip has its rows: the caller's count is what it was drawn for
    // before the graph was by prayer, and is kept so nothing has to change
    // its call.
    @Suppress("UNUSED_VARIABLE", "NAME_SHADOWING") val rows = STRIP_ROWS
    val ringUnit = minOf(cellWPx, cellHPx)
    val pad = padFor(ringUnit)
    // A wider gap after each Sunday, so the weeks read as weeks: the
    // columns are counted back from today, so which columns end a week
    // depends on what day today is.
    val firstDay = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -(columns - 1)) }
    val weekEnds = IntArray(columns) { i ->
      val d = (firstDay.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, i) }
      if (d.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY && i < columns - 1) gapPx else 0
    }
    val width = columns * cellWPx + (columns - 1) * gapPx + weekEnds.sum() + 2 * pad
    val height = rows * cellHPx + (rows - 1) * gapPx + 2 * pad
    val bmp = Bitmap.createBitmap(
      width.coerceAtLeast(1),
      height.coerceAtLeast(1),
      Bitmap.Config.ARGB_8888,
    )
    val canvas = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = ringUnit * 0.28f

    val byDate = indexByDate(days)
    val todayKey = keyOf(now)
    // Today is the LAST column, so the run starts however many days back
    // that makes it. Nothing after today is drawn at all.
    val cursor = (now.clone() as Calendar).apply {
      set(Calendar.HOUR_OF_DAY, 12)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      add(Calendar.DAY_OF_YEAR, -(columns - 1))
    }
    val lineW = (ringUnit * 0.14f).coerceAtLeast(1f)

    var x = pad.toFloat()
    for (col in 0 until columns) {
      val key = keyOf(cursor)
      val left = x
      x += cellWPx + gapPx + weekEnds[col]
      val day = byDate[key]
      // Every column is a day. The days before the record used to be left
      // blank, and a strip whose first weeks are holes reads as a strip
      // drawn in the wrong place; the faint cell says "a day, nothing in
      // it", which is true of them too. (`since` decides nothing here any
      // more — the unaccounted mark stayed in the app.)
      val letters = day?.optString("p", "")?.takeIf { it.length == SALAH_PER_DAY }
      // Today's column, lit: a strip whose last cells are empty says
      // nothing about where now is without it.
      if (key == todayKey) {
        paint.style = Paint.Style.FILL
        paint.color = withAlpha(INK, 0.10f)
        canvas.drawRoundRect(
          RectF(left - gapPx / 2f, 0f, left + cellWPx + gapPx / 2f, height.toFloat()),
          radius,
          radius,
          paint,
        )
      }
      for (row in 0 until rows) {
        val top = (pad + row * (cellHPx + gapPx)).toFloat()
        val rect = RectF(left, top, left + cellWPx, top + cellHPx)
        paint.style = Paint.Style.FILL
        if (row == STRIP_ROWS - 1) {
          // The fast, in the accent — the one colour the strip spends.
          if (day != null && day.optBoolean("f", false)) {
            paint.color = accent
            canvas.drawRoundRect(rect, radius, radius, paint)
          } else {
            paint.color = withAlpha(INK, 0.07f)
            canvas.drawRoundRect(rect, radius, radius, paint)
          }
        } else if (letters != null) {
          when (letters[row]) {
            'o' -> { paint.color = withAlpha(INK, 0.85f); canvas.drawRoundRect(rect, radius, radius, paint) }
            'l' -> { paint.color = withAlpha(INK, 0.38f); canvas.drawRoundRect(rect, radius, radius, paint) }
            'm' -> { paint.color = withAlpha(Color.parseColor(OWED_COLOR), 0.85f); canvas.drawRoundRect(rect, radius, radius, paint) }
            'q' -> {
              paint.style = Paint.Style.STROKE
              paint.strokeWidth = lineW
              paint.color = withAlpha(INK, 0.85f)
              val h = lineW / 2f
              canvas.drawRoundRect(RectF(rect.left + h, rect.top + h, rect.right - h, rect.bottom - h), radius, radius, paint)
              paint.style = Paint.Style.FILL
            }
            else -> { paint.color = withAlpha(INK, 0.07f); canvas.drawRoundRect(rect, radius, radius, paint) }
          }
        } else if (day != null) {
          // An older payload: the day's summary, the same in every prayer's
          // cell, so the column still says how the day went.
          paint.color = colorFor(day, INK)
          canvas.drawRoundRect(rect, radius, radius, paint)
        } else {
          paint.color = withAlpha(INK, 0.07f)
          canvas.drawRoundRect(rect, radius, radius, paint)
        }
      }
      cursor.add(Calendar.DAY_OF_YEAR, 1)
    }
    return bmp
  }

  /**
   * The grid's whole geometry for a given box — how many days, and the
   * shape of the cell that carries one.
   *
   * ── ONE PLACE, BECAUSE TWO WAS THE BUG ────────────────────────────────
   *
   * The count and the cell size used to be decided by different code: a
   * cell size derived from the box's HEIGHT chose the column count, and
   * then the caller drew that count at a size of its own. Two shapes with
   * no reason to agree, and on a 4x4 they did not — the bitmap came out
   * proportionally narrower than its ImageView, `fitStart` scaled it to the
   * height, and eighty-odd pixels of width piled up on the right. A graph
   * that stops short of the edge every other element reaches does not read
   * as a graph that chose to be narrow; it reads as one being clipped.
   *
   * So it is answered once, here, and the caller passes the answer straight
   * through to `render`.
   *
   * ── AND WHICH WAY TO BE WRONG ─────────────────────────────────────────
   *
   * `boxHeightDp` is an estimate: the caller subtracts the chrome it knows
   * about from the height the launcher reports for the host view, and the
   * ImageView's real height comes out a little under it. So the box is
   * reckoned SHORTER than it measured. Too many columns costs a few percent
   * of cell width with the slack falling under the grid, where nothing is
   * looking; too few costs the gap against the right edge. Being wrong in
   * one direction is a rounding error and in the other it is the bug.
   *
   * @param maxDays how much history the payload actually carries
   */
  @JvmStatic
  fun layoutFor(
    boxWidthDp: Int,
    boxHeightDp: Int,
    density: Float,
    maxDays: Int,
  ): Layout {
    val boxW = boxWidthDp.toFloat().coerceAtLeast(40f)
    val boxH = boxHeightDp.toFloat().coerceAtLeast(30f)

    // THE HEIGHT DECIDES THE CELL. The strip has six rows whatever the box,
    // so a row is a sixth of the height the card gives it, within the
    // bounds that keep a cell a cell — and THE WIDTH DECIDES THE DAYS: as
    // many as that cell fits across, with a week's breath after each
    // Sunday. The cell is then widened by the few dp the last column does
    // not divide into, so the strip lands on the card's edges, and the
    // bitmap's shape is the box's: drawn to fit it, it fills it.
    val rows = STRIP_ROWS
    val marginDp = 2f * ringWidthOf(MAX_CELL_DP)
    val usableH = (boxH - marginDp).coerceAtLeast(rows * 3f)
    // The tallest a row may be: a sixth of the box.
    val cellFromH = ((usableH - (rows - 1) * GAP_DP) / rows).coerceIn(MIN_CELL_DP, MAX_CELL_DP)
    // A week's breath is one more gap per seven columns, on average.
    val breath = GAP_DP / 7f
    // THE WIDTH DECIDES THE DAYS: as many columns of that row's height as
    // fit across, so the cells come out square and the strip fills the box
    // on both axes — a card gives the graph a box, and the graph takes it.
    val columns = Math.round((boxW + GAP_DP) / (cellFromH + GAP_DP + breath))
      .coerceAtLeast(7)
      .coerceAtMost(maxDays.coerceAtLeast(7))
    val breaths = columns / 7
    // The cell is then exactly what the width divides into, so the strip
    // lands on the card's edges; its height is the box's sixth, or a
    // little over square when the box is taller than that.
    val cellW = ((boxW - (columns - 1) * GAP_DP - breaths * GAP_DP) / columns).coerceAtLeast(3f)
    val cellH = minOf(cellFromH, cellW * MAX_ROW_RATIO).coerceAtLeast(3f)
    val cellWDp = cellW
    val cellHDp = cellH

    // Only the RATIOS above matter for how the grid LOOKS, because it is
    // scaled into the box either way. What the scale below decides is how
    // sharp it arrives: draw at the device's own pixels and every edge is
    // exactly where it should be; draw at a third of them and the launcher
    // enlarges the bitmap, which is a blur with rounded corners.
    //
    // Native resolution wherever it fits. It does not always fit — the
    // bitmap crosses a Binder transaction and the host has its own ceiling
    // on top of that, and the failure is the whole widget refusing to draw
    // rather than a warning — so the only thing that pulls the scale down
    // is the area budget, and it pulls it down by as little as it must.
    val gridW = columns * cellWDp + (columns - 1) * GAP_DP
    val gridH = rows * cellHDp + (rows - 1) * GAP_DP
    var scale = density
    val area = gridW * gridH * scale * scale
    if (area > MAX_BITMAP_PX) {
      scale *= Math.sqrt((MAX_BITMAP_PX / area).toDouble()).toFloat()
    }
    return Layout(
      rows = rows,
      columns = columns,
      cellWPx = Math.round(cellWDp * scale).coerceAtLeast(3),
      cellHPx = Math.round(cellHDp * scale).coerceAtLeast(3),
      gapPx = Math.round(GAP_DP * scale).coerceAtLeast(1),
    )
  }

  /** The smallest cell that still reads as one on a home screen. */
  private const val MIN_CELL_DP = 7f

  /**
   * A ceiling on the cell, in dp, and it is deliberately generous.
   *
   * The grid takes the shape of its box: a third of the height per row, and
   * as many columns as that cell size fits across the width. Capping the
   * cell tighter than this would buy extra columns at the price of a band
   * of empty card under the graph — the bitmap would be proportionally
   * wider than its box, so the width would bind and the leftover height
   * would sit there doing nothing. Better to let a tall box have big days
   * and fewer of them; how many days to show is a decision the person
   * makes by resizing the widget, which is the control they already have.
   */
  private const val MAX_CELL_DP = 24f

  /**
   * How far off square a day may be drawn, to spend what quantising left.
   *
   * The rows are whole squares and the box is not a whole number of them,
   * so something has to absorb the remainder: either the card does, as a
   * void the graph floats in, or the rows do, as a few percent on their
   * height. A day 12% taller than it is wide still reads as that day — the
   * marks on it are drawn as fractions of the smaller side, so nothing
   * inside it stretches — and it is the difference between a graph that
   * sits in its box and one that has a band of nothing at each end.
   *
   * 12%, not more: the fill, the fast ring and the sunnah arc are read as
   * a SHAPE at this size, and past about an eighth off square the eye
   * starts reading the shape instead of the mark on it.
   */
  private const val MAX_ROW_RATIO = 1.12f

  /**
   * The most pixels the bitmap may hold, and it is a Binder budget.
   *
   * 100k pixels is 400 KB as ARGB_8888 — comfortably inside what an
   * AppWidget host will carry, and enough that a 4x4's grid is drawn at
   * about two thirds of the device's own resolution rather than a third of
   * it. Below that the enlargement starts to show on the cells' corners.
   */
  private const val MAX_BITMAP_PX = 100_000f



  /**
   * The space between cells, in dp, on both axes.
   *
   * Four, up from two. Two was right for a 7dp square in a grid of a
   * hundred and eighty; at three rows the cells are four times the size and
   * the same two points between them read as a solid slab with grout lines
   * scratched into it. The gap has to grow with what it separates.
   */
  private const val GAP_DP = 3f

  /**
   * `days` keyed by its own date stamp.
   *
   * An entry without a usable `d` is dropped rather than guessed at: a day
   * drawn in the wrong square is worse than a day not drawn, because it is
   * indistinguishable from a real one.
   */
  private fun indexByDate(days: JSONArray?): Map<String, JSONObject> {
    if (days == null || days.length() == 0) return emptyMap()
    val out = HashMap<String, JSONObject>(days.length())
    for (i in 0 until days.length()) {
      val day = days.optJSONObject(i) ?: continue
      val key = day.optString("d")
      if (key.length == 10) out[key] = day
    }
    return out
  }

  /** Local YYYY-MM-DD, matching the payload's own day keys. */
  private fun keyOf(cal: Calendar): String = String.format(
    "%04d-%02d-%02d",
    cal.get(Calendar.YEAR),
    cal.get(Calendar.MONTH) + 1,
    cal.get(Calendar.DAY_OF_MONTH),
  )

  /**
   * The fill, and it is the Log screen's `fillFor` with the names changed.
   *
   * Kept deliberately in the same order and with the same thresholds,
   * because the one thing this grid must not do is describe a week
   * differently from the screen the user checks it against. A future day is
   * not here at all — it is skipped before this is called, and drawn as
   * nothing, which is what the app does with it. It used to be a grey
   * square, which read as a day already lost.
   */
  private fun colorFor(day: JSONObject?, accent: Int): Int {
    // The empty square is the palest step of the SAME ramp, not grey — the
    // app's heatmap makes the same choice, and for the same reason: grey
    // reads as a failed day, and this graph does not grade anyone.
    if (day == null) return withAlpha(accent, 0.10f)
    // ORDER MATTERS, and it used to be wrong. `m` was tested first, so a day
    // of four prayers on time and one marked missed — the ordinary shape of
    // a day that is still in progress — drew as a red square here and as a
    // strong green one on the Log screen. The app treats `missed` as a MARK
    // on a day, not as the day's colour: red is only what a day looks like
    // when something was recorded and NONE of it was kept.
    val weight = weightOf(day)
    if (weight > 0) return withAlpha(accent, 0.42f + 0.58f * (weight / 500f))
    if (loggedOf(day) > 0) return withAlpha(Color.parseColor(OWED_COLOR), 0.30f)
    return withAlpha(accent, 0.10f)
  }

  /**
   * The day's weighted score, 0..500, as the Log screen computes it.
   *
   * `kw` is the field the app now sends. `k` is the older count and is the
   * fallback for a payload written before this change — it over-credits a
   * late prayer and ignores a made-up one, which is exactly why it stopped
   * being the number the fill is drawn from.
   */
  private fun weightOf(day: JSONObject): Int {
    if (day.has("kw")) return day.optInt("kw", 0).coerceIn(0, 500)
    return day.optInt("k", 0).coerceIn(0, 5) * 100
  }

  /** Entries recorded that day, whatever they say. Absent on old payloads. */
  private fun loggedOf(day: JSONObject): Int {
    if (day.has("l")) return day.optInt("l", 0).coerceAtLeast(0)
    // Before `l` existed the only signal that something was recorded on a
    // day with nothing kept was the missed flag.
    return if (day.optBoolean("m", false)) 1 else 0
  }

  private fun withAlpha(color: Int, alpha: Float): Int =
    Color.argb(
      (alpha.coerceIn(0f, 1f) * 255).toInt(),
      Color.red(color),
      Color.green(color),
      Color.blue(color),
    )
}
