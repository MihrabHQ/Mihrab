package com.prayer_times.glance

import android.content.Context
import android.content.Intent
import android.content.res.Resources
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.SystemClock
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import android.text.TextUtils
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.background
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.absolutePadding
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.prayer_times.PrayerWidgetDisplay
import com.prayer_times.PrayerWidgetProvider
import com.prayer_times.R
import com.prayer_times.WidgetCard
import com.prayer_times.WidgetPayloadSource
import com.prayer_times.contract.NightMarks
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract
import com.prayer_times.contract.WidgetPayloadV1

/*
 * What every Glance widget shares: the payload as the contract's typed model,
 * the clock, the card, the text, the countdown and the taps.
 *
 * ── NO "HH:mm" ANYWHERE ───────────────────────────────────────────────
 *
 * The RemoteViews providers draw the v1 JSON, which carries times as
 * "05:12" strings they parse back (docs/rewrite-plan.md, Phase 1). These
 * read payload v2 through its generated reader — minutes after the day's
 * midnight, and the payload's clock — and every time is written by
 * `WallClock` and every instant computed by `WallClock.epochMs`. Nothing in
 * this package parses a formatted time, and there is no v1 fallback: a
 * payload without v2 (the app's fallback write, or an app older than 1.4)
 * draws the "Open Mihrab" placeholder until the app writes one.
 */

internal const val TAG = "MihrabGlance"

// ── Direction ────────────────────────────────────────────────────────────

/**
 * WHICH WAY A CARD READS (#118).
 *
 * In Mihrab's language, not the phone's. A launcher lays a widget out in its
 * own direction, and Glance pins every Row, Column and Box it inflates to
 * `layoutDirection="locale"` — the launcher's locale — so neither a frame
 * around the card nor anything else can turn it: with Mihrab in Arabic on an
 * English phone, Fajr stood on the left and Isha on the right. So the cards
 * say it themselves. `rtl`: Mihrab's language reads right to left.
 * `mirrored`: the launcher reads the other way, so a row's cells go in
 * reverse and start and end swap (`DirRow`, `dir`, `padStart`).
 */
internal data class WidgetDirection(val rtl: Boolean, val mirrored: Boolean) {
  companion object {
    fun of(context: Context): WidgetDirection {
      val rtl = PrayerWidgetProvider.localized(context).resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL
      val phone = Resources.getSystem().configuration.locales
      val hostRtl = !phone.isEmpty && TextUtils.getLayoutDirectionFromLocale(phone[0]) == View.LAYOUT_DIRECTION_RTL
      return WidgetDirection(rtl, rtl != hostRtl)
    }
  }
}

internal val LocalDirection = compositionLocalOf { WidgetDirection(rtl = false, mirrored = false) }

/** A row's cells, in reading order: `cell { … }` for each. */
internal class RowCells {
  internal val cells = ArrayList<@Composable RowScope.() -> Unit>()
  fun cell(content: @Composable RowScope.() -> Unit) {
    cells += content
  }
}

/** A Row in Mihrab's reading order: its cells reversed where the launcher reads the other way. */
@Composable
internal fun DirRow(
  modifier: GlanceModifier = GlanceModifier,
  horizontalAlignment: Alignment.Horizontal = Alignment.Start,
  verticalAlignment: Alignment.Vertical = Alignment.Top,
  build: RowCells.() -> Unit,
) {
  val cells = RowCells().apply(build).cells
  val mirrored = LocalDirection.current.mirrored
  Row(modifier = modifier, horizontalAlignment = dir(horizontalAlignment), verticalAlignment = verticalAlignment) {
    for (c in if (mirrored) cells.asReversed() else cells) c()
  }
}

/** A Column whose cells sit at the start of Mihrab's lines, not the launcher's. */
@Composable
internal fun DirColumn(
  modifier: GlanceModifier = GlanceModifier,
  verticalAlignment: Alignment.Vertical = Alignment.Top,
  horizontalAlignment: Alignment.Horizontal = Alignment.Start,
  content: @Composable ColumnScope.() -> Unit,
) = Column(modifier = modifier, verticalAlignment = verticalAlignment, horizontalAlignment = dir(horizontalAlignment), content = content)

/** A Box whose content sits by Mihrab's reading order. */
@Composable
internal fun DirBox(
  modifier: GlanceModifier = GlanceModifier,
  contentAlignment: Alignment = Alignment.TopStart,
  content: @Composable () -> Unit,
) = Box(modifier = modifier, contentAlignment = dir(contentAlignment), content = content)

