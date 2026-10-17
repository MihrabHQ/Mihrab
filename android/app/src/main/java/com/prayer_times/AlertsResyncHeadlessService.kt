package com.prayer_times

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS "AlertsResync" task after an app update
 * (MihrabRestartReceiver, MY_PACKAGE_REPLACED): the prayer alerts the
 * previous version scheduled — about four days of them, at the times that
 * version worked out — are written again by this one, and the widget
 * payload with them, without waiting for the app to be opened. Once per
 * build: the JS side records the build it did it for
 * (src/notifications/afterUpdate.ts), so the app's own start skips it.
 *
 * The task name MUST match AppRegistry.registerHeadlessTask('AlertsResync')
 * in index.js. A bundle without it (an older JS on a newer shell) makes
 * React Native log the missing task and finish it; nothing is scheduled
 * wrongly, and the app's start does the work instead.
 *
 * 60 s, like the widget refresh: a cold start of the JS engine, a read of
 * the settings and the cached times, and the notification writes.
 * `allowedInForeground = true`: the user may open the app straight after
 * the update, and the JS side runs the work once either way.
 */
class AlertsResyncHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      "AlertsResync",
      Arguments.fromBundle(extras),
      60_000, // timeout (ms)
      true,   // allowedInForeground
    )
  }
}
