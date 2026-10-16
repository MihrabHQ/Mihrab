package com.prayer_times

import android.content.Context
import android.os.Build
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * The tajwīd page fonts' ink, for the Androids that cannot draw it.
 *
 * The QPC V4 tajwīd fonts colour each word in COLR v0 layers, and every
 * layer drawn in the page's ink — the letters themselves, the pause and
 * maddah marks, the āyah medallion's outline — uses palette entry 0xFFFF,
 * "the text's own colour", so one file serves the paper and the sepia
 * page alike (scripts/mushaf/build_tajweed_assets.py).
 *
 * Android 10, 11 and 12 draw COLR but not that entry: they paint it black,
 * whatever the text colour (seen on the API 29, 30 and 31 emulators,
 * 2026-10-16; API 33 draws it in the text's colour). On the
 * paper and sepia pages that is the ink anyway, near enough; on the night
 * page it is black letters on a black page, and only the rule colours
 * showed — a scatter of coloured fragments where the āyāt should be.
 *
 * So there, the night palette's file is loaded from a copy in which those
 * layers point at a real palette entry holding the night ink. Entry 0 is
 * free for it: the build moved every layer that used it to 0xFFFF. The
 * light palette's file is left as it is; black is its ink.
 */
internal object TajweedInkPatch {
  /** The first Android whose COLR draws 0xFFFF in the text's colour. */
  const val FOREGROUND_SDK = 33

  /** The night page's ink (`mushafTone.ts`, night). */
  private const val NIGHT_INK = 0xFFF2F2F2.toInt()

  private val NIGHT_FILE = Regex("^QCF4T\\d{3}D\\.ttf$")

  /** Whether this device needs the night palette's ink written in. */
  val needed: Boolean get() = Build.VERSION.SDK_INT < FOREGROUND_SDK

  /**
   * The file to load for [file]: itself, or the patched copy for a night
   * palette file on an Android that needs one (made once, kept in the cache).
   */
  fun fileFor(context: Context, file: File): File {
    if (!needed || !NIGHT_FILE.matches(file.name)) return file
    val dir = File(context.cacheDir, "tajweed-ink").apply { mkdirs() }
    val out = File(dir, "${file.nameWithoutExtension}-${file.length()}-${file.lastModified()}.ttf")
    if (out.exists() && out.length() == file.length()) return out
    val bytes = file.readBytes()
    if (!patch(bytes, NIGHT_INK)) return file
    val tmp = File(dir, out.name + ".tmp")
    tmp.writeBytes(bytes)
    if (!tmp.renameTo(out)) return file
    return out
  }

  /**
   * Point every COLR v0 layer drawn in 0xFFFF at palette entry 0, and set
   * entry 0 of every palette to [argb]. In place; false when the font has
   * no COLR or CPAL to patch (then it is loaded unchanged).
   */
  fun patch(font: ByteArray, argb: Int): Boolean {
    val b = ByteBuffer.wrap(font).order(ByteOrder.BIG_ENDIAN)
    if (font.size < 12) return false
    val numTables = b.getShort(4).toInt() and 0xFFFF
    var colr = -1
    var cpal = -1
    for (i in 0 until numTables) {
      val rec = 12 + i * 16
      if (rec + 16 > font.size) return false
      val tag = String(font, rec, 4, Charsets.US_ASCII)
      val offset = b.getInt(rec + 8)
      when (tag) {
        "COLR" -> colr = offset
        "CPAL" -> cpal = offset
      }
    }
    if (colr < 0 || cpal < 0) return false

    // COLR v0 header: version, numBaseGlyphRecords, baseGlyphRecordsOffset,
    // layerRecordsOffset, numLayerRecords. A v1 table starts the same way.
    val layers = colr + b.getInt(colr + 8)
    val numLayers = b.getShort(colr + 12).toInt() and 0xFFFF
    var moved = 0
    for (i in 0 until numLayers) {
      val idx = layers + i * 4 + 2
      if (idx + 2 > font.size) return false
      if ((b.getShort(idx).toInt() and 0xFFFF) == 0xFFFF) {
        b.putShort(idx, 0)
        moved++
      }
    }
    if (moved == 0) return false

    // CPAL: version, numPaletteEntries, numPalettes, numColorRecords,
    // colorRecordsArrayOffset, then colorRecordIndices[numPalettes]; each
    // colour record is B, G, R, A.
    val numPalettes = b.getShort(cpal + 4).toInt() and 0xFFFF
    val records = cpal + b.getInt(cpal + 8)
    for (p in 0 until numPalettes) {
      val first = b.getShort(cpal + 12 + p * 2).toInt() and 0xFFFF
      val at = records + first * 4
      if (at + 4 > font.size) return false
      font[at] = (argb and 0xFF).toByte()
      font[at + 1] = ((argb shr 8) and 0xFF).toByte()
      font[at + 2] = ((argb shr 16) and 0xFF).toByte()
      font[at + 3] = ((argb ushr 24) and 0xFF).toByte()
    }
    return true
  }
}
