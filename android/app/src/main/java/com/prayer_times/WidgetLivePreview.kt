package com.prayer_times

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.RemoteViews
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.ExperimentalGlanceApi
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.compose

/**
 * A widget's sample that IS the widget: the card composed by the widget's own
 * code, at the size it is placed at, and shown in a view of the app's.
 *
 * The widget settings screen's sample was a drawing of a prayer-times strip,
 * whichever widget it was opened from; then a drawing of each prayer-times
 * card (WidgetPreviewCard). A drawing is a second copy of a card, and there
 * are nine cards: the Log's sample would have been a third thing to keep
 * true, and the Hijri, reading, streak and tasbih cards four more. So the
 * sample is no copy — Glance composes the placed widget's own `Content` into
 * RemoteViews (`GlanceAppWidget.compose`), exactly what it hands the
 * launcher, and the app applies them to a view. Every widget has its sample
 * by having its card.
 *
 * WHAT HAS NOT BEEN SAVED YET. The settings screen's sample follows every
 * control before Save. The cards read their look from the widgets' store,
 * always through the `Context` they are composed with (PrayerWidgetDisplay,
 * PrayerWidgetProvider.resolvedColors) — so the sample is composed with a
 * context whose view of that store has the choices so far laid over it
 * (`Overlay`). Nothing is written until Save, and the widgets on the home
 * screen, composed with the real context, do not see it.
 *
 * (One thing is shared: `Palette`, the cards' text colour, is read into a
 * process-wide holder at the head of every composition. A widget redrawn in
 * the same instant as a sample could take the sample's; every composition
 * reads it afresh, and the settings screen asks for a redraw of the widgets
 * as it closes, so the home screen ends on what is stored.)
 *
 * NOT TO BE TOUCHED. The applied views carry the widget's own taps — on the
 * Log's card a tap logs a prayer. The sample stands behind a shield that
 * takes every touch (`Shield`).
 *
 * Should composing fail, the caller falls back to WidgetPreviewCard's drawing.
 */
internal object WidgetLivePreview {

  /** The cards in the order a page shows them: the prayer times first, then the Log's, then the rest. */
  val PROVIDERS: List<String> = listOf(
    TimesWidgetReceiver::class.java.name,
    TimesTallWidgetReceiver::class.java.name,
    NextPrayerWidgetReceiver::class.java.name,
    LogWidgetReceiver::class.java.name,
    LogTallWidgetReceiver::class.java.name,
    StreakWidgetReceiver::class.java.name,
    PrayerWidgetReadingProvider::class.java.name,
    PrayerWidgetTasbihProvider::class.java.name,
    PrayerWidgetHijriProvider::class.java.name,
  )

  /** Shown where none is placed: the two prayer-times cards. */
  val DEFAULTS: List<String> = PROVIDERS.take(2)

  /** A one-row card's height where the launcher has not said, and a two-row card's. */
  private const val ONE_ROW_DP = 96
  private const val TWO_ROW_DP = 208

  /** The widget a receiver draws; null for a class that is not one of the Glance receivers. */
  fun widgetOf(providerClass: String?): GlanceAppWidget? =
    try {
      providerClass
        ?.takeIf { it in PROVIDERS }
        ?.let { Class.forName(it).getDeclaredConstructor().newInstance() as? GlanceAppWidgetReceiver }
        ?.glanceAppWidget
    } catch (_: Exception) {
      null
    }

  /** The first placed widget of each kind, in the page's order: receiver class → widget id. */
  fun placed(context: Context): List<Pair<String, Int>> {
    val manager = AppWidgetManager.getInstance(context)
    return PROVIDERS.mapNotNull { cls ->
      val ids = try {
        manager.getAppWidgetIds(ComponentName(context.packageName, cls))
      } catch (_: Exception) {
        IntArray(0)
      }
      ids.firstOrNull()?.let { cls to it }
    }
  }

  /**
   * The size the card is drawn at, in dp: the placed widget's own in
   * portrait (the launcher's options), no wider than the sample has room
   * for; for a card not placed, or one whose launcher has not said, the
   * room's width (half of it for a two-column card) and a row or two.
   */
  fun sizeOf(context: Context, appWidgetId: Int?, providerClass: String, roomDp: Int): DpSize {
    val manager = AppWidgetManager.getInstance(context)
    if (appWidgetId != null) {
      val options = try {
        manager.getAppWidgetOptions(appWidgetId)
      } catch (_: Exception) {
        null
      }
      val w = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0
      val h = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0
      if (w > 0 && h > 0) return DpSize(w.coerceAtMost(roomDp).dp, h.dp)
    }
    val info = try {
      manager.installedProviders.firstOrNull { it.provider.className == providerClass }
    } catch (_: Exception) {
      null
    }
    val columns = if (info != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) info.targetCellWidth else 4
    val rows = if (info != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) info.targetCellHeight else 1
    val width = if (columns in 1..2) roomDp / 2 else roomDp
    return DpSize(width.dp, (if (rows >= 2) TWO_ROW_DP else ONE_ROW_DP).dp)
  }

