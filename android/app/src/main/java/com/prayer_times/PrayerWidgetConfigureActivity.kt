package com.prayer_times

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.RadioGroup
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.materialswitch.MaterialSwitch
import kotlin.math.max
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout

/**
 * Shown when the user adds the widget or opens “Settings” from the widget’s long-press menu.
 * Writes the same SharedPreferences keys the app and [PrayerWidgetProvider] use.
 */
class PrayerWidgetConfigureActivity : AppCompatActivity() {

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
      v.setPadding(
        max(bars.left, cutout.left),
        max(bars.top, cutout.top),
        max(bars.right, cutout.right),
        max(bars.bottom, cutout.bottom),
      )
      windowInsets
    }
    ViewCompat.requestApplyInsets(root)

    val toolbar = findViewById<MaterialToolbar>(R.id.widget_configure_toolbar)
    setSupportActionBar(toolbar)
    toolbar.setNavigationOnClickListener { finish() }

    val prefs = getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val opacityStored =
      prefs.getInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, 88).coerceIn(0, 100)
    val highlightRaw =
      prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, "green")?.trim()
    // Dynamic (phone accent) is gone (2026-08-27, by request). The stored
    // flag is not read back into a selection: a widget configured by an
    // older build opens on the colour it will actually be drawn in, which
    // for "dynamic" is green — see `readWidgetStyle` in PrayerWidgetProvider.
    val highlightId =
      if (highlightRaw.isNullOrEmpty() || highlightRaw.lowercase() == "dynamic") {
        "green"
      } else {
        highlightRaw
      }
    val storedHex =
      prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, "")?.trim()
        ?: ""
    val seek = findViewById<SeekBar>(R.id.widget_configure_opacity_seek)
    val opacityLabel = findViewById<TextView>(R.id.widget_configure_opacity_value)
    seek.max = 100
    seek.progress = opacityStored

    fun updateOpacityLabel() {
      val v = seek.progress
      opacityLabel.text = getString(R.string.widget_configure_opacity_percent, v)
    }
    updateOpacityLabel()
    seek.setOnSeekBarChangeListener(
      object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(
          sb: SeekBar?,
          progress: Int,
          fromUser: Boolean,
        ) {
          updateOpacityLabel()
        }

        override fun onStartTrackingTouch(sb: SeekBar?) {}

        override fun onStopTrackingTouch(sb: SeekBar?) {}
      },
    )

    val radioGroup = findViewById<RadioGroup>(R.id.widget_configure_highlight_group)
    val hexLayout = findViewById<TextInputLayout>(R.id.widget_configure_hex_layout)
    val hexInput = findViewById<TextInputEditText>(R.id.widget_configure_hex_input)

    val radioId =
      when (highlightId.lowercase()) {
        "teal" -> R.id.widget_configure_highlight_teal
        "blue" -> R.id.widget_configure_highlight_blue
        "amber" -> R.id.widget_configure_highlight_amber
        "custom" -> R.id.widget_configure_highlight_custom
        else -> R.id.widget_configure_highlight_green
      }
    radioGroup.check(radioId)

    fun syncHexVisibility() {
      val custom = radioGroup.checkedRadioButtonId == R.id.widget_configure_highlight_custom
      hexLayout.visibility = if (custom) View.VISIBLE else View.GONE
    }
    hexInput.setText(
      if (storedHex.matches(Regex("^#([0-9A-Fa-f]{6})$"))) {
        storedHex
      } else {
        "#46A081"
      },
    )
    syncHexVisibility()
    radioGroup.setOnCheckedChangeListener { _, _ -> syncHexVisibility() }

    // ── The prayer-times widget's own options ────────────────────────────
    // Only the prayer-times cards read these (PrayerGlanceWidget), so the
    // section is shown only when this screen was opened from one of them.
    val isPrayerWidget = isPrayerTimesWidget(appWidgetId)
    val prayerSection = findViewById<LinearLayout>(R.id.widget_configure_prayer_section)
    prayerSection.visibility = if (isPrayerWidget) View.VISIBLE else View.GONE
    val display = PrayerWidgetDisplay.read(this)
    val storedTextHex = prefs.getString(PrayerWidgetDisplay.KEY_TEXT_HEX, "")?.trim().orEmpty().uppercase()
    val textGroup = findViewById<RadioGroup>(R.id.widget_configure_text_group)
    val textHexLayout = findViewById<TextInputLayout>(R.id.widget_configure_text_hex_layout)
    val textHexInput = findViewById<TextInputEditText>(R.id.widget_configure_text_hex_input)
    val presetIds = TEXT_PRESETS.map { it.first }
    val presetIndex = TEXT_PRESETS.indexOfFirst { it.second == storedTextHex.ifEmpty { TEXT_PRESETS[0].second } }
    textGroup.check(if (presetIndex >= 0) presetIds[presetIndex] else R.id.widget_configure_text_custom)
    textHexInput.setText(if (presetIndex < 0 && HEX.matches(storedTextHex)) storedTextHex else "#FFFFFF")
    fun syncTextHexVisibility() {
      val custom = textGroup.checkedRadioButtonId == R.id.widget_configure_text_custom
      textHexLayout.visibility = if (custom) View.VISIBLE else View.GONE
      textHexLayout.error = null
    }
    syncTextHexVisibility()
    textGroup.setOnCheckedChangeListener { _, _ -> syncTextHexVisibility() }

    val showLocation = findViewById<MaterialSwitch>(R.id.widget_configure_show_location)
    val showCountdown = findViewById<MaterialSwitch>(R.id.widget_configure_show_countdown)
    val showTable = findViewById<MaterialSwitch>(R.id.widget_configure_show_table)
    showLocation.isChecked = display.showLocation
    showCountdown.isChecked = display.showCountdown
    showTable.isChecked = display.showTable

    // 80 … 150 % in steps of 10: the seek bar's 0 … 7.
    val sizeSeek = findViewById<SeekBar>(R.id.widget_configure_time_size_seek)
    val sizeLabel = findViewById<TextView>(R.id.widget_configure_time_size_value)
    sizeSeek.max = (PrayerWidgetDisplay.SCALE_MAX - PrayerWidgetDisplay.SCALE_MIN) / 10
    sizeSeek.progress = (Math.round(display.timeScale * 100) - PrayerWidgetDisplay.SCALE_MIN) / 10
    fun sizePercent() = PrayerWidgetDisplay.SCALE_MIN + sizeSeek.progress * 10
    fun updateSizeLabel() {
      sizeLabel.text = getString(R.string.widget_configure_opacity_percent, sizePercent())
    }
    updateSizeLabel()
    sizeSeek.setOnSeekBarChangeListener(
      object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) = updateSizeLabel()
        override fun onStartTrackingTouch(sb: SeekBar?) {}
        override fun onStopTrackingTouch(sb: SeekBar?) {}
      },
    )

    findViewById<MaterialButton>(R.id.widget_configure_save).setOnClickListener {
      val checked = radioGroup.checkedRadioButtonId
      val hid =
        when (checked) {
          R.id.widget_configure_highlight_teal -> "teal"
          R.id.widget_configure_highlight_blue -> "blue"
          R.id.widget_configure_highlight_amber -> "amber"
          R.id.widget_configure_highlight_custom -> "custom"
          else -> "green"
        }
      val hexForStore =
        if (hid == "custom") {
          val raw = hexInput.text?.toString()?.trim() ?: ""
          if (raw.matches(Regex("^#([0-9A-Fa-f]{6})$"))) {
            raw
          } else {
            "#46A081"
          }
        } else {
          ""
        }

      // The custom text colour must be a real #RRGGBB before anything is
      // saved: a typo would otherwise draw the widget in the default and
      // look like the setting had been ignored.
      var textHex = ""
      if (isPrayerWidget) {
        val checkedText = textGroup.checkedRadioButtonId
        if (checkedText == R.id.widget_configure_text_custom) {
          val raw = normaliseHex(textHexInput.text?.toString())
          if (raw == null) {
            textHexLayout.error = getString(R.string.widget_configure_hex_invalid)
            return@setOnClickListener
          }
          textHex = raw
        } else {
          textHex = TEXT_PRESETS.firstOrNull { it.first == checkedText }?.second ?: TEXT_PRESETS[0].second
        }
      }

      val editor = prefs.edit()
      if (isPrayerWidget) {
        editor
          .putString(PrayerWidgetDisplay.KEY_TEXT_HEX, textHex)
          .putBoolean(PrayerWidgetDisplay.KEY_SHOW_LOCATION, showLocation.isChecked)
          .putBoolean(PrayerWidgetDisplay.KEY_SHOW_COUNTDOWN, showCountdown.isChecked)
          .putBoolean(PrayerWidgetDisplay.KEY_SHOW_TABLE, showTable.isChecked)
          .putInt(PrayerWidgetDisplay.KEY_TIME_SCALE, sizePercent())
      }
      editor
        .putInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, seek.progress)
        .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, hid)
        .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, hexForStore)
        // Written as false rather than left alone: saving here is the one
        // moment we know the user has looked at this screen, and an older
        // build's stored `true` would otherwise sit in the store for ever,
        // waiting for a downgrade to honour it.
        .putBoolean(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC, false)
        .apply()

      // Every card honours these two settings, so every card has to be
      // redrawn — not just the prayer-times ones.
      //
      // This used to collect PrayerWidgetProvider's ids, ADD the id it was
      // launched for, and hand the lot to refreshAll. That was wrong twice
      // over. It left the Streak, Log, Reading, Tasbih and Hijri cards
      // showing the old colours until something unrelated redrew them. And
      // refreshAll pushes `buildViews` — the PRAYER-TIMES layout — into
      // every id it is given, so the moment those five could reach this
      // screen, saving from a Hijri widget would have drawn a prayer-times
      // card into it. The line that added `appWidgetId` was defending
      // against a launcher that had not registered the new widget yet; the
      // fan-out below re-reads the ids itself, which covers that case
      // without assuming the widget belongs to any particular provider.
      PrayerWidgetProvider.requestUpdate(this)

      setResult(
        RESULT_OK,
        Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId),
      )
      finish()
    }
  }


  /** Is this widget one of the prayer-times cards (its options apply)? */
  private fun isPrayerTimesWidget(appWidgetId: Int): Boolean {
    val cls = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider?.className
      ?: return false
    return cls in PRAYER_TIMES_PROVIDERS
  }

  companion object {
    private val HEX = Regex("^#[0-9A-F]{6}$")

    /** The cards PrayerGlanceWidget draws: Next prayer, Prayer times, tall. */
    private val PRAYER_TIMES_PROVIDERS = setOf(
      PrayerWidgetProvider::class.java.name,
      PrayerWidgetSmallProvider::class.java.name,
      PrayerWidgetLargeProvider::class.java.name,
    )

    /** The app's swatches (settings/WidgetCard.tsx), in its order. */
    private val TEXT_PRESETS = listOf(
      R.id.widget_configure_text_light to "#E8EAED",
      R.id.widget_configure_text_white to "#FFFFFF",
      R.id.widget_configure_text_cream to "#F3E9D2",
      R.id.widget_configure_text_gold to "#E5C07B",
      R.id.widget_configure_text_sky to "#A8C7FA",
      R.id.widget_configure_text_dark to "#1C1C1E",
    )

    /** "#abc123", "abc123" → "#ABC123"; anything else → null. */
    fun normaliseHex(input: String?): String? {
      val t = input?.trim()?.uppercase()?.removePrefix("#") ?: return null
      return if (Regex("^[0-9A-F]{6}$").matches(t)) "#$t" else null
    }
  }
}
