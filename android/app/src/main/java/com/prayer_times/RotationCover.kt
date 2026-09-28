package com.prayer_times

import android.app.Activity
import android.content.res.Configuration
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * A sheet of page colour over the whole window, raised AT the rotation.
 *
 * The muṣḥaf already covered its pager while a rotation re-laid it out,
 * and faded the page back in afterwards (`src/quran/rotationFade.ts`). But
 * that cover is React, and React hears about a rotation last: Android
 * resizes the window, draws the old layout into the new shape — the page
 * stretched, the rail at the wrong width, the player where the rail was —
 * and only then does JavaScript learn the window's new size, render, and
 * put the cover up. Reported on a phone on 2026-09-28: the fade came in
 * after the screen had begun to turn, and the choppy frames still showed.
 *
 * Nothing in JavaScript can be earlier than that. This can:
 * `MainActivity.onConfigurationChanged` runs inside the window's own
 * traversal, before it measures and draws at the new size, so a view added
 * there is in the very first frame the new orientation draws. The system's
 * rotation animation cross-fades from its screenshot of the old screen
 * into the page colour, and the reader fades in over it once it has
 * settled — JS says when, with `lift`.
 *
 * ARMED, NOT ALWAYS ON. Only the muṣḥaf readers arm it, with their page
 * colour, while they are in front: a rotation anywhere else keeps the
 * system's own behaviour, and nothing would be there to lift the cover.
 * And only a real turn — portrait to landscape or back — raises it; the
 * window changing size for any other reason is the reader's own cover's
 * business. A timer takes it down regardless, so the page always comes
 * back even if the lift never arrives.
 */
object RotationCover {
  /** The longest the cover may stay up without a lift. */
  private const val MAX_MS = 1500L

  private val main = Handler(Looper.getMainLooper())
  private var color: Int? = null
  private var orientation: Int = Configuration.ORIENTATION_UNDEFINED
  private var overlay: View? = null
  private val safety = Runnable { lift(0) }

  /** Main thread. The reader is in front, and its page is this colour. */
  fun arm(activity: Activity?, argb: Int) {
    color = argb
    activity?.let { orientation = it.resources.configuration.orientation }
    overlay?.setBackgroundColor(argb)
  }

  /** Main thread. The reader has gone; a cover still up goes with it. */
  fun disarm() {
    color = null
    remove()
  }

  /** From `MainActivity.onConfigurationChanged`, before anything else. */
  fun onConfigurationChanged(activity: Activity, config: Configuration) {
    val was = orientation
    orientation = config.orientation
    val argb = color ?: return
    if (was == Configuration.ORIENTATION_UNDEFINED || was == config.orientation) return
    val decor = activity.window?.decorView as? ViewGroup ?: return
    val view = overlay ?: View(activity).also {
      decor.addView(
        it,
        FrameLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT,
        ),
      )
      overlay = it
    }
    view.animate().cancel()
    view.setBackgroundColor(argb)
    view.alpha = 1f
    // Above anything with an elevation of its own — the decor's content
    // is a sibling, and a FrameLayout orders siblings by Z first.
    view.translationZ = 10_000f
    view.bringToFront()
    main.removeCallbacks(safety)
    main.postDelayed(safety, MAX_MS)
  }

  /** Main thread. Fade the cover off the settled page, then drop it. */
  fun lift(durationMs: Long) {
    main.removeCallbacks(safety)
    val view = overlay ?: return
    view.animate().cancel()
    if (durationMs <= 0) {
      remove()
      return
    }
    view.animate()
      .alpha(0f)
      .setDuration(durationMs)
      .withEndAction { if (overlay === view) remove() }
      .start()
  }

  private fun remove() {
    main.removeCallbacks(safety)
    val view = overlay ?: return
    overlay = null
    view.animate().cancel()
    (view.parent as? ViewGroup)?.removeView(view)
  }
}

/** `NativeModules.MihrabRotationCover` — see [RotationCover]. */
class RotationCoverModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MihrabRotationCover"

  override fun getConstants(): Map<String, Any> = mapOf("enabled" to true)

  @ReactMethod
  fun arm(argb: Double) {
    val activity = reactApplicationContext.currentActivity
    UiThreadUtil.runOnUiThread { RotationCover.arm(activity, argb.toLong().toInt()) }
  }

  @ReactMethod
  fun disarm() {
    UiThreadUtil.runOnUiThread { RotationCover.disarm() }
  }

  @ReactMethod
  fun lift(durationMs: Double) {
    UiThreadUtil.runOnUiThread { RotationCover.lift(durationMs.toLong()) }
  }
}