  /** The card, composed by its own widget — with `overrides` laid over the widgets' store. */
  @OptIn(ExperimentalGlanceApi::class)
  suspend fun compose(context: Context, widget: GlanceAppWidget, size: DpSize, overrides: Map<String, Any>): RemoteViews =
    widget.compose(
      context = if (overrides.isEmpty()) context else Overlay(context, overrides),
      size = size,
    )

  /** The wallpaper with the composed card on it, behind its shield. */
  fun show(wall: LinearLayout, views: RemoteViews, size: DpSize) {
    val context = wall.context
    paint(wall)
    val density = context.resources.displayMetrics.density
    val shield = Shield(context)
    shield.addView(
      views.apply(context.applicationContext, shield),
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    )
    wall.removeAllViews()
    wall.addView(
      shield,
      LinearLayout.LayoutParams((size.width.value * density).toInt(), (size.height.value * density).toInt()).apply {
        gravity = Gravity.CENTER_HORIZONTAL
      },
    )
  }

  /**
   * The same, as a picture `widthPx` wide — for a page of the app's.
   * `tallestDp` is the tallest card of the row it is shown in: every
   * wallpaper in the row is that card's height, and a shorter card stands
   * in the middle of its own — side by side, cards of different heights on
   * wallpapers of different heights read as a row gone wrong.
   */
  fun bitmap(context: Context, views: RemoteViews, size: DpSize, widthPx: Int, tallestDp: Float = size.height.value): Bitmap {
    val density = context.resources.displayMetrics.density
    val pad = (WidgetPreviewCard.WALL_PAD_DP * density).toInt()
    val wall = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(pad, pad, pad, pad)
    }
    show(wall, views, size)
    val heightPx = (maxOf(tallestDp, size.height.value) * density).toInt() + 2 * pad
    wall.measure(
      View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(heightPx, View.MeasureSpec.EXACTLY),
    )
    wall.layout(0, 0, wall.measuredWidth, wall.measuredHeight)
    val bitmap = Bitmap.createBitmap(wall.measuredWidth.coerceAtLeast(1), wall.measuredHeight.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    wall.draw(Canvas(bitmap))
    return bitmap
  }

  /**
   * The stand-in wallpaper, light at one corner and dark at the other, so
   * the background's strength and a dark or a light text can both be judged
   * against it.
   */
  fun paint(wall: View) {
    if (wall.background != null) return
    wall.background = GradientDrawable(
      GradientDrawable.Orientation.TL_BR,
      intArrayOf(0xFFE2B98C.toInt(), 0xFF5F7E9C.toInt(), 0xFF1F2A3A.toInt()),
    ).apply { cornerRadius = 22f * wall.resources.displayMetrics.density }
  }

  /** Takes every touch: what is behind it is looked at, not used. */
  private class Shield(context: Context) : FrameLayout(context) {
    override fun onInterceptTouchEvent(ev: MotionEvent?): Boolean = true

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent?): Boolean = true
  }

  /** A context whose widgets' store reads the choices so far first. */
  private class Overlay(base: Context, private val overrides: Map<String, Any>) : ContextWrapper(base) {
    override fun getSharedPreferences(name: String?, mode: Int): SharedPreferences {
      val real = super.getSharedPreferences(name, mode)
      return if (name == PrayerWidgetProvider.PREFS_NAME) OverlayPrefs(real, overrides) else real
    }

    // The cards' strings come from a context in Mihrab's language, made from this one: it keeps the overlay.
    override fun createConfigurationContext(overrideConfiguration: Configuration): Context =
      Overlay(super.createConfigurationContext(overrideConfiguration), overrides)
  }

  /** The store, read through the overrides. Written straight through: a sample writes nothing of its own. */
  private class OverlayPrefs(private val real: SharedPreferences, private val over: Map<String, Any>) : SharedPreferences {
    override fun getAll(): MutableMap<String, *> = HashMap<String, Any?>(real.all).apply { putAll(over) }
    override fun getString(key: String?, defValue: String?): String? = over[key] as? String ?: real.getString(key, defValue)

    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
      over[key] as? MutableSet<String> ?: real.getStringSet(key, defValues)

    override fun getInt(key: String?, defValue: Int): Int = over[key] as? Int ?: real.getInt(key, defValue)
    override fun getLong(key: String?, defValue: Long): Long = over[key] as? Long ?: real.getLong(key, defValue)
    override fun getFloat(key: String?, defValue: Float): Float = over[key] as? Float ?: real.getFloat(key, defValue)
    override fun getBoolean(key: String?, defValue: Boolean): Boolean = over[key] as? Boolean ?: real.getBoolean(key, defValue)
    override fun contains(key: String?): Boolean = over.containsKey(key) || real.contains(key)
    override fun edit(): SharedPreferences.Editor = real.edit()

    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) =
      real.registerOnSharedPreferenceChangeListener(listener)

    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) =
      real.unregisterOnSharedPreferenceChangeListener(listener)
  }
}