/** Start and end in Mihrab's reading order. */
@Composable
internal fun dir(a: Alignment.Horizontal): Alignment.Horizontal =
  if (!LocalDirection.current.mirrored) a
  else when (a) {
    Alignment.Start -> Alignment.End
    Alignment.End -> Alignment.Start
    else -> a
  }

@Composable
internal fun dir(a: Alignment): Alignment = Alignment(dir(a.horizontal), a.vertical)

@Composable
internal fun dir(a: TextAlign): TextAlign =
  if (!LocalDirection.current.mirrored) a
  else when (a) {
    TextAlign.Start -> TextAlign.End
    TextAlign.End -> TextAlign.Start
    else -> a
  }

/**
 * A line laid out in Mihrab's direction inside a text view that the
 * launcher sets to its own (#118): the text in a directional isolate, so
 * "5 / 20" or "176 pages behind" reads as it does in the app and not with
 * its parts swapped round. Unchanged where the two directions agree.
 */
@Composable
internal fun isolated(text: String): String {
  val d = LocalDirection.current
  if (!d.mirrored || text.isEmpty()) return text
  return (if (d.rtl) "\u2067" else "\u2066") + text + "\u2069"
}

/** Space on the side a line starts from, in Mihrab's language (left or right, not the launcher's start). */
@Composable
internal fun GlanceModifier.padStart(d: Dp): GlanceModifier =
  if (LocalDirection.current.rtl) absolutePadding(right = d) else absolutePadding(left = d)

/** Space on the side a line ends at, in Mihrab's language. */
@Composable
internal fun GlanceModifier.padEnd(d: Dp): GlanceModifier =
  if (LocalDirection.current.rtl) absolutePadding(left = d) else absolutePadding(right = d)

/**
 * The colours the widgets draw in, in one place. The text colours follow the
 * user's choice (Settings → Widgets → Text colour, read by `sync` before a
 * card is composed); the state colours — danger, disabled — are fixed so a
 * missed prayer never reads as ordinary text.
 */
internal object Palette {
  @Volatile private var style: PrayerWidgetDisplay = PrayerWidgetDisplay.DEFAULT

  /** Read the user's text colour; called once per composition. */
  fun sync(context: Context) {
    style = PrayerWidgetDisplay.read(context)
  }

  val TEXT: Int get() = style.text
  val MUTED: Int get() = style.muted
  const val DANGER = 0xFFF87171.toInt()
  const val DISABLED = 0xFF6B7076.toInt()
  val REFRESH: Int get() = style.refresh
  val RULE: Int get() = style.rule
  val RULE_STRONG: Int get() = style.ruleStrong
}

/** The moment a card describes: one reading of the clock per composition. */
internal data class Now(val epochMs: Long, val dateKey: String, val minutes: Int) {
  companion object {
    fun current(): Now {
      val t = System.currentTimeMillis()
      return Now(t, WallClock.dateKey(t), WallClock.minutesOf(t))
    }
  }
}

/**
 * Payload v2, read through the contract's lenient generated reader, parsed
 * once per version of the string the app wrote (the same rule as
 * PrayerWidgetProvider.payload: keyed on content, so it cannot go stale).
 */
internal object GlancePayload {
  private var cachedRaw: String? = null
  private var cached: WidgetContract.Payload? = null

  @Synchronized
  fun read(context: Context): WidgetContract.Payload? {
    val raw = context
      .getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      .getString(WidgetPayloadSource.PREFS_KEY_V2, null)
    if (raw.isNullOrEmpty()) return null
    if (raw == cachedRaw) return cached
    val parsed = try {
      // A later schema is a different contract, not a lenient read of this one.
      WidgetContract.Payload.parse(raw)?.takeIf { it.schemaVersion == WidgetContract.VERSION }
    } catch (e: Exception) {
      Log.w(TAG, "payload v2 did not read", e)
      null
    }
    cachedRaw = raw
    cached = parsed
    return parsed
  }

  /**
   * The payload, unless its schedule no longer reaches today — the rule
   * every RemoteViews widget applies (`payloadHasExpired`): a streak, a
   * Hijri date or a "today" from a payload weeks old states someone
   * else's facts. Estimated days do not count; v1 never carried them.
   */
  fun live(context: Context, now: Now): WidgetContract.Payload? =
    read(context)?.takeUnless { p -> p.days.none { !it.estimated && it.dateKey >= now.dateKey } }

