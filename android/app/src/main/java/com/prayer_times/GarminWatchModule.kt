package com.prayer_times

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Settings → the Garmin watch: see GarminWatch.kt and src/native/GarminWatch.ts. */
class GarminWatchModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun configure(enabled: Boolean, address: String?, promise: Promise) {
    try {
      GarminWatch.configure(reactContext, enabled, address)
      promise.resolve(GarminWatch.send(reactContext, force = true))
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  /** The thermometer of the app's place; kept for the next send. */
  @ReactMethod
  fun setFahrenheit(fahrenheit: Boolean, promise: Promise) {
    try {
      GarminWatch.setFahrenheit(reactContext, fahrenheit)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  /** The face's accent, the app's: kept, and sent when it changes. */
  @ReactMethod
  fun setAccent(hex: String, promise: Promise) {
    try {
      GarminWatch.setAccent(reactContext, hex)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  /**
   * Opens Gadgetbridge's installer on the watch face this build carries;
   * resolves to "opened", "no-face", "no-gadgetbridge" or "failed". From
   * the current activity when there is one, so back returns to Settings.
   */
  @ReactMethod
  fun installFace(promise: Promise) {
    try {
      promise.resolve(GarminWatch.installFace(reactContext.currentActivity ?: reactContext))
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  /** Sends now, whatever was sent before; resolves to the outcome word. */
  /** "face", "widget" or "field": that watch app, handed to Gadgetbridge's installer. */
  @ReactMethod
  fun installApp(kind: String, promise: Promise) {
    try {
      promise.resolve(GarminWatch.install(reactContext.currentActivity ?: reactContext, kind))
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  /** What the watch shows: the `OPT_` bits (garmin/shared/source/Mihrab.mc). */
  @ReactMethod
  fun setOptions(flags: Int, promise: Promise) {
    try {
      GarminWatch.setOptions(reactContext, flags)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  @ReactMethod
  fun sendNow(promise: Promise) {
    try {
      promise.resolve(GarminWatch.send(reactContext, force = true))
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  @ReactMethod
  fun status(promise: Promise) {
    try {
      val map = Arguments.createMap()
      map.putBoolean("enabled", GarminWatch.enabled(reactContext))
      map.putString("address", GarminWatch.address(reactContext))
      map.putString("gadgetbridge", GarminWatch.gadgetbridgePackage(reactContext))
      map.putBoolean("bundledFace", GarminWatch.hasBundledFace(reactContext))
      map.putBoolean("bundledWidget", GarminWatch.hasBundled(reactContext, "widget"))
      map.putBoolean("bundledField", GarminWatch.hasBundled(reactContext, "field"))
      map.putString("lastResult", GarminWatch.lastResult(reactContext))
      // A double: a timestamp does not fit the bridge's int.
      map.putDouble("lastResultAt", GarminWatch.lastResultAt(reactContext).toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  /** The paired devices, or null when the permission is missing. */
  @ReactMethod
  fun pairedDevices(promise: Promise) {
    try {
      if (!GarminWatch.canListPaired(reactContext)) {
        promise.resolve(null)
        return
      }
      val list = Arguments.createArray()
      for (d in GarminWatch.pairedDevices(reactContext)) {
        val m = Arguments.createMap()
        m.putString("name", d.name)
        m.putString("address", d.address)
        m.putBoolean("garmin", d.garmin)
        list.pushMap(m)
      }
      promise.resolve(list)
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  companion object {
    const val NAME = "GarminWatch"
  }
}
