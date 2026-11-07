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

  /** Sends now, whatever was sent before; resolves to the outcome word. */
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
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("E_GARMIN", e.message, e)
    }
  }

  companion object {
    const val NAME = "GarminWatch"
  }
}