  /**
   * The Log's day (#81): the payload's `today` block while it is today's.
   *
   * The block is the journal as the app last saw it, written for the date
   * it was written on. The Log's day turns at local midnight, and a phone
   * left alone overnight has not run the app since: the card kept drawing
   * yesterday — its date, its ticks, "5 of 5" — until the app was opened,
   * and a tap on a chip the next morning was queued against yesterday.
   * So once the date has moved on, the block is rolled forward here from
   * the schedule the payload already carries: today's five at today's
   * times, nothing recorded. That is what the journal holds for a day
   * nobody has logged yet; anything tapped on the card since is in the
   * queue, which the card adds on top. Null when the payload has no entry
   * for today, and the card says it does not know rather than guess.
   */
  fun todayOf(p: WidgetContract.Payload, now: Now): WidgetContract.Today? {
    val block = p.today ?: return null
    // Today's, or ahead of the clock (a clock set back): as written.
    if (block.dateKey >= now.dateKey) return block
    val day = p.days.firstOrNull { it.dateKey == now.dateKey && !it.estimated }
      ?: p.days.firstOrNull { it.dateKey == now.dateKey }
      ?: return null
    return WidgetContract.Today(
      dateKey = now.dateKey,
      logged = 0,
      loggable = block.loggable,
      owed = 0,
      prayers = block.prayers.map { pr ->
        WidgetContract.TodayPrayer(
          key = pr.key,
          name = pr.name,
          minutes = day.prayers.firstOrNull { it.key == pr.key }?.minutes,
          status = null,
          due = false,
        )
      },
    )
  }

  /**
   * Whether the payload's single-day blocks (`today`, `hijri`) are about
   * today: the `today` block's own date, else the first real day's.
   */
  fun describesToday(p: WidgetContract.Payload, now: Now): Boolean {
    val stamped = p.today?.dateKey?.takeIf { it.isNotEmpty() }
    if (stamped != null) return stamped == now.dateKey
    return p.days.firstOrNull { !it.estimated }?.dateKey == now.dateKey
  }
}

/**
 * Asks every running Glance session to draw again.
 *
 * A session's composition only re-runs when state it read changes, and the
 * payload lives in SharedPreferences, which Compose cannot observe. So every
 * card reads this counter first, and every path that changes what a card
 * would draw (a payload write, a tap, a prayer boundary) bumps it before
 * asking Glance to update: the sessions already running recompose, and the
 * ones that are not start from `provideGlance` and read everything fresh.
 */
internal object GlanceRefresh {
  // `mutableStateOf`, not `mutableIntStateOf`: the second is Compose 1.5,
  // and the runtime Glance 1.1 brings is older — the first real build with
  // the flag stopped here.
  private val version = mutableStateOf(0)

  /** Read inside a composition to be recomposed by `bump`. */
  fun observe(): Int = version.value

  fun bump() {
    Snapshot.withMutableSnapshot { version.value += 1 }
  }
}

// ── Time ─────────────────────────────────────────────────────────────────

/** One time on one day: what "next" and a countdown aim at. */
internal class Event(
  val row: WidgetContract.Row,
  val day: WidgetContract.Day,
  /** Minutes after the midnight that starts `day` (may pass 1440). */
  val minutes: Int,
  /** Minutes after the midnight that starts the day being drawn. */
  val at: Int,
) {
  /** The instant it happens — on the payload's own date, never "now + n". */
  fun epochMs(): Long? = WallClock.epochMs(day.dateKey, minutes)

  fun label(): String = row.name.trim().ifEmpty { row.abbr.trim() }.ifEmpty { row.key }
}

/**
 * Which day a prayer card draws and what comes next — the same rules as the
 * v1 adapter (`WidgetPayloadV1.fromV2`, held to the app's TS by the contract
 * fixtures) and the RemoteViews renderer on top of it.
 */
