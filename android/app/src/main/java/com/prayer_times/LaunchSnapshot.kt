package com.prayer_times

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

/**
 * THE LAST SCREEN, AS THE FIRST FRAME.
 *
 * A cold start used to go: the system's splash, then an empty window in
 * the theme colour while React Native started, then a skeleton, then the
 * Today screen arriving in pieces — about a second of nothing useful
 * (measured with tools/startup-trace/video.sh). Most of that second is
 * before any JavaScript runs, so no amount of caching in the screens could
 * cover it.
 *
 * So the screen itself is kept. When the app is left while Today is on
 * screen (JS says when that is: `setEligible`), the window's pixels are
 * copied, exactly as drawn, into a file in no-backup storage. On the next
 * cold start the file is decoded on a background thread from the moment
 * the process exists, and the activity's FIRST frame is that picture laid
 * over the whole window — the blank never draws. React Native, the
 * skeleton and the live screen all build underneath, unseen; when Today
 * has settled, JS calls `hide` and the picture fades into the live screen,
 * so a countdown that has moved on changes in the fade instead of jumping.
 *
 * The picture is only used when it is the screen the person is about to
 * get: the same app version, less than a month old, the
 * same window size, night mode, font scale and density, the same in-app
 * look (every setting — `setLookKey`), and a start that opens the app
 * rather than something in it. A deep link, a widget tap or a notification opens another screen
 * and gets no picture. Whatever happens on the JS side, it is gone after
 * a few seconds.
 *
 * Android 12+ still draws its own starting window (icon on the theme
 * colour) before the process exists; nothing in an app can replace that.
 */
internal object LaunchSnapshot {
  private const val TAG = "MihrabSnapshot"
  private const val PREFS = "launch_snapshot"
  /**
   * A month. Not "the same day": the first open of a morning is the
   * launch that most needs the picture, and nor is a few days away a
   * reason for a blank one — the hero runs from the picture's hour to
   * now whatever lies between (src/boot/launchWarp.ts), and the rest of
   * the screen fades. Past a month the day's times have moved by most of
   * an hour and the picture is another season's screen.
   */
  private const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000L
  /** Longest the first frame will wait for a decode still in flight. */
  private const val DECODE_WAIT_MS = 600L
  /** The picture comes down by itself after this, whatever JS does. */
  private const val SAFETY_HIDE_MS = 5000L
  private const val FADE_MS = 260L
  /**
   * From JS's commit of the live screen to the fade: the UI thread mounts
   * that commit and draws it in the next frame or two, whatever the JS
   * thread is busy with afterwards.
   */
  private const val MOUNT_GRACE_MS = 120L

