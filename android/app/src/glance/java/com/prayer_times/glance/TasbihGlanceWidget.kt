package com.prayer_times.glance

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import com.prayer_times.PrayerWidgetProvider
import com.prayer_times.R
import com.prayer_times.WidgetQueueEvents
import com.prayer_times.WidgetTasbihQueue
import com.prayer_times.contract.WidgetContract

/**
 * Tasbih on Glance — PrayerWidgetTasbihProvider's card.
 *
 * The count on the left over the preset's name, its target and the day's
 * total, with the six dots of the cycle; +1 across the top of the right
 * column, Reset and Next under it. A tap does not write the counter: it is
 * queued (WidgetTasbihQueue) for the app to replay, and the card draws the
 * queue projected over the payload — the same projection the app makes when
 * it drains, so the number on the card and the number in the app agree.
 *
 * The one rule easy to get wrong is kept: a bounded preset stops at its
 * target, and +1 is then disabled in place rather than hidden, so the other
 * two controls do not move under a thumb on its way down.
 */
internal class TasbihGlanceWidget : MihrabGlanceWidget("tasbih") {

  private class Model(
    val colors: Colors,
    val label: String,
    val count: Int,
    val target: Int,
    val incEnabled: Boolean,
    val index: Int,
    val total: Int,
    val todayTotal: Int,
    val todayRounds: Int,
  ) {
    val complete: Boolean get() = target > 0 && count >= target
  }

  @Composable
  override fun Content() {
    val context = localizedContext()
    val size = cardSize()
    val result = guarded("tasbih") {
      val now = Now.current()
      GlancePayload.live(context, now)?.tasbih?.let { model(context, it) }
    }
    val colors = result.getOrNull()?.colors ?: Colors.of(context)
    MihrabCard(colors.background, openRoute(context, "mihrab://tasbih")) {
      result.fold(
        onSuccess = { m ->
          if (m == null) Placeholder(context.getString(R.string.widget_placeholder_open_app))
          else Counter(context, m, size)
        },
        onFailure = { ErrorContent(context, it) },
      )
    }
  }

  /** The payload's counter with the queued taps applied — WidgetTasbihQueue.project. */
  private fun model(context: Context, t: WidgetContract.Tasbih): Model {
    val total = t.total
    // The whole cycle's labels, targets and flags: Next moves the index here,
    // before the app runs, so the singular fields are only right until then.
    val targets = t.targets.ifEmpty { List(total) { t.target } }
    val flags = t.unboundedFlags.ifEmpty { List(total) { t.unbounded } }
    val p = WidgetTasbihQueue.project(
      index = t.index,
      total = total,
      counts = t.counts,
      targets = targets,
      unboundedFlags = flags,
      todayTotal = t.todayTotal,
      queue = WidgetTasbihQueue.read(context),
    )
    val count = p.counts.getOrElse(p.index) { t.count }
    val target = t.targets.getOrElse(p.index) { t.target }
    val unbounded = t.unboundedFlags.getOrElse(p.index) { t.unbounded }
    val complete = target > 0 && count >= target
    return Model(
      colors = Colors.of(context),
      label = t.labels.getOrElse(p.index) { t.label },
      count = count,
      target = target,
      incEnabled = !(complete && !unbounded),
      index = p.index,
      total = total,
      todayTotal = p.todayTotal,
      todayRounds = t.todayRounds,
    )
  }

