package com.prayer_times.glance

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.Visibility
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.TextAlign
import androidx.glance.visibility
import com.prayer_times.PracticeGridBitmap
import com.prayer_times.PrayerWidgetProvider
import com.prayer_times.R
import com.prayer_times.WidgetRefreshHeadlessService
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract

/**
 * Prayer times on Glance — the card PrayerWidgetProvider draws for its three
 * picker entries (Next prayer, Prayer times, Prayer times tall), ported last
 * as the plan asks.
 *
 * Three designs, chosen as the provider chooses them: the compact line
 * (next prayer, its time, the countdown, the city) for the Next-prayer
 * entry and for any card under 92dp; the strip (six columns, the night
 * marks on a line of their own, the next prayer and the practice summary,
 * and from 211dp the practice graph) for the others; and the list for a
 * card under 200dp wide and 165dp tall or more. Size only ever overrides
 * the entry downward.
 *
 * From the typed payload: which day's times, what is next and when are the
 * v1 adapter's rules (`Schedule`), every time is WallClock text, and the
 * countdown is the system-ticked Chronometer aimed at the next event's
 * instant on its own date.
 */
internal class PrayerGlanceWidget(private val entry: Entry) : MihrabGlanceWidget("prayer") {

  /** Which picker entry this instance was placed from — its intent. */
  enum class Entry { SMALL, STRIP }

  private enum class Design { SMALL, STRIP, LIST }

  private class Night(val left: String, val mid: String?, val right: String?)

  private class Practice(
    val block: WidgetContract.Practice,
    val streakText: String,
    val second: String,
    val sunnah: String?,
    val fasts: String?,
  )

  private class Model(
    val colors: Colors,
    val clock: WidgetContract.Clock,
    val rows: List<WidgetContract.Row>,
    val nextKey: String?,
    val nextName: String,
    val nextTime: String,
    val nextAt: Long?,
    val header: String,
    val location: String,
    val hijri: String,
    val night: Night?,
    val logged: WidgetContract.Today?,
    val practice: Practice?,
    val now: Now,
  )

  @Composable
  override fun Content() {
    val context = localizedContext()
    val size = cardSize()
    val design = designFor(size)
    val result = guarded("prayer") {
      val now = Now.current()
      // An expired payload is not drawn as today: ask, don't guess.
      GlancePayload.live(context, now)?.let { p -> Schedule.of(p, now)?.let { model(context, p, it, now) } }
    }
    val colors = result.getOrNull()?.colors ?: Colors.of(context)
    // The layouts' root padding: 10dp on the compact line, 14 elsewhere, and
    // 6 above and below a strip shorter than its roomy budget.
    val side = if (design == Design.SMALL) 10 else 14
    val ends = if (design == Design.STRIP && size.heightDp in 1 until STRIP_ROOMY_CONTENT_DP) 6 else side
    // Today, for all three: they show today's times (#27, #31).
    MihrabCard(
      colors.background,
      openRoute(context, "mihrab://today", clearTop = true),
      contentPadding = side.dp,
      verticalPadding = ends.dp,
    ) {
      result.fold(
        onSuccess = { m ->
          if (m == null) {
            Placeholder(context.getString(R.string.widget_placeholder_day), sp = placeholderSp(design))
          } else {
            when (design) {
              Design.SMALL -> Small(m, size)
              Design.STRIP -> Strip(context, m, size)
              Design.LIST -> ListCard(context, m, size)
            }
          }
        },
        onFailure = { ErrorContent(context, it) },
      )
    }
  }

  private fun placeholderSp(d: Design) = when (d) {
    Design.SMALL -> 12f
    Design.STRIP -> 13f
    Design.LIST -> 14f
  }

  /**
   * PrayerWidgetProvider.selectLayout: the entry is honoured whenever the
   * card is big enough for it, and only ever overridden downward.
   */
  private fun designFor(size: CardSize): Design {
    if (entry == Entry.SMALL) return Design.SMALL
    val h = size.heightDp
    if (h <= 0) return Design.STRIP
    return when {
      h < STRIP_MIN_HEIGHT_DP -> Design.SMALL
      size.widthDp in 1 until STRIP_MIN_WIDTH_DP && h >= ROWS_MIN_HEIGHT_DP -> Design.LIST
      else -> Design.STRIP
    }
  }

