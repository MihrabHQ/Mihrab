package com.prayer_times

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Whether Android will let a prayer alert take the whole screen — issue #63.
 *
 * USE_FULL_SCREEN_INTENT is granted at install below Android 14. From 14 on
 * the person can revoke it, and Play only pre-grants it to calling and alarm
 * apps, so the settings row asks here and sends the person to the system page
 * when it is off. Without it Android quietly downgrades the alert to an
 * ordinary heads-up: nothing breaks, it just is not full-screen.
 */
class FullScreenAlarmModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FullScreenAlarm"

  @ReactMethod
  fun canUse(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      promise.resolve(true)
      return
    }
    val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    promise.resolve(runCatching { nm.canUseFullScreenIntent() }.getOrDefault(true))
  }

  @ReactMethod
  fun openSettings(promise: Promise) {
    val pkg = reactContext.packageName
    val intent =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$pkg"))
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
      }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { reactContext.startActivity(intent) }
      .onSuccess { promise.resolve(null) }
      .onFailure {
        // Some shells hide the dedicated page; the app's notification
        // settings are the next best place.
        runCatching {
          reactContext.startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
              .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
        }
        promise.resolve(null)
      }
  }
}

class FullScreenAlarmPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(FullScreenAlarmModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
