package com.prayer_times

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS "PrayerAlarmAction" headless task for a press on the full-screen
 * prayer alert ([PrayerAlarmActivity]) — Snooze or Log prayer. Those are the
 * notification's own buttons, and the JS that answers them is the same code;
 * this only carries the press there with the app closed.
 *
 * The task name MUST match AppRegistry.registerHeadlessTask('PrayerAlarmAction')
 * in index.js.
 */
class PrayerAlarmHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      "PrayerAlarmAction",
      Arguments.fromBundle(extras),
      30_000, // timeout (ms)
      true,   // allowedInForeground
    )
  }
}
