package com.prayer_times

import android.content.Context

/**
 * The default build: no Glance widgets, so nothing to redraw and nothing
 * placed. The real hook is src/glance/java/com/prayer_times/GlanceWidgetHook.kt,
 * compiled instead with `-PmihrabGlanceWidgets=true` (android/app/build.gradle).
 */
object GlanceWidgetHook {
  @Suppress("UNUSED_PARAMETER")
  fun requestUpdate(context: Context) = Unit

  @Suppress("UNUSED_PARAMETER")
  fun anyPlaced(context: Context): Boolean = false
}
