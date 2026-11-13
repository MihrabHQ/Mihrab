package com.prayer_times

import android.app.AppComponentFactory
import android.app.Service
import android.content.Intent
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * Hands Android our [DownloadForegroundService] where the manifest names
 * notifee's foreground service.
 *
 * Notifee starts `app.notifee.core.ForegroundService` by class, from inside
 * its prebuilt core, so there is no call site of ours to point elsewhere.
 * The component factory is the one place the platform asks the app which
 * object to create for a component, and it is asked with the name — so the
 * Quran download keeps running through notifee exactly as before, in an
 * instance that also answers [Service.onTimeout].
 *
 * Android reads `appComponentFactory` from API 28 on. Below that it is
 * ignored and notifee's own class is created, which costs nothing: the
 * foreground-service time limits it exists for start at Android 15.
 *
 * Replaces androidx's CoreComponentFactory, whose only job is unwrapping
 * components that implement its restricted CompatWrapped interface — none
 * in this app.
 */
@RequiresApi(Build.VERSION_CODES.P)
class MihrabComponentFactory : AppComponentFactory() {
  override fun instantiateService(
    cl: ClassLoader,
    className: String,
    intent: Intent?,
  ): Service =
    if (className == NOTIFEE_FOREGROUND_SERVICE) {
      DownloadForegroundService()
    } else {
      super.instantiateService(cl, className, intent)
    }

  companion object {
    const val NOTIFEE_FOREGROUND_SERVICE = "app.notifee.core.ForegroundService"
  }
}