internal class Schedule(
  /** The day whose times are drawn: today's own entry while there is one. */
  val table: WidgetContract.Day,
  /**
   * The day the v1 adapter called "shown" — today while any of its times is
   * still ahead, else the day after. Its label is the payload's `dayLabel`.
   */
  val shown: WidgetContract.Day,
  val next: Event?,
  /**
   * The last of the five to have come in — what a card counts up from for a
   * while (#111). Never Sunrise or a night mark. Last night's ʿIshāʾ in the
   * small hours; null on a later day.
   */
  val came: Event? = null,
  /** Minutes after the drawn day's midnight; -1 when it is a later day. */
  val nowMinutes: Int = -1,
) {
  companion object {
    fun of(p: WidgetContract.Payload, now: Now): Schedule? {
      val days = p.days
      if (days.isEmpty()) return null
      var todayIndex = days.indexOfFirst { it.dateKey == now.dateKey }
      var nowMinutes = now.minutes
      if (todayIndex < 0) {
        // Written before today and not yet expired, or after it (a clock set
        // back): the first day not yet past, and on a later day everything
        // is still ahead.
        todayIndex = days.indexOfFirst { it.dateKey > now.dateKey }
        if (todayIndex < 0) todayIndex = days.size - 1 else nowMinutes = -1
      }
      val today = days[todayIndex]
      val tomorrow = days.getOrNull(todayIndex + 1)
      val ahead = eventsOf(today, 0).filter { it.at > nowMinutes }
      // The day before today, while one of its rows past its midnight (an
      // ʿIshāʾ at 1442) is still ahead: what comes next in the small hours.
      val yesterday = if (today.dateKey == now.dateKey && todayIndex > 0) days[todayIndex - 1] else null
      val behind =
        if (yesterday == null || yesterday.estimated) emptyList()
        else eventsOf(yesterday, -WallClock.MINUTES_PER_DAY).filter { it.at > nowMinutes }
      val soon = behind + ahead
      val next =
        if (tomorrow?.estimated == true) {
          // An estimated day repeats the day before; only its Fajr is offered.
          earliest(soon) ?: earliest(eventsOf(tomorrow, WallClock.MINUTES_PER_DAY).filter { it.row.key == "Fajr" })
        } else {
          earliest(soon + (tomorrow?.let { eventsOf(it, WallClock.MINUTES_PER_DAY) } ?: emptyList()))
        }
      val shown = if (ahead.isNotEmpty() || tomorrow == null) today else tomorrow
      // The table is today's own entry while there is one — the times roll
      // at midnight, not at Isha, and "next" says what tomorrow brings. With
      // no entry for today, the day the adapter would show.
      val table = if (today.dateKey == now.dateKey) today else shown
      val came = if (nowMinutes < 0) null else {
        val before = yesterday?.takeUnless { it.estimated }?.let { eventsOf(it, -WallClock.MINUTES_PER_DAY) }.orEmpty()
        (before + eventsOf(today, 0))
          .filter { it.row.key in WidgetPayloadV1.SINCE_ADHAN_KEYS && it.at <= nowMinutes }
          .maxByOrNull { it.at }
      }
      return Schedule(table, shown, next, came, nowMinutes)
    }

    /** Every time on a day, placed `offset` minutes from the drawn day's midnight. */
    fun eventsOf(day: WidgetContract.Day, offset: Int): List<Event> {
      val rows = day.prayers + listOfNotNull(day.sunrise) + day.extras
      return rows.mapNotNull { r -> r.minutes?.let { Event(r, day, it, offset + it) } }
    }

    fun earliest(events: List<Event>): Event? = events.minByOrNull { it.at }
  }
}

internal fun isNightKey(key: String): Boolean = NightMarks.isNightKey(key)

/** How the meridiem is drawn beside the digits: 62%, as `styledTime` does. */
internal const val MERIDIEM_SCALE = 0.62f

/**
 * The clock, digits at `sp` and the period (when there is one) at 62% on
 * the side the locale writes it — `WallClock.parts`, never a parsed string.
 */
@Composable
internal fun ClockText(
  minutes: Int?,
  clock: WidgetContract.Clock,
  sp: Float,
  color: Int,
  medium: Boolean = true,
  modifier: GlanceModifier = GlanceModifier,
) {
  if (minutes == null) {
    Label(WallClock.NO_TIME, sp, color, medium = medium, modifier = modifier)
    return
  }
  val parts = WallClock.parts(minutes, clock)
  val period = parts.period
  if (period.isNullOrEmpty()) {
    Label(parts.digits, sp, color, medium = medium, modifier = modifier)
    return
  }
  // In the order the RemoteViews cards show it. They draw the time as ONE
  // string with the period in a smaller span, and the TextView orders it by
  // the string's own direction (first strong character): "5:31 م" reads
  // "م 5:31" on screen. Glance text takes no spans, so here it is two Texts
  // in a Row — and a Row is laid out in the HOST's direction, which follows
  // the phone's language, not Mihrab's. The children go in logical order
  // when the two directions agree and reversed when they do not, so an
  // Arabic time on an English phone (or the other way round) reads as the
  // RemoteViews card does.
  val logical = if (parts.periodFirst) period + parts.digits else parts.digits + " " + period
  val textRtl = TextDirectionHeuristics.FIRSTSTRONG_LTR.isRtl(logical, 0, logical.length)
  val hostRtl = Resources.getSystem().configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL
  val first: @Composable () -> Unit
  val second: @Composable () -> Unit
  if (parts.periodFirst) {
    first = { Label(period, sp * MERIDIEM_SCALE, color, medium = medium) }
    second = { Label(parts.digits, sp, color, medium = medium) }
  } else {
    first = { Label(parts.digits, sp, color, medium = medium) }
    second = { Label(" $period", sp * MERIDIEM_SCALE, color, medium = medium) }
  }
  Row(modifier = modifier, verticalAlignment = Alignment.Bottom) {
    if (textRtl == hostRtl) {
      first()
      second()
    } else {
      second()
      first()
    }
  }
}

