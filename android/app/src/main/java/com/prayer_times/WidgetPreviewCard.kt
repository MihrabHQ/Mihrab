package com.prayer_times

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.prayer_times.contract.WidgetContract
import com.prayer_times.glance.WidgetSample
import com.prayer_times.glance.practiceGrid
import org.json.JSONArray

/**
 * The sample of a prayer-times widget: the card as the home screen will
 * show it, on a stand-in wallpaper, drawn from the day the widgets hold.
 *
 * ONE DRAWING, TWO PLACES. The widget's own settings screen
 * (PrayerWidgetConfigureActivity, touch and hold a widget → Settings) shows
 * the card it was opened from — the Next prayer card, the Prayer times
 * strip, or the tall card with its graph — following every control before
 * anything is saved. The app's Settings → Widgets cannot know which the
 * reader has placed (and they may have placed both), so it shows the strip
 * and the tall card together (`PrayerWidgetModule.renderPreviews`).
 *
 * It was the strip alone in the first place, whichever widget was held:
 * someone setting up the tall card was shown a card that was not theirs.
 *
 * A sample, not the widget: plain views sized like the card's lines, not
 * the Glance composition itself — but the names, the times, the next prayer
 * and the graph are the reader's own (`WidgetSample`).
 */
internal object WidgetPreviewCard {

  /** The picker's three entries (PrayerGlanceWidget.Entry). */
  enum class Kind { SMALL, STRIP, TALL }

  /** How the card is drawn: the settings as chosen so far. */
  class Look(
    val opacity: Int,
    val cardRgb: Int,
    val text: Int,
    val accent: Int,
    val showLocation: Boolean,
    val showCountdown: Boolean,
    val showTable: Boolean,
    val timeScalePercent: Int,
  )

  private const val TIME_SP = 17f
  private const val SAMPLE_COUNTDOWN = "1:23:45"
  /** The tall card's graph: the room it has on a 4×2 card, near enough. */
  private const val GRAPH_DP = 84
  private const val GRID_DAYS = 210
  /** The wallpaper's padding round the cards, and between two of them. */
  const val WALL_PAD_DP = 14f
  private const val CARD_GAP_DP = 12f
  private const val CARD_PAD_H_DP = 10f

  /** The sample's times when the widgets hold no day yet: figures alone. */
  private val FALLBACK_ROWS = listOf("05:03", "07:19", "11:37", "13:15", "15:44", "17:44")
    .mapIndexed { i, t -> WidgetSample.Row("", t, i == 3) }

  /** Which card a placed widget is, by its receiver; null for a widget that is not a prayer-times one. */
  fun kindOf(providerClass: String?): Kind? = when (providerClass) {
    NextPrayerWidgetReceiver::class.java.name -> Kind.SMALL
    TimesWidgetReceiver::class.java.name -> Kind.STRIP
    TimesTallWidgetReceiver::class.java.name -> Kind.TALL
    else -> null
  }

