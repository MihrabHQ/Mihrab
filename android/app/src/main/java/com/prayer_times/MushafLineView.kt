package com.prayer_times

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.view.View
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.common.assets.ReactFontManager
import kotlin.math.ceil

/**
 * One line of the Ḥafṣ muṣḥaf, drawn with the pen.
 *
 * The line arrives as pieces in drawing order — right to left, the text is
 * RTL — each a run of glyphs in the page font or a gap the pen skips, with
 * an optional wash behind it and, for the marker's medallion, its own ink.
 * The pen starts at `penRight` and walks left by each run's measured advance
 * (Minikin's, the same shaper the platform's TextView uses, so a word is
 * exactly as wide here as it was there) or by the gap's width.
 *
 * Nothing here breaks or clips: a run a hair wider than expected lands a
 * hair further left, and the ink that overshoots the line's ends and its
 * metrics lands wherever the view has room for it — the view is sized by
 * JS to have that room (`lineInkPadding`, `lineInkSidePadding`). See
 * `src/quran/native/MushafLineView.ts` for why this exists.
 *
 * All positions are in dp from JS and scaled here.
 *
 * ── THE LINE IS DRAWN ONCE, THEN SHOWN ───────────────────────────────
 *
 * A QPC glyph is a whole word, and at a phone's page size most of them are
 * bigger than the 256 px the GPU's glyph atlas will hold. Skia draws every
 * such glyph as a PATH instead — rasterised on the CPU and uploaded as a
 * mask, again on every frame it is on screen (`SoftwarePathRenderer`, the
 * top of a simpleperf profile of a page turn on a Pixel 10 Pro). A portrait
 * page is fifteen lines of them and a turn shows two pages: ~22 ms of
 * render thread per frame, so the swipe ran at ~40 fps and trailed the
 * finger. Landscape shows a third of a page and got away with ~7 ms, which
 * is why the same reader felt right on its side and heavy upright.
 *
 * So the line is rasterised once into a bitmap, and the bitmap is what
 * every later frame draws — a texture the GPU already holds. It is redrawn
 * only when something it shows changes: a prop (each setter marks it
 * stale), the view's size, or the typeface the family resolves to. It is
 * let go when the view leaves the window, so only the pages the pager has
 * mounted hold one.
 *
 * The rasterising happens OFF the UI thread. A page is fifteen of these,
 * and drawing them all in the frame a neighbour page appears in — the
 * moment a finger lands on the pager — cost 100–200 ms on that thread: a
 * hitch at the very start of every swipe, which is where it is felt most.
 * So a worker paints the bitmap and the line swaps to it the frame after
 * it is ready.
 *
 * AND UNTIL IT IS READY THE LINE WAITS, BRIEFLY, RATHER THAN DRAW ITSELF.
 * It used to draw itself the old way in the meantime, so that the ink was
 * there from the first frame. But the old way is the expensive one, and a
 * page's first frame is fifteen lines of it at once, on the render thread:
 * traced on a Pixel 10 Pro, opening the reader held one frame for 179 ms
 * (94 ms the second time) — the render thread rasterising every word of
 * the page as a path while the screen was sliding in, the UI thread
 * waiting on it. The worker has the same page painted in less time than
 * that, off both threads. So a line with nothing to show yet draws nothing
 * for up to `INK_WAIT_MS`, and a line whose words are the same but whose
 * marks changed (a selection, the ayah being recited) goes on showing the
 * picture it has until the new one comes. Past the wait — a worker that
 * failed, or never ran — it draws itself as it always could.
 */
class MushafLineView(context: Context) : View(context) {
  var fontFamily: String = ""
    set(value) { field = value; stale() }
  var fontSize: Float = 0f
    set(value) { field = value; stale() }
  var color: Int = -0x1000000
    set(value) { field = value; stale() }
  var runs: ReadableArray? = null
    set(value) { field = value; stale() }
  var penRight: Float = 0f
    set(value) { field = value; stale() }
  var penBaseline: Float = 0f
    set(value) { field = value; stale() }
  var boxTop: Float = 0f
    set(value) { field = value; stale() }
  var boxHeight: Float = 0f
    set(value) { field = value; stale() }

  /** Everything a line needs to be drawn, in px, read off the props once. */
  private class Line(
    val typeface: Typeface?,
    val textPx: Float,
    val color: Int,
    val penRight: Float,
    val baseline: Float,
    val top: Float,
    val bottom: Float,
    val texts: Array<String?>,
    val gaps: FloatArray,
    val washes: IntArray,
    val hasWash: BooleanArray,
    val inks: IntArray,
    val hasInk: BooleanArray,
  )

