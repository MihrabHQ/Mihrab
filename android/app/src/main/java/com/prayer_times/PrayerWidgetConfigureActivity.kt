package com.prayer_times

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.color.MaterialColors
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.prayer_times.glance.WidgetSample
import kotlin.math.max
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Shown when the user adds a widget or opens “Settings” from its long-press
 * menu. Writes the same SharedPreferences keys the app and the widgets read.
 *
 * A SAMPLE OF THE CARD stands at the top and follows every control, so a
 * choice is seen before it is saved: the background's strength over a
 * stand-in wallpaper, the text and highlight colours, and — from a
 * prayer-times widget — what is shown and the size of the times. It is
 * THE WIDGET THIS WAS OPENED FROM, composed by its own code at the size it
 * is placed at, with the choices so far laid over what is stored
 * (`WidgetLivePreview`) — the tall prayer card with its graph, the Log's
 * card with its checks, the Hijri date: whichever was held. It was a
 * drawing of the prayer-times strip whichever was held, and someone setting
 * up another card was shown one that was not theirs. Should composing
 * fail, a drawing of the prayer-times card stands in (`WidgetPreviewCard`).
 *
 * THE SETTINGS ARE NOT THIS WIDGET'S ALONE. The first section is followed
 * by every Mihrab widget, and says so; the second by the prayer-times
 * widgets only, shown only from one of them, and in it only what the
 * widget it was opened from draws (the Next prayer card has no table and
 * no time size).
 */
class PrayerWidgetConfigureActivity : AppCompatActivity() {

  // What the screen holds, as chosen so far.
  private var opacity = 88
  private var highlightId = "green"
  private var highlightCustomHex = DEFAULT_HIGHLIGHT
  private var textHex = TEXT_PRESETS[0].second
  private var textCustom = false
  private var showLocation = true
  private var showCountdown = true
  private var showTable = true
  private var timeScalePercent = 100
  private var sinceAdhan = 0

  private var isPrayerWidget = false
  private var isSmallWidget = false
  /** The card this was opened from; null from a widget that is not a prayer-times one. */
  private var kind: WidgetPreviewCard.Kind? = null
  /** The widget itself, for the sample; null where its receiver is not one of the Glance ones. */
  private var widget: androidx.glance.appwidget.GlanceAppWidget? = null
  private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
  private var providerClass = ""
  private val scope = MainScope()
  private var previewJob: Job? = null
  private var sample: WidgetSample? = null
  private var cardRgb = 0x101418

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val appWidgetId =
      intent?.extras?.getInt(
        AppWidgetManager.EXTRA_APPWIDGET_ID,
        AppWidgetManager.INVALID_APPWIDGET_ID,
      ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    setResult(RESULT_CANCELED)
    // On Android 15+ edge-to-edge is enforced, so this deprecated call is a
    // no-op that only trips Play's deprecated-API check; the inset listener
    // below handles padding on every version. Only call it on older versions.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      @Suppress("DEPRECATION")
      WindowCompat.setDecorFitsSystemWindows(window, false)
    }
    setContentView(R.layout.activity_prayer_widget_configure)

