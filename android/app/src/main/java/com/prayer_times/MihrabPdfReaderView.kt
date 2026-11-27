package com.prayer_times

import android.net.Uri
import android.util.SparseArray
import android.graphics.RectF
import android.widget.FrameLayout
import androidx.annotation.RequiresApi
import androidx.pdf.PdfDocument
import androidx.pdf.SandboxedPdfLoader
import androidx.pdf.view.PdfView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import java.io.File
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

  /** `step` is against the page's own width: 1 is a page as wide as the view. */
  fun zoomTo(step: Double, key: Int) {
    if (key == zoomKey) return
    zoomKey = key
    if (baseZoom <= 0f || document == null) return
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
  }
}
