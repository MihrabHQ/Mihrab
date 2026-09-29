package com.prayer_times.glance

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * Every Glance receiver this build registers, and the one way they are
 * redrawn.
 *
 * The RemoteViews fan-out (`PrayerWidgetProvider.requestUpdate`) is still
 * the single entry point — the payload write, the prayer-boundary alarm,
 * boot, unlock and every tap end there — and it calls `GlanceWidgetHook`,
 * which lands here. So a home screen holding only Glance cards is redrawn
 * by exactly the signals that redraw the RemoteViews ones, and the alarms
 * are armed for it (`anyPlaced`).
 */
internal object GlanceWidgets {
  val receivers: List<Class<out GlanceAppWidgetReceiver>> = listOf(
    HijriGlanceReceiver::class.java,
    TasbihGlanceReceiver::class.java,
    StreakGlanceReceiver::class.java,
  )

  fun anyPlaced(context: Context): Boolean {
    val mgr = AppWidgetManager.getInstance(context)
    return receivers.any { cls ->
      try {
        mgr.getAppWidgetIds(ComponentName(context, cls)).isNotEmpty()
      } catch (_: Throwable) {
        false
      }
    }
  }

  /**
   * Redraw every placed Glance card.
   *
   * Two halves. `GlanceRefresh.bump` recomposes the sessions already
   * running (a card tapped a moment ago), which read the payload inside the
   * composition. The broadcast starts the rest: APPWIDGET_UPDATE to each
   * receiver, whose `onUpdate` runs under `goAsync` and hands every id to
   * Glance — so the redraw survives this process having nothing else alive
   * in it, which a coroutine launched from here would not be promised.
   */
  fun requestUpdate(context: Context) {
    GlanceRefresh.bump()
    val mgr = AppWidgetManager.getInstance(context)
    for (cls in receivers) {
      try {
        val ids = mgr.getAppWidgetIds(ComponentName(context, cls))
        if (ids.isEmpty()) continue
        context.sendBroadcast(
          Intent(context, cls)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids),
        )
      } catch (t: Throwable) {
        Log.w(TAG, "could not redraw ${cls.simpleName}", t)
      }
    }
  }
}