/**
 * The largest size, from `maxSp` down to `minSp` in half points, at which
 * every one of `times` fits `availableDp` with its meridiem drawn small —
 * `PrayerWidgetProvider.stripTimeSizeSp`, measured from `WallClock.parts`.
 * Glance cannot auto-size text, and not every host honours auto-sizing on a
 * RemoteViews TextView anyway; measuring here is what the strip already did.
 */
internal fun fitTimesSp(
  context: Context,
  times: List<Int?>,
  clock: WidgetContract.Clock,
  availableDp: Float,
  maxSp: Float,
  minSp: Float,
): Float {
  if (times.isEmpty() || availableDp <= 0f) return maxSp
  val metrics = context.resources.displayMetrics
  val available = availableDp * metrics.density
  val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
  }
  fun width(minutes: Int?, sp: Float): Float {
    val scaled = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics)
    if (minutes == null) {
      paint.textSize = scaled
      return paint.measureText(WallClock.NO_TIME)
    }
    val p = WallClock.parts(minutes, clock)
    paint.textSize = scaled
    var w = paint.measureText(p.digits)
    p.period?.takeIf { it.isNotEmpty() }?.let {
      // Its own size in sp, as `ClockText` draws it — not a share of the
      // digits' pixels: from Android 14 font scaling is non-linear, and
      // small text is scaled up more than large.
      paint.textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp * MERIDIEM_SCALE, metrics)
      w += paint.measureText(if (p.periodFirst) it else " $it")
    }
    return w
  }
  var sp = maxSp
  while (sp > minSp && times.any { width(it, sp) > available }) sp -= 0.5f
  return sp
}

/** The largest size in `minSp..maxSp` at which one line of `text` fits `availableDp`. */
internal fun fitTextSp(
  context: Context,
  text: String,
  availableDp: Float,
  maxSp: Float,
  minSp: Float,
  medium: Boolean,
): Float {
  if (text.isEmpty() || availableDp <= 0f) return maxSp
  val metrics = context.resources.displayMetrics
  val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(if (medium) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
  }
  var sp = maxSp
  while (sp > minSp) {
    paint.textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics)
    if (paint.measureText(text) <= availableDp * metrics.density) break
    sp -= 0.5f
  }
  return sp
}

/** The width one line of text takes, in dp. */
/** A line of text at `sp`, as tall as a TextView draws it (font padding included). */
internal fun textLineDp(context: Context, sp: Float, medium: Boolean): Float {
  val metrics = context.resources.displayMetrics
  val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(if (medium) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
    textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics)
  }
  val fm = paint.fontMetrics
  return (fm.bottom - fm.top) / metrics.density
}

/**
 * How tall a line of `text` is drawn, in dp — as a TextView lays it out,
 * fallback fonts included. `textLineDp` is the widgets' own face, Latin;
 * Arabic, Bengali or Hindi text falls back to a font whose line is taller,
 * and a TextView grows to hold it (#118: the Log card's names in Arabic
 * pushed its times off a short card that holds them in English).
 */
internal fun textHeightDp(context: Context, text: String, sp: Float, medium: Boolean): Float {
  if (text.isEmpty()) return textLineDp(context, sp, medium)
  val metrics = context.resources.displayMetrics
  val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(if (medium) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
    textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics)
  }
  val layout = android.text.StaticLayout.Builder.obtain(text, 0, text.length, paint, 100_000)
    .setIncludePad(true)
    .setMaxLines(1)
    .apply { if (android.os.Build.VERSION.SDK_INT >= 28) setUseLineSpacingFromFallbacks(true) }
    .build()
  return maxOf(layout.height / metrics.density, textLineDp(context, sp, medium))
}

