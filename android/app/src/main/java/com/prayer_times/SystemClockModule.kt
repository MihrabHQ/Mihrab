package com.prayer_times

import android.text.format.DateFormat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.prayer_times.specs.NativeSystemClockSpec

/**
 * Whether the device clock is set to 24-hour time — issue #18.
 *
 * `Settings.System.TIME_12_24` is the only source of truth on Android:
 * it is a system setting, independent of the locale, so ICU (and
 * therefore anything JavaScript can see through `Intl`) cannot answer
 * this. A German phone switched to 12-hour time shows 5:31 PM in the
 * clock app, and the app should agree.
 *
 * Exposed twice on purpose. The constant is there at startup with no
 * round trip, so the first frame is already right; `readIs24Hour()` is
 * called again when the app returns to the foreground, because the
 * user may have gone to Settings precisely to change this.
 *
 * The two have DIFFERENT names, and that is not cosmetic. Under the New
 * Architecture's interop layer a name that is a method is a method, and
 * a constant of the same name is unreachable; under the legacy bridge
 * the constants are `Object.assign`ed over the module and the method is
 * the one that vanishes. One name for both means one of the two halves
 * is dead in every mode — and the first cut shipped exactly that, with
 * `auto` starting as 24-hour on every cold start and flipping a frame
 * later once the promise came back.
 */
class SystemClockModule(private val reactContext: ReactApplicationContext) :
  NativeSystemClockSpec(reactContext) {

  override fun getName(): String = NAME

  private fun read(): Boolean = DateFormat.is24HourFormat(reactContext)

  // The zone as well: JavaScript's first `Intl.DateTimeFormat().resolvedOptions()`
  // built a formatter to learn it, 7 ms of a cold start (utils/zoneClock.ts).
  override fun getTypedExportedConstants(): Map<String, Any> =
    mapOf("is24Hour" to read(), "timeZone" to java.util.TimeZone.getDefault().id)

  override fun readIs24Hour(promise: Promise) {
    promise.resolve(read())
  }

  /**
   * The country of the mobile network the phone is registered on (ISO
   * 3166-1 alpha-2, upper case), or null: no SIM, flight mode, a tablet.
   *
   * A sign of travel, and only that (src/prayer/locationFreshness.ts): the
   * phone knows it the moment it registers after landing, offline and with
   * no permission, long before the satellites answer. It is compared on the
   * phone with what it was at the last position and goes nowhere.
   */
  override fun readNetworkCountryIso(promise: Promise) {
    val iso = try {
      (reactContext.getSystemService(android.content.Context.TELEPHONY_SERVICE)
        as? android.telephony.TelephonyManager)?.networkCountryIso
    } catch (e: Exception) {
      null
    }
    promise.resolve(iso?.takeIf { it.length == 2 }?.uppercase(java.util.Locale.ROOT))
  }

  /**
   * The phone's time zone NOW — its id and its offset from UTC in minutes.
   *
   * Asked of the system each time, for the same comparison as the network's
   * country (locationFreshness.ts). JavaScript's own idea of the zone can
   * lag in a process that has been alive across a change of zone: a move
   * found in the background was recorded under the old zone, and the app,
   * opened, read the new one as a second journey ("still for Dubai", on an
   * Android 17 emulator).
   */
  override fun readTimeZone(promise: Promise) {
    val zone = java.util.TimeZone.getDefault()
    promise.resolve(
      com.facebook.react.bridge.Arguments.createMap().apply {
        putString("zone", zone.id)
        putInt("offset", zone.getOffset(System.currentTimeMillis()) / 60_000)
      },
    )
  }

  companion object {
    const val NAME = "SystemClock"
  }
}
