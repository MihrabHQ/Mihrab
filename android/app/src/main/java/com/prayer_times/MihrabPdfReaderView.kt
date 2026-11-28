package com.prayer_times

import android.net.Uri
import android.util.SparseArray
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.RectF
import android.widget.FrameLayout
import androidx.annotation.RequiresApi
import androidx.pdf.Highlight
import androidx.pdf.PdfDocument
import androidx.pdf.PdfFeature
import androidx.pdf.PdfPoint
import androidx.pdf.PdfRect
import androidx.pdf.SandboxedPdfLoader
import androidx.pdf.view.PdfView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * A Library book that is a PDF, read in Android's own PDF view
 * (`androidx.pdf`, Jetpack: Apache 2.0, built from AOSP, no Play Services).
 *
 * The scrolling, the zoom under two fingers and the drawing of the pages
 * are the system's. A reader made of pictures of pages in a list, zoomed
 * by hand from JavaScript, twitched when the fingers lifted and moved one
 * way at a time (found by hand on a Pixel, 2026-11-27); this is what
 * replaced it on Android 9 and later. Below that the library does not run
 * and the list of pictures still reads the book (`LibraryPdfBookScreen`).
 *
 * The file is one already on the device (`libraryPdf.ts` fetched and
 * checked it); it is opened by its path, in the library's own isolated
 * process, and nothing here reaches the network.
 *
 * What it tells JavaScript: the page at the top and the zoom, as they
 * change (`onPdfViewport`), and that the file would not open
 * (`onPdfError`). What it is told: the file, the page to open at, a page
 * to go to and a zoom to take, each with a key that changes when it is
 * asked for again.
 *
 * Words are looked for in the file by the library itself (`find`), on the
 * device: where they are is marked on the pages, the view goes to one
 * place after another (`findStep`), and JavaScript is told how many there
 * are and which is shown (`onPdfFind`). A file that is pictures of pages
 * has no words to find, and the answer is none.
 */