internal fun textWidthDp(context: Context, text: String, sp: Float, medium: Boolean): Float {
  val metrics = context.resources.displayMetrics
  val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create(if (medium) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
    textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics)
  }
  return paint.measureText(text) / metrics.density
}

// ── Drawing ──────────────────────────────────────────────────────────────

/** The card's size as the launcher hands it, in whole dp; 0 when unmeasured. */
internal data class CardSize(val widthDp: Int, val heightDp: Int)

/**
 * THE SIZES A STRETCHED CARD MAY BE, for `SizeMode.Responsive`.
 *
 * The cards are fixed heights (the manifest's resizeMode is horizontal),
 * and a launcher that keeps to that hands `SizeMode.Exact` the one size
 * the card is. Nova does not: it lets a card be stretched to any height
 * and goes on reporting the size it was placed at, so every layout was
 * built for a card it was not — the graph drawn for a 44dp box filled a
 * 500dp card as a strip of dots, and a stretched 4×1 log left its lower
 * half empty. With these, the layouts go to the host as a size map and
 * the host view picks the one that fits by its OWN measured size
 * (AppWidgetHostView re-picks on every layout), whatever the launcher
 * reports.
 *
 * Sixteen is RemoteViews' ceiling for a size map. Two widths — a five-
 * and a four-column home screen's four cells — and the heights where the
 * layouts change: the strip's 66/92/112/134 steps, then the TWO-ROW BAND
 * in 16dp steps, where the tall cards' graph fills its room
 * (GRAPH_BAND_TOP_DP), and one size above it, where it stops growing. The
 * narrow width gets the coarse steps; there are not sixteen to go round.
 *
 * The band is the tall cards' default size on every launcher we have
 * measured: two rows are 201dp on the Pixel launcher and 259dp on Nova
 * (Pixel 10 Pro, `dumpsys activity com.teslacoilsw.launcher`), and Nova's
 * row and a half is 190dp — the steps land on 190 and 254 so the two
 * sizes people place most get a graph drawn for their own height. The
 * steps are what the graph may come out short of its room by, before the
 * graph is stretched to its room (`spreadScale`).
 */
internal val STRETCHABLE_SIZES: Set<DpSize> = buildSet {
  for (h in listOf(66, 92, 112, 134, 176, 190, 206, 222, 238, 254, GRAPH_BAND_TOP_DP, GRAPH_SPREAD_MAX_DP)) add(DpSize(370.dp, h.dp))
  for (h in listOf(66, 112, 176, 240)) add(DpSize(280.dp, h.dp))
}

/**
 * THE TALL CARDS' GRAPH FILLS ITS ROOM AT THE DEFAULT SIZE, AND ONLY THERE.
 *
 * Up to the top of the two-row band the graph is drawn for the card it is
 * on and spread over whatever the layout's step left over; a card
 * stretched taller than that gets the band's graph, not a bigger one — a
 * card that grew its graph with its height would only invite being made
 * larger than it is meant to be.
 */
internal const val GRAPH_BAND_TOP_DP = 270

/** The first size above the band: from here on the graph is the band's and sits in its room unspread. */
internal const val GRAPH_SPREAD_MAX_DP = 300

/**
 * How the tall cards' graph meets its room in the two-row band: STRETCHED
 * to it, so it reaches the room's four edges whatever the launcher made of
 * the card, and the days grow with the room rather than the gaps.
 *
 * The graph is drawn for its size map's box, and the card's room is a
 * little more on each side — up to a step taller (16dp on a box of 60 to
 * 100) and a few percent wider — so the days come out within a tenth or so
 * of square, which PracticeGridBitmap already allows itself (MAX_ROW_RATIO).
 *
 * Fitting the whole kept the days square and left the rest as a band of
 * empty card; cutting the rows apart and fitting each spread the rest
 * between them, but a row fitted by its slot's height is scaled by that
 * height, the slots are whole pixels, and rows a pixel apart came out a few
 * percent different in width — the days stopped lining up from row to row.
 * A stretched image has one scale per axis, so they cannot.
 */
internal fun spreadScale(spread: Boolean): ContentScale = if (spread) ContentScale.FillBounds else ContentScale.Fit

@Composable
internal fun cardSize(): CardSize {
  val s = LocalSize.current
  return CardSize(s.width.value.toInt().coerceAtLeast(0), s.height.value.toInt().coerceAtLeast(0))
}

/** A context whose string table speaks Mihrab's language, not the phone's. */
@Composable
internal fun localizedContext(): Context = PrayerWidgetProvider.localized(LocalContext.current)

