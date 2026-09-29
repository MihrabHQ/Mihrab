package com.prayer_times.glance

import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.SystemClock
import android.text.TextPaint
import android.util.Log
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.prayer_times.PrayerWidgetProvider
import com.prayer_times.R
import com.prayer_times.WidgetCard
import com.prayer_times.WidgetPayloadSource
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract

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

/** The colours the RemoteViews layouts declare, in one place. */
internal object Palette {
  const val TEXT = 0xFFE8EAED.toInt()
  const val MUTED = 0xFF9AA0A6.toInt()
  const val DANGER = 0xFFF87171.toInt()
  const val DISABLED = 0xFF6B7076.toInt()
  const val REFRESH = 0x80FFFFFF.toInt()
  const val RULE = 0x1FFFFFFF
  const val RULE_STRONG = 0x26FFFFFF
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
      WidgetContract.Payload.parse(raw)
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
  private val version = mutableIntStateOf(0)

  /** Read inside a composition to be recomposed by `bump`. */
  fun observe(): Int = version.intValue

  fun bump() {
    Snapshot.withMutableSnapshot { version.intValue += 1 }
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
internal class Schedule(val table: WidgetContract.Day, val next: Event?) {
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
      val next =
        if (tomorrow?.estimated == true) {
          // An estimated day repeats the day before; only its Fajr is offered.
          earliest(ahead) ?: earliest(eventsOf(tomorrow, WallClock.MINUTES_PER_DAY).filter { it.row.key == "Fajr" })
        } else {
          earliest(ahead + (tomorrow?.let { eventsOf(it, WallClock.MINUTES_PER_DAY) } ?: emptyList()))
        }
      // The table is today's own entry while there is one — the times roll
      // at midnight, not at Isha, and "next" says what tomorrow brings. With
      // no entry for today, the day the adapter would show.
      val table =
        if (days[todayIndex].dateKey == now.dateKey) today
        else if (ahead.isNotEmpty() || tomorrow == null) today
        else tomorrow
      return Schedule(table, next)
    }

    /** Every time on a day, placed `offset` minutes from the drawn day's midnight. */
    fun eventsOf(day: WidgetContract.Day, offset: Int): List<Event> {
      val rows = day.prayers + listOfNotNull(day.sunrise) + day.extras
      return rows.mapNotNull { r -> r.minutes?.let { Event(r, day, it, offset + it) } }
    }

    fun earliest(events: List<Event>): Event? = events.minByOrNull { it.at }
  }
}

internal fun isNightKey(key: String): Boolean =
  key.equals("Midnight", ignoreCase = true) ||
    key.equals("Lastthird", ignoreCase = true) ||
    key.equals("Firstthird", ignoreCase = true)

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
  Row(modifier = modifier, verticalAlignment = Alignment.Bottom) {
    if (parts.periodFirst) Label(period, sp * MERIDIEM_SCALE, color, medium = medium)
    Label(parts.digits, sp, color, medium = medium)
    if (!parts.periodFirst) Label(" $period", sp * MERIDIEM_SCALE, color, medium = medium)
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
      paint.textSize = scaled * MERIDIEM_SCALE
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
    text = text,
    modifier = modifier,
    style = TextStyle(
      color = provider(color),
      fontSize = sp.sp,
      fontWeight = if (medium) FontWeight.Medium else FontWeight.Normal,
      textAlign = align,
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
  content: @Composable () -> Unit,
) {
  val context = LocalContext.current
  val card = RemoteViews(context.packageName, R.layout.glance_card).also { WidgetCard.paint(it, background) }
  Box(modifier = GlanceModifier.fillMaxSize().padding(R.dimen.widget_card_inset)) {
    AndroidRemoteViews(card, GlanceModifier.fillMaxSize())
    val inner = GlanceModifier.fillMaxSize().padding(contentPadding)
    Box(modifier = if (onClick != null) inner.clickable(onClick) else inner) {
      content()
    }
  }
}

/** The one-line message a card shows in place of its content. */
@Composable
internal fun Placeholder(text: String, sp: Float = 12f, color: Int = Palette.MUTED) {
  Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
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
  val views = RemoteViews(context.packageName, R.layout.glance_countdown).apply {
    setChronometerCountDown(R.id.glance_countdown, true)
    setChronometer(
      R.id.glance_countdown,
      SystemClock.elapsedRealtime() + left,
      context.getString(R.string.widget_countdown_format),
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
