package com.prayer_times

import android.app.ForegroundServiceStartNotAllowedException
import android.app.Service
import android.os.Build
import android.util.Log
import app.notifee.core.ForegroundService

/**
 * Notifee's foreground service, with the two endings Android 15 added and
 * notifee 9 does not handle.
 *
 * The Quran download runs in this service with the dataSync type. Since
 * Android 15 a dataSync service may run for six hours in a day while the
 * app is in the background; at the limit the system calls [onTimeout] and
 * gives the service a few seconds to stop. Notifee does not override it,
 * so the service stayed up and the system killed the app with
 * ForegroundServiceDidNotStopInTimeException — Play, 2.37.0, Android 17,
 * November 2026. Here the service stops when told to.
 *
 * Once the budget is spent, a new startForeground of the same type throws
 * [ForegroundServiceStartNotAllowedException] until the app is opened again
 * (which also resets the six hours). Notifee calls startForeground inside
 * onStartCommand, so that throw would be a crash too; it is caught, and
 * the service stops instead. The download itself is JavaScript and goes on
 * while the app is alive — it only loses the bar in the shade and the
 * protection from being frozen.
 *
 * Notifee keeps which notification the service is showing in two statics
 * and clears them only on its own way out. A service the system stopped
 * leaves them set, and the next download would then skip startForeground
 * altogether — a crash of its own (DidNotStartInTime) — so every way out
 * here clears them.
 */
class DownloadForegroundService : ForegroundService() {
  override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int =
    try {
      super.onStartCommand(intent, flags, startId)
    } catch (e: RuntimeException) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        e is ForegroundServiceStartNotAllowedException
      ) {
        Log.w(TAG, "foreground service refused; download continues without it", e)
        stopNow()
        START_NOT_STICKY
      } else {
        throw e
      }
    }

  override fun onTimeout(startId: Int, fgsType: Int) {
    Log.w(TAG, "foreground service timed out (type $fgsType); stopping")
    stopNow()
  }

  override fun onDestroy() {
    forget()
    super.onDestroy()
  }

  private fun stopNow() {
    try {
      stopForeground(Service.STOP_FOREGROUND_REMOVE)
    } catch (_: RuntimeException) {
      // Not in the foreground: nothing to remove.
    }
    forget()
    stopSelf()
  }

  private fun forget() {
    ForegroundService.a = null
    ForegroundService.b = -1
  }

  private companion object {
    const val TAG = "MihrabDownloadService"
  }
}