/** The user's card colour and accent — the same reader every widget uses. */
internal data class Colors(val background: Int, val accent: Int) {
  companion object {
    fun of(context: Context): Colors {
      val (bg, accent) = PrayerWidgetProvider.resolvedColors(context)
      return Colors(bg, accent)
    }
  }
}

internal fun provider(argb: Int): ColorProvider = ColorProvider(Color(argb))

/** One line of text in the widgets' type: sans-serif, or its medium weight. */
@Composable
internal fun Label(
  text: String,
  sp: Float,
  color: Int,
  modifier: GlanceModifier = GlanceModifier,
  medium: Boolean = false,
  maxLines: Int = 1,
  align: TextAlign? = null,
) {
  Text(
    text = isolated(text),
    modifier = modifier,
    style = TextStyle(
      color = provider(color),
      fontSize = sp.sp,
      fontWeight = if (medium) FontWeight.Medium else FontWeight.Normal,
      // In Mihrab's reading order: a line starts on the right in Arabic on an English phone too (#118).
      textAlign = dir(align ?: TextAlign.Start),
    ),
    maxLines = maxLines,
  )
}

/**
 * The card every widget draws on, inset from the host view.
 *
 * Not `background(color).cornerRadius(…)`: Glance's corner radius is
 * Android 12+ only, and below that the card would be a square slab again —
 * the bug `WidgetCard` exists to end. So the card is the RemoteViews one,
 * embedded: the same white rounded drawable, recoloured by
 * `WidgetCard.paint` (colour filter plus image alpha, API 16+), at every
 * API level the app supports.
 */
@Composable
internal fun MihrabCard(
  background: Int,
  onClick: Action?,
  contentPadding: Dp = 10.dp,
  verticalPadding: Dp = contentPadding,
  content: @Composable () -> Unit,
) {
  val context = LocalContext.current
  val card = RemoteViews(context.packageName, R.layout.glance_card).also { WidgetCard.paint(it, background) }
  DirBox(modifier = GlanceModifier.fillMaxSize().padding(R.dimen.widget_card_inset)) {
    AndroidRemoteViews(card, GlanceModifier.fillMaxSize())
    val inner = GlanceModifier.fillMaxSize().padding(horizontal = contentPadding, vertical = verticalPadding)
    DirBox(modifier = if (onClick != null) inner.clickable(onClick) else inner) {
      content()
    }
  }
}

/**
 * A 1dp rule across the card, with the margins the layouts gave it — one
 * element, not three: a Glance Row, Column or Box takes at most ten
 * children, and the strip is close to that.
 */
@Composable
internal fun Rule(color: Int, top: Int, bottom: Int) {
  DirBox(modifier = GlanceModifier.fillMaxWidth().padding(top = top.dp, bottom = bottom.dp)) {
    DirBox(modifier = GlanceModifier.fillMaxWidth().height(1.dp).background(provider(color))) {}
  }
}

/**
 * How tall a row of labels is drawn, in dp: the tallest of `texts` at
 * `sp`, as a TextView lays each out (fallback fonts and the system's font
 * size included), or the face's own line when there is no text.
 *
 * THE CARDS' HEIGHTS ARE SUMMED FROM THESE, NOT MEASURED ONCE AND KEPT.
 * The room a card has for its graph is its height less everything else on
 * it, and "everything else" used to be a constant read off one phone's
 * view tree (161dp, 108dp, 125dp…): right there, and wrong wherever a line
 * came out another height — a larger font size, Arabic names, the night
 * marks switched on, a bigger time. A graph drawn for the wrong room is
 * stretched or left floating. `rule` is the rule's own dp, for the sums.
 */
internal fun rowDp(context: Context, sp: Float, medium: Boolean, vararg texts: String?): Float =
  texts.filterNotNull().filter { it.isNotEmpty() }.maxOfOrNull { textHeightDp(context, it, sp, medium) }
    ?: textLineDp(context, sp, medium)

/** A `Rule(top, bottom)`'s height: its margins and its 1dp line. */
internal fun ruleDp(top: Int, bottom: Int): Float = top + 1f + bottom

/** The card's inset from the host view (R.dimen.widget_card_inset), both sides, in dp. */
internal fun cardInsetsDp(context: Context): Float =
  2 * context.resources.getDimension(R.dimen.widget_card_inset) / context.resources.displayMetrics.density