  private class Pens {
    val glyph = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
      textAlign = Paint.Align.LEFT
    }
    val wash = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  }

  private val uiPens = Pens()
  private val visibleProbe = android.graphics.Rect()
  /** The page's lines this one is waiting to be shown with, while it is. */
  private var reveal: Reveal? = null
  private val blitPaint = Paint(Paint.FILTER_BITMAP_FLAG)

  /** The line as last rasterised; valid only while `cacheGeneration` is current. */
  private var cache: Bitmap? = null
  private var cacheGeneration = -1
  private var cacheTypeface: Typeface? = null
  private var cacheMargin = 0
  /** Bumped by every change to what the line shows. */
  private var generation = 0
  /** The generation a worker is painting, if one is. */
  private var pendingGeneration = -1
  /** What the cached picture is a picture of: its words and their size, whatever its marks. */
  private var cacheInk: String? = null
  private var cacheWidth = 0
  private var cacheHeight = 0
  /** When this line began waiting for its picture (uptime, ms); 0 when it is not waiting. */
  private var waitingSince = 0L

  init {
    setWillNotDraw(false)
  }

  private fun stale() {
    generation += 1
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    generation += 1
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    // Off screen, the bitmap is memory for nothing; and a worker still
    // painting one must not hand it to a view that has gone.
    generation += 1
    pendingGeneration = -1
    cache?.recycle()
    cache = null
    cacheGeneration = -1
    cacheInk = null
    waitingSince = 0L
    reveal = null
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val pieces = runs ?: return
    if (fontSize <= 0f || fontFamily.isEmpty() || pieces.size() == 0) return
    if (width <= 0 || height <= 0) return
    // Resolved at draw time, not when the prop lands: the font store can
    // re-register a slot family with another page's file, and a page that
    // is on screen is pinned against that — but a lookup is a map read,
    // and it is the one thing that can never go stale. A different answer
    // from the one the bitmap was painted with is a different line.
    val typeface =
      ReactFontManager.getInstance().getTypeface(fontFamily, Typeface.NORMAL, context.assets)
    if (cacheGeneration == generation && typeface !== cacheTypeface) generation += 1

    val bitmap = cache
    val cached = bitmap != null && cacheGeneration == generation
    // Painted, but the rest of its page is not: the page appears whole
    // (see Reveal). Never on a capture, and never for long.
    if (cached && canvas.isHardwareAccelerated) {
      val r = reveal
      if (r != null) {
        val left = INK_WAIT_MS - (android.os.SystemClock.uptimeMillis() - r.since)
        if (r.pending > 0 && left > 0) {
          postInvalidateDelayed(left + 1)
          return
        }
        reveal = null
      }
    }
    // A HARDWARE bitmap cannot be drawn on a software canvas (it throws):
    // a capture of the view into a Bitmap — a screenshot-to-share, a
    // drawing cache — gets the line drawn directly instead. Nothing does
    // that today; this keeps it from being a crash the day something does.
    if (cached && (canvas.isHardwareAccelerated || !isHardwareBitmap(bitmap!!))) {
      val m = -cacheMargin.toFloat()
      canvas.drawBitmap(bitmap, m, m, blitPaint)
      return
    }
    val line = snapshot(pieces, typeface)
    // An older picture of the same words can stand in while the new one is
    // painted; a line with none is one of a page appearing for the first time.
    val standIn =
      bitmap != null && !bitmap.isRecycled && cacheInk == inkOf(line) && cacheWidth == width && cacheHeight == height
    if (!cached && pendingGeneration != generation) paintInBackground(line, !standIn)
    // On the screen, the line waits for its picture (see the note at the
    // top). A software canvas — a capture — is never kept waiting.
    if (!cached && canvas.isHardwareAccelerated) {
      val now = android.os.SystemClock.uptimeMillis()
      if (waitingSince == 0L) waitingSince = now
      if (now - waitingSince < INK_WAIT_MS) {
        // The same words in the same place, with older marks: better than
        // nothing, and never another line's ink.
        if (standIn) {
          val m = -cacheMargin.toFloat()
          canvas.drawBitmap(bitmap!!, m, m, blitPaint)
        }
        // Looked at again when the wait is over, should no picture have come.
        postInvalidateDelayed(INK_WAIT_MS - (now - waitingSince) + 1)
        return
      }
    }
    drawLine(canvas, line, uiPens, 0f)
  }

  /** The words of a line and where they are set, without its marks. */
  private fun inkOf(line: Line): String =
    buildString {
      append(System.identityHashCode(line.typeface)).append('|').append(line.textPx).append('|')
      append(line.penRight).append('|').append(line.baseline).append('|').append(line.color)
      for (i in line.texts.indices) {
        append('|')
        val t = line.texts[i]
        if (t != null) append(t) else append('~').append(line.gaps[i])
      }
    }

  private fun snapshot(pieces: ReadableArray, typeface: Typeface?): Line {
    val density = resources.displayMetrics.density
    val count = pieces.size()
    val texts = arrayOfNulls<String>(count)
    val gaps = FloatArray(count)
    val washes = IntArray(count)
    val hasWash = BooleanArray(count)
    val inks = IntArray(count)
    val hasInk = BooleanArray(count)
    for (i in 0 until count) {
      val piece: ReadableMap = pieces.getMap(i) ?: continue
      if (piece.hasKey("t") && !piece.isNull("t")) {
        texts[i] = piece.getString("t") ?: ""
      } else if (piece.hasKey("g")) {
        gaps[i] = piece.getDouble("g").toFloat() * density
      }
      if (piece.hasKey("w") && !piece.isNull("w")) {
        washes[i] = piece.getInt("w"); hasWash[i] = true
      }
      if (piece.hasKey("i") && !piece.isNull("i")) {
        inks[i] = piece.getInt("i"); hasInk[i] = true
      }
    }
    return Line(
      typeface = typeface,
      textPx = fontSize * density,
      color = color,
      penRight = penRight * density,
      baseline = penBaseline * density,
      top = boxTop * density,
      bottom = (boxTop + boxHeight) * density,
      texts = texts,
      gaps = gaps,
      washes = washes,
      hasWash = hasWash,
      inks = inks,
      hasInk = hasInk,
    )
  }

  private fun paintInBackground(line: Line, firstInk: Boolean) {
    val gen = generation
    pendingGeneration = gen
    // A line with nothing to show joins its page's reveal; the job reports
    // back to it exactly once, whatever becomes of the picture.
    val joined: Reveal? = if (firstInk) Reveal.join(fontFamily, this) else null
    if (joined != null) reveal = joined
    // The view is sized for the ink, but calligraphy has outrun that sizing
    // before; a quarter-em margin keeps a stray swash from being cut at the
    // bitmap's edge, where before it simply landed outside the view.
    val margin = ceil(line.textPx * 0.25f).toInt()
    val w = width + margin * 2
    val h = height + margin * 2
    // On the screen now, or a neighbour page mounted for the next swipe?
    val onScreen = isShown && getGlobalVisibleRect(visibleProbe)
    PAINTERS.execute(PaintJob(onScreen) {
      val painted = try {
        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        drawLine(Canvas(bitmap), line, Pens(), margin.toFloat())
        // GPU-only from here: the pixels are uploaded once and the CPU copy
        // is let go, so a line costs its texture and not twice that.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val hardware = try { bitmap.copy(Bitmap.Config.HARDWARE, false) } catch (e: Throwable) { null }
          if (hardware != null) { bitmap.recycle(); hardware } else bitmap
        } else {
          bitmap
        }
      } catch (e: Throwable) {
        // No bitmap to be had (memory, say): the line keeps drawing itself
        // straight onto the canvas, as it always used to.
        null
      }
      // The main looper, not `post`: on a view that has left the window
      // `post` keeps the runnable for an attach that may never come — the
      // bitmap with it, and the page's reveal would wait on this line.
      MAIN.post {
        joined?.done()
        if (painted == null) {
          // Free the slot, or this line would draw itself directly on every
          // frame until a prop changed: the next draw tries again, by when
          // the memory pressure that failed this one may have passed.
          if (pendingGeneration == gen) pendingGeneration = -1
          // And it is not kept waiting for a picture that is not coming:
          // the wait is declared over, and the line draws itself now.
          if (gen == generation) {
            waitingSince = 1L
            invalidate()
          }
          return@post
        }
        if (gen != generation || !isAttachedToWindow) {
          painted.recycle()
          return@post
        }
        cache?.recycle()
        cache = painted
        cacheGeneration = gen
        cacheTypeface = line.typeface
        cacheMargin = margin
        cacheInk = inkOf(line)
        cacheWidth = width
        cacheHeight = height
        pendingGeneration = -1
        waitingSince = 0L
        invalidate()
      }
    })
  }

  companion object {
    /**
     * How long a line goes without its ink before drawing itself. A page
     * is painted in a fraction of this on a phone that is keeping up; the
     * figure is for the one that is not.
     */
    private const val INK_WAIT_MS = 250L

    private fun isHardwareBitmap(b: Bitmap): Boolean =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && b.config == Bitmap.Config.HARDWARE

    /**
     * THE PAINTERS, AND WHOSE LINE GOES FIRST.
     *
     * There were two of them, at background priority, taking lines in the
     * order they asked. Opening the reader mounts the page and its
     * neighbours — 88 lines on a Pixel 10 Pro, measured — and each takes
     * about 17 ms on a background thread, which Android keeps to the small
     * cores: the page on screen filled in a line at a time over a quarter
     * of a second, its lines queued in among those of pages nobody could
     * see yet, and the neighbours took half a second more.
     *
     * So: the lines on the screen go before the ones that are not, at the
     * app's ordinary priority (the big cores); the ones waiting off screen
     * stay at background priority, where they cannot take a frame from a
     * swipe; and there are as many painters as the phone can spare, up to
     * four. The UI thread still never paints a line.
     */
    private val MAIN = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * A PAGE APPEARS WHOLE.
     *
     * Each line swapped to its picture the frame it was painted, so a page
     * opening filled in a line or two at a time for as long as the painters
     * took — a tenth of a second and more on a Pixel 10 Pro, and it was
     * seen as the ayahs loading in. The lines of a page that have nothing
     * to show yet now wait for one another: they are counted in as they
     * ask to be painted (all of them in the one draw pass a page first
     * appears in) and shown together when the last is done, or when
     * `INK_WAIT_MS` has gone by, whichever is first.
     *
     * Keyed by the page's font family, which is the page. A line that
     * already shows an older picture of the same words (a selection, the
     * recited ayah) never waits: it has something to show. Main thread only.
     */
    private class Reveal(val key: String) {
      val since = android.os.SystemClock.uptimeMillis()
      var pending = 0
      val lines = ArrayList<java.lang.ref.WeakReference<MushafLineView>>()

      fun done() {
        pending -= 1
        if (pending > 0) return
        if (OPEN[key] === this) OPEN.remove(key)
        for (ref in lines) {
          val v = ref.get() ?: continue
          if (v.reveal === this) {
            v.reveal = null
            v.invalidate()
          }
        }
        lines.clear()
      }

      companion object {
        private val OPEN = HashMap<String, Reveal>()

        fun join(key: String, line: MushafLineView): Reveal {
          var r = OPEN[key]
          if (r == null || r.pending <= 0 || android.os.SystemClock.uptimeMillis() - r.since >= INK_WAIT_MS) {
            r = Reveal(key)
            OPEN[key] = r
          }
          r.pending += 1
          r.lines.add(java.lang.ref.WeakReference(line))
          return r
        }
      }
    }

    private class PaintJob(val onScreen: Boolean, val work: () -> Unit) : Runnable, Comparable<PaintJob> {
      val order = SEQUENCE.incrementAndGet()
      override fun run() {
        android.os.Process.setThreadPriority(
          if (onScreen) android.os.Process.THREAD_PRIORITY_DEFAULT
          else android.os.Process.THREAD_PRIORITY_BACKGROUND,
        )
        work()
      }
      override fun compareTo(other: PaintJob): Int =
        if (onScreen != other.onScreen) (if (onScreen) -1 else 1) else order.compareTo(other.order)
    }

    private val SEQUENCE = java.util.concurrent.atomic.AtomicLong()
    private val PAINTER_COUNT = (Runtime.getRuntime().availableProcessors() - 2).coerceIn(2, 4)

    private val PAINTERS: java.util.concurrent.ThreadPoolExecutor =
      java.util.concurrent.ThreadPoolExecutor(
        PAINTER_COUNT,
        PAINTER_COUNT,
        0L,
        java.util.concurrent.TimeUnit.MILLISECONDS,
        // Jobs are PaintJobs and only ever handed over with `execute`.
        java.util.concurrent.PriorityBlockingQueue<Runnable>(),
      ) { task ->
        Thread(task, "MushafLinePainter").apply { isDaemon = true }
      }

    /** The line itself, offset by `inset` px on both axes. */
    private fun drawLine(canvas: Canvas, line: Line, pens: Pens, inset: Float) {
      val glyph = pens.glyph
      glyph.typeface = line.typeface
      glyph.textSize = line.textPx
      glyph.letterSpacing = 0f
      val top = line.top + inset
      val bottom = line.bottom + inset
      val y = line.baseline + inset
      val count = line.texts.size

      // Two passes, washes then glyphs, so a swash that crosses into the
      // next word is drawn over its wash and not under it — which is how a
      // paragraph draws its span backgrounds too.
      var pen = line.penRight + inset
      val lefts = FloatArray(count)
      for (i in 0 until count) {
        val text = line.texts[i]
        val advance = if (text != null) glyph.measureText(text) else line.gaps[i]
        val left = pen - advance
        lefts[i] = left
        if (line.hasWash[i]) {
          pens.wash.color = line.washes[i]
          canvas.drawRect(left, top, pen, bottom, pens.wash)
        }
        pen = left
      }
      for (i in 0 until count) {
        val text = line.texts[i] ?: continue
        glyph.color = if (line.hasInk[i]) line.inks[i] else line.color
        canvas.drawText(text, lefts[i], y, glyph)
      }
    }
  }
}
