package com.prayer_times

import androidx.core.content.ContextCompat
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Where a foldable's hinge is, and how far it is folded.
 *
 * Jetpack WindowManager reports a FoldingFeature for the window the app is
 * in: its bounds (in the window's pixels), whether it is half open (a book
 * on its side, a laptop on a table) or flat, which way it runs, and whether
 * it separates the window into two areas. JS reads that as the posture —
 * `src/native/FoldPosture.ts` — and keeps content off the hinge.
 *
 * Nothing is reported on a device without a hinge, or with the device
 * closed onto its cover screen (that window has no fold in it).
 */
class FoldPostureModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private var adapter: WindowInfoTrackerCallbackAdapter? = null
  private var latest: WritableMap = none()
  private val listener = Consumer<WindowLayoutInfo> { info -> publish(info) }

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = NAME

  override fun onHostResume() {
    val activity = reactApplicationContext.currentActivity ?: return
    if (adapter != null) return
    UiThreadUtil.runOnUiThread {
      try {
        val a = WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(activity))
        a.addWindowLayoutInfoListener(activity, ContextCompat.getMainExecutor(activity), listener)
        adapter = a
      } catch (_: Throwable) {
        // No WindowManager extensions on this device: no hinge to report.
      }
    }
  }

  override fun onHostPause() {}

  override fun onHostDestroy() {
    adapter?.removeWindowLayoutInfoListener(listener)
    adapter = null
  }

  private fun publish(info: WindowLayoutInfo) {
    val activity = reactApplicationContext.currentActivity
    val density = activity?.resources?.displayMetrics?.density ?: 1f
    val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
    val map = if (fold == null) {
      none()
    } else {
      Arguments.createMap().apply {
        putString(
          "state",
          if (fold.state == FoldingFeature.State.HALF_OPENED) "half" else "flat",
        )
        putString(
          "orientation",
          if (fold.orientation == FoldingFeature.Orientation.VERTICAL) "vertical" else "horizontal",
        )
        putBoolean("separating", fold.isSeparating)
        val b = fold.bounds
        putDouble("left", b.left / density.toDouble())
        putDouble("top", b.top / density.toDouble())
        putDouble("right", b.right / density.toDouble())
        putDouble("bottom", b.bottom / density.toDouble())
      }
    }
    latest = map
    if (reactApplicationContext.hasActiveReactInstance()) {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT, copy(map))
    }
  }

  @ReactMethod
  fun read(promise: Promise) {
    promise.resolve(copy(latest))
  }

  @ReactMethod
  fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}

  @ReactMethod
  fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Double) {}

  private fun none(): WritableMap = Arguments.createMap().apply { putString("state", "none") }

  private fun copy(m: WritableMap): WritableMap = Arguments.createMap().apply { merge(m) }

  companion object {
    const val NAME = "MihrabFoldPosture"
    const val EVENT = "FoldPosture"
  }
}
