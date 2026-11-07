package com.prayer_times

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager.PERMISSION_GRANTED
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import android.content.pm.PackageManager
import android.util.Log
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract
import org.json.JSONArray
import org.json.JSONObject

/**
 * The Garmin watch, through Gadgetbridge (garmin/README.md).
 *
 * Gadgetbridge's Intent API carries a message to a Connect IQ app on the
 * watch: `SEND_WATCH_APP_MESSAGE` with the watch's Bluetooth address, the
 * app's UUID and a JSON payload, which Gadgetbridge encodes the Garmin way
 * and encrypts to the watch (its GarminWatchAppCommunicator). It is small —
 * about 260 bytes encoded — so the payload is numbers only: the five
 * prayers and sunrise for three days as epoch seconds, today first, two
 * flags — the app's 12-hour clock, and Fahrenheit for its place — and the
 * app's accent, with the face's options in its top byte (a key of their
 * own would cost bytes the limit does not have). The watch keeps them and
 * counts down by itself; its own strings name the prayers.
 *
 * Sent whenever the app writes its widget payload (PrayerWidgetModule), which
 * is the one schedule every Android surface draws from — daily by the
 * refresh task, and on any change of place or method — and from Settings.
 * The same bytes are not sent again within [RESEND_AFTER_MS]: Gadgetbridge
 * wakes the watch for each one.
 *
 * Nothing is read back: the watch's address is typed in Settings from
 * Gadgetbridge's device page (reading paired devices would need the
 * Bluetooth permission for a field the person fills once).
 */
object GarminWatch {
  const val PREFS_NAME = "garmin_watch"
  const val PREFS_ENABLED = "enabled"
  const val PREFS_ADDRESS = "address"
  private const val PREFS_LAST_SENT = "last_sent"
  private const val PREFS_LAST_SENT_AT = "last_sent_at"
  /** Whether the app's place reads its thermometer in Fahrenheit (JS decides, from the coordinates). */
  private const val PREFS_FAHRENHEIT = "fahrenheit"
  /** The face's accent, 0xRRGGBB on the watch screen's palette. */
  private const val PREFS_ACCENT = "accent"
  /** The face's options, one byte (garminWatch.ts, garminFaceBits). */
  private const val PREFS_FACE = "face"
  /** The app's green as the watch screen shows it (garminWatch.ts). */
  const val DEFAULT_ACCENT = 0x00AA55

  /** The watch apps' manifest ids (garmin/watchface, garmin/datafield, garmin/widget: manifest.xml). */
  const val FACE_APP_ID = "ce7d1151-6b87-42a1-b561-364b45404b37"
  const val FIELD_APP_ID = "d58b7cb1-c37b-4629-92b1-4720b95ac49b"
  /** The widget, which publishes the complications (garmin/widget). */
  const val WIDGET_APP_ID = "ff148f06-923b-45ec-9afe-542d6779a952"
  val APP_IDS = listOf(FACE_APP_ID, FIELD_APP_ID, WIDGET_APP_ID)

  const val ACTION = "nodomain.freeyourgadget.gadgetbridge.command.SEND_WATCH_APP_MESSAGE"
  val GADGETBRIDGE_PACKAGES = listOf(
    "nodomain.freeyourgadget.gadgetbridge",
    "nodomain.freeyourgadget.gadgetbridge.nightly",
    "nodomain.freeyourgadget.gadgetbridge.nightly_nopebble",
  )

  /**
   * Three days of six times — eighteen numbers, fewer than the twenty of
   * four days of five, so the message stays inside Gadgetbridge's limit.
   */
  private const val DAYS = 3
  /** Each day's times as the watch reads them; Sunrise from the day's own row. */
  private val TIME_KEYS = listOf("Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha")
  private const val RESEND_AFTER_MS = 6 * 60 * 60_000L
  private const val TAG = "MihrabGarmin"

  private val ADDRESS = Regex("^([0-9A-F]{2}:){5}[0-9A-F]{2}$")

  fun enabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(PREFS_ENABLED, false)

