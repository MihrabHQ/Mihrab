package com.prayer_times

import com.facebook.react.bridge.ReactApplicationContext
import com.prayer_times.specs.NativeAppVersionSpec

/**
 * Exposes installed app version metadata to JavaScript.
 */
class AppVersionModule(reactContext: ReactApplicationContext) :
  NativeAppVersionSpec(reactContext) {

  override fun getName(): String = NAME

  override fun getTypedExportedConstants(): Map<String, Any> =
    mapOf(
      "versionName" to BuildConfig.VERSION_NAME,
      "buildNumber" to BuildConfig.VERSION_CODE.toString(),
    )

  companion object {
    const val NAME = "AppVersion"
  }
}
