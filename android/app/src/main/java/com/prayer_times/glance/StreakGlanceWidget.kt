package com.prayer_times.glance

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Paint
import android.util.TypedValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import com.prayer_times.PracticeGridBitmap
import com.prayer_times.R
import com.prayer_times.contract.WidgetContract
import com.prayer_times.contract.WidgetPayloadV1

/**
 * Streak & Practice on Glance — PrayerWidgetStreakProvider's card.
 *
 * The streak in the accent with its unit, a summary line under it, the
 * make-up and fasts lines when the card is tall enough to give them lines
 * of their own, and the practice graph beside it — still a Bitmap
 * (PracticeGridBitmap), drawn by the same code for the same days, and shown
 * as a Glance Image. An absent practice block draws "Open Mihrab", never a
 * zero streak.
 */
internal class StreakGlanceWidget : MihrabGlanceWidget("streak") {

  private class Model(val colors: Colors, val practice: WidgetContract.Practice?)

  @Composable
  override fun Content() {
    val context = localizedContext()
    val size = cardSize()
    val result = guarded("streak") {
      Model(Colors.of(context), GlancePayload.live(context, Now.current())?.practice)
    }
    val colors = result.getOrNull()?.colors ?: Colors.of(context)
    MihrabCard(colors.background, openRoute(context, "mihrab://log")) {
      result.fold(
        onSuccess = { m ->
          val pr = m.practice
          if (pr == null) Placeholder(context.getString(R.string.widget_placeholder_open_app))
          else Streak(context, pr, m.colors.accent, size)
        },
        onFailure = { ErrorContent(context, it) },
      )
    }
  }

