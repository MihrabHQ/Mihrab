package com.prayer_times

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService

/**
 * Restarts the Live Activity foreground service after an app update or
 * device reboot, so the user doesn't need to open the app to get the
 * notification back — and, after an update, has the new version write the
 * prayer alerts again (AlertsResyncHeadlessService).
 *
 * Handles two intents:
 *
 *   MY_PACKAGE_REPLACED — fired immediately after this app's APK is
 *     replaced during an OTA update. The old process has already been
 *     killed; this receiver runs in the freshly-installed process.
 *
 *   BOOT_COMPLETED — fired after a full device boot. All foreground
 *     services are dead; we revive the Live Activity if it was active
 *     before the shutdown.
 *
 * Both cases restart the service with the stored payload
 * (MihrabLiveActivityModule.currentPayload): the shared one adapted for
 * this minute, else the last one shown. If the user had explicitly
 * cancelled (MihrabLiveActivityModule.cancel() clears the prefs), or the
 * shared payload has nothing ahead, this receiver is a no-op.
 *
 * The RECEIVE_BOOT_COMPLETED permission is already declared in the
 * manifest (added for the widget receivers). MY_PACKAGE_REPLACED does
 * not require a special permission.
 */
class MihrabRestartReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_MY_PACKAGE_REPLACED &&
        action != Intent.ACTION_BOOT_COMPLETED) return

    // The widgets first, and unconditionally.
    //
    // An app update kills the old process and leaves every placed widget
    // showing whatever RemoteViews the launcher last received — drawn by the
    // code that was just replaced, from a payload that may since have
    // expired. Nothing else redraws them until the user opens the app.
    //
    // Above the early return, because that return is about whether a Live
    // Activity was running, which has nothing to do with whether there are
    // widgets on the home screen.
    try {
      PrayerWidgetProvider.requestUpdate(context)
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to refresh widgets after $action", t)
    }

    // After an update, the prayer alerts: the previous version scheduled the
    // next few days, at the times it worked out, and they fire as written
    // until the app is opened and Today rewrites them — which a widget's
    // deep link into another tab never does. The JS task writes them again
    // now (AlertsResyncHeadlessService). The update broadcast is one of the
    // wake-ups a background service may still be started from; refused
    // anyway, the app's own start does it.
    if (action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      try {
        // The wake lock only once the start is accepted: it has no timeout
        // and only the service's onDestroy releases it, so taken before a
        // start that is refused it would be held until the process dies.
        if (context.startService(Intent(context, AlertsResyncHeadlessService::class.java)) != null) {
          HeadlessJsTaskService.acquireWakeLockNow(context)
          Log.i(TAG, "$action — rewriting the prayer alerts")
        }
      } catch (e: IllegalStateException) {
        Log.i(TAG, "$action — alert rewrite refused in the background; the app's start will do it")
      } catch (t: Throwable) {
        Log.w(TAG, "Failed to start the alert rewrite after $action", t)
      }
    }

    val payload = MihrabLiveActivityModule.currentPayload(context)
    if (payload.isNullOrEmpty()) {
      Log.i(TAG, "$action — nothing to draw (off, or nothing ahead), skipping restart")
      return
    }

    Log.i(TAG, "$action — restarting Live Activity service")
    MihrabLiveActivityModule.ensureChannelExists(context)
    MihrabLiveActivityModule.ensureFgsChannelExists(context)
    val serviceIntent = Intent(context, MihrabLiveActivityService::class.java).apply {
      putExtra(MihrabLiveActivityService.EXTRA_PAYLOAD, payload)
    }
    try {
      ContextCompat.startForegroundService(context, serviceIntent)
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to restart Live Activity service after $action", t)
    }
  }

  companion object {
    const val TAG = "MihrabRestartReceiver"
  }
}