/** The one-line message a card shows in place of its content. */
@Composable
internal fun Placeholder(text: String, sp: Float = 12f, color: Int = Palette.MUTED) {
  DirBox(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Label(text, sp, color, maxLines = 3, align = TextAlign.Center)
  }
}

/**
 * The error card: "Couldn't load widget (SomeException)" in the error red,
 * class name only — the message can carry payload content and goes to the
 * log. `WidgetErrorCard`'s rule, for a failure while the model was built.
 */
@Composable
internal fun ErrorContent(context: Context, e: Throwable) {
  val label = try { context.getString(R.string.widget_error) } catch (_: Exception) { "Couldn't load widget" }
  Placeholder("$label (${e.javaClass.simpleName})", color = Palette.DANGER)
}

/**
 * Build the card's model, and on a throw draw the error card rather than
 * letting Glance show its own "widget error" layout. The model is plain
 * data, so everything that can throw on a bad payload happens here, where
 * the name of the exception can reach the card.
 */
internal inline fun <T> guarded(what: String, build: () -> T): Result<T> =
  try {
    Result.success(build())
  } catch (e: Exception) {
    Log.e(PrayerWidgetProvider.WIDGET_LOG_TAG, "$what glance widget failed", e)
    Result.failure(e)
  }

/**
 * The same clock counting UP from a prayer that has come in — "12:34 since
 * Dhuhr" (#111). `format` is the whole line with the clock's `%1$s` left
 * in (the prayer's name already written into it). The alarm at the end of
 * the window redraws the card back to its countdown.
 */
@Composable
internal fun CountUp(sinceEpochMs: Long, format: String, now: Now, sp: Float, color: Int, modifier: GlanceModifier = GlanceModifier) {
  val context = localizedContext()
  val elapsed = now.epochMs - sinceEpochMs
  if (elapsed < 0) return
  // At the end of the frame Glance stretches around it, where the row is
  // mirrored, so it stays beside what it counts down to (#118).
  val layout = if (LocalDirection.current.mirrored) R.layout.glance_countdown_end else R.layout.glance_countdown
  val dirIso = LocalDirection.current
  fun iso(f: String) = if (!dirIso.mirrored) f else (if (dirIso.rtl) "\u2067" else "\u2066") + f + "\u2069"
  val views = RemoteViews(context.packageName, layout).apply {
    setChronometerCountDown(R.id.glance_countdown, false)
    setChronometer(R.id.glance_countdown, SystemClock.elapsedRealtime() - elapsed, iso(format), true)
    setTextColor(R.id.glance_countdown, color)
    setTextViewTextSize(R.id.glance_countdown, TypedValue.COMPLEX_UNIT_SP, sp)
  }
  AndroidRemoteViews(views, modifier)
}

/**
 * A system-ticked countdown, which Glance has no composable for.
 *
 * A Chronometer counts itself down at no refresh cost (the RemoteViews
 * widgets' own answer), so it is embedded as RemoteViews: base on the
 * elapsed-realtime clock, from the instant the event happens.
 */
@Composable
internal fun Countdown(targetEpochMs: Long, now: Now, sp: Float, color: Int, modifier: GlanceModifier = GlanceModifier) {
  val context = localizedContext()
  val left = targetEpochMs - now.epochMs
  if (left < 0) return
  // At the end of the frame Glance stretches around it, where the row is
  // mirrored, so it stays beside what it counts down to (#118).
  val layout = if (LocalDirection.current.mirrored) R.layout.glance_countdown_end else R.layout.glance_countdown
  val dirIso = LocalDirection.current
  fun iso(f: String) = if (!dirIso.mirrored) f else (if (dirIso.rtl) "\u2067" else "\u2066") + f + "\u2069"
  val views = RemoteViews(context.packageName, layout).apply {
    setChronometerCountDown(R.id.glance_countdown, true)
    setChronometer(
      R.id.glance_countdown,
      SystemClock.elapsedRealtime() + left,
      iso(context.getString(R.string.widget_countdown_format)),
      true,
    )
    setTextColor(R.id.glance_countdown, color)
    setTextViewTextSize(R.id.glance_countdown, TypedValue.COMPLEX_UNIT_SP, sp)
  }
  AndroidRemoteViews(views, modifier)
}

/**
 * Open the app on a mihrab:// route, the destination every RemoteViews
 * widget taps into (#27, #31). `setPackage` so nothing else can answer the
 * implicit VIEW.
 */
internal fun openRoute(context: Context, uri: String, clearTop: Boolean = false): Action =
  actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (clearTop) addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
    },
  )
