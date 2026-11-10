package com.prayer_times

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
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

/**
 * Shown when the user adds a widget or opens “Settings” from its long-press
 * menu. Writes the same SharedPreferences keys the app and the widgets read.
 *
 * A SAMPLE OF THE CARD stands at the top and follows every control, so a
 * choice is seen before it is saved: the background's strength over a
 * stand-in wallpaper, the text and highlight colours, and — from a
 * prayer-times widget — what is shown and the size of the times. It is
 * drawn from the day the widgets hold (`WidgetSample`), so the names and
 * times are the user's own.
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
    editor.putString(PrayerWidgetDisplay.KEY_TEXT_HEX, textHex)
    if (isPrayerWidget) {
      editor
        .putBoolean(PrayerWidgetDisplay.KEY_SHOW_LOCATION, showLocation)
        .putBoolean(PrayerWidgetDisplay.KEY_SHOW_COUNTDOWN, showCountdown)
        .putInt(PrayerWidgetDisplay.KEY_SINCE_ADHAN, sinceAdhan)
      // What the Next prayer card does not draw, it does not write.
      if (!isSmallWidget) {
        editor
          .putBoolean(PrayerWidgetDisplay.KEY_SHOW_TABLE, showTable)
          .putInt(PrayerWidgetDisplay.KEY_TIME_SCALE, timeScalePercent)
      }
    }
    editor
      .putInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, opacity)
      .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, highlightId)
      .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, if (highlightId == "custom") highlightCustomHex else "")
      // Written as false rather than left alone: saving here is the one
      // moment we know the user has looked at this screen, and an older
      // build's stored `true` would otherwise sit in the store for ever,
      // waiting for a downgrade to honour it.
      .putBoolean(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC, false)
      .apply()

    // Every card honours the common settings, so every card is redrawn —
    // the fan-out re-reads the ids itself, whichever provider this widget
    // belongs to.
    PrayerWidgetProvider.requestUpdate(this)

    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
    finish()
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
    val card = findViewById<LinearLayout>(R.id.widget_configure_preview_card)
    val header = findViewById<TextView>(R.id.widget_configure_preview_header)
    val row = findViewById<LinearLayout>(R.id.widget_configure_preview_row)
    val nextLine = findViewById<TextView>(R.id.widget_configure_preview_next)
    val countdown = findViewById<TextView>(R.id.widget_configure_preview_countdown)

    // A stand-in wallpaper, light at one corner and dark at the other, so
    // the background's strength and a dark or a light text can both be
    // judged against it.
    if (wall.background == null) {
      wall.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(0xFFE2B98C.toInt(), 0xFF5F7E9C.toInt(), 0xFF1F2A3A.toInt()))
        .apply { cornerRadius = dp(22f) }
    }
    card.background = GradientDrawable().apply {
      cornerRadius = dp(18f)
      setColor((opacity * 255 / 100 shl 24) or cardRgb)
    }

    val text = Color.parseColor(textHex)
    val muted = (text and 0x00FFFFFF) or (0xA6 shl 24)
    val accent = highlightColour()
    val s = sample

    // The common settings alone, from a widget that is not a prayer-times
    // one: the card still shows a day's times, as the sample of its colours.
    val withLocation = !isPrayerWidget || showLocation
    val withCountdown = !isPrayerWidget || showCountdown
    val withTable = !isPrayerWidget || showTable || isSmallWidget
    val scale = if (isPrayerWidget && !isSmallWidget) timeScalePercent / 100f else 1f

    header.setTextColor(muted)
    header.text = listOfNotNull(
      s?.dayLabel?.takeIf { it.isNotEmpty() },
      s?.location?.takeIf { withLocation && it.isNotEmpty() },
    ).joinToString(" · ")
    header.visibility = if (header.text.isNullOrEmpty()) View.GONE else View.VISIBLE

    row.removeAllViews()
    val rows = s?.rows ?: FALLBACK_ROWS
    row.visibility = if (withTable) View.VISIBLE else View.GONE
    if (withTable) {
      for (r in rows) {
        val column = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER_HORIZONTAL
          setPadding(0, dp(4f).toInt(), 0, dp(4f).toInt())
          if (r.next) {
            background = GradientDrawable().apply {
              cornerRadius = dp(10f)
              setColor((text and 0x00FFFFFF) or (0x24 shl 24))
            }
          }
        }
        val colour = if (r.next) accent else text
        if (r.name.isNotEmpty()) {
          column.addView(TextView(this).apply {
            this.text = r.name
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 9f)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setTextColor(if (r.next) accent else muted)
            maxLines = 1
            gravity = Gravity.CENTER
          })
        }
        column.addView(TextView(this).apply {
          this.text = r.time
          // As the widget does: the size asked for, where the column has
          // room for it.
          val sp = (PREVIEW_TIME_SP * scale).coerceAtMost(previewTimeCapSp(rows.size, r.time.length))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
          typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
          setTextColor(colour)
          maxLines = 1
          gravity = Gravity.CENTER
        })
        row.addView(column, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      }
    }

    // Without the table the card is the next prayer, large.
    val next = rows.firstOrNull { it.next } ?: rows.firstOrNull()
    nextLine.visibility = if (withTable || next == null) View.GONE else View.VISIBLE
    nextLine.setTextColor(text)
    nextLine.text = next?.let { listOf(it.name, it.time).filter { p -> p.isNotEmpty() }.joinToString("  ") }.orEmpty()

    countdown.visibility = if (withCountdown && next != null) View.VISIBLE else View.GONE
    countdown.setTextColor(muted)
    countdown.text = listOf(next?.name.orEmpty(), SAMPLE_COUNTDOWN).filter { it.isNotEmpty() }.joinToString("  ")
  }

  /** The largest a time may be drawn in the sample's column, in sp: its share of the card's width over its characters. */
  private fun previewTimeCapSp(columns: Int, chars: Int): Float {
    val m = resources.displayMetrics
    val cardDp = m.widthPixels / m.density - 2 * 20 - 2 * 14 - 2 * 10
    val perColumn = cardDp / columns.coerceAtLeast(1)
    // A digit of the widgets' face is about 0.56 of its size wide.
    return (perColumn / (chars.coerceAtLeast(4) * 0.58f)) * (m.density / m.scaledDensity)
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
    private const val PREVIEW_TIME_SP = 17f
    private const val SAMPLE_COUNTDOWN = "1:23:45"

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

    /** The sample's times when the widgets hold no day yet: figures alone. */
    private val FALLBACK_ROWS = listOf("05:03", "07:19", "11:37", "13:15", "15:44", "17:44")
      .mapIndexed { i, t -> WidgetSample.Row("", t, i == 3) }

    /** "#abc123", "abc123" → "#ABC123"; anything else → null. */
    fun normaliseHex(input: String?): String? {
      val t = input?.trim()?.uppercase()?.removePrefix("#") ?: return null
      return if (Regex("^[0-9A-F]{6}$").matches(t)) "#$t" else null
    }
  }
}
