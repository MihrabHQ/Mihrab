package com.prayer_times

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.prayer_times.specs.NativeMihrabPdfSpec
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * A page of a PDF that is a file on this device, drawn to a picture.
 *
 * WHY THE SYSTEM'S OWN RENDERER. A Library book that is a PDF is read
 * with no network and on every phone the app runs on (API 24). Android
 * has drawn PDF pages itself since API 21 (`PdfRenderer`): nothing is
 * added to the app, nothing for F-Droid to build or to question, and no
 * binary of anyone else's. What it does not give on older versions is a
 * page's text, so there is no search here.
 *
 * WHY A PICTURE IN A FILE, AND NOT A VIEW. The reader is a list of pages
 * like any other list in the app; a page is drawn once at the width it
 * is shown at, kept in the cache, and shown as an image. A long book
 * holds in memory only the pages on screen, and a page already drawn is
 * there at once on coming back to it.
 *
 * ONE AT A TIME. `PdfRenderer` allows one open page, so every call runs
 * on one thread, and the open document is kept between calls: opening it
 * again for each page of a long book is the slow part.
 */
class MihrabPdfModule(reactContext: ReactApplicationContext) :
  NativeMihrabPdfSpec(reactContext) {

  override fun getName(): String = NAME

  private val worker = Executors.newSingleThreadExecutor()
  private var openPath: String? = null
  private var openFd: ParcelFileDescriptor? = null
  private var open: PdfRenderer? = null

  private fun cacheRoot(): File = File(reactApplicationContext.cacheDir, "pdf-pages")

  /** The document at `path`, opened once and kept. Called on `worker` only. */
  private fun renderer(path: String): PdfRenderer {
    val file = File(path.removePrefix("file://"))
    val key = "${file.absolutePath}:${file.length()}:${file.lastModified()}"
    open?.let { if (openPath == key) return it }
    closeOpen()
    val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      val made = PdfRenderer(fd)
      openFd = fd
      open = made
      openPath = key
      return made
    } catch (e: Exception) {
      try { fd.close() } catch (_: Exception) {}
      throw e
    }
  }

  private fun closeOpen() {
    try { open?.close() } catch (_: Exception) {}
    try { openFd?.close() } catch (_: Exception) {}
    open = null
    openFd = null
    openPath = null
  }

  /** Where this file's drawn pages are kept: by the file as it is now, so a book fetched again is drawn again. */
  private fun pagesDir(path: String): File {
    val file = File(path.removePrefix("file://"))
    val name = "${file.nameWithoutExtension}-${file.length()}-${file.lastModified()}".replace(Regex("[^A-Za-z0-9._-]"), "_")
    return File(cacheRoot(), name)
  }

  override fun info(path: String, promise: Promise) {
    worker.execute {
      try {
        val doc = renderer(path)
        if (doc.pageCount < 1) throw IllegalStateException("no pages")
        val map = Arguments.createMap()
        doc.openPage(0).use { first ->
          map.putInt("pages", doc.pageCount)
          map.putInt("width", first.width)
          map.putInt("height", first.height)
        }
        prune(pagesDir(path))
        promise.resolve(map)
      } catch (e: Throwable) {
        closeOpen()
        promise.reject("pdf_unreadable", e.message ?: "not a PDF that can be read", e)
      }
    }
  }

  override fun renderPage(path: String, page: Double, width: Double, promise: Promise) {
    worker.execute {
      try {
        val index = page.toInt()
        val wanted = width.toInt().coerceIn(MIN_WIDTH, MAX_WIDTH)
        val dir = pagesDir(path)
        val out = File(dir, "$index@$wanted.jpg")
        val sizeFile = File(dir, "$index@$wanted.txt")
        if (out.exists() && out.length() > 0 && sizeFile.exists()) {
          val (w, h) = sizeFile.readText().trim().split("x").map { it.toInt() }
          out.setLastModified(System.currentTimeMillis())
          promise.resolve(drawn(out, w, h))
          return@execute
        }
        val doc = renderer(path)
        if (index < 0 || index >= doc.pageCount) throw IllegalArgumentException("no page $index")
        doc.openPage(index).use { p ->
          var w = wanted
          var h = Math.round(wanted.toDouble() * p.height / p.width).toInt().coerceAtLeast(1)
          // A page far taller than it is wide is not drawn past what a bitmap may hold.
          if (w.toLong() * h > MAX_PIXELS) {
            val k = Math.sqrt(MAX_PIXELS.toDouble() / (w.toLong() * h))
            w = (w * k).toInt().coerceAtLeast(1)
            h = (h * k).toInt().coerceAtLeast(1)
          }
          val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          try {
            // A PDF page has no paper of its own: without this it is drawn on nothing, and saved black.
            bitmap.eraseColor(Color.WHITE)
            p.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            dir.mkdirs()
            val tmp = File(dir, "$index@$wanted.jpg.part")
            FileOutputStream(tmp).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it) }
            if (!tmp.renameTo(out)) throw IllegalStateException("could not keep the page")
            sizeFile.writeText("${w}x$h")
          } finally {
            bitmap.recycle()
          }
          promise.resolve(drawn(out, w, h))
        }
      } catch (e: Throwable) {
        promise.reject("pdf_page", e.message ?: "the page could not be drawn", e)
      }
    }
  }

  private fun drawn(file: File, w: Int, h: Int) = Arguments.createMap().apply {
    putString("uri", "file://${file.absolutePath}")
    putInt("width", w)
    putInt("height", h)
  }

  /** The cache is the system's to empty, but it is not left to grow past its share: the pages least lately read go first. */
  private fun prune(keep: File) {
    try {
      val all = cacheRoot().walkTopDown().filter { it.isFile }.toList()
      var total = all.sumOf { it.length() }
      if (total <= CACHE_BYTES) return
      for (f in all.sortedBy { it.lastModified() }) {
        if (total <= CACHE_BYTES * 3 / 4) break
        if (f.parentFile == keep && System.currentTimeMillis() - f.lastModified() < 60_000) continue
        total -= f.length()
        f.delete()
      }
    } catch (_: Exception) {}
  }

  override fun clearCache(promise: Promise) {
    worker.execute {
      closeOpen()
      promise.resolve(cacheRoot().deleteRecursively())
    }
  }

  override fun invalidate() {
    worker.execute { closeOpen() }
    super.invalidate()
  }

  companion object {
    const val NAME = "MihrabPdf"
    private const val MIN_WIDTH = 200
    private const val MAX_WIDTH = 3000
    /** About what a 3000 x 4250 page is: past it a bitmap is refused on a phone with little memory. */
    private const val MAX_PIXELS = 13_000_000L
    private const val CACHE_BYTES = 120L * 1024 * 1024
  }
}
