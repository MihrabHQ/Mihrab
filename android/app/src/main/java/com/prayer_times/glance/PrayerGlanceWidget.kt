package com.prayer_times.glance

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.SizeMode
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.Visibility
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.TextAlign
import androidx.glance.visibility
import com.prayer_times.PracticeGridBitmap
import com.prayer_times.cardfit.GraphRoom
import com.prayer_times.cardfit.StripVariant
import com.prayer_times.cardfit.stripVariant
import com.prayer_times.cardfit.graphBoxDp
import com.prayer_times.cardfit.graphRoom
import com.prayer_times.PrayerWidgetDisplay
import com.prayer_times.PrayerWidgetProvider
import com.prayer_times.R
import com.prayer_times.WidgetRefreshHeadlessService
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract
import com.prayer_times.contract.WidgetPayloadV1

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

  /** The strip and the tall card follow the height they are stretched to (STRETCHABLE_SIZES). */
  override val sizeMode: SizeMode = if (entry == Entry.SMALL) SizeMode.Exact else SizeMode.Responsive(STRETCHABLE_SIZES)

  /**
   * Which picker entry this instance was placed from — its intent. The
   * widgets keep the height they are placed at: the strip is the 4×1 that
   * shows the times, the tall one the 4×2 that shows the times and the
   * practice graph. Which draws the graph is the entry's to say, not the
   * height's: a card sized so the graph does not fit cannot be made. They
   * stretch sideways only (#115) — from their own width up, so a five-column
   * home screen can fill its row; every layout here fits its text to the
   * width it is given.
   */
  enum class Entry { SMALL, STRIP, TALL }

  private enum class Design { SMALL, STRIP, LIST }

  private class Night(val left: String, val mid: String?, val right: String?)

  private class Practice(
    val block: WidgetContract.Practice,
    val streakText: String,
    val second: String,
    val sunnah: String?,
    val fasts: String?,
  )

  /**
   * Counting up from a prayer that has just come in (#111): its instant,
   * the Chronometer's line with the prayer named in it, and the longest that
   * line can read, for sizing.
   */
  private class Since(val atMs: Long, val format: String, val sample: String)

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
    val display: PrayerWidgetDisplay,
    val since: Since?,
  )

  @Composable
  override fun Content() {
    val context = localizedContext()
    val size = cardSize()
    val design = designFor(size)
    val result = guarded("prayer") {
      val now = Now.current()
      // An expired payload is not drawn as today: ask, don't guess.
      val display = try {
        PrayerWidgetDisplay.read(context)
      } catch (e: Exception) {
        PrayerWidgetDisplay.DEFAULT
      }
      GlancePayload.live(context, now)?.let { p -> Schedule.of(p, now)?.let { model(context, p, it, now, display) } }
    }
    val colors = result.getOrNull()?.colors ?: Colors.of(context)
    // The root padding: at the sides, `sideDp` (the strip's is narrow, so its
    // six times get the card's width rather than sitting cramped between wide
    // margins); above and below, 10 on the compact line, 14 elsewhere, and 6
    // on a strip shorter than its roomy budget.
    val side = sideDp(design)
    // What the strip draws at this size, decided once: the padding here and
    // the layout in `Strip` read the same plan.
    val plan = result.getOrNull()?.takeIf { design == Design.STRIP }?.let { stripPlan(context, it, size) }
    val ends = when {
      design == Design.STRIP -> plan?.ends ?: stripEnds(size.heightDp in 1 until STRIP_ROOMY_CONTENT_DP, compact = false)
      design == Design.SMALL -> 10
      else -> 14
    }
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
              Design.STRIP -> Strip(context, m, size, plan ?: stripPlan(context, m, size))
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
      h < STRIP_TIMES_MIN_HEIGHT_DP -> Design.SMALL
      size.widthDp in 1 until STRIP_MIN_WIDTH_DP && h >= ROWS_MIN_HEIGHT_DP -> Design.LIST
      else -> Design.STRIP
    }
  }

  /**
   * What the strip draws at a size: the time's type, whether the practice
   * graph is on it and in which layout, and what everything but the graph
   * costs in height (`chromeDp`) — so the graph is drawn for the room it
   * will be given.
   */
  private class StripPlan(
    val timeSp: Float,
    /** The practice graph is drawn. */
    val graph: Boolean,
    /** …in the compact layout: the next prayer in the header, tighter ends and rule. */
    val compact: Boolean,
    val showFoot: Boolean,
    /** The card's top and bottom padding. */
    val ends: Int,
    /** The card's height less the graph's room (and less the foot line, `footDp`). */
    val chromeDp: Int,
    val footDp: Int,
    /** Which layout the height gets (`cardfit.stripVariant`). */
    val variant: StripVariant,
  )

  /** The strip's top and bottom padding: 6 once it is shorter than its roomy budget, or compact. */
  private fun stripEnds(tight: Boolean, compact: Boolean) = if (compact || tight) 6 else 14

  /** The row under the times: the next prayer and its countdown, or the streak's words. */
  private fun nextLineDp(context: Context, m: Model): Float =
    rowDp(context, 11f, false, m.nextName, m.practice?.let { "${it.streakText} · ${it.second}" }, "0:00:00")

  private fun headerDp(context: Context, m: Model, onTop: Boolean): Float = maxOf(
    rowDp(context, 10f, true, m.header, m.hijri),
    rowDp(context, 14f, false, "↻"),
    if (onTop) rowDp(context, 11f, false, m.nextName, "0:00:00") else 0f,
  )

  /**
   * Which layout the strip gets at this height: the fixed budgets as
   * floors, and never a layout the card's own rows do not fit
   * (`cardfit.stripVariant`).
   */
  private fun variantOf(context: Context, m: Model, size: CardSize, timeSp: Float): StripVariant {
    val d = m.display
    val h = size.heightDp
    val onTop = topNext(d, h, compact = false)
    val body = cardInsetsDp(context) + headerDp(context, m, onTop) +
      (if (d.showTable) tableDp(context, m, timeSp, slack = 0) else noTableDp(context, m, size, timeSp, slack = 0).first)
    val next = if (onTop) 0f else nextLineDp(context, m)
    return stripVariant(
      heightDp = h,
      roomyNeedDp = Math.ceil((body + 28 + (if (onTop) 0f else ruleDp(6, 8)) + next).toDouble()).toInt(),
      tightNeedDp = Math.ceil((body + 12 + next).toDouble()).toInt(),
      roomyFloorDp = STRIP_ROOMY_CONTENT_DP,
      tightFloorDp = STRIP_TIGHT_CONTENT_DP,
      bareBudgetDp = STRIP_BARE_CONTENT_DP,
    )
  }

  /** The next prayer rides in the header: the 4×1 card always, the tall card when compact. */
  private fun topNext(d: PrayerWidgetDisplay, h: Int, compact: Boolean) =
    d.showTable && h !in 1 until STRIP_MIN_HEIGHT_DP && (compact || entry == Entry.STRIP)

  /** The times' segment: the row of six and the night marks under it (`slack` above and below the row). */
  private fun tableDp(context: Context, m: Model, timeSp: Float, slack: Int, top: Int = 8): Float =
    (top + slack) + 4 + rowDp(context, 9f, true, *m.rows.take(STRIP_COLUMNS).map { rowLabel(it) }.toTypedArray()) +
      rowDp(context, timeSp, true, "00:00") + 4 + slack +
      (m.night?.let { 4 + rowDp(context, 11f, false, it.left, it.mid, it.right) } ?: 0f)

  /**
   * Everything on the strip but the graph, summed as `Strip` lays it out:
   * the card's inset and ends, the header, the times (or the next prayer
   * in their place), the next-prayer line and its rule, the graph's rule.
   */
  private fun stripChromeDp(context: Context, m: Model, size: CardSize, timeSp: Float, compact: Boolean, tight: Boolean): Float {
    val d = m.display
    val h = size.heightDp
    val onTop = topNext(d, h, compact)
    val header = headerDp(context, m, onTop)
    val table = if (d.showTable) tableDp(context, m, timeSp, slack = 0) else noTableDp(context, m, size, timeSp, slack = 0).first
    val next = if (onTop) 0f else (if (tight) 0f else ruleDp(6, 8)) + nextLineDp(context, m)
    val rule = if (compact) ruleDp(4, 4) else ruleDp(8, 8)
    return cardInsetsDp(context) + 2 * stripEnds(tight, compact) + header + table + next + rule
  }

  /** With the table hidden: the segment the next prayer stands in — as tall as the table's — and its name's size. */
  private fun noTableDp(context: Context, m: Model, size: CardSize, timeSp: Float, slack: Int): Pair<Float, Float> {
    val table = tableDp(context, m, timeSp, slack)
    // …and as large as that segment lets it be.
    val nameSp = nextNameSp(context, m, size, table)
    val next = rowDp(context, 9f, true) + rowDp(context, nameSp, true, m.nextName)
    return maxOf(table, next) to nameSp
  }

  private fun stripPlan(context: Context, m: Model, size: CardSize): StripPlan {
    val d = m.display
    val h = size.heightDp
    val columns = m.rows.take(STRIP_COLUMNS)
    val columnDp = (size.widthDp - insetDp(context, size)).toFloat() / columns.size.coerceAtLeast(1) - TIME_GUTTER_DP
    val baseSp = fitTimesSp(context, columns.map { it.minutes }, m.clock, columnDp, TIME_MAX_SP, TIME_MIN_SP)
    val timeSp = scaledClockSp(context, columns.map { it.minutes }, m.clock, baseSp, d.timeScale, if (size.widthDp > 0) columnDp else 0f)
    val variant = variantOf(context, m, size, timeSp)
    fun plan(graph: Boolean, compact: Boolean, chrome: Int): StripPlan {
      val foot = graph && !compact && h >= PRACTICE_MIN_HEIGHT_DP
      return StripPlan(timeSp, graph, compact, foot, stripEnds(variant.tight, compact), chrome,
        Math.ceil((7 + rowDp(context, 11f, false, m.practice?.sunnah, m.practice?.fasts)).toDouble()).toInt(), variant)
    }
    if (m.practice == null || h <= 0) return plan(graph = false, compact = false, chrome = 0)
    // The graph wherever there is room for it — the tall card as placed,
    // and either card stretched (STRETCHABLE_SIZES) — and not where there
    // is not: a tall card squeezed short drew it as a line of dots.
    //
    // THE TALL CARD KEEPS ITS TOP AND MAKES ROOM FOR ITS GRAPH. Where the
    // card is short of the full layout (two short rows, or Nova's row and a
    // half), the next-prayer line moves up into the header, centred between
    // the dates — with the prayer's name where the card is wide enough —
    // and the graph takes the line's place and its rule, on tighter ends
    // and a tighter rule (`compact`): down to its smallest, and below that
    // it goes. The decision itself is `cardfit.graphRoom`.
    fun chrome(compact: Boolean) = Math.ceil(stripChromeDp(context, m, size, timeSp, compact, variant.tight).toDouble()).toInt()
    val room = graphRoom(h, chrome(false), if (d.showTable && entry == Entry.TALL) chrome(true) else null, GRID_MIN_BOX_DP)
    return plan(room.graph, room.compact, room.chromeDp)
  }

  private fun sideDp(d: Design) = when (d) {
    Design.SMALL -> 10
    Design.STRIP -> STRIP_SIDE_DP
    Design.LIST -> 14
  }

  /**
   * What the card takes from the launcher's width before the content gets
   * any: its inset from the host (widget_card_inset) and the content's side
   * padding, both sides. Every width the layouts fit text to is the
   * launcher's minus this. A constant that undercounted it by 20dp fitted
   * the times and the countdown to room the card did not have: on a larger
   * display size the countdown was cut off and the times crowded together.
   */
  private fun insetDp(context: Context, size: CardSize): Int {
    val res = context.resources
    val card = res.getDimension(R.dimen.widget_card_inset) / res.displayMetrics.density
    return Math.round(2 * (card + sideDp(designFor(size))))
  }

  private fun model(
    context: Context,
    p: WidgetContract.Payload,
    s: Schedule,
    now: Now,
    display: PrayerWidgetDisplay,
  ): Model {
    val day = s.table
    // Fajr, Sunrise, Dhuhr … Isha, then the night marks the user turned on.
    val rows = day.prayers.take(1) + listOfNotNull(day.sunrise) + day.prayers.drop(1) + day.extras
    val next = s.next
    val describesToday = GlancePayload.describesToday(p, now)
    val dayLabel = day.label.trim().ifEmpty { s.shown.label.trim() }
    // Hidden by choice: everything that prints the city reads this.
    val location = if (display.showLocation) p.locationName else ""
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
      // Today's own Hijri date from the payload's list; from an older app's
      // single date, like the log below, only while it is about today —
      // once the card has moved on it is someone else's fact.
      hijri = (
        if (p.hijriDays.isEmpty()) p.hijri?.takeIf { describesToday }
        else WidgetPayloadV1.hijri(p, now.dateKey)
      )?.label?.trim().orEmpty(),
      night = extra("nightRow") { nightLine(rows, p.clock) },
      logged = if (describesToday) p.today else null,
      practice = p.practice?.let { pr -> extra("practice") { practice(context, pr) } },
      now = now,
      display = display,
      since = extra("since") { sinceOf(context, p, s, now) },
    )
  }

  /**
   * Whether the card counts up from the prayer that came in last (#111):
   * for `sinceAdhanMinutes` after it, or until halfway to what is next if
   * that is sooner (`WidgetPayloadV1.sinceAdhanEnd`, the app's own rule).
   * The alarm at the end of the window (PrayerWidgetProvider) redraws it.
   */
  private fun sinceOf(context: Context, p: WidgetContract.Payload, s: Schedule, now: Now): Since? {
    val came = s.came ?: return null
    val next = s.next ?: return null
    val end = WidgetPayloadV1.sinceAdhanEnd(came.at, next.at, p.sinceAdhanMinutes) ?: return null
    if (s.nowMinutes >= end) return null
    val at = came.epochMs() ?: return null
    if (at > now.epochMs) return null
    val format = context.getString(R.string.widget_since_adhan_format, "%1\$s", came.label())
    val sample = context.getString(R.string.widget_since_adhan_format, "59:59", came.label())
    return Since(at, format, sample)
  }

  /** What the counter can read at its longest: the countdown's, or the count-up's. */
  private fun counterSample(context: Context, m: Model): String =
    m.since?.sample ?: context.getString(R.string.widget_countdown_format, "23:59:59")

  /**
   * The counter: up from the prayer that has just come in, while it is in
   * its window, else down to the next time. Nothing when there is neither.
   */
  @Composable
  private fun Counter(m: Model, sp: Float, color: Int, modifier: GlanceModifier = GlanceModifier) {
    val since = m.since
    if (since != null) CountUp(since.atMs, since.format, m.now, sp, color, modifier)
    else m.nextAt?.let { Countdown(it, m.now, sp, color, modifier) }
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
    r.key.equals("Sunrise", ignoreCase = true) || isNightKey(r.key) -> m.display.muted
    else -> m.display.text
  }

  private fun rowLabel(r: WidgetContract.Row) = r.name.trim().ifEmpty { r.abbr.trim() }.ifEmpty { r.key }

  // ── The compact line ──────────────────────────────────────────────────

  @Composable
  private fun Small(m: Model, size: CardSize) {
    val context = localizedContext()
    val d = m.display
    // The layout auto-sized the time between 22 and 44sp; measured here
    // against half the card, and against its height.
    val column = (size.widthDp - 32) / 2f - 6f
    val byHeight = if (size.heightDp > 0) (size.heightDp - 12 - 20 - 16) / 1.2f else SMALL_TIME_SP
    val baseSp = if (size.widthDp <= 0) SMALL_TIME_SP
    else minOf(fitTextSp(context, m.nextTime, column, 44f, 22f, medium = false), byHeight.coerceAtLeast(22f))
    // The user's size, held to what the half-card can take.
    val timeSp = scaledTimeSp(context, listOf(m.nextTime), baseSp, d.timeScale, if (size.widthDp <= 0) 0f else column, medium = false)
    DirRow(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
      cell {
        DirColumn(modifier = GlanceModifier.defaultWeight().padEnd(6.dp)) {
          if (m.nextName.isNotEmpty()) Label(m.nextName, 12f, d.text, medium = true)
          if (m.nextTime.isNotEmpty()) Label(m.nextTime, timeSp, m.colors.accent)
        }
      }
      cell {
        DirColumn(modifier = GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.End) {
          if (d.showCountdown) Counter(m, 13f, d.muted)
          if (m.location.isNotEmpty()) {
            Label(m.location, 11f, d.muted, maxLines = 2, align = TextAlign.End, modifier = GlanceModifier.padding(top = 2.dp))
          }
        }
      }
    }
  }

  /**
   * `baseSp` times the user's scale, then brought back down to whatever fits
   * `availableDp` (0: unmeasured, no limit) — a larger size only where the
   * card has the room for it. At 100% this is `baseSp` exactly.
   */
  private fun scaledTimeSp(
    context: Context,
    texts: List<String>,
    baseSp: Float,
    scale: Float,
    availableDp: Float,
    medium: Boolean,
  ): Float {
    if (scale == 1f) return baseSp
    val wanted = baseSp * scale
    if (availableDp <= 0f) return wanted
    val floor = minOf(wanted, TIME_MIN_SP)
    return texts.filter { it.isNotEmpty() }.minOfOrNull { fitTextSp(context, it, availableDp, wanted, floor, medium) } ?: wanted
  }

  /** Same, for clock times measured as `ClockText` draws them. */
  private fun scaledClockSp(
    context: Context,
    times: List<Int?>,
    clock: WidgetContract.Clock,
    baseSp: Float,
    scale: Float,
    availableDp: Float,
  ): Float {
    if (scale == 1f) return baseSp
    val wanted = baseSp * scale
    if (availableDp <= 0f) return wanted
    return fitTimesSp(context, times, clock, availableDp, wanted, minOf(wanted, TIME_MIN_SP))
  }

  /**
   * The next prayer on its own: name, time, and the countdown — what the
   * strip and the list say when the table is hidden, and the list's
   * headline always.
   *
   * The countdown sits at the end of the name's row, never bigger than
   * the name and never on a line of its own: sized to the room the row
   * has left after the name and the time (measured on the longest it can
   * read, "in 23:59:59"), from the name's size down to the row's small
   * print. A line of its own, sized to the spare height, read as a
   * second headline above an empty card.
   *
   * `nameSp` is the name's size — the list's headline at NEXT_NAME_SP, or
   * larger in the strip with the table hidden, where the row has the
   * table's height to grow into (`nextNameSp`); the time keeps its
   * proportion to the name.
   */
  @Composable
  private fun NextBlock(context: Context, m: Model, size: CardSize, top: Int, nameSp: Float = NEXT_NAME_SP) {
    val d = m.display
    val width = if (size.widthDp > 0) (size.widthDp - insetDp(context, size)).toFloat() else 0f
    val half = width / 2f
    val timeBase = NEXT_TIME_SP * nameSp / NEXT_NAME_SP
    val timeSp = scaledTimeSp(context, listOf(m.nextTime), timeBase, d.timeScale, half, medium = false)
    val counting = d.showCountdown && (m.since != null || m.nextAt != null)
    Label(context.getString(R.string.widget_next_label), 9f, d.muted, medium = true, modifier = GlanceModifier.padding(top = top.dp))
    DirRow(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
      if (m.nextName.isNotEmpty()) cell { Label(m.nextName, nameSp, d.text, medium = true) }
      if (m.nextTime.isNotEmpty()) cell { Label(m.nextTime, timeSp, m.colors.accent, modifier = GlanceModifier.padStart(8.dp)) }
      cell { Spacer(GlanceModifier.defaultWeight()) }
      if (counting) cell {
        // At the time's size, so the two sit level, unless the row has not
        // the room: then down to what fits, measured on the longest it can
        // read and in the Chronometer's own face (medium).
        val level = if (m.nextTime.isEmpty()) nameSp else timeSp
        val sp = if (width <= 0f) minOf(level, COUNTDOWN_ROW_SP) else {
          val taken = textWidthDp(context, m.nextName, nameSp, medium = true) +
            (if (m.nextTime.isEmpty()) 0f else textWidthDp(context, m.nextTime, timeSp, medium = false) + 8f) + 8f + ROW_SLACK_DP
          fitTextSp(context, counterSample(context, m), width - taken, level, COUNTDOWN_MIN_SP, medium = true)
        }
        // Level with the time: an embedded RemoteViews is placed at the top
        // of the row whatever its alignment, so it sat above the time. Padded
        // down by the difference, its foot is the row's, as the time's is.
        val rowDp = maxOf(
          textLineDp(context, nameSp, medium = true),
          if (m.nextTime.isEmpty()) 0f else textLineDp(context, timeSp, medium = false),
        )
        // Less a twentieth of its size: the Chronometer draws its line that
        // much lower in its view than a Glance Text does (measured on a
        // Pixel 10 Pro, 5px at 22sp), and the eye reads the baselines.
        val drop = (rowDp - textLineDp(context, sp, medium = true) - COUNTDOWN_LIFT * sp).coerceAtLeast(0f)
        Counter(m, sp, d.muted, GlanceModifier.padStart(8.dp).padding(top = drop.dp))
      }
    }
  }

  /**
   * The next prayer's size in the strip with the table hidden: as large
   * as the table's segment is tall (its label above it) and the row is
   * wide — the name, the time at its proportion and the countdown at its
   * smallest, all on one row — between the list's headline size and
   * NEXT_NAME_MAX_SP.
   */
  private fun nextNameSp(context: Context, m: Model, size: CardSize, segmentDp: Float): Float {
    val width = if (size.widthDp > 0) (size.widthDp - insetDp(context, size)).toFloat() else 0f
    // Not the whole of the room: a headline that fills its box edge to
    // edge reads as shouting, and the table's own times sit in theirs
    // with air above and below.
    val room = (segmentDp - textLineDp(context, 9f, medium = true)) * NEXT_NAME_FILL
    var sp = (NEXT_NAME_SP * room / textLineDp(context, NEXT_NAME_SP, medium = true)).coerceIn(NEXT_NAME_SP, NEXT_NAME_MAX_SP)
    if (width <= 0f) return sp
    val countdown = if (m.display.showCountdown && (m.since != null || m.nextAt != null))
      textWidthDp(context, counterSample(context, m), COUNTDOWN_ROW_SP, medium = true) + 8f + ROW_SLACK_DP
    else 0f
    while (sp > NEXT_NAME_SP) {
      val timeSp = NEXT_TIME_SP * sp / NEXT_NAME_SP * m.display.timeScale
      val row = textWidthDp(context, m.nextName, sp, medium = true) +
        (if (m.nextTime.isEmpty()) 0f else textWidthDp(context, m.nextTime, timeSp, medium = false) + 8f) + countdown
      if (row <= width) break
      sp -= 1f
    }
    return sp
  }

  // ── The strip ─────────────────────────────────────────────────────────

  @Composable
  private fun Strip(context: Context, m: Model, size: CardSize, plan: StripPlan) {
    val d = m.display
    val h = size.heightDp
    // An unmeasured card (0) keeps the header and the roomy padding. Which
    // layout a height gets: `variantOf`.
    val oneRow = plan.variant.oneRow
    // A row shorter than the strip's own minimum — a dense home screen,
    // five by seven (#115): the six times and nothing under them. The next
    // prayer is still the highlighted column; its line and the logged count
    // are what the row has no room for. Below this the card is the next
    // prayer alone.
    val timesOnly = h in 1 until STRIP_MIN_HEIGHT_DP
    val tight = plan.variant.tight
    val budget = plan.variant.budgetDp
    // Whether the graph is drawn, and how: `stripPlan`.
    val compact = plan.compact
    val practice = m.practice?.takeIf { plan.graph }
    // With nothing under the times — no graph, and the next prayer on top —
    // the times sit in the middle of the room under the header: equal
    // weighted spacers above and below them take the spare height.
    // (`topNext` without a graph.)
    val centreTimes = practice == null && h > 0 && d.showTable && !timesOnly && (compact || entry == Entry.STRIP)
    val slack = if (h <= 0 || practice != null || centreTimes) 0
    else ((h - budget) / 2).coerceIn(0, STRIP_SLACK_CAP_DP)
    val showFoot = plan.showFoot
    val columns = m.rows.take(STRIP_COLUMNS)
    val timeSp = plan.timeSp

    // THE NEXT PRAYER ON TOP: the 4×1 card always, and the tall card when it
    // is compact, centre the next prayer in the header between the dates,
    // and give its line below the times (and the rule over it) to the room.
    val topNext = topNext(d, h, compact)

    DirColumn(modifier = GlanceModifier.fillMaxSize()) {
      if (!oneRow || topNext) Header(m.header, m.hijri, d, center = if (!topNext) null else ({
        DirRow(verticalAlignment = Alignment.CenterVertically, modifier = GlanceModifier.padding(horizontal = 6.dp)) {
          val named = size.widthDp - insetDp(context, size) >= COMPACT_NAMED_MIN_WIDTH_DP
          if (named && m.nextName.isNotEmpty()) cell { Label(m.nextName, 11f, d.text) }
          if (d.showCountdown) cell { Counter(m, 11f, d.muted, if (named) GlanceModifier.padStart(4.dp) else GlanceModifier) }
          else if (!named && m.nextName.isNotEmpty()) cell { Label(m.nextName, 11f, d.text) }
        }
      }))
      if (centreTimes) Spacer(GlanceModifier.defaultWeight())
      if (d.showTable) {
        DirRow(
          modifier = GlanceModifier.fillMaxWidth().padding(top = (if (timesOnly || centreTimes) 0 else if (oneRow) 4 else 8 + slack).dp, bottom = slack.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          for (r in columns) cell {
            DirColumn(
              modifier = GlanceModifier.defaultWeight().padding(horizontal = 1.dp),
              horizontalAlignment = Alignment.CenterHorizontally,
            ) {
              val highlight = m.nextKey != null && m.nextKey == r.key
              val color = rowColor(m, r)
              val box = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp)
              DirColumn(
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
          DirRow(modifier = GlanceModifier.fillMaxWidth().padding(top = 4.dp)) {
            cell { Label(n.left, 11f, d.muted, modifier = GlanceModifier.defaultWeight()) }
            n.mid?.let { mid -> cell { Label(mid, 11f, d.muted, modifier = GlanceModifier.padding(horizontal = 6.dp)) } }
            n.right?.let { right -> cell { Label(right, 11f, d.muted, modifier = GlanceModifier.padStart(6.dp)) } }
          }
        }
      } else {
        // No table: the next prayer, large, says what the card is for — in
        // the table's own segment, as tall as the times and the night row
        // would be, so the rule and the line under it (the logged count)
        // sit where they do with the table on, and the two layouts read as
        // one card with and without its times.
        val (segmentDp, nameSp) = noTableDp(context, m, size, timeSp, slack)
        DirBox(
          modifier = GlanceModifier.fillMaxWidth().height(segmentDp.dp),
          contentAlignment = Alignment.CenterStart,
        ) {
          DirColumn(modifier = GlanceModifier.fillMaxWidth()) { NextBlock(context, m, size, top = 0, nameSp = nameSp) }
        }
      }
      if (centreTimes) Spacer(GlanceModifier.defaultWeight())
      // The next-prayer line is in the header when `topNext`.
      if (!tight && !topNext) Rule(d.rule, top = 6, bottom = 8)
      if ((!timesOnly || !d.showTable) && !topNext) DirRow(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        // The next-prayer line is the NextBlock's when the table is hidden.
        if (d.showTable) {
          if (m.nextName.isNotEmpty()) cell { Label(m.nextName, 11f, d.text) }
          if (d.showCountdown) cell { Counter(m, 11f, d.muted, GlanceModifier.padStart(4.dp)) }
        }
        cell { Spacer(GlanceModifier.defaultWeight()) }
        if (practice != null) {
          cell { Label(practice.block.streak.toString(), 11f, d.text, medium = true, modifier = GlanceModifier.padStart(10.dp)) }
          cell { Label("${practice.streakText} · ${practice.second}", 11f, d.muted, modifier = GlanceModifier.padStart(5.dp)) }
        } else {
          // "2 of 5 logged" — said by the summary instead once it is drawn.
          m.logged?.let {
            cell {
              Label(
                context.getString(R.string.widget_logged_short, it.logged, it.loggable),
                11f,
                d.muted,
                modifier = GlanceModifier.padStart(6.dp),
              )
            }
          }
        }
      }
      practice?.let { pr ->
        if (compact) Rule(d.ruleStrong, top = 4, bottom = 4) else Rule(d.ruleStrong, top = 8, bottom = 8)
        // The tall card's graph fills its room in the two-row band and
        // stops growing above it (GRAPH_BAND_TOP_DP).
        val tall = entry == Entry.TALL
        // The room is the card's height less everything else on it, summed
        // from the lines as they will be drawn (`stripChromeDp`).
        val box = graphBoxDp(
          size.heightDp,
          GraphRoom(plan.graph, plan.compact, plan.chromeDp),
          capDp = if (tall) GRAPH_BAND_TOP_DP else null,
          footDp = if (showFoot) plan.footDp else 0,
        )
        PracticeImage(context, pr.block, size.widthDp - insetDp(context, size), box, MAX_GRID_DAYS, m.colors.accent,
          GlanceModifier.fillMaxWidth().defaultWeight(), spread = tall && size.heightDp < GRAPH_SPREAD_MAX_DP)
        if (showFoot) Foot(pr, top = 7, d)
      }
    }
  }

  @Composable
  private fun Header(
    text: String,
    hijri: String,
    d: PrayerWidgetDisplay,
    /** The compact tall card's next prayer, centred between the dates. */
    center: (@Composable () -> Unit)? = null,
  ) {
    val refresh = localizedContext().getString(R.string.widget_intent_refresh)
    @Composable
    fun Refresh() = Label(
      "↻",
      14f,
      d.refresh,
      modifier = GlanceModifier
        .padStart(8.dp)
        .clickable(actionRunCallback<PrayerRefresh>())
        .semantics { contentDescription = refresh },
    )
    if (center != null) {
      // Equal weights either side, so the middle is the card's middle.
      DirRow(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        cell { Label(text, 10f, d.muted, medium = true, modifier = GlanceModifier.defaultWeight()) }
        cell { center() }
        cell {
          DirRow(
            modifier = GlanceModifier.defaultWeight(),
            horizontalAlignment = Alignment.End,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            if (hijri.isNotEmpty()) cell { Label(hijri, 10f, d.muted, medium = true, modifier = GlanceModifier.padStart(6.dp)) }
            cell { Refresh() }
          }
        }
      }
      return
    }
    DirRow(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      cell { Label(text, 10f, d.muted, medium = true, modifier = GlanceModifier.defaultWeight()) }
      if (hijri.isNotEmpty()) cell { Label(hijri, 10f, d.muted, medium = true, modifier = GlanceModifier.padStart(6.dp)) }
      // The refresh glyph: redraw now, then go and look (a sync round).
      cell { Refresh() }
    }
  }

  @Composable
  private fun Foot(pr: Practice, top: Int, d: PrayerWidgetDisplay) {
    DirRow(modifier = GlanceModifier.fillMaxWidth().padding(top = top.dp)) {
      // INVISIBLE, not gone, when absent: the fasts keep their end.
      cell {
        Label(
          pr.sunnah.orEmpty(),
          11f,
          d.muted,
          modifier = GlanceModifier.defaultWeight().visibility(if (pr.sunnah == null) Visibility.Invisible else Visibility.Visible),
        )
      }
      pr.fasts?.let { f -> cell { Label(f, 11f, d.muted, modifier = GlanceModifier.padStart(6.dp)) } }
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
    spread: Boolean = false,
  ) {
    val rtl = LocalDirection.current.rtl
    val layout = PracticeGridBitmap.layoutFor(boxWidthDp, boxHeightDp, context.resources.displayMetrics.density, maxDays)
    val grid = extra("practiceGrid") {
      practiceGrid(pr, layout.rows, layout.columns, layout.cellWPx, layout.cellHPx, layout.gapPx, accent, mirror = rtl)
    } ?: return
    Image(
      provider = ImageProvider(grid),
      contentDescription = context.getString(R.string.widget_streak_grid_description),
      // The graph is the Log's: a tap on it opens the Log, the rest of the
      // card Today.
      modifier = modifier.clickable(openRoute(context, "mihrab://log")),
      contentScale = spreadScale(spread),
    )
  }

  // ── The list (narrow and tall) ────────────────────────────────────────

  @Composable
  private fun ListCard(context: Context, m: Model, size: CardSize) {
    val d = m.display
    val h = size.heightDp
    val practice = m.practice?.takeIf { h > 0 && h - LIST_GRAPH_CHROME_DP >= GRID_MIN_BOX_DP }
    val showFoot = practice != null && h >= PRACTICE_MIN_HEIGHT_DP
    val shown = m.rows.take(LIST_SLOTS)
    // The provider sizes every layout's times by the same measure.
    val baseSp = fitTimesSp(
      context,
      shown.map { it.minutes },
      m.clock,
      (size.widthDp - insetDp(context, size)).toFloat() / shown.size.coerceAtLeast(1) - TIME_GUTTER_DP,
      TIME_MAX_SP,
      TIME_MIN_SP,
    )
    // A row's time has about half the row; that, not the strip's column, is
    // what a larger size has to fit.
    val half = if (size.widthDp > 0) (size.widthDp - insetDp(context, size) - 14) / 2f else 0f
    val timeSp = scaledClockSp(context, shown.map { it.minutes }, m.clock, baseSp, d.timeScale, half)
    DirColumn(modifier = GlanceModifier.fillMaxSize()) {
      Header(m.location, m.hijri, d)
      NextBlock(context, m, size, top = 6)
      if (d.showTable) {
        DirColumn(modifier = GlanceModifier.fillMaxWidth().defaultWeight().padding(top = 6.dp)) {
          for ((i, r) in shown.withIndex()) {
            val night = i >= STRIP_COLUMNS
            val color = rowColor(m, r)
            val highlight = m.nextKey != null && m.nextKey == r.key
            val box = GlanceModifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 3.dp)
            Row(
              modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              DirRow(
                modifier = if (highlight) box.background(ImageProvider(R.drawable.widget_row_highlight)) else box,
                verticalAlignment = Alignment.CenterVertically,
              ) {
                cell { Label(rowLabel(r), if (night) 12f else 13f, color, modifier = GlanceModifier.defaultWeight()) }
                cell { ClockText(r.minutes, m.clock, timeSp, color, medium = !night) }
              }
            }
          }
        }
      } else {
        Spacer(GlanceModifier.defaultWeight())
      }
      practice?.let { pr ->
        Rule(d.ruleStrong, top = 6, bottom = 0)
        DirRow(modifier = GlanceModifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
          cell { DirColumn(modifier = GlanceModifier.defaultWeight()) {
            DirRow(verticalAlignment = Alignment.Bottom) {
              cell { Label(pr.block.streak.toString(), 25f, m.colors.accent, medium = true) }
              cell { Label(pr.streakText, 12f, d.muted, modifier = GlanceModifier.padStart(7.dp)) }
            }
            Label(pr.second, 11f, d.muted, modifier = GlanceModifier.padding(top = 2.dp))
          } }
          // Beside the number, in half the width, a share of what is left —
          // the tall card's graph sets its row's height, so it is kept short.
          cell {
            PracticeImage(
              context,
              pr.block,
              (size.widthDp - insetDp(context, size)) / 2,
              ((h - STRIP_CHROME_DP) * 2) / 3,
              MAX_GRID_DAYS / 2,
              m.colors.accent,
              GlanceModifier.padStart(10.dp),
            )
          }
        }
        if (showFoot) Foot(pr, top = 6, d)
      }
      m.logged?.let {
        Label(
          context.getString(R.string.widget_logged_line, it.logged, it.loggable),
          11f,
          d.muted,
          modifier = GlanceModifier.padding(top = 4.dp),
        )
      }
    }
  }

  companion object {
    /** PrayerWidgetProvider's thresholds and budgets, unchanged — see the notes there. */
    private const val ROWS_MIN_HEIGHT_DP = 165
    private const val STRIP_MIN_HEIGHT_DP = 92
    /**
     * The shortest row that still takes the six times, alone (#115): the
     * times' two lines and the card's ends. A five-by-seven home screen's
     * row is under the strip's 92 and over this.
     */
    private const val STRIP_TIMES_MIN_HEIGHT_DP = 66
    private const val STRIP_MIN_WIDTH_DP = 200
    private const val STRIP_ROOMY_CONTENT_DP = 150
    private const val STRIP_TIGHT_CONTENT_DP = 124
    private const val STRIP_BARE_CONTENT_DP = 96
    private const val STRIP_SLACK_CAP_DP = 64
    private const val STRIP_CHROME_DP = 184
    /**
     * The list card's height under which its graph is left out. (The
     * strip's room is summed, not kept: `stripChromeDp`.)
     */
    private const val LIST_GRAPH_CHROME_DP = 161

    /**
     * The compact card's header names the next prayer ("Asr in 07:56") from
     * this inner width; under it, the countdown alone, so the dates either
     * side keep their room.
     */
    private const val COMPACT_NAMED_MIN_WIDTH_DP = 340
    /** The strip's side padding (sideDp). */
    private const val STRIP_SIDE_DP = 8
    /** The least box the graph is drawn into: six rows of the smallest cell, and its gaps. */
    private const val GRID_MIN_BOX_DP = 36
    private const val PRACTICE_MIN_HEIGHT_DP = 375
    private const val MAX_GRID_DAYS = 210
    private const val STRIP_COLUMNS = 6

    /** Sunrise, the five and the three night marks. */
    private const val LIST_SLOTS = 9
    private const val TIME_MAX_SP = 17f
    private const val TIME_MIN_SP = 10f
    private const val TIME_GUTTER_DP = 6f
    private const val SMALL_TIME_SP = 36f
    /** The list's next-prayer time, as the layout drew it. */
    private const val NEXT_TIME_SP = 19f

    private const val NEXT_NAME_SP = 24f
    /** The name in the strip with the table hidden: at the largest, and
     *  how much of the segment's height it grows into. */
    private const val NEXT_NAME_MAX_SP = 32f
    private const val NEXT_NAME_FILL = 0.7f
    /** The countdown at the end of the next prayer's row, at the smallest. */
    private const val COUNTDOWN_ROW_SP = 15f
    /** …and the least it may shrink to on a row with no room left. */
    private const val COUNTDOWN_MIN_SP = 10f
    /** Measured and drawn text differ by a pixel or two: kept spare. */
    private const val ROW_SLACK_DP = 4f
    /** How much higher than its line the countdown is set, per sp (NextBlock). */
    private const val COUNTDOWN_LIFT = 0.06f
  }
}

/**
 * The refresh glyph: redraw from
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