  private fun model(context: Context, p: WidgetContract.Payload, s: Schedule, now: Now): Model {
    val day = s.table
    // Fajr, Sunrise, Dhuhr … Isha, then the night marks the user turned on.
    val rows = day.prayers.take(1) + listOfNotNull(day.sunrise) + day.prayers.drop(1) + day.extras
    val next = s.next
    val describesToday = GlancePayload.describesToday(p, now)
    val dayLabel = day.label.trim().ifEmpty { s.shown.label.trim() }
    val location = p.locationName
    return Model(
      colors = Colors.of(context),
      clock = p.clock,
      rows = rows,
      nextKey = next?.row?.key,
      nextName = next?.label().orEmpty(),
      nextTime = next?.let { WallClock.text(it.minutes, p.clock) }.orEmpty(),
      nextAt = next?.epochMs(),
      // The day's own label beside the city — the one that rolls with the times.
      header = when {
        dayLabel.isEmpty() -> location
        location.isEmpty() -> dayLabel
        else -> "$dayLabel · $location"
      },
      location = location,
      // Both describe the day the payload was written; once the card has
      // moved on they are someone else's facts, so they go.
      hijri = if (describesToday) p.hijri?.label?.trim().orEmpty() else "",
      night = extra("nightRow") { nightLine(rows, p.clock) },
      logged = if (describesToday) p.today else null,
      practice = p.practice?.let { pr -> extra("practice") { practice(context, pr) } },
      now = now,
    )
  }

  /**
   * An extra, contained: the times are the promise, the rest are additions,
   * and a throw in one of them costs that one — never the times (#31).
   */
  private inline fun <T> extra(what: String, build: () -> T): T? =
    try {
      build()
    } catch (e: Exception) {
      Log.w(PrayerWidgetProvider.WIDGET_LOG_TAG, "glance widget extra failed: $what", e)
      null
    }

  /** Islamic Midnight and the Last Third (and the First Third) on one line. */
  private fun nightLine(rows: List<WidgetContract.Row>, clock: WidgetContract.Clock): Night? {
    val night = rows.filter { isNightKey(it.key) }
    if (night.isEmpty()) return null
    fun label(r: WidgetContract.Row) = "${r.name.trim().ifEmpty { r.key }} ${WallClock.text(r.minutes, clock)}"
    val last = if (night.size > 2) night[2] else night.getOrNull(1)
    return Night(label(night[0]), if (night.size > 2) label(night[1]) else null, last?.let { label(it) })
  }

  private fun practice(context: Context, pr: WidgetContract.Practice): Practice {
    val parts = mutableListOf<String>()
    if (pr.bestStreak > 0) parts.add(context.getString(R.string.widget_streak_best, pr.bestStreak))
    parts.add(context.getString(R.string.widget_streak_logged, pr.loggedToday))
    if (pr.owed > 0) parts.add(context.resources.getQuantityString(R.plurals.widget_streak_make_up, pr.owed, pr.owed))
    // Dropped rather than zeroed when there is nothing to say: "Sunnah 0%"
    // reads as a judgement.
    val sunnah = pr.sunnahRate?.let {
      context.getString(R.string.widget_practice_sunnah_month, Math.round(it * 100).toInt())
    }
    val fasts = pr.fastsThisMonth.takeIf { it > 0 }?.let {
      context.resources.getQuantityString(R.plurals.widget_practice_fasts, it, it)
    }
    return Practice(
      block = pr,
      streakText = context.resources.getQuantityString(R.plurals.widget_streak_day_label, pr.streak, pr.streak),
      second = parts.joinToString(" · "),
      sunnah = sunnah,
      fasts = fasts,
    )
  }

  private fun rowColor(m: Model, r: WidgetContract.Row): Int = when {
    m.nextKey != null && m.nextKey == r.key -> m.colors.accent
    // Sunrise and the night marks on the card without competing with the ṣalāh.
    r.key.equals("Sunrise", ignoreCase = true) || isNightKey(r.key) -> Palette.MUTED
    else -> Palette.TEXT
  }

  private fun rowLabel(r: WidgetContract.Row) = r.name.trim().ifEmpty { r.abbr.trim() }.ifEmpty { r.key }

  // ── The compact line ──────────────────────────────────────────────────

