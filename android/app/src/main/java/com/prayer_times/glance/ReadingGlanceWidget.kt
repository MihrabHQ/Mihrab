package com.prayer_times.glance

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.layout.ContentScale
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
import com.prayer_times.R
import com.prayer_times.contract.WallClock
import com.prayer_times.contract.WidgetContract

/**
 * Continue Reading on Glance — PrayerWidgetReadingProvider's card.
 *
 * Two states: a khatmah running (the plan's day as the header, today's
 * portion in the side column) or not (the last page read and when). A third
 * for someone who has never opened the Qurʾān: an invitation, not a dead
 * "Open Mihrab". Height picks one of three type tiers, as it does there;
 * under 200dp wide the side column goes. The card's tap opens the page in
 * silence; the play disc opens it reciting (#25). Which reader either opens
 * is the app's call (`mode`), carried in the payload.
 */
internal class ReadingGlanceWidget : MihrabGlanceWidget("reading") {

  private enum class Tier { COMPACT, NORMAL, GENEROUS }

  private class Model(val colors: Colors, val reading: WidgetContract.Reading?, val nowMs: Long)

  @Composable
  override fun Content() {
    val context = localizedContext()
    val size = cardSize()
    val result = guarded("reading") {
      val now = Now.current()
      Model(Colors.of(context), GlancePayload.live(context, now)?.reading, now.epochMs)
    }
    val m = result.getOrNull()
    val colors = m?.colors ?: Colors.of(context)
    val r = m?.reading
    val onClick =
      if (r != null && r.started) readingAction(context, r, play = false)
      else openRoute(context, "mihrab://quran")
    MihrabCard(colors.background, onClick) {
      result.fold(
        onSuccess = {
          if (r == null) Placeholder(context.getString(R.string.widget_placeholder_open_app))
          else if (!r.started) Invitation(context, r, tierFor(size.heightDp))
          else Reading(context, r, colors.accent, size, it.nowMs)
        },
        onFailure = { ErrorContent(context, it) },
      )
    }
  }

  private class Fit(val surahSp: Float, val gapAbove: Int, val gapBelow: Int)

  /**
   * The three lines of the left column — the khatmah's day, the surah, the
   * page — on a card one row high. Their sizes were set in the widgets'
   * Latin face, and Arabic, Urdu or Bengali text falls back to a font whose
   * line is half as tall again, so in Arabic the page line ran off the
   * bottom of a 4×1 card. Measured in the text's own script
   * (`textHeightDp`), the overflow is taken from the gaps between the
   * lines first, then from the surah's size (to 16sp), never from the
   * page line. Nothing is touched where the card is taller and the lines
   * have room (`more`: the progress bar or the last-read line is shown).
   */
  private fun fitLines(
    context: Context,
    heightDp: Int,
    head: String,
    surah: String,
    surahSp: Float,
    position: String,
    positionSp: Float,
    more: Boolean,
  ): Fit {
    val roomy = Fit(surahSp, 6, 3)
    if (more || heightDp <= 0) return roomy
    val avail = heightDp - 2 * CARD_INSET_DP - 2 * CARD_PADDING_DP
    val fixed = textHeightDp(context, head, 11f, medium = true) + textHeightDp(context, position, positionSp, medium = false)
    fun need(sp: Float, a: Int, b: Int) = fixed + textHeightDp(context, surah, sp, medium = true) + a + b
    if (need(surahSp, 6, 3) <= avail) return roomy
    if (need(surahSp, 2, 0) <= avail) return Fit(surahSp, 2, 0)
    var sp = surahSp
    while (sp > SURAH_MIN_SP && need(sp, 2, 0) > avail) sp -= 1f
    return Fit(sp.coerceAtLeast(SURAH_MIN_SP), 2, 0)
  }

  private fun tierFor(heightDp: Int): Tier = when {
    heightDp <= 0 -> Tier.NORMAL
    heightDp < COMPACT_MAX_HEIGHT_DP -> Tier.COMPACT
    heightDp >= GENEROUS_MIN_HEIGHT_DP -> Tier.GENEROUS
    else -> Tier.NORMAL
  }

