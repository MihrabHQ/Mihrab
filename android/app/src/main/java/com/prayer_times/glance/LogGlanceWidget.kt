package com.prayer_times.glance

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.SizeMode
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
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
import androidx.glance.layout.size
import androidx.glance.text.TextAlign
import com.prayer_times.PracticeGridBitmap
import com.prayer_times.PrayerWidgetProvider
import com.prayer_times.R
import com.prayer_times.WidgetLogQueue
import com.prayer_times.WidgetQueueEvents
import com.prayer_times.cardfit.fitLogCard
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract

/**
 * Log Today on Glance — PrayerWidgetLogProvider's card.
 *
 * Five chips, one per ṣalāh. A due one takes a tap, which is queued
 * (WidgetLogQueue) for the app to write to the journal, and a second tap
 * inside the undo window takes it back; everything else opens the Log.
 * A chip is ticked if the journal (the payload's `today`) or the queue says
 * so. Under the chips: what to tap next, and the countdown to the next time
 * the user asked to be told about. From 190dp the practice graph.
 *
 * Dueness is decided here against the clock, from the prayer's minutes —
 * never "HH:mm" — and the payload's stamped `due` only stands in when the
 * block is not about today or a time does not occur.
 */
internal class LogGlanceWidget(
  /**
   * The 4×2 (PrayerWidgetLogLargeProvider), placed with room for the
   * practice graph under today's row; the 4×1 without. The graph follows
   * the room, not the entry: a launcher that stretches the cards (Nova)
   * gives a 4×1 the room and a squeezed 4×2 none (STRETCHABLE_SIZES).
   */
  private val tall: Boolean = false,
) : MihrabGlanceWidget("log") {

  override val sizeMode: SizeMode = SizeMode.Responsive(STRETCHABLE_SIZES)

  private class Chip(
    val key: String,
    val name: String,
    val minutes: Int?,
    val status: WidgetContract.PrayerStatus?,
    val due: Boolean,
    val queued: Boolean,
  ) {
    val done: Boolean
      get() = queued || status == WidgetContract.PrayerStatus.ON_TIME ||
        status == WidgetContract.PrayerStatus.LATE || status == WidgetContract.PrayerStatus.QADHA
    val missed: Boolean get() = !queued && status == WidgetContract.PrayerStatus.MISSED
  }

  private class Model(
    val colors: Colors,
    val clock: WidgetContract.Clock,
    val title: String,
    val count: String,
    val chips: List<Chip>,
    val footLeft: String,
    val next: Pair<String, Long>?,
    val practice: WidgetContract.Practice?,
    val now: Now,
  )

  @Composable
  override fun Content() {
    val context = localizedContext()
    val size = cardSize()
    val result = guarded("log") {
      val now = Now.current()
      val p = GlancePayload.live(context, now)
      // Today's block, rolled onto today's date if the app has not run
      // since midnight (#81).
      p?.let { GlancePayload.todayOf(it, now) }?.let { model(context, p, it, now) }
    }
    val colors = result.getOrNull()?.colors ?: Colors.of(context)
    // The Log, not the app wherever it was (#27).
    MihrabCard(colors.background, openRoute(context, "mihrab://log"), contentPadding = paddingFor(size).dp) {
      result.fold(
        onSuccess = { m ->
          // No `today` block means "we do not know what has been logged" —
          // five empty chips would be a claim.
          if (m == null) Placeholder(context.getString(R.string.widget_placeholder_day))
          else Card(context, m, size)
        },
        onFailure = { ErrorContent(context, it) },
      )
    }
  }

  private fun model(context: Context, p: WidgetContract.Payload, today: WidgetContract.Today, now: Now): Model {
    val dateKey = today.dateKey
    val pending = WidgetLogQueue.pendingFor(context, dateKey)
    val describesToday = dateKey == now.dateKey
    // Queued taps have not reached the journal; count them so "3 of 5"
    // agrees with the three filled chips beside it.
    val logged = today.logged + pending.count { key -> today.prayers.none { it.key == key && it.status != null } }
    val chips = today.prayers.take(CHIPS).map { pr ->
      Chip(
        key = pr.key,
        name = pr.name.ifEmpty { pr.key },
        minutes = pr.minutes,
        status = pr.status,
        due = isDue(pr, describesToday, now),
        queued = pending.contains(pr.key),
      )
    }
    val schedule = Schedule.of(p, now)
    return Model(
      colors = Colors.of(context),
      clock = p.clock,
      // The payload's `dayLabel`, as the RemoteViews card reads it.
      title = schedule?.shown?.label?.ifEmpty { null } ?: context.getString(R.string.widget_log_today),
      count = context.getString(R.string.widget_log_count, logged, today.loggable),
      chips = chips,
      footLeft = footerLeft(context, today, pending, describesToday, now),
      next = nextEvent(p, today, describesToday, now),
      // The practice line counts today's logs too: on a rolled day the
      // payload's count is yesterday's, and today's is what the chips say.
      practice = if (today === p.today) p.practice else p.practice?.copy(loggedToday = logged),
      now = now,
    )
  }

  /**
   * Has this prayer's time arrived? From its minutes against the clock when
   * the block is today's; the payload's stamped flag otherwise.
   */
  private fun isDue(pr: WidgetContract.TodayPrayer, describesToday: Boolean, now: Now): Boolean {
    val at = pr.minutes
    if (!describesToday || at == null) return pr.due
    return at <= now.minutes
  }

  /** The next prayer still waiting to be logged, else the owed count, else "up to date". */
  private fun footerLeft(
    context: Context,
    today: WidgetContract.Today,
    pending: Set<String>,
    describesToday: Boolean,
    now: Now,
  ): String {
    for (pr in today.prayers) {
      if (isDue(pr, describesToday, now) && pr.status == null && !pending.contains(pr.key)) {
        return context.getString(R.string.widget_log_tap_to_log, pr.name.ifEmpty { pr.key })
      }
    }
    if (today.owed > 0) return context.getString(R.string.widget_log_owed, today.owed)
    return context.getString(R.string.widget_log_up_to_date)
  }

  /**
   * What the countdown aims at, and when, as an instant: the next of the
   * day's events (Sunrise and the night marks included, when on), past the
   * last one the first event of the next day — PrayerWidgetLogProvider's
   * bindCountdown, with every instant from WallClock.epochMs on the event's
   * own date instead of minutes-of-day arithmetic.
   */
  private fun nextEvent(
    p: WidgetContract.Payload,
    today: WidgetContract.Today,
    describesToday: Boolean,
    now: Now,
  ): Pair<String, Long>? {
    val todayKey = today.dateKey
    val index = p.days.indexOfFirst { it.dateKey == todayKey }
    val day = p.days.getOrNull(index)
    val events = day?.let { Schedule.eventsOf(it, 0) } ?: emptyList()
    fun name(row: WidgetContract.Row) = row.name.ifEmpty { row.key }

    var next: Pair<String, Long>? =
      if (events.isNotEmpty() && describesToday) {
        Schedule.earliest(events.filter { it.at > now.minutes })?.let { e -> e.epochMs()?.let { name(e.row) to it } }
      } else {
        today.prayers.firstOrNull { !isDue(it, describesToday, now) }?.let { pr ->
          pr.minutes?.let { m -> WallClock.epochMs(todayKey, m)?.let { pr.name.ifEmpty { pr.key } to it } }
        }
      }
    if (next == null || next.second < now.epochMs) {
      // The day is done: what is next is on the other side of midnight.
      val after = if (index >= 0) p.days.getOrNull(index + 1)?.takeUnless { it.estimated } else null
      next = after?.let { Schedule.earliest(Schedule.eventsOf(it, 0)) }?.let { e -> e.epochMs()?.let { name(e.row) to it } }
        ?: Schedule.earliest(events)?.let { e ->
          WallClock.epochMs(todayKey, e.minutes + WallClock.MINUTES_PER_DAY)?.let { name(e.row) to it }
        }
        ?: today.prayers.firstOrNull()?.let { pr ->
          pr.minutes?.let { m ->
            WallClock.epochMs(todayKey, m + WallClock.MINUTES_PER_DAY)?.let { pr.name.ifEmpty { pr.key } to it }
          }
        }
    }
    return next?.takeIf { it.second >= now.epochMs }
  }

  /** The card's padding: 6dp once it is tighter than the roomy budget. */
  private fun paddingFor(size: CardSize): Int = if (size.heightDp in 1 until LOG_ROOMY_CONTENT_DP) 6 else 10

  @Composable
  private fun Card(context: Context, m: Model, size: CardSize) {
    val h = size.heightDp
    // An unmeasured card (0) is the roomy one and draws no graph.
    val tight = h in 1 until LOG_ROOMY_CONTENT_DP
    val bare = h in 1 until LOG_TIGHT_CONTENT_DP
    // The chrome over the graph is the card's own: its inset and padding,
    // the chip row, the footer, the rules — 8dp of padding, 8dp of chip and
    // a 15dp rule less once the card is tight. What is left is the graph's.
    val chrome = if (tight) LOG_CHROME_TIGHT_DP else LOG_CHROME_ROOMY_DP
    val graphBox = h - chrome
    // THE TALL CARD IS ALWAYS 4×2 WITH ITS GRAPH (PrayerGlanceWidget's
    // `compact`): where two rows are short of the full card, the footer
    // line goes before the graph does.
    val compact = tall && h > 0 && graphBox < GRID_MIN_BOX_DP && h - LOG_CHROME_COMPACT_DP >= GRID_MIN_BOX_DP
    val graphHeight = h > 0 && (graphBox >= GRID_MIN_BOX_DP || compact)
    // Null when there is no block or no room for it: one value, no `!!`.
    val practice = m.practice?.takeIf { graphHeight }
    val showGrid = practice != null
    // Each variant is filled against the budget that chose it.
    val budget = if (bare) LOG_BARE_CONTENT_DP else if (tight) LOG_TIGHT_CONTENT_DP else LOG_ROOMY_CONTENT_DP
    val slack = if (h <= 0 || graphHeight) 0 else ((h - budget) / 2).coerceIn(0, LOG_SLACK_CAP_DP)
    // The budgets are reckoned in the widgets' Latin face. A chip's name in
    // a script whose lines are taller (Arabic) takes the difference out of
    // the chip, not off the bottom of the card (#118).
    val nameSurplus = m.chips.maxOfOrNull { textHeightDp(context, it.name, 11f, medium = false) - textLineDp(context, 11f, medium = false) } ?: 0f
    var chipHeight = ((if (tight) 30 else 38) - (if (h > 0) Math.ceil(nameSurplus.toDouble()).toInt() else 0)).coerceAtLeast(CHIP_MIN_HEIGHT_DP)

    // ── A CARD SHORTER THAN ITS BUDGET ─────────────────────────────────
    //
    // The budgets above read a 4×1 cell as about 112dp. Launchers do not
    // promise that: `minHeight` is 40dp, `targetCellHeight` is 1, and a
    // Pixel's own launcher hands this card 89dp — 65dp of it inside the
    // inset and the padding. A 30dp pill, a name, a time and the footer
    // want 84dp, so the column ran past the bottom edge and Glance cut it
    // there: the footer — the line the countdown is on — was simply not
    // drawn, with nothing on the card to say a line was missing.
    //
    // So the card is fitted to the room there is rather than the room the
    // budget assumed, and what gives, gives in order: the pill first,
    // because it is the one band with nothing written in it; then the air
    // over the chips and under them; then the type itself, half a point at
    // a time, to a floor that is still a widget's smallest readable size.
    // Nothing is clipped on the way: a card too short even for the floor
    // is a card that drops the footer deliberately, in `showFoot`.
    // The spending itself is `cardfit.fitLogCard`, which has no Android in
    // it so that `contract-tests/kotlin` can sweep it over every height a
    // launcher might hand this card. Only the measuring is done here: line
    // heights need the device's own fonts.
    val fit = fitLogCard(
      roomDp = if (graphHeight) 0 else h - 2 * CARD_INSET_DP - 2 * paddingFor(size),
      titleDp = if (!bare) textLineDp(context, 11f, medium = true) else 0f,
      // Rule(top = 6, bottom = 8) plus its own 1dp line.
      ruleDp = if (!tight) 15f else 0f,
      slackDp = slack,
      startPillDp = chipHeight,
      minPillDp = CHIP_MIN_HEIGHT_DP,
      minSp = CARD_MIN_SP,
      nameDp = { sp ->
        m.chips.maxOfOrNull { textHeightDp(context, it.name, sp, medium = false) }
          ?: textLineDp(context, sp, medium = false)
      },
      lineDp = { sp -> textLineDp(context, sp, medium = false) },
    )
    chipHeight = fit.pillDp
    val topPad = fit.topPadDp
    val botPad = fit.botPadDp
    val gapDp = fit.gapDp
    val nameSp = fit.nameSp
    val timeSp = fit.timeSp
    val footSp = fit.footSp
    val showFoot = fit.showFoot && !compact

    DirColumn(
      modifier = GlanceModifier.fillMaxSize(),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      // The date-and-count line goes when the graph arrives: the band under
      // the chips says "0 of 5 today" by then.
      if (!bare && !graphHeight) {
        DirRow(modifier = GlanceModifier.fillMaxWidth()) {
          cell { Label(m.title, 11f, Palette.MUTED, medium = true, modifier = GlanceModifier.defaultWeight()) }
          cell { Label(m.count, 11f, Palette.MUTED, medium = true) }
        }
      }
      DirRow(
        modifier = GlanceModifier.fillMaxWidth().padding(top = topPad.dp, bottom = botPad.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        for ((i, chip) in m.chips.withIndex()) cell {
          ChipCell(
            chip, i, chipHeight, gapDp, nameSp, timeSp,
            fit.showName, fit.showTime, m, GlanceModifier.defaultWeight(),
          )
        }
      }
      // The rule above the footer is what a one-row card does without.
      if (!tight && showFoot) Rule(Palette.RULE, top = 6, bottom = 8)
      if (showFoot) DirRow(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (!showGrid) cell { Label(m.footLeft, footSp, Palette.MUTED, modifier = GlanceModifier.defaultWeight()) }
        // The countdown is the tall card's; the 4×1 says the day's count.
        m.next?.takeIf { tall }?.let { (name, at) ->
          cell { Label(name, footSp, Palette.MUTED) }
          cell { Countdown(at, m.now, footSp, Palette.MUTED, modifier = GlanceModifier.padStart(4.dp)) }
        }
        cell { Spacer(GlanceModifier.defaultWeight()) }
        practice?.let { pr ->
          cell { Label(pr.streak.toString(), 11f, Palette.TEXT, medium = true, modifier = GlanceModifier.padStart(10.dp)) }
          cell { Label(practiceLine(context, pr), 11f, Palette.MUTED, modifier = GlanceModifier.padStart(5.dp)) }
        }
      }
      practice?.let { pr ->
        if (compact) Rule(Palette.RULE, top = 4, bottom = 4) else Rule(Palette.RULE, top = 8, bottom = 8)
        // The card's chrome off the height, the padding off the width; the
        // grid gets the rest — PrayerWidgetLogProvider.bindGrid's box.
        val density = context.resources.displayMetrics.density
        val boxW = size.widthDp - 2 * (CARD_INSET_DP + paddingFor(size))
        // The tall card's graph fills its room in the two-row band and
        // stops growing above it (GRAPH_BAND_TOP_DP).
        val room = if (tall) minOf(h, GRAPH_BAND_TOP_DP) else h
        val box = room - (if (compact) LOG_CHROME_COMPACT_DP else chrome)
        val spread = tall && h < GRAPH_SPREAD_MAX_DP
        val grid = PracticeGridBitmap.layoutFor(boxW, box, density, MAX_GRID_DAYS)
        val bitmap = practiceGrid(pr, grid.rows, grid.columns, grid.cellWPx, grid.cellHPx, grid.gapPx, m.colors.accent, mirror = LocalDirection.current.rtl)
        Image(
          provider = ImageProvider(bitmap),
          contentDescription = context.getString(R.string.widget_streak_grid_description),
          modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
          contentScale = spreadScale(spread),
        )
      }
    }
  }

  /** "0  day streak · Best 92 · 3 of 5 today · 1 to make up" — the prayer card's words. */
  private fun practiceLine(context: Context, pr: WidgetContract.Practice): String {
    val parts = mutableListOf(
      context.resources.getQuantityString(R.plurals.widget_streak_day_label, pr.streak, pr.streak),
    )
    if (pr.bestStreak > 0) parts.add(context.getString(R.string.widget_streak_best, pr.bestStreak))
    parts.add(context.getString(R.string.widget_streak_logged, pr.loggedToday))
    if (pr.owed > 0) parts.add(context.resources.getQuantityString(R.plurals.widget_streak_make_up, pr.owed, pr.owed))
    return parts.joinToString(" · ")
  }

  @Composable
  private fun ChipCell(
    chip: Chip,
    index: Int,
    chipHeight: Int,
    gapDp: Int,
    nameSp: Float,
    timeSp: Float,
    showName: Boolean,
    showTime: Boolean,
    m: Model,
    modifier: GlanceModifier,
  ) {
    // Only a chip that can legitimately change takes a tap; the rest fall
    // through to the card's own "open the Log".
    val cell = modifier.padding(horizontal = 2.dp)
    DirColumn(
      modifier = if (chip.due || chip.queued) cell.clickable(tap(chip.key, index)) else cell,
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      val (drawable, glyph, color) = when {
        chip.done -> Triple(R.drawable.widget_log_chip_done, "✓", android.graphics.Color.WHITE)
        chip.missed -> Triple(R.drawable.widget_log_chip_missed, "!", Palette.DANGER)
        // A hollow tick: what tapping produces, in outline until it is done.
        chip.due -> Triple(R.drawable.widget_log_chip_due, "✓", m.colors.accent)
        else -> Triple(R.drawable.widget_log_chip_idle, "·", Palette.MUTED)
      }
      DirBox(
        modifier = GlanceModifier
          .size(52.dp, chipHeight.dp)
          .background(
            ImageProvider(drawable),
            // The done chip in the accent the user picked, as the RemoteViews
            // card tints it on API 31+ (there, below 31 it keeps its emerald).
            colorFilter = if (chip.done) ColorFilter.tint(provider(m.colors.accent)) else null,
          ),
        contentAlignment = Alignment.Center,
      ) {
        Label(glyph, 18f, color, medium = true)
      }
      // On a cell too short for them these go rather than overflow — the
      // ladder is in `cardfit.fitLogCard`, the tick always stays.
      if (showName) {
        Label(
          chip.name,
          nameSp,
          if (chip.due || chip.queued) Palette.TEXT else Palette.MUTED,
          align = TextAlign.Center,
          modifier = GlanceModifier.padding(top = gapDp.dp),
        )
      }
      // The meridiem small, the same as the prayer strip.
      if (showTime) {
        ClockText(
          chip.minutes,
          m.clock,
          timeSp,
          Palette.TEXT,
          modifier = if (showName) GlanceModifier else GlanceModifier.padding(top = gapDp.dp),
        )
      }
    }
  }

  private fun tap(prayer: String, index: Int) =
    actionRunCallback<LogTap>(actionParametersOf(LogTap.PRAYER to prayer, LogTap.INDEX to index))

  companion object {
    private const val CHIPS = 5
    /** The shortest a chip gets to make room for a taller script's names. */
    private const val CHIP_MIN_HEIGHT_DP = 22

    /**
     * The smallest type the card will set to fit a short cell. Below this a
     * line is dropped rather than shrunk: 9sp is about where a time on a
     * widget stops being read at arm's length.
     */
    private const val CARD_MIN_SP = 9f

    /** PrayerWidgetLogProvider's budgets, unchanged (see the notes there). */
    private const val GRID_MIN_HEIGHT_DP = 190
    private const val LOG_ROOMY_CONTENT_DP = 157
    private const val LOG_TIGHT_CONTENT_DP = 134
    private const val LOG_BARE_CONTENT_DP = 112
    private const val LOG_SLACK_CAP_DP = 56
    /**
     * The 4×2's chrome over the graph: the inset and padding, the chips and
     * their padding, the footer row, two rules. Measured, not summed: on a
     * 201dp card the strip the image drew was 41dp tall, so the chrome is
     * 160dp; the tight card has 8dp less padding, 8dp less chip and no
     * 15dp rule. A couple of dp over the measure:
     * a box reckoned too tall draws a strip the image then has to shrink,
     * and a shrunk strip is a strip that stops short of the card's edges;
     * a box a few dp short leaves that much air, which nobody sees.
     */
    private const val LOG_CHROME_ROOMY_DP = 162
    private const val LOG_CHROME_TIGHT_DP = 131
    /** Under this much room the graph is left out rather than squashed. */
    private const val GRID_MIN_BOX_DP = 36
    /**
     * The compact tall card's chrome: the tight card's less the footer line
     * and 8dp of the rule over the graph — about 108dp, reckoned over.
     */
    private const val LOG_CHROME_COMPACT_DP = 110
    private const val CARD_INSET_DP = 6
    private const val MAX_GRID_DAYS = 210
  }
}

/**
 * A tap on a chip — PrayerWidgetLogProvider.handleTap. The date is the
 * payload's `today` block's, so a tap and the chip it was drawn under agree
 * about the day; a payload whose schedule has run out queues nothing.
 */
class LogTap : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val prayer = parameters[PRAYER] ?: return
    if (!WidgetLogQueue.PRAYERS.contains(prayer)) return
    // The day the chip was drawn under — rolled onto today, as the card is.
    val now = Now.current()
    val date = GlancePayload.live(context, now)?.let { GlancePayload.todayOf(it, now) }?.dateKey.orEmpty()
    if (date.isEmpty()) return
    WidgetLogQueue.tap(context, date, prayer)
    WidgetQueueEvents.postChanged(context)
    PrayerWidgetProvider.requestUpdate(context)
  }

  companion object {
    val PRAYER = ActionParameters.Key<String>("prayer")

    /** Keeps the five chips' actions distinct, as the provider's request codes did. */
    val INDEX = ActionParameters.Key<Int>("index")
  }
}