@RequiresApi(28)
class MihrabPdfReaderView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val pdf = PdfView(reactContext)
  private var built = false
  private var job: Job? = null
  private var document: PdfDocument? = null
  private var opened = ""

  var path = ""
  /** The page to open at. */
  var page = 0
  private var targetKey = 0
  private var zoomKey = 0

  /**
   * The zoom at which a page is as wide as the view: the one the view has settled at when its first page is
   * drawn. Its first reports come before it has fitted the page, at a zoom of its own (a page at its own
   * width read "255%" on an emulator).
   */
  private var baseZoom = 0f
  /** Set until the view has gone to the page it was opened at: its first report is of page 1. */
  private var arriving = false
  private var arriveBy = 0L
  private var saidPage = -1
  private var saidZoom = -1

  init {
    addView(pdf, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    pdf.addOnViewportChangedListener(
        object : PdfView.OnViewportChangedListener {
          override fun onViewportChanged(
              firstVisiblePage: Int,
              visiblePagesCount: Int,
              pageLocations: SparseArray<RectF>,
              zoomLevel: Float,
          ) = report(reading(firstVisiblePage, pageLocations), zoomLevel)
        })
    pdf.addOnFirstContentLoadListener(
        object : PdfView.OnFirstContentLoadListener {
          override fun onFirstContentLoad() {
            if (pdf.zoom > 0f) baseZoom = pdf.zoom
            saidZoom = -1
            report(pdf.firstVisiblePage, pdf.zoom)
            val asked = waitingZoom
            waitingZoom = 0.0
            if (asked > 0.0 && baseZoom > 0f) applyZoom(asked)
          }
        })
    built = true
  }

  /** The props of one update are in: open the file if it is another one. */
  fun commit() {
    val file = path.removePrefix("file://")
    if (file.isEmpty() || file == opened) return
    opened = file
    job?.cancel()
    job =
        scope.launch {
          try {
            val doc = SandboxedPdfLoader(reactContext.applicationContext).openDocument(Uri.fromFile(File(file)), null)
            document?.close()
            document = doc
            baseZoom = 0f
            saidPage = -1
            pdf.pdfDocument = doc
            // Whether words can be looked for in a file is the system's to say: on Android 12 and older
            // without the newer PDF parts it draws pages and reads no text (a search found nothing on an
            // API 31 emulator, in a page that had the word). JavaScript offers the search only where it is.
            val search = try { doc.isFeatureSupported(PdfFeature.SEARCH) } catch (_: Throwable) { false }
            emit("topPdfReady", Arguments.createMap().apply { putBoolean("search", search) })
            val at = page.coerceIn(0, maxOf(0, doc.pageCount - 1))
            if (at > 0) {
              arriving = true
              arriveBy = System.currentTimeMillis() + ARRIVE_MS
              pdf.scrollToPage(at)
              // Once more when the pages have a size: a view not yet laid out has nowhere to scroll.
              pdf.post { if (arriving) pdf.scrollToPage(at) }
            }
          } catch (e: Exception) {
            opened = ""
            emit("topPdfError", Arguments.createMap().apply { putString("message", e.message ?: e.javaClass.simpleName) })
          }
        }
  }

  fun goTo(target: Int, key: Int) {
    if (key == targetKey) return
    targetKey = key
    val doc = document ?: return
    arriving = false
    pdf.scrollToPage(target.coerceIn(0, maxOf(0, doc.pageCount - 1)))
  }

  /** A screen on, or back (the volume buttons): most of a screen, so the line read last is still in sight. */
  private var pageKey = 0

  fun pageBy(by: Int, key: Int) {
    if (key == pageKey) return
    pageKey = key
    if (document == null) return
    arriving = false
    pdf.scrollBy(0, (by * pdf.height * SCREEN_PART).toInt())
  }

  /**
   * The colour of the paper: as printed, a warm paper, or the page turned dark for a dark room. The file is
   * not touched and nothing is drawn again: the view's own picture is tinted on its way to the glass.
   */
  var tone = "paper"
    set(value) {
      if (field == value) return
      field = value
      val matrix =
          when (value) {
            "night" -> ColorMatrix(floatArrayOf(-0.9f, 0f, 0f, 0f, 235f, 0f, -0.9f, 0f, 0f, 235f, 0f, 0f, -0.9f, 0f, 235f, 0f, 0f, 0f, 1f, 0f))
            "sepia" -> ColorMatrix(floatArrayOf(1f, 0f, 0f, 0f, 0f, 0f, 0.95f, 0f, 0f, 0f, 0f, 0f, 0.82f, 0f, 0f, 0f, 0f, 0f, 1f, 0f))
            else -> null
          }
      if (matrix == null) pdf.setLayerType(LAYER_TYPE_NONE, null)
      else pdf.setLayerType(LAYER_TYPE_HARDWARE, Paint().apply { colorFilter = ColorMatrixColorFilter(matrix) })
    }

  /** `step` is against the page's own width: 1 is a page as wide as the view. */
  fun zoomTo(step: Double, key: Int) {
    if (key == zoomKey) return
    zoomKey = key
    if (baseZoom <= 0f || document == null) {
      // Asked before the first page is drawn (the zoom a book was left at, asked for as it opens): there is
      // no page width to zoom against yet. Kept, and taken when there is — it was dropped, and a book
      // reopened at 100% (seen on an emulator).
      waitingZoom = step
      return
    }
    applyZoom(step)
  }

  private var waitingZoom = 0.0

  private fun applyZoom(step: Double) {
    // The view keeps its scroll, not its place, through a zoom it is told to take: from page 40 the button
    // landed on page 18 (seen on an emulator). So what is in the middle of the view is noted, and gone back to.
    val middle = pdf.viewToPdfPoint(pdf.width / 2f, pdf.height / 2f)
    val page = saidPage
    pdf.zoom = (baseZoom * step.toFloat()).coerceIn(pdf.minZoom, pdf.maxZoom)
    if (middle != null) pdf.scrollToPosition(middle) else if (page >= 0) pdf.scrollToPage(page)
    // Told to zoom and to scroll in one go, the view left its pages blank until a finger touched it (seen
    // on an emulator): it draws for the new zoom when it next moves, so it is moved, by nothing.
    pdf.postDelayed({ pdf.scrollBy(0, 1); pdf.scrollBy(0, -1) }, REDRAW_MS)
  }

  /**
   * The page being read: the one with the most of itself on the glass, which is the page the view's own
   * indicator names beside its scroll thumb. The first page with any of itself showing is often the foot of
   * the one before ("2 of 119" in the bar beside the view's "3 / 119").
   */
  private fun reading(first: Int, places: SparseArray<RectF>): Int {
    var best = first
    var most = 0f
    for (i in 0 until places.size()) {
      val r = places.valueAt(i)
      val showing = minOf(r.bottom, pdf.height.toFloat()) - maxOf(r.top, 0f)
      if (showing > most) {
        most = showing
        best = places.keyAt(i)
      }
    }
    return best
  }

  private fun report(first: Int, zoom: Float) {
    // Nothing is said until the first page is drawn and the zoom that fits it is known.
    if (zoom <= 0f || baseZoom <= 0f) return
    if (arriving) {
      // Not said until the view is at the page it was opened at: said sooner, the place kept would be page 1.
      if (first >= page || System.currentTimeMillis() > arriveBy) arriving = false else return
    }
    val percent = Math.round(zoom / baseZoom * 20f) * 5
    if (first == saidPage && percent == saidZoom) return
    saidPage = first
    saidZoom = percent
    emit(
        "topPdfViewport",
        Arguments.createMap().apply {
          putInt("page", first)
          putDouble("zoom", percent / 100.0)
        })
  }

  private fun emit(name: String, data: WritableMap) {
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
    dispatcher.dispatchEvent(PdfEvent(UIManagerHelper.getSurfaceId(this), id, name, data))
  }

  // ── Looking for words ──
  private class Match(val page: Int, val rects: List<RectF>)

  private var findKey = 0
  private var stepKey = 0
  private var findJob: Job? = null
  private var matches: List<Match> = emptyList()
  private var shown = -1

  fun find(query: String, key: Int) {
    if (key == findKey) return
    findKey = key
    findJob?.cancel()
    matches = emptyList()
    shown = -1
    val doc = document ?: return
    val words = query.trim()
    if (words.isEmpty()) {
      // The search was closed: the marks come off, and there is nothing to say.
      pdf.setHighlights(emptyList())
      return
    }
    findJob =
        scope.launch {
          val list = ArrayList<Match>()
          try {
            val found = doc.searchDocument(words, 0 until doc.pageCount)
            for (i in 0 until found.size()) {
              val page = found.keyAt(i)
              for (m in found.valueAt(i)) list.add(Match(page, m.bounds))
            }
          } catch (e: CancellationException) {
            throw e
          } catch (_: Exception) {
            list.clear()
          }
          matches = list
          // The first place at or after the page being read; none there, the first in the book.
          shown = list.indexOfFirst { it.page >= saidPage }.let { if (it < 0 && list.isNotEmpty()) 0 else it }
          showMatch()
        }
  }

  fun findStep(by: Int, key: Int) {
    if (key == stepKey) return
    stepKey = key
    val n = matches.size
    if (n == 0) return
    shown = ((shown + by) % n + n) % n
    showMatch()
  }

  private fun showMatch() {
    // Marked: the place shown, and the others on its page and the pages beside it. A common word is in a
    // book thousands of times, and the view is not handed thousands of marks it will not draw.
    val here = matches.getOrNull(shown)
    val marks = ArrayList<Highlight>()
    if (here != null) {
      matches.forEachIndexed { i, m ->
        if (m.page >= here.page - 1 && m.page <= here.page + 1) {
          for (r in m.rects) marks.add(Highlight(PdfRect(m.page, r), if (i == shown) MARK_SHOWN else MARK_OTHER))
        }
      }
    }
    pdf.setHighlights(marks)
    if (here != null) {
      arriving = false
      val r = here.rects.firstOrNull()
      if (r != null) pdf.scrollToPosition(PdfPoint(here.page, r.centerX(), r.centerY())) else pdf.scrollToPage(here.page)
    }
    emit(
        "topPdfFind",
        Arguments.createMap().apply {
          putInt("count", matches.size)
          putInt("index", shown + 1)
        })
  }

  /** The view is gone for good: the file is let go of. */
  fun close() {
    scope.cancel()
    try {
      document?.close()
    } catch (_: Exception) {}
    document = null
  }

  // React Native lays out its own views and does not answer a native child that asks to be laid out again;
  // the PDF view asks whenever its pages change. So it is measured and placed here, at this view's own size.
  private val settle = Runnable {
    measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    layout(left, top, right, bottom)
  }

  // The phone was turned: a page as wide as the view is now another zoom, by as much as the view is wider
  // (a page that fitted read "220%" on its side, seen on an emulator).
  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (w > 0 && oldw > 0 && w != oldw && baseZoom > 0f) {
      baseZoom *= w.toFloat() / oldw
      saidZoom = -1
      post { report(saidPage.coerceAtLeast(0), pdf.zoom) }
    }
  }

  override fun requestLayout() {
    super.requestLayout()
    if (built) post(settle)
  }

  private class PdfEvent(surfaceId: Int, viewTag: Int, private val name: String, private val data: WritableMap) :
      Event<PdfEvent>(surfaceId, viewTag) {
    override fun getEventName(): String = name

    override fun getEventData(): WritableMap = data
  }

  companion object {
    private const val ARRIVE_MS = 2500L
    private const val REDRAW_MS = 120L
    private const val SCREEN_PART = 0.85f
    // On white paper, whatever the app's theme: amber for the place shown, a paler yellow for the others.
    private const val MARK_SHOWN = 0x99FF9800.toInt()
    private const val MARK_OTHER = 0x66FFE082
  }
}