  @Composable
  private fun Streak(context: Context, pr: WidgetContract.Practice, accent: Int, size: CardSize) {
    // Each optional line earns its place from the measured height, scaled by
    // the font scale (see PrayerWidgetStreakProvider.requiredHeightDp). An
    // unmeasured card draws title, number and one line: what the layout is
    // sized for.
    val measured = size.heightDp > 0
    val showTitle = !measured || size.heightDp >= requiredHeightDp(context, true, 1)
    val roomForOwed = measured && size.heightDp >= requiredHeightDp(context, showTitle, 2)
    val roomForFasts = measured && size.heightDp >= requiredHeightDp(context, showTitle, 3)

    // The graph takes the trailing half of the card, and all of its
    // height: the strip's rows are drawn as tall as the card lets them be,
    // and as many days as that fits (PracticeGridBitmap.layoutFor).
    val density = context.resources.displayMetrics.density
    val boxW = ((size.widthDp - 28) * 0.55f).toInt().coerceAtLeast(60)
    val boxH = (size.heightDp - 28).coerceAtLeast(40)
    val grid = PracticeGridBitmap.layoutFor(boxW, boxH, density, pr.days.size.coerceAtLeast(7))

    val owed = pr.owed
    val fasts = pr.fastsThisMonth
    // A make-up count is never dropped: without a line of its own it leads
    // the summary, in the danger colour, and the softer facts give way.
    val inlineOwed = owed > 0 && !roomForOwed
    val inlineFasts = fasts > 0 && !roomForFasts
    val summary = summaryParts(
      context,
      pr,
      owed = if (inlineOwed) owed else 0,
      fasts = if (inlineFasts) fasts else 0,
      widthPx = summaryWidthPx(context, size.widthDp, boxW),
    )

    DirRow(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
      cell { DirColumn(
        modifier = GlanceModifier.defaultWeight().fillMaxHeight(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        if (showTitle) Label(context.getString(R.string.widget_streak_title), 10f, Palette.MUTED, medium = true)
        DirRow(modifier = GlanceModifier.padding(top = 2.dp), verticalAlignment = Alignment.Bottom) {
          cell { Label(pr.streak.toString(), 30f, accent, medium = true) }
          cell {
            Label(
              context.resources.getQuantityString(R.plurals.widget_streak_days, pr.streak, pr.streak),
              12f,
              Palette.MUTED,
              modifier = GlanceModifier.padStart(4.dp),
            )
          }
        }
        SummaryLine(summary)
        if (owed > 0 && roomForOwed) {
          Label(
            context.resources.getQuantityString(R.plurals.widget_streak_make_up, owed, owed),
            11f,
            Palette.DANGER,
          )
        }
        if (fasts > 0 && roomForFasts) {
          Label(
            context.resources.getQuantityString(R.plurals.widget_streak_fasts, fasts, fasts),
            11f,
            Palette.MUTED,
          )
        }
      } }
      // Natural size, shrunk only when the card is too short: the image is
      // as wide as the bitmap, so Fit can scale it down and never up.
      cell {
        Image(
          provider = ImageProvider(practiceGrid(pr, grid.rows, grid.columns, grid.cellWPx, grid.cellHPx, grid.gapPx, accent, mirror = LocalDirection.current.rtl)),
          contentDescription = context.getString(R.string.widget_streak_grid_description),
          modifier = GlanceModifier.fillMaxHeight().padStart(8.dp),
          contentScale = ContentScale.Fit,
        )
      }
    }
  }

  /** The summary, its first part in the danger colour when it is the make-up count. */
  private class Summary(val owedPart: String?, val rest: String)

  @Composable
  private fun SummaryLine(s: Summary) {
    if (s.owedPart == null) {
      Label(s.rest, 11f, Palette.MUTED, modifier = GlanceModifier.padding(top = 1.dp))
      return
    }
    // Glance text has no spans, so the red part is its own Text. The rest
    // follows it on the same line.
    DirRow(modifier = GlanceModifier.padding(top = 1.dp)) {
      cell { Label(s.owedPart, 11f, Palette.DANGER) }
      if (s.rest.isNotEmpty()) cell { Label(SEPARATOR + s.rest, 11f, Palette.MUTED, modifier = GlanceModifier.defaultWeight()) }
    }
  }

  /**
   * "3 to make up · Best 31 · 2 of 5 today · Sunnah 68%", dropping the empty
   * halves and, when wider than its column, the softest fact still in it —
   * never below two parts. PrayerWidgetStreakProvider.summaryLine.
   */
  private fun summaryParts(
    context: Context,
    pr: WidgetContract.Practice,
    owed: Int,
    fasts: Int,
    widthPx: Float,
  ): Summary {
    val parts = mutableListOf<String>()
    val owedText = if (owed > 0) {
      context.resources.getQuantityString(R.plurals.widget_streak_make_up, owed, owed).also { parts.add(it) }
    } else {
      null
    }
    if (pr.bestStreak > 0) parts.add(context.getString(R.string.widget_streak_best, pr.bestStreak))
    parts.add(context.getString(R.string.widget_streak_logged, pr.loggedToday))
    val rate = pr.sunnahRate ?: 0.0
    if (rate > 0) parts.add(context.getString(R.string.widget_streak_sunnah, Math.round(rate * 100).toInt()))
    if (fasts > 0) parts.add(context.resources.getQuantityString(R.plurals.widget_streak_fasts, fasts, fasts))

    if (widthPx > 0) {
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 11f, context.resources.displayMetrics)
      }
      while (parts.size > 2 && paint.measureText(parts.joinToString(SEPARATOR)) > widthPx) {
        parts.removeAt(parts.size - 1)
      }
    }
    return if (owedText != null) Summary(owedText, parts.drop(1).joinToString(SEPARATOR))
    else Summary(null, parts.joinToString(SEPARATOR))
  }

  /** The card less its padding, the graph and the gap before it. */
  private fun summaryWidthPx(context: Context, widthDp: Int, gridDp: Int): Float {
    if (widthDp <= 0) return 0f
    val density = context.resources.displayMetrics.density
    return (widthDp - 28 - gridDp - 8) * density
  }

  /** PrayerWidgetStreakProvider.requiredHeightDp — the same arithmetic. */
  private fun requiredHeightDp(context: Context, title: Boolean, bodyLines: Int): Int {
    val scale = context.resources.configuration.fontScale.coerceIn(0.85f, 2f)
    val text = (if (title) TITLE_LINE_DP else 0f) + VALUE_LINE_DP + BODY_LINE_DP * bodyLines
    return Math.ceil((PADDING_DP + BREATHING_DP + text * scale).toDouble()).toInt()
  }

  companion object {
    private const val SEPARATOR = " · "
    private const val PADDING_DP = 20f
    private const val BREATHING_DP = 8f
    private const val TITLE_LINE_DP = 15f
    private const val VALUE_LINE_DP = 36f
    private const val BODY_LINE_DP = 14f
  }
}

