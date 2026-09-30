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

    // Sixteen columns at 4x2, eight at 2x2 — the provider's numbers.
    val columns = if (size.widthDp >= 220) 16 else 8
    val density = context.resources.displayMetrics.density
    val cell = (7 * density).toInt().coerceAtLeast(3)
    val gap = (2 * density).toInt().coerceAtLeast(1)

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
      widthPx = summaryWidthPx(context, size.widthDp, columns, cell, gap),
    )

    Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
      Column(
        modifier = GlanceModifier.defaultWeight().fillMaxHeight(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        if (showTitle) Label(context.getString(R.string.widget_streak_title), 10f, Palette.MUTED, medium = true)
        Row(modifier = GlanceModifier.padding(top = 2.dp), verticalAlignment = Alignment.Bottom) {
          Label(pr.streak.toString(), 30f, accent, medium = true)
          Label(
            context.resources.getQuantityString(R.plurals.widget_streak_days, pr.streak, pr.streak),
            12f,
            Palette.MUTED,
            modifier = GlanceModifier.padding(start = 4.dp),
          )
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
      }
      // Natural size, shrunk only when the card is too short: the image is
      // as wide as the bitmap, so Fit can scale it down and never up.
      Image(
        provider = ImageProvider(practiceGrid(pr, PracticeGridBitmap.MAX_ROWS, columns, cell, cell, gap, accent)),
        contentDescription = context.getString(R.string.widget_streak_grid_description),
        modifier = GlanceModifier.fillMaxHeight().padding(start = 8.dp),
        contentScale = ContentScale.Fit,
      )
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
    Row(modifier = GlanceModifier.padding(top = 1.dp)) {
      Label(s.owedPart, 11f, Palette.DANGER)
      if (s.rest.isNotEmpty()) Label(SEPARATOR + s.rest, 11f, Palette.MUTED, modifier = GlanceModifier.defaultWeight())
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
  private fun summaryWidthPx(context: Context, widthDp: Int, columns: Int, cell: Int, gap: Int): Float {
    if (widthDp <= 0) return 0f
    val density = context.resources.displayMetrics.density
    val gridPx = columns * cell + (columns - 1) * gap
    return widthDp * density - 28 * density - gridPx
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
 */
internal fun practiceGrid(
  pr: WidgetContract.Practice,
  rows: Int,
  columns: Int,
  cellWPx: Int,
  cellHPx: Int,
  gapPx: Int,
  accent: Int,
): Bitmap {
  val days = org.json.JSONArray()
  for (d in pr.days) days.put(WidgetPayloadV1.practiceDayJson(d))
  return PracticeGridBitmap.render(days, rows, columns, cellWPx, cellHPx, gapPx, accent, pr.since?.ifEmpty { null })
}
