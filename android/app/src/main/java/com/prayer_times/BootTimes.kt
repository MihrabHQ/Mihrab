package com.prayer_times

import android.os.Process
import android.os.SystemClock
import android.util.Log

/**
 * The native half of a cold start's timeline, as one logcat line:
 *
 *   [boot-native] proc0=1728… napp=48 nrn=63 nactivity=95
 *
 * `proc0` is the wall clock when the process was forked (so it lines up
 * with the JS side's `js0`, see src/boot/bootTimeline.ts); the rest are
 * milliseconds since then. Read by tools/startup-trace.
 */
internal object BootTimes {
  private const val TAG = "MihrabBoot"
  private var line: String? = null

  fun app(appStart: Long, rnDone: Long) {
    val p0 = Process.getStartUptimeMillis()
    line = "napp=${appStart - p0} nrn=${rnDone - p0}"
  }

  /** MainActivity.onCreate has run; print the line (first activity only). */
  fun activity() {
    val pending = line ?: return
    line = null
    val p0 = Process.getStartUptimeMillis()
    val now = SystemClock.uptimeMillis()
    val proc0Wall = System.currentTimeMillis() - (now - p0)
    Log.i(TAG, "[boot-native] proc0=$proc0Wall $pending nactivity=${now - p0}")
  }
}