/**
 * The practice graph for a typed practice block, drawn by the one renderer
 * every widget uses, from each day in the v1 shape it reads — written by
 * the v1 adapter's own `practiceDayJson`, so the two cannot drift.
 *
 * DRAWN ONCE FOR THE SAME QUESTION. A stretchable card goes to the launcher
 * as a map of sixteen sizes (`STRETCHABLE_SIZES`), each composed in full,
 * and every redraw of the placed cards composes all of them again — after a
 * page turned, a bead counted, the app left — though the graph changes
 * when a prayer is logged or the day turns and at no other time. Each of
 * those compositions drew its own bitmap: on a Pixel 10 Pro with three
 * cards placed, 150 bitmaps (25 MB) stood in the app's memory from the
 * moment its process started, and one redraw put 170 more beside them
 * (another 60 MB) until the collector came round. The same record, on the
 * same day, in the same shape and colour is the same picture: it is kept
 * (`GridCache`) and handed out again, to the next size that lays out the
 * same, to the second card of a kind, to the next redraw. RemoteViews
 * sends a bitmap it is given twice once.
 */
internal fun practiceGrid(
  pr: WidgetContract.Practice,
  rows: Int,
  columns: Int,
  cellWPx: Int,
  cellHPx: Int,
  gapPx: Int,
  accent: Int,
  /** Today on the left, the days running back to the right — the Log's graph in a right-to-left language (#118). */
  mirror: Boolean = false,
): Bitmap {
  val days = org.json.JSONArray()
  for (d in pr.days) days.put(WidgetPayloadV1.practiceDayJson(d))
  val since = pr.since?.ifEmpty { null }
  // Everything the picture is drawn from, the day included: today is its
  // last column.
  val today = java.util.Calendar.getInstance().let { it.get(java.util.Calendar.YEAR) * 1000 + it.get(java.util.Calendar.DAY_OF_YEAR) }
  val key = "$today|$rows|$columns|$cellWPx|$cellHPx|$gapPx|$accent|$mirror|$since|$days"
  return GridCache.get(key) {
    val grid = PracticeGridBitmap.render(days, rows, columns, cellWPx, cellHPx, gapPx, accent, since)
    if (!mirror) {
      grid
    } else {
      val flip = android.graphics.Matrix().apply { preScale(-1f, 1f) }
      Bitmap.createBitmap(grid, 0, 0, grid.width, grid.height, flip, false)
    }
  }
}

/**
 * The graphs drawn lately, by everything they were drawn from.
 *
 * Small on purpose: a card's size map is sixteen sizes over two widths and
 * a record changes a few times a day, so what is worth keeping is one
 * record's worth of shapes. Least lately used goes first, by count and by
 * bytes. A picture that leaves is not recycled — a RemoteViews on its way
 * to the launcher may still hold it — only let go.
 */
internal object GridCache {
  private const val MAX_ENTRIES = 40
  private const val MAX_BYTES = 8L * 1024 * 1024
  private val kept = LinkedHashMap<String, Bitmap>(64, 0.75f, true)
  private var bytes = 0L

  @Synchronized
  fun get(key: String, draw: () -> Bitmap): Bitmap {
    kept[key]?.let { if (!it.isRecycled) return it }
    val drawn = draw()
    kept.put(key, drawn)?.let { bytes -= it.allocationByteCount }
    bytes += drawn.allocationByteCount
    val eldest = kept.entries.iterator()
    while ((kept.size > MAX_ENTRIES || bytes > MAX_BYTES) && kept.size > 1 && eldest.hasNext()) {
      val gone = eldest.next()
      if (gone.value === drawn) continue
      bytes -= gone.value.allocationByteCount
      eldest.remove()
    }
    return drawn
  }

  /** How many pictures are kept, and their bytes: for the log, and for a test. */
  @Synchronized
  fun held(): Pair<Int, Long> = kept.size to bytes

  @Synchronized
  fun clear() {
    kept.clear()
    bytes = 0L
  }
}