  /** The look the widgets are drawn in now, from what is stored. */
  fun storedLook(context: Context): Look {
    val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val colors = try {
      PrayerWidgetProvider.resolvedColors(context)
    } catch (_: Exception) {
      Pair(0xFF101418.toInt(), Color.parseColor("#46A081"))
    }
    val textHex = PrayerWidgetConfigureActivity.normaliseHex(prefs.getString(PrayerWidgetDisplay.KEY_TEXT_HEX, "")) ?: "#E8EAED"
    val display = PrayerWidgetDisplay.read(context)
    return Look(
      opacity = prefs.getInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, 88).coerceIn(0, 100),
      cardRgb = colors.first and 0x00FFFFFF,
      text = Color.parseColor(textHex),
      accent = colors.second,
      showLocation = display.showLocation,
      showCountdown = display.showCountdown,
      showTable = display.showTable,
      timeScalePercent = Math.round(display.timeScale * 100),
    )
  }

  /**
   * The wallpaper filled with the cards, top to bottom. `innerWidthPx` is
   * the width the cards have: the wallpaper's own, less its padding.
   */
  fun fill(wall: LinearLayout, kinds: List<Kind>, look: Look, sample: WidgetSample?, innerWidthPx: Int) {
    val context = wall.context
    // A stand-in wallpaper, light at one corner and dark at the other, so
    // the background's strength and a dark or a light text can both be
    // judged against it.
    if (wall.background == null) {
      wall.background = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        intArrayOf(0xFFE2B98C.toInt(), 0xFF5F7E9C.toInt(), 0xFF1F2A3A.toInt()),
      ).apply { cornerRadius = dp(context, 22f) }
    }
    wall.removeAllViews()
    kinds.forEachIndexed { i, kind ->
      // The Next prayer card is the small one: a little over half the row.
      val width = if (kind == Kind.SMALL) (innerWidthPx * 0.6f).toInt() else innerWidthPx
      val lp = LinearLayout.LayoutParams(width, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        gravity = Gravity.CENTER_HORIZONTAL
        if (i > 0) topMargin = dp(context, CARD_GAP_DP).toInt()
      }
      wall.addView(card(context, kind, look, sample, width), lp)
    }
  }

  /** The cards on their wallpaper as a picture `widthPx` wide — for the app's settings page. */
  fun bitmap(context: Context, kinds: List<Kind>, look: Look, sample: WidgetSample?, widthPx: Int): Bitmap {
    val pad = dp(context, WALL_PAD_DP).toInt()
    val wall = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(pad, pad, pad, pad)
    }
    fill(wall, kinds, look, sample, widthPx - 2 * pad)
    wall.measure(
      View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )
    wall.layout(0, 0, wall.measuredWidth, wall.measuredHeight)
    val bitmap = Bitmap.createBitmap(wall.measuredWidth.coerceAtLeast(1), wall.measuredHeight.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    wall.draw(Canvas(bitmap))
    return bitmap
  }

  private fun card(context: Context, kind: Kind, look: Look, sample: WidgetSample?, widthPx: Int): View {
    val text = look.text
    val muted = (text and 0x00FFFFFF) or (0xA6 shl 24)
    val accent = look.accent
    val padH = dp(context, CARD_PAD_H_DP).toInt()
    val innerPx = widthPx - 2 * padH
    val rows = sample?.rows ?: FALLBACK_ROWS
    val next = rows.firstOrNull { it.next } ?: rows.firstOrNull()
    // The Next prayer card has no table to show or hide.
    val withTable = kind != Kind.SMALL && look.showTable
    val scale = if (kind == Kind.SMALL) 1f else look.timeScalePercent / 100f

    val card = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padH, dp(context, 12f).toInt(), padH, dp(context, 12f).toInt())
      background = GradientDrawable().apply {
        cornerRadius = dp(context, 18f)
        setColor((look.opacity * 255 / 100 shl 24) or look.cardRgb)
      }
    }

    val header = listOfNotNull(
      sample?.dayLabel?.takeIf { it.isNotEmpty() },
      sample?.location?.takeIf { look.showLocation && it.isNotEmpty() },
    ).joinToString(" · ")
    if (header.isNotEmpty()) card.addView(line(context, header, 10f, muted))

    if (withTable) {
      val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        isBaselineAligned = false
      }
      for (r in rows) {
        val column = LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER_HORIZONTAL
          setPadding(0, dp(context, 4f).toInt(), 0, dp(context, 4f).toInt())
          if (r.next) {
            background = GradientDrawable().apply {
              cornerRadius = dp(context, 10f)
              setColor((text and 0x00FFFFFF) or (0x24 shl 24))
            }
          }
        }
        if (r.name.isNotEmpty()) {
          column.addView(line(context, r.name, 9f, if (r.next) accent else muted, medium = true, centre = true))
        }
        // As the widget does: the size asked for, where the column has room for it.
        val sp = (TIME_SP * scale).coerceAtMost(timeCapSp(context, innerPx, rows.size, r.time.length))
        column.addView(line(context, r.time, sp, if (r.next) accent else text, medium = true, centre = true))
        row.addView(column, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      }
      card.addView(row, below(context, 8f))
    } else if (next != null) {
      // Without the table — and on the Next prayer card always — the card is the next prayer, large.
      val words = listOf(next.name, next.time).filter { it.isNotEmpty() }.joinToString("  ")
      card.addView(line(context, words, if (kind == Kind.SMALL) 20f else 24f, text), below(context, 6f))
    }

    val counting = if (look.showCountdown && next != null) {
      listOf(next.name, SAMPLE_COUNTDOWN).filter { it.isNotEmpty() }.joinToString("  ")
    } else {
      ""
    }

    if (kind != Kind.TALL) {
      if (counting.isNotEmpty()) card.addView(line(context, counting, 11f, muted), below(context, 8f))
      return card
    }

    // THE TALL CARD: under the times a rule, the countdown's line with the
    // streak at its end, and the graph of the days logged — the Log's.
    val practice = sample?.practice
    card.addView(rule(context, text), hairline(context, 8f))
    val foot = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    foot.addView(line(context, counting, 11f, muted), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    if (practice != null) {
      val streak = context.resources.getQuantityString(R.plurals.widget_streak_day_label, practice.streak, practice.streak)
      foot.addView(line(context, "${practice.streak} $streak", 11f, text))
    }
    card.addView(foot, below(context, 8f))
    graph(context, practice, innerPx, accent)?.let { bitmap ->
      card.addView(rule(context, text), hairline(context, 8f))
      val image = ImageView(context).apply {
        setImageBitmap(bitmap)
        adjustViewBounds = true
        scaleType = ImageView.ScaleType.FIT_START
      }
      card.addView(image, below(context, 8f))
    }
    return card
  }

  /** The Log's graph for the box the sample gives it; with nothing logged yet, the empty grid. */
  private fun graph(context: Context, practice: WidgetContract.Practice?, widthPx: Int, accent: Int): Bitmap? =
    try {
      val density = context.resources.displayMetrics.density
      val layout = PracticeGridBitmap.layoutFor((widthPx / density).toInt(), GRAPH_DP, density, GRID_DAYS)
      if (practice != null) {
        practiceGrid(practice, layout.rows, layout.columns, layout.cellWPx, layout.cellHPx, layout.gapPx, accent)
      } else {
        PracticeGridBitmap.render(JSONArray(), layout.rows, layout.columns, layout.cellWPx, layout.cellHPx, layout.gapPx, accent)
      }
    } catch (_: Exception) {
      null
    }

  /** The largest a time may be drawn in its column, in sp: its share of the card's width over its characters. */
  private fun timeCapSp(context: Context, innerPx: Int, columns: Int, chars: Int): Float {
    val m = context.resources.displayMetrics
    val perColumn = innerPx / m.density / columns.coerceAtLeast(1)
    // A digit of the widgets' face is about 0.56 of its size wide.
    return (perColumn / (chars.coerceAtLeast(4) * 0.58f)) * (m.density / m.scaledDensity)
  }

  private fun line(context: Context, words: String, sp: Float, colour: Int, medium: Boolean = false, centre: Boolean = false) =
    TextView(context).apply {
      text = words
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
      if (medium) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      setTextColor(colour)
      maxLines = 1
      ellipsize = android.text.TextUtils.TruncateAt.END
      if (centre) gravity = Gravity.CENTER
    }

  private fun rule(context: Context, text: Int) = View(context).apply {
    setBackgroundColor((text and 0x00FFFFFF) or (0x2E shl 24))
  }

  /** A rule's place: a pixel-row high — a bare View asked to wrap takes all the room it is offered. */
  private fun hairline(context: Context, gapDp: Float) =
    LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(context, 1f).toInt().coerceAtLeast(1)).apply {
      topMargin = dp(context, gapDp).toInt()
    }

  private fun below(context: Context, gapDp: Float) =
    LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(context, gapDp).toInt()
    }

  private fun dp(context: Context, v: Float): Float = v * context.resources.displayMetrics.density
}
