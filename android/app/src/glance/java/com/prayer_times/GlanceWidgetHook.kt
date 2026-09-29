package com.prayer_times

import android.content.Context
import com.prayer_times.glance.GlanceWidgets

/**
 * The Glance widgets, as the RemoteViews fan-out sees them.
 *
 * This is the build with `-PmihrabGlanceWidgets=true` (android/app/build.gradle):
 * the Glance receivers are compiled and registered, and every redraw of the
 * RemoteViews widgets redraws them too. The default build compiles the
 * no-op twin in src/glanceOff instead, so the shipping app carries no
 * Glance, no Compose and no extra receivers until the Phase 4 gate is
 * measured (docs/rewrite-plan.md).
 */
object GlanceWidgetHook {
  fun requestUpdate(context: Context) = GlanceWidgets.requestUpdate(context)

  fun anyPlaced(context: Context): Boolean = GlanceWidgets.anyPlaced(context)
}
