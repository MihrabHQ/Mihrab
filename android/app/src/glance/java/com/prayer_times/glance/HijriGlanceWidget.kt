package com.prayer_times.glance

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.TextAlign
import com.prayer_times.R
import com.prayer_times.contract.WidgetContract
import com.prayer_times.contract.WidgetPayloadV1

/**
 * Hijri Date on Glance — the Phase 4 trial (docs/rewrite-plan.md, 4.1).
 *
 * The same card as PrayerWidgetHijriProvider: the day and month in the
 * accent, the year under it, and "Next month / Rabi II in 12 days" in a
 * column opposite. The same size rules — below 52dp tall the card is one
 * line (no year, no column); below 170dp wide the column goes first — and
 * the same tap, into Today.
 *
 * What changed is where the data comes from: the payload's typed `hijri`
 * block, read by the contract's generated reader, rather than `optInt`s on
 * the v1 JSON. The date is still the app's — no conversion here, and no
 * sunset turnover (see the RemoteViews provider for why).
 */
internal class HijriGlanceWidget : MihrabGlanceWidget("hijri") {

  /** Everything the card draws, decided before anything is drawn. */
  private class Model(
    val colors: Colors,
    val hijri: WidgetContract.Hijri?,
  )

  @Composable
  override fun Content() {
    val context = localizedContext()
    val size = cardSize()
    val model = guarded("hijri") {
      val now = Now.current()
      // Today's own date when the payload carries one per day: past
      // midnight the card has moved on from the day it was built on.
      val p = GlancePayload.live(context, now)
      Model(Colors.of(context), p?.let { WidgetPayloadV1.hijri(it, now.dateKey) })
    }
    val colors = model.getOrNull()?.colors ?: Colors.of(context)
    MihrabCard(colors.background, openRoute(context, "mihrab://today")) {
      model.fold(
        onSuccess = { m ->
          val h = m.hijri
          if (h == null) Placeholder(context.getString(R.string.widget_placeholder_open_app))
          else HijriCard(context, h, m.colors.accent, size)
        },
        onFailure = { ErrorContent(context, it) },
      )
    }
  }

  @Composable
  private fun HijriCard(context: Context, h: WidgetContract.Hijri, accent: Int, size: CardSize) {
    // A size of 0 is a launcher that has not measured: the full card.
    val short = size.heightDp in 1 until SHORT_HEIGHT_DP
    val narrow = size.widthDp in 1 until NARROW_WIDTH_DP
    val showNext = h.nextMonthName.isNotEmpty() && !short && !narrow

    // "7 Rabi I" and "1448" on separate lines: the day is the number people
    // came for. The year is a label, not a quantity — no grouping, ever.
    val dayMonth = context.getString(R.string.widget_hijri_day_month, h.day, h.monthName)
    val nextLabel = context.getString(R.string.widget_hijri_next)
    val nextValue = when {
      // "tomorrow" beats "in 1 days", and "today" beats "in 0 days".
      h.nextMonthInDays <= 0 -> context.getString(R.string.widget_hijri_begins_today, h.nextMonthName)
      h.nextMonthInDays == 1 -> context.getString(R.string.widget_hijri_begins_tomorrow, h.nextMonthName)
      else -> context.getString(R.string.widget_hijri_in_days, h.nextMonthName, h.nextMonthInDays)
    }

    // The layout auto-sized the date between 13 and 22sp. Glance cannot, so
    // it is measured against what the row leaves it: the card less its inset
    // and padding (32dp), the 6dp gap, and the next-month column's widest line.
    val dateSp = if (size.widthDp <= 0) {
      DATE_SP
    } else {
      val column = if (showNext) {
        maxOf(textWidthDp(context, nextLabel, 10f, medium = true), textWidthDp(context, nextValue, 12f, medium = false))
      } else {
        0f
      }
      fitTextSp(context, dayMonth, size.widthDp - 32f - 6f - column, DATE_MAX_SP, DATE_MIN_SP, medium = true)
    }

    Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
      Column(modifier = GlanceModifier.defaultWeight().padding(end = 6.dp)) {
        Label(dayMonth, dateSp, accent, medium = true)
        if (!short) Label(h.year.toString(), 13f, Palette.MUTED)
      }
      if (showNext) {
        Column(horizontalAlignment = Alignment.End) {
          Label(nextLabel, 10f, Palette.MUTED, medium = true, align = TextAlign.End)
          Label(nextValue, 12f, Palette.MUTED, maxLines = 2, align = TextAlign.End)
        }
      }
    }
  }

  companion object {
    /** PrayerWidgetHijriProvider.SHORT_HEIGHT_DP. */
    const val SHORT_HEIGHT_DP = 52

    /** PrayerWidgetHijriProvider.NARROW_WIDTH_DP. */
    const val NARROW_WIDTH_DP = 170

    private const val DATE_SP = 20f
    private const val DATE_MAX_SP = 22f
    private const val DATE_MIN_SP = 13f
  }
}

/** The Hijri Date widget's Glance receiver. Registered only by the Glance build flag. */
class HijriGlanceReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = HijriGlanceWidget()
}
