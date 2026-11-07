package com.prayer_times

import android.content.Context
import android.content.Intent
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
 * prayers for four days as epoch seconds, today first. The watch keeps
 * them and counts down by itself; its own strings name the prayers.
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

  /** The watch apps' manifest ids (garmin/watchface, garmin/datafield, garmin/widget: manifest.xml). */
  const val FACE_APP_ID = "ce7d1151-6b87-42a1-b561-364b45404b37"
  const val FIELD_APP_ID = "d58b7cb1-c37b-4629-92b1-4720b95ac49b"
  /** The widget, which publishes the complications (garmin/widget). */
  const val WIDGET_APP_ID = "ff148f06-923b-45ec-9afe-542d6779a952"

  const val ACTION = "nodomain.freeyourgadget.gadgetbridge.command.SEND_WATCH_APP_MESSAGE"
  val GADGETBRIDGE_PACKAGES = listOf(
    "nodomain.freeyourgadget.gadgetbridge",
    "nodomain.freeyourgadget.gadgetbridge.nightly",
    "nodomain.freeyourgadget.gadgetbridge.nightly_nopebble",
  )

  private const val DAYS = 4
  private val PRAYER_KEYS = listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")
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
   * The message for the payload the app last wrote: `{"v":1,"t":[…]}`, or
   * null when there is no payload, or no times from today on.
   */
  fun message(context: Context, nowMs: Long = System.currentTimeMillis()): String? {
    val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
    val payload = WidgetContract.Payload.parse(prefs.getString(WidgetPayloadSource.PREFS_KEY_V2, null))
      ?.takeIf { it.schemaVersion == WidgetContract.VERSION } ?: return null
    return message(payload, nowMs)
  }

  fun message(payload: WidgetContract.Payload, nowMs: Long): String? {
    val today = WallClock.dateKey(nowMs)
    val days = payload.days.dropWhile { it.dateKey < today }.take(DAYS)
    if (days.isEmpty()) return null
    val times = JSONArray()
    for (day in days) {
      val byKey = day.prayers.associateBy { it.key }
      for (key in PRAYER_KEYS) {
        val minutes = byKey[key]?.minutes
        val ms = if (minutes == null) null else WallClock.epochMs(day.dateKey, minutes)
        // 0 is "does not occur": the watch skips it.
        times.put(if (ms == null) 0 else (ms / 1000).toInt())
      }
    }
    return JSONObject().put("v", 1).put("t", times).toString()
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
    if (!force &&
      message == prefs.getString(PREFS_LAST_SENT, null) &&
      now - prefs.getLong(PREFS_LAST_SENT_AT, 0L) in 0..RESEND_AFTER_MS
    ) {
      return "unchanged"
    }
    for (appId in listOf(FACE_APP_ID, FIELD_APP_ID, WIDGET_APP_ID)) {
      val intent = Intent(ACTION)
        .setPackage(pkg)
        .putExtra("device", address)
        .putExtra("appId", appId)
        .putExtra("payload", message)
      context.sendBroadcast(intent)
    }
    prefs.edit().putString(PREFS_LAST_SENT, message).putLong(PREFS_LAST_SENT_AT, now).apply()
    Log.i(TAG, "sent ${message.length} bytes to $pkg for $address")
    return "sent"
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