    val root = findViewById<LinearLayout>(R.id.widget_configure_root)
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, windowInsets ->
      val bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
      val cutout = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout())
      // The keyboard too: the colour fields are near the foot of the scroll.
      val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(
        max(bars.left, cutout.left),
        max(bars.top, cutout.top),
        max(bars.right, cutout.right),
        max(max(bars.bottom, cutout.bottom), ime.bottom),
      )
      windowInsets
    }
    ViewCompat.requestApplyInsets(root)

    val toolbar = findViewById<MaterialToolbar>(R.id.widget_configure_toolbar)
    setSupportActionBar(toolbar)
    toolbar.setNavigationOnClickListener { finish() }

    val provider = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider?.className
    isPrayerWidget = provider in PRAYER_TIMES_PROVIDERS
    isSmallWidget = provider == NextPrayerWidgetReceiver::class.java.name
    kind = WidgetPreviewCard.kindOf(provider)
    widget = WidgetLivePreview.widgetOf(provider)
    widgetId = appWidgetId
    providerClass = provider.orEmpty()

    readStored()
    sample = try {
      WidgetSample.of(this)
    } catch (_: Exception) {
      null
    }
    cardRgb = try {
      PrayerWidgetProvider.resolvedColors(this).first and 0x00FFFFFF
    } catch (_: Exception) {
      0x101418
    }

    bindBackground()
    bindTextColour()
    bindHighlight()
    bindPrayerSection()
    renderPreview()

    findViewById<MaterialButton>(R.id.widget_configure_save).setOnClickListener { save(appWidgetId) }
  }

  // ── Reading and writing ────────────────────────────────────────────────

  private fun readStored() {
    val prefs = getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    opacity = prefs.getInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, 88).coerceIn(0, 100)
    // Dynamic (phone accent) is gone (2026-08-27, by request). The stored
    // flag is not read back into a selection: a widget configured by an
    // older build opens on the colour it will actually be drawn in, which
    // for "dynamic" is green — see `readWidgetStyle` in PrayerWidgetProvider.
    val storedId = prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, "green")?.trim()?.lowercase().orEmpty()
    highlightId = if (storedId == "custom" || HIGHLIGHTS.any { it.first == storedId }) storedId else "green"
    highlightCustomHex = normaliseHex(prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, "")) ?: DEFAULT_HIGHLIGHT

    val storedText = normaliseHex(prefs.getString(PrayerWidgetDisplay.KEY_TEXT_HEX, "")) ?: TEXT_PRESETS[0].second
    textHex = storedText
    textCustom = TEXT_PRESETS.none { it.second == storedText }

    val display = PrayerWidgetDisplay.read(this)
    showLocation = display.showLocation
    showCountdown = display.showCountdown
    showTable = display.showTable
    timeScalePercent = Math.round(display.timeScale * 100)
    sinceAdhan = PrayerWidgetDisplay.sinceAdhanMinutes(this, WidgetSample.publishedSinceAdhan(this))
      .let { v -> if (v in PrayerWidgetDisplay.SINCE_ADHAN_CHOICES) v else 0 }
  }

  private fun save(appWidgetId: Int) {
    // A custom colour must be a real #RRGGBB before anything is saved: a
    // typo would otherwise draw the widget in the default and look like
    // the setting had been ignored.
    val textLayout = findViewById<TextInputLayout>(R.id.widget_configure_text_hex_layout)
    val highlightLayout = findViewById<TextInputLayout>(R.id.widget_configure_hex_layout)
    if (textCustom && normaliseHex(findViewById<TextInputEditText>(R.id.widget_configure_text_hex_input).text?.toString()) == null) {
      textLayout.error = getString(R.string.widget_configure_hex_invalid)
      textLayout.requestFocus()
      return
    }
    if (highlightId == "custom" && normaliseHex(findViewById<TextInputEditText>(R.id.widget_configure_hex_input).text?.toString()) == null) {
      highlightLayout.error = getString(R.string.widget_configure_hex_invalid)
      highlightLayout.requestFocus()
      return
    }

    val editor = getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE).edit()
    for ((key, value) in pending()) {
      when (value) {
        is Boolean -> editor.putBoolean(key, value)
        is Int -> editor.putInt(key, value)
        is String -> editor.putString(key, value)
      }
    }
    editor.apply()

    // Every card honours the common settings, so every card is redrawn —
    // the fan-out re-reads the ids itself, whichever provider this widget
    // belongs to.
    PrayerWidgetProvider.requestUpdate(this)

    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
    finish()
  }

  /**
   * What Save writes, as chosen so far: the store's keys and their values.
   * The sample is composed over exactly this (`WidgetLivePreview`), so what
   * is seen before Save is what is stored by it.
   */
  private fun pending(): Map<String, Any> {
    val out = LinkedHashMap<String, Any>()
    out[PrayerWidgetDisplay.KEY_TEXT_HEX] = textHex
    if (isPrayerWidget) {
      out[PrayerWidgetDisplay.KEY_SHOW_LOCATION] = showLocation
      out[PrayerWidgetDisplay.KEY_SHOW_COUNTDOWN] = showCountdown
      out[PrayerWidgetDisplay.KEY_SINCE_ADHAN] = sinceAdhan
      // What the Next prayer card does not draw, it does not write.
      if (!isSmallWidget) {
        out[PrayerWidgetDisplay.KEY_SHOW_TABLE] = showTable
        out[PrayerWidgetDisplay.KEY_TIME_SCALE] = timeScalePercent
      }
    }
    out[PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY] = opacity
    out[PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID] = highlightId
    out[PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX] = if (highlightId == "custom") highlightCustomHex else ""
    // Written as false rather than left alone: saving here is the one
    // moment we know the user has looked at this screen, and an older
    // build's stored `true` would otherwise sit in the store for ever,
    // waiting for a downgrade to honour it.
    out[PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC] = false
    return out
  }

  override fun onDestroy() {
    scope.cancel()
    // The home screen ends on what is stored, whatever a sample was
    // composed with in passing (WidgetLivePreview, on `Palette`).
    try {
      PrayerWidgetProvider.requestUpdate(this)
    } catch (_: Exception) {
    }
    super.onDestroy()
  }

  // ── The controls ───────────────────────────────────────────────────────

  private fun bindBackground() {
    val seek = findViewById<SeekBar>(R.id.widget_configure_opacity_seek)
    val label = findViewById<TextView>(R.id.widget_configure_opacity_value)
    seek.max = 100
    seek.progress = opacity
    label.text = getString(R.string.widget_configure_opacity_percent, opacity)
    seek.setOnSeekBarChangeListener(onSeek { v ->
      opacity = v
      label.text = getString(R.string.widget_configure_opacity_percent, v)
      renderPreview()
    })
  }

  private fun bindTextColour() {
    val row = findViewById<LinearLayout>(R.id.widget_configure_text_swatches)
    val layout = findViewById<TextInputLayout>(R.id.widget_configure_text_hex_layout)
    val input = findViewById<TextInputEditText>(R.id.widget_configure_text_hex_input)
    input.setText(if (textCustom) textHex else "#FFFFFF")

    fun redraw() {
      row.removeAllViews()
      for ((nameRes, hex) in TEXT_PRESETS) {
        row.addView(swatch(Color.parseColor(hex), getString(nameRes), !textCustom && textHex == hex) {
          textCustom = false
          textHex = hex
          redraw()
        })
      }
      row.addView(swatch(null, getString(R.string.widget_configure_highlight_custom), textCustom) {
        textCustom = true
        normaliseHex(input.text?.toString())?.let { textHex = it }
        redraw()
      })
      layout.visibility = if (textCustom) View.VISIBLE else View.GONE
      layout.error = null
      renderPreview()
    }
    input.addTextChangedListener(afterText {
      layout.error = null
      if (textCustom) normaliseHex(it)?.let { hex ->
        textHex = hex
        renderPreview()
      }
    })
    redraw()
  }

  private fun bindHighlight() {
    val row = findViewById<LinearLayout>(R.id.widget_configure_highlight_swatches)
    val layout = findViewById<TextInputLayout>(R.id.widget_configure_hex_layout)
    val input = findViewById<TextInputEditText>(R.id.widget_configure_hex_input)
    input.setText(highlightCustomHex)

    fun redraw() {
      row.removeAllViews()
      for ((id, hex, nameRes) in HIGHLIGHTS) {
        row.addView(swatch(Color.parseColor(hex), getString(nameRes), highlightId == id) {
          highlightId = id
          redraw()
        })
      }
      row.addView(swatch(null, getString(R.string.widget_configure_highlight_custom), highlightId == "custom") {
        highlightId = "custom"
        redraw()
      })
      layout.visibility = if (highlightId == "custom") View.VISIBLE else View.GONE
      layout.error = null
      renderPreview()
    }
    input.addTextChangedListener(afterText {
      layout.error = null
      normaliseHex(it)?.let { hex ->
        highlightCustomHex = hex
        renderPreview()
      }
    })
    redraw()
  }

  private fun bindPrayerSection() {
    val section = findViewById<LinearLayout>(R.id.widget_configure_prayer_section)
    section.visibility = if (isPrayerWidget) View.VISIBLE else View.GONE
    if (!isPrayerWidget) return

    fun switch(id: Int, on: Boolean, set: (Boolean) -> Unit) {
      val s = findViewById<MaterialSwitch>(id)
      s.isChecked = on
      s.setOnCheckedChangeListener { _, v ->
        set(v)
        renderPreview()
      }
    }
    switch(R.id.widget_configure_show_location, showLocation) { showLocation = it }
    switch(R.id.widget_configure_show_countdown, showCountdown) { showCountdown = it }
    switch(R.id.widget_configure_show_table, showTable) { showTable = it }

    // The Next prayer card is the next prayer alone: no table to hide, no
    // row of times to size.
    findViewById<View>(R.id.widget_configure_show_table).visibility = if (isSmallWidget) View.GONE else View.VISIBLE
    findViewById<View>(R.id.widget_configure_time_size_group).visibility = if (isSmallWidget) View.GONE else View.VISIBLE

    // 80 … 150 % in steps of 10: the seek bar's 0 … 7.
    val sizeSeek = findViewById<SeekBar>(R.id.widget_configure_time_size_seek)
    val sizeLabel = findViewById<TextView>(R.id.widget_configure_time_size_value)
    sizeSeek.max = (PrayerWidgetDisplay.SCALE_MAX - PrayerWidgetDisplay.SCALE_MIN) / 10
    sizeSeek.progress = (timeScalePercent - PrayerWidgetDisplay.SCALE_MIN) / 10
    sizeLabel.text = getString(R.string.widget_configure_opacity_percent, timeScalePercent)
    sizeSeek.setOnSeekBarChangeListener(onSeek { v ->
      timeScalePercent = PrayerWidgetDisplay.SCALE_MIN + v * 10
      sizeLabel.text = getString(R.string.widget_configure_opacity_percent, timeScalePercent)
      renderPreview()
    })

    // Time since the adhan (#111): off, or for how long the card counts up.
    val group = findViewById<MaterialButtonToggleGroup>(R.id.widget_configure_since_adhan_group)
    val ids = HashMap<Int, Int>()
    for (minutes in PrayerWidgetDisplay.SINCE_ADHAN_CHOICES) {
      val b = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle)
      b.id = View.generateViewId()
      b.text = if (minutes == 0) getString(R.string.widget_configure_since_adhan_off)
      else getString(R.string.widget_configure_since_adhan_minutes, minutes)
      b.isAllCaps = false
      b.maxLines = 1
      group.addView(b, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      ids[b.id] = minutes
      if (minutes == sinceAdhan) group.check(b.id)
    }
    group.addOnButtonCheckedListener { _, checkedId, isChecked ->
      if (isChecked) sinceAdhan = ids[checkedId] ?: 0
    }
  }

  // ── The sample ─────────────────────────────────────────────────────────

  private fun highlightColour(): Int =
    if (highlightId == "custom") Color.parseColor(highlightCustomHex)
    else Color.parseColor(HIGHLIGHTS.firstOrNull { it.first == highlightId }?.second ?: DEFAULT_HIGHLIGHT)

  private fun renderPreview() {
    val wall = findViewById<LinearLayout>(R.id.widget_configure_preview)
    val m = resources.displayMetrics
    // The wallpaper's width: the screen's, less its margins (the layout's
    // 20dp) and its own padding.
    val innerPx = m.widthPixels - (2 * dp(20f) + 2 * dp(WidgetPreviewCard.WALL_PAD_DP)).toInt()
    val glance = widget
    if (glance == null) {
      drawnPreview(wall, innerPx)
      return
    }
    // The widget itself, with the choices so far: the latest asked for wins.
    val choices = pending()
    val size = WidgetLivePreview.sizeOf(this, widgetId, providerClass, (innerPx / m.density).toInt())
    previewJob?.cancel()
    previewJob = scope.launch {
      try {
        val views = WidgetLivePreview.compose(this@PrayerWidgetConfigureActivity, glance, size, choices)
        WidgetLivePreview.show(wall, views, size)
      } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
      } catch (e: Exception) {
        android.util.Log.w(PrayerWidgetProvider.WIDGET_LOG_TAG, "widget sample could not be composed", e)
        drawnPreview(wall, innerPx)
      }
    }
  }

  /** The stand-in: a drawing of the prayer-times card (WidgetPreviewCard). */
  private fun drawnPreview(wall: LinearLayout, innerPx: Int) {
    // The common settings alone, from a widget that is not a prayer-times
    // one: the strip still shows a day's times, whole, as the sample of
    // its colours.
    val prayer = isPrayerWidget
    val look = WidgetPreviewCard.Look(
      opacity = opacity,
      cardRgb = cardRgb,
      text = Color.parseColor(textHex),
      accent = highlightColour(),
      showLocation = !prayer || showLocation,
      showCountdown = !prayer || showCountdown,
      showTable = !prayer || showTable,
      timeScalePercent = if (prayer) timeScalePercent else 100,
    )
    WidgetPreviewCard.fill(wall, listOf(kind ?: WidgetPreviewCard.Kind.STRIP), look, sample, innerPx)
  }

  // ── Small pieces ───────────────────────────────────────────────────────

  /** One round swatch: a colour, or "#" for a colour of one's own. */
  private fun swatch(colour: Int?, name: String, selected: Boolean, onPick: () -> Unit): View {
    val size = dp(40f).toInt()
    val ring = MaterialColors.getColor(this, androidx.appcompat.R.attr.colorPrimary, Color.WHITE)
    val edge = MaterialColors.getColor(this, com.google.android.material.R.attr.colorOutline, Color.GRAY)
    val dot = TextView(this).apply {
      gravity = Gravity.CENTER
      text = if (colour == null) "#" else ""
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setTextColor(MaterialColors.getColor(this@PrayerWidgetConfigureActivity, com.google.android.material.R.attr.colorOnSurface, Color.WHITE))
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(colour ?: Color.TRANSPARENT)
        setStroke(dp(if (selected) 3f else 1f).toInt(), if (selected) ring else edge)
      }
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    // A 48dp target round a 40dp dot.
    return FrameLayout(this).apply {
      val pad = dp(4f).toInt()
      setPadding(pad, pad, pad, pad)
      addView(dot, FrameLayout.LayoutParams(size, size))
      contentDescription = name
      isSelected = selected
      isClickable = true
      isFocusable = true
      ViewCompat.setStateDescription(this, if (selected) "✓" else null)
      setOnClickListener { onPick() }
    }
  }

  private fun dp(v: Float): Float = v * resources.displayMetrics.density

  private fun onSeek(change: (Int) -> Unit) = object : SeekBar.OnSeekBarChangeListener {
    override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) = change(progress)
    override fun onStartTrackingTouch(sb: SeekBar?) {}
    override fun onStopTrackingTouch(sb: SeekBar?) {}
  }

  private fun afterText(change: (String) -> Unit) = object : TextWatcher {
    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
    override fun afterTextChanged(s: Editable?) = change(s?.toString().orEmpty())
  }

  companion object {
    private const val DEFAULT_HIGHLIGHT = "#46A081"

    /** The cards PrayerGlanceWidget draws: Next prayer, Prayer times, tall. */
    private val PRAYER_TIMES_PROVIDERS = setOf(
      TimesWidgetReceiver::class.java.name,
      NextPrayerWidgetReceiver::class.java.name,
      TimesTallWidgetReceiver::class.java.name,
    )

    /** The highlight's presets: the stored id, its colour (`WidgetStyle.highlightInt`), its name. */
    private val HIGHLIGHTS = listOf(
      Triple("green", "#46A081", R.string.widget_configure_highlight_green),
      Triple("teal", "#4EC9B0", R.string.widget_configure_highlight_teal),
      Triple("blue", "#6BA3F5", R.string.widget_configure_highlight_blue),
      Triple("amber", "#E5C07B", R.string.widget_configure_highlight_amber),
    )

    /** The app's swatches (settings/WidgetTextColor.tsx), in its order. */
    private val TEXT_PRESETS = listOf(
      R.string.widget_configure_text_light to "#E8EAED",
      R.string.widget_configure_text_white to "#FFFFFF",
      R.string.widget_configure_text_cream to "#F3E9D2",
      R.string.widget_configure_text_gold to "#E5C07B",
      R.string.widget_configure_text_sky to "#A8C7FA",
      R.string.widget_configure_text_dark to "#1C1C1E",
    )

    /** "#abc123", "abc123" → "#ABC123"; anything else → null. */
    fun normaliseHex(input: String?): String? {
      val t = input?.trim()?.uppercase()?.removePrefix("#") ?: return null
      return if (Regex("^[0-9A-F]{6}$").matches(t)) "#$t" else null
    }
  }
}