  private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "mihrab-snapshot").apply { isDaemon = true } }
  private val main = Handler(Looper.getMainLooper())

  @Volatile private var eligible = false
  @Volatile private var preloaded: Future<Bitmap?>? = null
  private var overlay: ImageView? = null
  /** The picture this process opened on, for JS: "at,targetAt,fromAt". */
  @Volatile var shownState: String = ""
    private set
  @Volatile private var heroTarget = 0L
  @Volatile private var heroFrom = 0L

  /** What the hero counts down to, and from — kept with the next picture. */
  fun setHeroState(targetAt: Long, fromAt: Long) {
    heroTarget = targetAt
    heroFrom = fromAt
  }

  // ── What JS tells us ─────────────────────────────────────────────────

  /** Today is on screen, settled, scrolled to the top: worth keeping. */
  fun setEligible(value: Boolean) {
    eligible = value
  }

  /** The app's look (theme, accent, language…), as one opaque string. */
  fun setLookKey(context: Context, key: String) {
    val p = prefs(context)
    if (p.getString("look_current", null) != key) p.edit().putString("look_current", key).apply()
  }

  // ── Keeping the screen ───────────────────────────────────────────────

  /** MainActivity.onPause: copy the window if Today is what it shows. */
  fun capture(activity: Activity) {
    if (!eligible || overlay != null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      Log.i(TAG, "not kept: eligible=$eligible showing=${overlay != null}")
      return
    }
    val window = activity.window ?: return
    val decor = window.decorView
    val w = decor.width
    val h = decor.height
    if (w <= 0 || h <= 0) return
    val bitmap = try {
      Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    } catch (e: Throwable) {
      return
    }
    val meta = Meta.current(activity, w, h, System.currentTimeMillis())
    try {
      PixelCopy.request(window, bitmap, { result ->
        if (result == PixelCopy.SUCCESS) {
          val app = activity.applicationContext
          io.execute { write(app, bitmap, meta) }
        } else {
          bitmap.recycle()
        }
      }, main)
    } catch (e: Throwable) {
      bitmap.recycle()
    }
  }

  private fun write(context: Context, bitmap: Bitmap, meta: Meta) {
    try {
      val dir = dir(context)
      val name = "snapshot-${meta.at}.webp"
      val tmp = File(dir, "$name.tmp")
      FileOutputStream(tmp).use { out ->
        @Suppress("DEPRECATION")
        val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
        bitmap.compress(format, 88, out)
      }
      val file = File(dir, name)
      if (!tmp.renameTo(file)) return
      // The record names the file, so a picture and a record from two
      // different moments can never be paired.
      meta.save(prefs(context), name)
      Log.i(TAG, "kept ${bitmap.width}x${bitmap.height} as $name (${file.length() / 1024} KB)")
      dir.listFiles()?.forEach { if (it.name != name) it.delete() }
    } catch (e: Throwable) {
      Log.w(TAG, "could not keep the screen", e)
    } finally {
      bitmap.recycle()
    }
  }

  // ── Showing it ───────────────────────────────────────────────────────

  /**
   * MainApplication.onCreate, before anything else is slow: start decoding
   * the kept screen if it could still be used, so the first frame need not
   * wait. A process started for a widget or an alarm decodes it for
   * nothing and lets it go a few seconds later.
   */
  fun preload(context: Context) {
    val app = context.applicationContext
    val stored = Meta.load(prefs(app)) ?: return
    if (!stored.stillCurrent(app)) {
      Log.i(TAG, "kept screen is out of date: $stored look_current=${prefs(app).getString("look_current", null)}")
      return
    }
    val file = File(dir(app), stored.file ?: return)
    if (!file.exists()) return
    preloaded = io.submit<Bitmap?> {
      try {
        val opts = BitmapFactory.Options()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) opts.inPreferredConfig = Bitmap.Config.HARDWARE
        BitmapFactory.decodeFile(file.path, opts)
      } catch (e: Throwable) {
        null
      }
    }
    main.postDelayed({ preloaded = null }, SAFETY_HIDE_MS)
  }

  /** MainActivity.onCreate, after super: lay the kept screen over the window. */
  fun show(activity: Activity) {
    val pending = preloaded ?: return
    preloaded = null
    if (!isPlainLaunch(activity.intent)) {
      Log.i(TAG, "not a plain launch: ${activity.intent}")
      return
    }
    val stored = Meta.load(prefs(activity)) ?: return
    if (!stored.matches(activity)) {
      Log.i(TAG, "kept screen does not fit this window")
      return
    }
    val bitmap = try {
      pending.get(DECODE_WAIT_MS, TimeUnit.MILLISECONDS)
    } catch (e: Throwable) {
      null
    } ?: return
    if (bitmap.width != stored.width || bitmap.height != stored.height) return
    val view = ImageView(activity).apply {
      setImageBitmap(bitmap)
      scaleType = ImageView.ScaleType.FIT_XY
      // A tap on a picture of a button must not fall through to whatever
      // is half-built underneath it.
      isClickable = true
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    (activity.window.decorView as? ViewGroup)?.addView(
      view,
      ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    ) ?: return
    overlay = view
    shownState = "${stored.at},${stored.heroTarget},${stored.heroFrom}"
    Log.i(TAG, "showing the kept screen")
    main.postDelayed({ hide() }, SAFETY_HIDE_MS)
  }

  /** The live screen is committed: fade the picture into it. Idempotent. */
  fun hide() {
    main.postDelayed({
      val view = overlay ?: return@postDelayed
      overlay = null
      view.isClickable = false
      view.animate()
        .alpha(0f)
        .setDuration(FADE_MS)
        .setInterpolator(DecelerateInterpolator())
        .withEndAction {
          (view.parent as? ViewGroup)?.removeView(view)
          view.setImageDrawable(null)
        }
        .start()
    }, MOUNT_GRACE_MS)
  }

  /**
   * Started to open the app, not to open something in it: no link (a
   * widget's or a deep link's `mihrab://…`) and no extras of anyone but the
   * system's (a notification's press action carries its own). The
   * launcher's MAIN/LAUNCHER and Recents both pass; so does a bare
   * `am start -n`, which is how tools/startup-trace measures it.
   */
  private fun isPlainLaunch(intent: Intent?): Boolean {
    if (intent == null) return false
    if (intent.action != null && intent.action != Intent.ACTION_MAIN) return false
    if (intent.data != null) return false
    val extras = intent.extras ?: return true
    return extras.keySet().all { it.startsWith("android.") || it.startsWith("com.android.") }
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun dir(context: Context): File =
    File(context.noBackupFilesDir, "launch-snapshot").apply { mkdirs() }

  /** What the screen was taken under, and what it must match to be used. */
  private data class Meta(
    val width: Int,
    val height: Int,
    val night: Int,
    val fontScale: Float,
    val densityDpi: Int,
    val version: Int,
    val day: String,
    val at: Long,
    val look: String,
    val heroTarget: Long = 0L,
    val heroFrom: Long = 0L,
    val file: String? = null,
  ) {
    fun save(p: android.content.SharedPreferences, name: String) {
      p.edit()
        .putInt("w", width).putInt("h", height).putInt("night", night)
        .putFloat("font", fontScale).putInt("dpi", densityDpi).putInt("version", version)
        .putString("day", day).putLong("at", at).putString("look", look)
        .putLong("heroTarget", heroTarget).putLong("heroFrom", heroFrom)
        .putString("file", name)
        .commit()
    }

    /** Could this still be today's screen, before any window exists? */
    fun stillCurrent(context: Context): Boolean {
      val now = System.currentTimeMillis()
      if (version != BuildConfig.VERSION_CODE) return false
      if (now - at !in 0..MAX_AGE_MS) return false
      val look = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("look_current", null)
      return look != null && look == this.look
    }

    /** …and is it, for this window? */
    fun matches(activity: Activity): Boolean {
      if (!stillCurrent(activity)) return false
      val c = activity.resources.configuration
      if ((c.uiMode and Configuration.UI_MODE_NIGHT_MASK) != night) return false
      if (c.fontScale != fontScale || c.densityDpi != densityDpi) return false
      val (w, h) = windowSize(activity)
      return w == width && h == height
    }

    companion object {
      fun current(activity: Activity, w: Int, h: Int, at: Long): Meta {
        val c = activity.resources.configuration
        val look = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("look_current", "") ?: ""
        return Meta(w, h, c.uiMode and Configuration.UI_MODE_NIGHT_MASK, c.fontScale, c.densityDpi,
          BuildConfig.VERSION_CODE, dayOf(at), at, look, heroTarget, heroFrom)
      }

      fun load(p: android.content.SharedPreferences): Meta? {
        val file = p.getString("file", null) ?: return null
        return Meta(
          p.getInt("w", 0), p.getInt("h", 0), p.getInt("night", -1), p.getFloat("font", 0f),
          p.getInt("dpi", 0), p.getInt("version", -1), p.getString("day", "") ?: "",
          p.getLong("at", 0L), p.getString("look", "") ?: "",
          p.getLong("heroTarget", 0L), p.getLong("heroFrom", 0L), file,
        )
      }

      private fun dayOf(ms: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(ms))

      private fun windowSize(activity: Activity): Pair<Int, Int> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          val b = activity.windowManager.currentWindowMetrics.bounds
          b.width() to b.height()
        } else {
          val p = android.graphics.Point()
          @Suppress("DEPRECATION")
          activity.windowManager.defaultDisplay.getRealSize(p)
          p.x to p.y
        }
    }
  }
}