  @Composable
  private fun Small(m: Model, size: CardSize) {
    val context = localizedContext()
    // The layout auto-sized the time between 22 and 44sp; measured here
    // against half the card, and against its height.
    val column = (size.widthDp - 32) / 2f - 6f
    val byHeight = if (size.heightDp > 0) (size.heightDp - 12 - 20 - 16) / 1.2f else SMALL_TIME_SP
    val timeSp = if (size.widthDp <= 0) SMALL_TIME_SP
    else minOf(fitTextSp(context, m.nextTime, column, 44f, 22f, medium = false), byHeight.coerceAtLeast(22f))
    Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
      Column(modifier = GlanceModifier.defaultWeight().padding(end = 6.dp)) {
        if (m.nextName.isNotEmpty()) Label(m.nextName, 12f, Palette.TEXT, medium = true)
        if (m.nextTime.isNotEmpty()) Label(m.nextTime, timeSp, m.colors.accent)
      }
      Column(modifier = GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.End) {
        m.nextAt?.let { Countdown(it, m.now, 13f, Palette.MUTED) }
        if (m.location.isNotEmpty()) {
          Label(m.location, 11f, Palette.MUTED, maxLines = 2, align = TextAlign.End, modifier = GlanceModifier.padding(top = 2.dp))
        }
      }
    }
  }

  // ── The strip ─────────────────────────────────────────────────────────

  @Composable
  private fun Strip(context: Context, m: Model, size: CardSize) {
    val h = size.heightDp
    // An unmeasured card (0) keeps the header and the roomy padding.
    val oneRow = h in 1 until STRIP_TIGHT_CONTENT_DP
    val tight = h in 1 until STRIP_ROOMY_CONTENT_DP
    val budget = if (oneRow) STRIP_BARE_CONTENT_DP else if (tight) STRIP_TIGHT_CONTENT_DP else STRIP_ROOMY_CONTENT_DP
    val slack = if (h <= 0 || h >= GRID_MIN_HEIGHT_DP) 0 else ((h - budget) / 2).coerceIn(0, STRIP_SLACK_CAP_DP)
    // An unmeasured card draws no graph: on a short card the graph would
    // take the prayer times' room.
    val showPractice = m.practice != null && h >= GRID_MIN_HEIGHT_DP
    val showFoot = showPractice && h >= PRACTICE_MIN_HEIGHT_DP
    val columns = m.rows.take(STRIP_COLUMNS)
    val timeSp = fitTimesSp(
      context,
      columns.map { it.minutes },
      m.clock,
      (size.widthDp - STRIP_CONTENT_INSET_DP).toFloat() / columns.size.coerceAtLeast(1) - TIME_GUTTER_DP,
      TIME_MAX_SP,
      TIME_MIN_SP,
    )

    Column(modifier = GlanceModifier.fillMaxSize()) {
      if (!oneRow) Header(m.header, m.hijri)
      Row(
        modifier = GlanceModifier.fillMaxWidth().padding(top = (8 + slack).dp, bottom = slack.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        for (r in columns) {
          Column(
            modifier = GlanceModifier.defaultWeight().padding(horizontal = 1.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
          ) {
            val highlight = m.nextKey != null && m.nextKey == r.key
            val color = rowColor(m, r)
            val box = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp)
            Column(
              modifier = if (highlight) box.background(ImageProvider(R.drawable.widget_row_highlight)) else box,
              horizontalAlignment = Alignment.CenterHorizontally,
            ) {
              Label(rowLabel(r), 9f, color, medium = true, align = TextAlign.Center)
              ClockText(r.minutes, m.clock, timeSp, color)
            }
          }
        }
      }
      m.night?.let { n ->
        Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 4.dp)) {
          Label(n.left, 11f, Palette.MUTED, modifier = GlanceModifier.defaultWeight())
          n.mid?.let { Label(it, 11f, Palette.MUTED, modifier = GlanceModifier.padding(horizontal = 6.dp)) }
          n.right?.let { Label(it, 11f, Palette.MUTED, modifier = GlanceModifier.padding(start = 6.dp)) }
        }
      }
      if (!tight) Rule(Palette.RULE, top = 6, bottom = 8)
      Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (m.nextName.isNotEmpty()) Label(m.nextName, 11f, Palette.TEXT)
        m.nextAt?.let { Countdown(it, m.now, 11f, Palette.MUTED, GlanceModifier.padding(start = 4.dp)) }
        Spacer(GlanceModifier.defaultWeight())
        if (showPractice) {
          val pr = m.practice!!
          Label(pr.block.streak.toString(), 11f, Palette.TEXT, medium = true, modifier = GlanceModifier.padding(start = 10.dp))
          Label("${pr.streakText} · ${pr.second}", 11f, Palette.MUTED, modifier = GlanceModifier.padding(start = 5.dp))
        } else {
          // "2 of 5 logged" — said by the summary instead once it is drawn.
          m.logged?.let {
            Label(
              context.getString(R.string.widget_logged_short, it.logged, it.loggable),
              11f,
              Palette.MUTED,
              modifier = GlanceModifier.padding(start = 6.dp),
            )
          }
        }
      }
      if (showPractice) {
        val pr = m.practice!!
        Rule(Palette.RULE_STRONG, top = 8, bottom = 8)
        val box = size.heightDp - STRIP_CHROME_DP - (if (showFoot) STRIP_FOOT_DP else 0)
        PracticeImage(context, pr.block, size.widthDp - STRIP_CONTENT_INSET_DP, box, MAX_GRID_DAYS, m.colors.accent,
          GlanceModifier.fillMaxWidth().defaultWeight())
        if (showFoot) Foot(pr, top = 7)
      }
    }
  }

  @Composable
  private fun Header(text: String, hijri: String) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Label(text, 10f, Palette.MUTED, medium = true, modifier = GlanceModifier.defaultWeight())
      if (hijri.isNotEmpty()) Label(hijri, 10f, Palette.MUTED, medium = true, modifier = GlanceModifier.padding(start = 6.dp))
      // The refresh glyph: redraw now, then go and look (a sync round).
      Label(
        "↻",
        14f,
        Palette.REFRESH,
        modifier = GlanceModifier
          .padding(start = 8.dp)
          .clickable(actionRunCallback<PrayerRefresh>())
          .semantics { contentDescription = "Refresh" },
      )
    }
  }

  @Composable
  private fun Foot(pr: Practice, top: Int) {
    Row(modifier = GlanceModifier.fillMaxWidth().padding(top = top.dp)) {
      // INVISIBLE, not gone, when absent: the fasts keep their end.
      Label(
        pr.sunnah.orEmpty(),
        11f,
        Palette.MUTED,
        modifier = GlanceModifier.defaultWeight().visibility(if (pr.sunnah == null) Visibility.Invisible else Visibility.Visible),
      )
      pr.fasts?.let { Label(it, 11f, Palette.MUTED, modifier = GlanceModifier.padding(start = 6.dp)) }
    }
  }

  @Composable
  private fun PracticeImage(
    context: Context,
    pr: WidgetContract.Practice,
    boxWidthDp: Int,
    boxHeightDp: Int,
    maxDays: Int,
    accent: Int,
    modifier: GlanceModifier,
  ) {
    val grid = extra("practiceGrid") {
      val layout = PracticeGridBitmap.layoutFor(boxWidthDp, boxHeightDp, context.resources.displayMetrics.density, maxDays)
      practiceGrid(pr, layout.rows, layout.columns, layout.cellWPx, layout.cellHPx, layout.gapPx, accent)
    } ?: return
    Image(
      provider = ImageProvider(grid),
      contentDescription = context.getString(R.string.widget_streak_grid_description),
      modifier = modifier,
      contentScale = ContentScale.Fit,
    )
  }

  // ── The list (narrow and tall) ────────────────────────────────────────

  @Composable
  private fun ListCard(context: Context, m: Model, size: CardSize) {
    val h = size.heightDp
    val showPractice = m.practice != null && h >= GRID_MIN_HEIGHT_DP
    val showFoot = showPractice && h >= PRACTICE_MIN_HEIGHT_DP
    val shown = m.rows.take(LIST_SLOTS)
    // The provider sizes every layout's times by the same measure.
    val timeSp = fitTimesSp(
      context,
      shown.map { it.minutes },
      m.clock,
      (size.widthDp - STRIP_CONTENT_INSET_DP).toFloat() / shown.size.coerceAtLeast(1) - TIME_GUTTER_DP,
      TIME_MAX_SP,
      TIME_MIN_SP,
    )
    Column(modifier = GlanceModifier.fillMaxSize()) {
      Header(m.location, m.hijri)
      Label(context.getString(R.string.widget_next_label), 9f, Palette.MUTED, medium = true, modifier = GlanceModifier.padding(top = 6.dp))
      Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        if (m.nextName.isNotEmpty()) Label(m.nextName, 24f, Palette.TEXT, medium = true)
        if (m.nextTime.isNotEmpty()) Label(m.nextTime, 19f, m.colors.accent, modifier = GlanceModifier.padding(start = 8.dp))
        Spacer(GlanceModifier.defaultWeight())
        Column(horizontalAlignment = Alignment.End) {
          Label(context.getString(R.string.widget_in_label), 10f, Palette.MUTED, align = TextAlign.End)
          m.nextAt?.let { Countdown(it, m.now, 15f, Palette.MUTED) }
        }
      }
      Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight().padding(top = 6.dp)) {
        for ((i, r) in shown.withIndex()) {
          val night = i >= STRIP_COLUMNS
          val color = rowColor(m, r)
          val highlight = m.nextKey != null && m.nextKey == r.key
          val box = GlanceModifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 3.dp)
          Row(
            modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Row(
              modifier = if (highlight) box.background(ImageProvider(R.drawable.widget_row_highlight)) else box,
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Label(rowLabel(r), if (night) 12f else 13f, color, modifier = GlanceModifier.defaultWeight())
              ClockText(r.minutes, m.clock, timeSp, color, medium = !night)
            }
          }
        }
      }
      if (showPractice) {
        val pr = m.practice!!
        Rule(Palette.RULE_STRONG, top = 6, bottom = 0)
        Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
          Column(modifier = GlanceModifier.defaultWeight()) {
            Row(verticalAlignment = Alignment.Bottom) {
              Label(pr.block.streak.toString(), 25f, m.colors.accent, medium = true)
              Label(pr.streakText, 12f, Palette.MUTED, modifier = GlanceModifier.padding(start = 7.dp))
            }
            Label(pr.second, 11f, Palette.MUTED, modifier = GlanceModifier.padding(top = 2.dp))
          }
          // Beside the number, in half the width, a share of what is left —
          // the tall card's graph sets its row's height, so it is kept short.
          PracticeImage(
            context,
            pr.block,
            (size.widthDp - STRIP_CONTENT_INSET_DP) / 2,
            ((h - STRIP_CHROME_DP) * 2) / 3,
            MAX_GRID_DAYS / 2,
            m.colors.accent,
            GlanceModifier.padding(start = 10.dp),
          )
        }
        if (showFoot) Foot(pr, top = 6)
      }
      m.logged?.let {
        Label(
          context.getString(R.string.widget_logged_line, it.logged, it.loggable),
          11f,
          Palette.MUTED,
          modifier = GlanceModifier.padding(top = 4.dp),
        )
      }
    }
  }

  companion object {
    /** PrayerWidgetProvider's thresholds and budgets, unchanged — see the notes there. */
    private const val ROWS_MIN_HEIGHT_DP = 165
    private const val STRIP_MIN_HEIGHT_DP = 92
    private const val STRIP_MIN_WIDTH_DP = 200
    private const val STRIP_ROOMY_CONTENT_DP = 150
    private const val STRIP_TIGHT_CONTENT_DP = 124
    private const val STRIP_BARE_CONTENT_DP = 96
    private const val STRIP_SLACK_CAP_DP = 64
    private const val STRIP_CHROME_DP = 184
    private const val STRIP_FOOT_DP = 19
    private const val STRIP_CONTENT_INSET_DP = 20
    private const val GRID_MIN_HEIGHT_DP = 211
    private const val PRACTICE_MIN_HEIGHT_DP = 375
    private const val MAX_GRID_DAYS = 210
    private const val STRIP_COLUMNS = 6

    /** Sunrise, the five and the three night marks. */
    private const val LIST_SLOTS = 9
    private const val TIME_MAX_SP = 17f
    private const val TIME_MIN_SP = 10f
    private const val TIME_GUTTER_DP = 4f
    private const val SMALL_TIME_SP = 36f
  }
}

/**
 * The refresh glyph — PrayerWidgetProvider.onRefreshPressed: redraw from
 * what is on disk now, then start the sync round the press is really for.
 * A HeadlessJS service can be refused; a refresh that only redraws is the
 * old behaviour, not a crash.
 */
class PrayerRefresh : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    PrayerWidgetProvider.requestUpdate(context)
    try {
      context.startService(Intent(context, WidgetRefreshHeadlessService::class.java))
    } catch (t: Throwable) {
      Log.w(TAG, "widget refresh: could not start the sync task", t)
    }
  }
}

/** "Prayer times": the strip, and whatever the size makes of it. */
open class PrayerGlanceReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = PrayerGlanceWidget(PrayerGlanceWidget.Entry.STRIP)
}

/** "Prayer times (tall)": the same card, placed two rows tall. */
class PrayerTallGlanceReceiver : PrayerGlanceReceiver()

/** "Next prayer": the compact line at every size. */
class PrayerSmallGlanceReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = PrayerGlanceWidget(PrayerGlanceWidget.Entry.SMALL)
}