  @Composable
  private fun Counter(context: Context, m: Model, size: CardSize) {
    // Below 110dp the "today" line goes, so the count, target and dots keep
    // their room. 0 is unmeasured: the full card.
    val short = size.heightDp in 1 until SHORT_HEIGHT_DP
    Row(modifier = GlanceModifier.fillMaxSize()) {
      Column(
        modifier = GlanceModifier.defaultWeight().fillMaxHeight(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Label(m.label, 12f, Palette.MUTED, medium = true)
        Row(verticalAlignment = Alignment.Bottom) {
          Label(m.count.toString(), 34f, Palette.TEXT, medium = true)
          if (m.target > 0) {
            Label(
              context.getString(R.string.widget_tasbih_of, m.target),
              12f,
              if (m.complete) m.colors.accent else Palette.MUTED,
              modifier = GlanceModifier.padding(start = 5.dp),
            )
          }
        }
        if (!short) Label(footerLine(context, m.todayTotal, m.todayRounds), 10f, Palette.MUTED)
        // Each dot in a box that carries the 4dp gap, rather than a spacer
        // between them: six dots and five spacers would pass Glance's limit
        // of ten children to a Row.
        Row(modifier = GlanceModifier.padding(top = 5.dp)) {
          for (i in 0 until minOf(m.total, DOTS)) {
            Box(modifier = GlanceModifier.padding(end = if (i < minOf(m.total, DOTS) - 1) 4.dp else 0.dp)) {
              Box(
                modifier = GlanceModifier
                  .size(6.dp)
                  .background(
                    ImageProvider(
                      if (i == m.index) R.drawable.widget_tasbih_dot_on else R.drawable.widget_tasbih_dot_off,
                    ),
                  ),
              ) {}
            }
          }
        }
      }
      Column(modifier = GlanceModifier.width(140.dp).fillMaxHeight().padding(start = 8.dp)) {
        val inc = GlanceModifier
          .defaultWeight()
          .fillMaxWidth()
          .background(
            ImageProvider(if (m.incEnabled) R.drawable.widget_tasbih_primary else R.drawable.widget_tasbih_disabled),
          )
        Box(
          modifier = if (m.incEnabled) inc.clickable(tap(WidgetTasbihQueue.ACTION_INC)) else inc,
          contentAlignment = Alignment.Center,
        ) {
          Label(
            context.getString(R.string.widget_tasbih_inc),
            20f,
            if (m.incEnabled) m.colors.accent else Palette.DISABLED,
            medium = true,
          )
        }
        Spacer(GlanceModifier.height(6.dp))
        Row(modifier = GlanceModifier.defaultWeight().fillMaxWidth()) {
          SecondaryButton(
            context.getString(R.string.widget_tasbih_reset),
            WidgetTasbihQueue.ACTION_RESET,
            GlanceModifier.defaultWeight(),
          )
          Spacer(GlanceModifier.width(6.dp))
          SecondaryButton(
            context.getString(R.string.widget_tasbih_next),
            WidgetTasbihQueue.ACTION_NEXT,
            GlanceModifier.defaultWeight(),
          )
        }
      }
    }
  }

  @Composable
  private fun SecondaryButton(text: String, action: String, modifier: GlanceModifier) {
    Box(
      modifier = modifier
        .fillMaxHeight()
        .background(ImageProvider(R.drawable.widget_tasbih_secondary))
        .clickable(tap(action)),
      contentAlignment = Alignment.Center,
    ) {
      Label(text, 12f, Palette.TEXT, medium = true)
    }
  }

  /** "Today 231 · 3 rounds" — what a single count cannot say on its own. */
  private fun footerLine(context: Context, todayTotal: Int, rounds: Int): String {
    val parts = mutableListOf(context.getString(R.string.widget_tasbih_today, todayTotal))
    if (rounds > 0) {
      parts.add(context.resources.getQuantityString(R.plurals.widget_tasbih_rounds, rounds, rounds))
    }
    return parts.joinToString(" · ")
  }

  /**
   * One control's tap. Glance keys each action by its parameters, so the
   * three buttons cannot collapse into one the way three PendingIntents on
   * one request code would (the RemoteViews provider's 2000 + index).
   */
  private fun tap(action: String) =
    actionRunCallback<TasbihTap>(actionParametersOf(TasbihTap.ACTION to action))

  companion object {
    /** PrayerWidgetTasbihProvider.SHORT_HEIGHT_DP. */
    const val SHORT_HEIGHT_DP = 110

    /** The layout has six dots; a longer cycle shows its first six. */
    private const val DOTS = 6
  }
}

/**
 * A tap on +1, Reset or Next: queue it, tell the app if it is running, and
 * redraw everything — PrayerWidgetTasbihProvider.handleTap, step for step.
 */
class TasbihTap : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val action = parameters[ACTION] ?: return
    WidgetTasbihQueue.append(context, action)
    WidgetQueueEvents.postChanged(context)
    PrayerWidgetProvider.requestUpdate(context)
  }

  companion object {
    val ACTION = ActionParameters.Key<String>("tasbih_action")
  }
}

/** The Tasbih widget's Glance receiver. Registered only by the Glance build flag. */
class TasbihGlanceReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = TasbihGlanceWidget()
}