  fun address(context: Context): String =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREFS_ADDRESS, "") ?: ""

  /** Upper case with colons, or null when it is not a Bluetooth address. */
  fun normalizeAddress(raw: String?): String? {
    val s = raw?.trim()?.uppercase()?.replace('-', ':') ?: return null
    return if (ADDRESS.matches(s)) s else null
  }

  fun configure(context: Context, enabled: Boolean, address: String?) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(PREFS_ENABLED, enabled)
      .putString(PREFS_ADDRESS, normalizeAddress(address) ?: "")
      // A changed setting is a reason to send, whatever went before.
      .remove(PREFS_LAST_SENT)
      .apply()
  }

  /**
   * Whether the weather on the watch reads in Fahrenheit, for the place the
   * app is set to. Kept, not sent: the next payload write carries it.
   */
  fun setFahrenheit(context: Context, fahrenheit: Boolean) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit().putBoolean(PREFS_FAHRENHEIT, fahrenheit).apply()
  }

  /**
   * The app's accent (#RRGGBB), snapped to the watch's palette: a
   * memory-in-pixel screen shows 64 colours, each channel one of 00, 55,
   * AA or FF, and any other is dithered into a speckle. Sent at once when
   * it changes, since no new schedule may come for a day.
   */
  fun setAccent(context: Context, hex: String) {
    val rgb = snapToWatchPalette(hex) ?: return
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.getInt(PREFS_ACCENT, DEFAULT_ACCENT) == rgb && prefs.contains(PREFS_ACCENT)) return
    prefs.edit().putInt(PREFS_ACCENT, rgb).apply()
    if (enabled(context)) send(context)
  }

  /**
   * #RRGGBB to the nearest of the 64 colours, or null if not a colour: the
   * hue kept first, then the saturation and brightness, among those bright
   * enough to read on black (a grey stays a grey).
   */
  fun snapToWatchPalette(hex: String): Int? {
    val m = Regex("^#?([0-9a-fA-F]{6})$").find(hex.trim()) ?: return null
    val n = m.groupValues[1].toInt(16)
    val want = FloatArray(3)
    android.graphics.Color.RGBToHSV((n shr 16) and 0xFF, (n shr 8) and 0xFF, n and 0xFF, want)
    val grey = want[1] <= 0.15f
    val levels = intArrayOf(0x00, 0x55, 0xAA, 0xFF)
    val have = FloatArray(3)
    var best = DEFAULT_ACCENT
    var bestScore = Float.MAX_VALUE
    for (r in levels) for (g in levels) for (b in levels) {
      android.graphics.Color.RGBToHSV(r, g, b, have)
      if (have[2] < 0.6f) continue
      if (grey != (have[1] <= 0.15f)) continue
      if (!grey && have[1] < 0.3f) continue
      var dh = Math.abs(want[0] - have[0]) / 360f
      if (dh > 0.5f) dh = 1f - dh
      val score = (if (grey) 0f else dh * 10f) + Math.abs(want[1] - have[1]) + Math.abs(want[2] - have[2])
      if (score < bestScore) {
        bestScore = score
        best = (r shl 16) or (g shl 8) or b
      }
    }
    return best
  }

  /**
   * The watch face's options, a byte (garminFaceBits): kept, and sent at
   * once when they change, as the accent is.
   */
  fun setFaceOptions(context: Context, bits: Int) {
    val face = bits and 0xFF
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (prefs.getInt(PREFS_FACE, 0) == face && prefs.contains(PREFS_FACE)) return
    prefs.edit().putInt(PREFS_FACE, face).apply()
    if (enabled(context)) send(context)
  }

  private fun face(context: Context): Int =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getInt(PREFS_FACE, 0)

  private fun accent(context: Context): Int =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getInt(PREFS_ACCENT, DEFAULT_ACCENT)

  private fun fahrenheit(context: Context): Boolean =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(PREFS_FAHRENHEIT, false)

  /** Which Gadgetbridge build is installed, or null. */
  fun gadgetbridgePackage(context: Context): String? {
    val pm = context.packageManager
    return GADGETBRIDGE_PACKAGES.firstOrNull {
      try {
        pm.getPackageInfo(it, 0)
        true
      } catch (e: PackageManager.NameNotFoundException) {
        false
      }
    }
  }

  /**
   * The message for the payload the app last wrote:
   * `{"v":2,"t":[…],"h12":0|1,"f":0|1,"a":0xOORRGGBB}` — the times (six a
   * day: the prayers and sunrise, 0 where one does not occur), the app's
   * clock (Settings → Appearance, as the widgets have it), the thermometer
   * of its place and its accent, the face's options (OO) above it — or null
   * when there is no payload, or no times from today on. With the top bit
   * of the options set the number is negative, which the watch reads the same.
   */
  fun message(context: Context, nowMs: Long = System.currentTimeMillis()): String? {
    val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val payload = WidgetContract.Payload.parse(prefs.getString(WidgetPayloadSource.PREFS_KEY_V2, null))
      ?.takeIf { it.schemaVersion == WidgetContract.VERSION } ?: return null
    return message(payload, nowMs, fahrenheit(context), accent(context), face(context))
  }

  fun message(payload: WidgetContract.Payload, nowMs: Long, fahrenheit: Boolean = false, accent: Int = DEFAULT_ACCENT, face: Int = 0): String? {
    val today = WallClock.dateKey(nowMs)
    val days = payload.days.dropWhile { it.dateKey < today }.take(DAYS)
    if (days.isEmpty()) return null
    val times = JSONArray()
    for (day in days) {
      val byKey = day.prayers.associateBy { it.key }
      for (key in TIME_KEYS) {
        // Sunrise is its own row, absent when the app is set not to show it.
        val minutes = if (key == "Sunrise") day.sunrise?.minutes else byKey[key]?.minutes
        val ms = if (minutes == null) null else WallClock.epochMs(day.dateKey, minutes)
        // 0 is "does not occur": the watch skips it.
        times.put(if (ms == null) 0 else (ms / 1000).toInt())
      }
    }
    return JSONObject()
      .put("v", 2)
      .put("t", times)
      .put("h12", if (payload.clock.hour12) 1 else 0)
      .put("f", if (fahrenheit) 1 else 0)
      .put("a", ((face and 0xFF) shl 24) or (accent and 0xFFFFFF))
      .toString()
  }

  /**
   * Sends the current schedule to each of the watch apps. Returns what happened,
   * for the log and for Settings: "sent", "unchanged", "disabled",
   * "no-address", "no-gadgetbridge", "no-times".
   */
  fun send(context: Context, force: Boolean = false): String {
    if (!enabled(context)) return "disabled"
    val address = normalizeAddress(address(context)) ?: return "no-address"
    val pkg = gadgetbridgePackage(context) ?: return "no-gadgetbridge"
    val message = message(context) ?: return "no-times"
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    // The app list is part of what was sent: a build that adds a watch app
    // sends again, or the new app waits for the next change of schedule.
    val sent = APP_IDS.joinToString(",") + "|" + message
    if (!force &&
      sent == prefs.getString(PREFS_LAST_SENT, null) &&
      now - prefs.getLong(PREFS_LAST_SENT_AT, 0L) in 0..RESEND_AFTER_MS
    ) {
      return "unchanged"
    }
    for (appId in APP_IDS) {
      val intent = Intent(ACTION)
        .setPackage(pkg)
        .putExtra("device", address)
        .putExtra("appId", appId)
        .putExtra("payload", message)
      context.sendBroadcast(intent)
    }
    prefs.edit().putString(PREFS_LAST_SENT, sent).putLong(PREFS_LAST_SENT_AT, now).apply()
    Log.i(TAG, "sent ${message.length} bytes to $pkg for $address")
    return "sent"
  }

  /** A paired Bluetooth device, as the picker in Settings shows it. */
  data class Paired(val name: String, val address: String, val garmin: Boolean)

  private val GARMIN_NAMES = Regex(
    "enduro|f[eē]nix|forerunner|venu|instinct|epix|v[ií]voactive|vivomove|descent|quatix|tactix|marq|approach|lily|edge|garmin",
    RegexOption.IGNORE_CASE,
  )

  /** Whether the paired-devices list may be read (Android 12+: BLUETOOTH_CONNECT). */
  fun canListPaired(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PERMISSION_GRANTED

  /**
   * The devices paired with this phone, Garmin watches first — the watch
   * Gadgetbridge connects to is bonded like any other. Empty without the
   * permission, or without Bluetooth.
   */
  fun pairedDevices(context: Context): List<Paired> {
    if (!canListPaired(context)) return emptyList()
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter ?: return emptyList()
    return try {
      adapter.bondedDevices
        .map { d -> Paired(d.name ?: d.address, d.address, GARMIN_NAMES.containsMatchIn(d.name ?: "")) }
        .sortedWith(compareByDescending<Paired> { it.garmin }.thenBy { it.name })
    } catch (e: SecurityException) {
      emptyList()
    }
  }

  /** The watch face built with this APK (app/build.gradle, copyGarminFace). */
  private const val FACE_ASSET = "garmin/mihrab-face.prg"

  /** Whether this build carries a watch face to install. */
  fun hasBundledFace(context: Context): Boolean =
    try {
      context.assets.open(FACE_ASSET).close()
      true
    } catch (e: Exception) {
      false
    }

  /**
   * Hands the watch face that came with this build to Gadgetbridge's
   * installer, which asks before it installs — the same screen as opening
   * the .prg from a file manager. Returns "opened", "no-face",
   * "no-gadgetbridge" or "failed".
   */
  fun installFace(context: Context): String {
    val pkg = gadgetbridgePackage(context) ?: return "no-gadgetbridge"
    if (!hasBundledFace(context)) return "no-face"
    return try {
      val dir = File(context.filesDir, "garmin").apply { mkdirs() }
      val file = File(dir, "mihrab-face.prg")
      context.assets.open(FACE_ASSET).use { input -> file.outputStream().use { input.copyTo(it) } }
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.adhan", file)
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/octet-stream")
        .setPackage(pkg)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      "opened"
    } catch (e: Exception) {
      Log.w(TAG, "could not open Gadgetbridge's installer", e)
      "failed"
    }
  }

  /** After the app wrote its widget payload: send if it is on, quietly. */
  fun onPayloadWritten(context: Context) {
    if (!enabled(context)) return
    try {
      send(context)
    } catch (e: Exception) {
      Log.w(TAG, "could not send to the watch", e)
    }
  }
}