  private fun surahSp(t: Tier) = when (t) { Tier.COMPACT -> 20f; Tier.NORMAL -> 23f; Tier.GENEROUS -> 28f }
  private fun positionSp(t: Tier) = if (t == Tier.COMPACT) 12f else 13f
  private fun sideValueSp(t: Tier) = when (t) { Tier.COMPACT -> 22f; Tier.NORMAL -> 27f; Tier.GENEROUS -> 32f }

  /** Never opened the Qurʾān: an invitation, and no play disc — nothing to resume. */
  @Composable
  private fun Invitation(context: Context, r: WidgetContract.Reading, tier: Tier) {
    DirRow(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
      cell { DirColumn(
        modifier = GlanceModifier.defaultWeight().fillMaxHeight(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Label(context.getString(R.string.widget_reading_header_start), 11f, Palette.MUTED, medium = true)
        Label(
          context.getString(R.string.widget_reading_start_title),
          surahSp(tier),
          Palette.TEXT,
          medium = true,
          modifier = GlanceModifier.padding(top = 6.dp),
        )
        // The mushaf to someone who has it; the translation, which needs no
        // download, to someone who does not.
        Label(
          context.getString(
            if (r.downloaded) R.string.widget_reading_start_note else R.string.widget_reading_start_note_undownloaded,
          ),
          positionSp(tier),
          Palette.MUTED,
          modifier = GlanceModifier.padding(top = 3.dp),
        )
        if (tier != Tier.COMPACT) {
          Label(
            context.getString(R.string.widget_reading_start_tail),
            11f,
            Palette.MUTED,
            modifier = GlanceModifier.padding(top = 5.dp),
          )
        }
      } }
      cell {
        SideColumn(
          title = context.getString(R.string.widget_reading_start_side_title),
          value = "604",
          valueSp = sideValueSp(tier),
          note = if (tier == Tier.COMPACT) null else context.getString(R.string.widget_reading_start_side_note),
          noteColor = Palette.MUTED,
        )
      }
    }
  }

  @Composable
  private fun Reading(context: Context, r: WidgetContract.Reading, accent: Int, size: CardSize, nowMs: Long) {
    val tier = tierFor(size.heightDp)
    // The bar and the lines under it need 170dp; at one row the page number
    // above says the same thing.
    val tall = tier != Tier.COMPACT && (size.heightDp <= 0 || size.heightDp >= PROGRESS_MIN_HEIGHT_DP)
    val khatmah = r.khatmah
    val totalPages = r.totalPages.coerceAtLeast(1)
    val pct = Math.round(r.pagesRead * 100.0 / totalPages).toInt()
    // A floor of 1%: two pages of 604 draws as nothing, which says "not
    // started" to someone who has.
    val bar = if (r.pagesRead > 0) pct.coerceAtLeast(1) else 0

    val tail: String? =
      if (khatmah != null) lastReadTail(context, r, nowMs)?.takeIf { tall }
      else if (tier == Tier.GENEROUS) lastReadTail(context, r, nowMs)
      else null

    val head =
      if (khatmah != null) context.getString(R.string.widget_reading_khatmah_day, khatmah.day, khatmah.targetDays)
      else context.getString(R.string.widget_reading_continue)
    val position = context.getString(R.string.widget_reading_position, r.page, r.juz)
    val fit = fitLines(context, size.heightDp, head, r.surahName, surahSp(tier), position, positionSp(tier), tall || tail != null)

    DirRow(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
      cell { DirColumn(
        modifier = GlanceModifier.defaultWeight().fillMaxHeight(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Label(head, 11f, Palette.MUTED, medium = true)
        Label(r.surahName, fit.surahSp, Palette.TEXT, medium = true, modifier = GlanceModifier.padding(top = fit.gapAbove.dp))
        Label(position, positionSp(tier), Palette.MUTED, modifier = GlanceModifier.padding(top = fit.gapBelow.dp))
        if (tall) {
          Spacer(GlanceModifier.height(10.dp))
          ProgressBar(bar / 100f, accent, LocalDirection.current.rtl)
          Label(
            context.getString(R.string.widget_reading_progress, r.pagesRead, totalPages, pct),
            11f,
            Palette.MUTED,
            modifier = GlanceModifier.padding(top = 5.dp),
          )
        }
        if (tail != null) Label(tail, 11f, Palette.MUTED, modifier = GlanceModifier.padding(top = 5.dp))
      } }

      // The one control on the card, in the card's accent. The space before
      // it is an outer box's: Glance draws a background under a view's own
      // padding but centres the content inside it, so with the padding on
      // the disc itself the triangle sat 4dp toward the disc's far edge.
      cell { DirBox(modifier = GlanceModifier.padStart(8.dp)) {
        DirBox(
          modifier = GlanceModifier
            .size(36.dp)
            .background(ImageProvider(R.drawable.widget_play_button))
            .clickable(readingAction(context, r, play = true)),
          contentAlignment = Alignment.Center,
        ) {
          Image(
            provider = ImageProvider(R.drawable.ic_widget_play),
            contentDescription = context.getString(R.string.widget_reading_play),
            modifier = GlanceModifier.size(20.dp),
            colorFilter = ColorFilter.tint(provider(accent)),
          )
        }
      } }

      // At 2x2 the side column goes first: the left column alone still
      // answers "where was I".
      if (size.widthDp !in 1 until SIDE_COLUMN_MIN_WIDTH_DP) cell {
        if (khatmah != null) {
          val behind = khatmah.behindBy
          val left = (khatmah.pagesToday - khatmah.doneToday).coerceAtLeast(0)
          SideColumn(
            title = context.getString(R.string.widget_reading_today_portion),
            value = context.getString(R.string.widget_reading_portion_value, khatmah.doneToday, khatmah.pagesToday),
            valueSp = sideValueSp(tier),
            note = if (tier == Tier.COMPACT) null else when {
              behind > 0 -> context.resources.getQuantityString(R.plurals.widget_reading_behind, behind, behind)
              // Skipped pages outrank "done for today": this is the only place
              // the widget says they are there at all.
              khatmah.skipped > 0 ->
                context.resources.getQuantityString(R.plurals.widget_reading_skipped, khatmah.skipped, khatmah.skipped)
              left == 0 -> context.getString(R.string.widget_reading_done_today)
              else -> context.resources.getQuantityString(R.plurals.widget_reading_left, left, left)
            },
            noteColor = if (behind > 0) Palette.DANGER else accent,
          )
        } else {
          SideColumn(
            title = context.getString(R.string.widget_reading_last_read),
            value = lastReadPhrase(context, r, nowMs) ?: "—",
            valueSp = sideValueSp(tier),
            note = if (tier == Tier.COMPACT || r.bookmarks <= 0) null
            else context.resources.getQuantityString(R.plurals.widget_reading_bookmarks, r.bookmarks, r.bookmarks),
            noteColor = Palette.MUTED,
          )
        }
      }
    }
  }

  /**
   * The share of the muṣḥaf read, as a bar that fills from where a line
   * starts in Mihrab's language (#118). Glance's LinearProgressIndicator is
   * a ProgressBar that fills from the left in every direction, and from the
   * launcher's side at that; this is the same 4dp bar drawn as an image,
   * stretched to the width — square ends, so stretching changes nothing.
   */
  @Composable
  private fun ProgressBar(fraction: Float, accent: Int, rtl: Boolean) {
    val bitmap = android.graphics.Bitmap.createBitmap(PROGRESS_BITMAP_W, 1, android.graphics.Bitmap.Config.ARGB_8888)
    val filled = Math.round(fraction.coerceIn(0f, 1f) * PROGRESS_BITMAP_W)
    for (x in 0 until PROGRESS_BITMAP_W) {
      val inFill = if (rtl) x >= PROGRESS_BITMAP_W - filled else x < filled
      bitmap.setPixel(x, 0, if (inFill) accent else PROGRESS_TRACK)
    }
    Image(
      provider = ImageProvider(bitmap),
      contentDescription = null,
      modifier = GlanceModifier.fillMaxWidth().height(4.dp),
      contentScale = ContentScale.FillBounds,
    )
  }

  @Composable
  private fun SideColumn(title: String, value: String, valueSp: Float, note: String?, noteColor: Int) {
    DirColumn(
      modifier = GlanceModifier.fillMaxHeight().padStart(10.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Label(title, 11f, Palette.MUTED, medium = true)
      Label(value, valueSp, Palette.TEXT, medium = true, modifier = GlanceModifier.padding(top = 6.dp))
      if (note != null) Label(note, 11f, noteColor, maxLines = 2, modifier = GlanceModifier.padding(top = 5.dp))
    }
  }

  /** "Last read today · 3 bookmarks", dropping whichever half is unknown. */
  private fun lastReadTail(context: Context, r: WidgetContract.Reading, nowMs: Long): String? {
    val parts = mutableListOf<String>()
    lastReadPhrase(context, r, nowMs)?.let {
      parts.add(context.getString(R.string.widget_reading_last_read_prefix, it.lowercase()))
    }
    if (r.bookmarks > 0) {
      parts.add(context.resources.getQuantityString(R.plurals.widget_reading_bookmarks, r.bookmarks, r.bookmarks))
    }
    return if (parts.isEmpty()) null else parts.joinToString(" · ")
  }

  /** "Today" / "Yesterday" / "4 days ago". Never "0 days ago". */
  private fun lastReadPhrase(context: Context, r: WidgetContract.Reading, nowMs: Long): String? {
    val ms = r.lastReadAt ?: return null
    if (ms <= 0) return null
    // Calendar days, not elapsed ones: read at 23:30, it is "Yesterday" the next morning.
    val days = WallClock.calendarDaysBetween(ms, nowMs)
    return when {
      days < 1 -> context.getString(R.string.widget_reading_today)
      days == 1 -> context.getString(R.string.widget_reading_yesterday)
      else -> context.resources.getQuantityString(R.plurals.widget_reading_days_ago, days, days)
    }
  }

  /**
   * mihrab://read/2?initialPage=3 (or ?scrollToAyah=1), with
   * `sessionKhatmah=1` when a plan is running and `playFromAyah` for the
   * play disc — PrayerWidgetReadingProvider.readingIntent / playIntent.
   */
  private fun readingAction(context: Context, r: WidgetContract.Reading, play: Boolean): Action {
    val position =
      if (r.mode == WidgetContract.ReaderMode.MUSHAF) "initialPage=${r.page}" else "scrollToAyah=${r.ayah}"
    val playParam = if (play) "&playFromAyah=${r.ayah}" else ""
    val session = if (r.khatmah != null) "&sessionKhatmah=1" else ""
    return openRoute(context, "mihrab://read/${r.surah}?$position$playParam$session")
  }

  companion object {
    /** The PrayerWidgetReadingProvider thresholds, unchanged. */
    private const val SIDE_COLUMN_MIN_WIDTH_DP = 200
    private const val PROGRESS_MIN_HEIGHT_DP = 170
    /** `widget_card_inset` and MihrabCard's padding, each side. */
    private const val CARD_INSET_DP = 6
    private const val CARD_PADDING_DP = 10
    private const val SURAH_MIN_SP = 16f
    private const val COMPACT_MAX_HEIGHT_DP = 130
    private const val GENEROUS_MIN_HEIGHT_DP = 240

    /** The bar's track: the rule colour the cards already use. */
    private const val PROGRESS_TRACK = 0x33FFFFFF
    /** The bar's resolution: a thousandth of the muṣḥaf is under a pixel at any card width. */
    private const val PROGRESS_BITMAP_W = 1000
  }
}
