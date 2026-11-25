package com.prayer_times

import android.view.KeyEvent
import com.facebook.react.bridge.ReactApplicationContext
import com.prayer_times.specs.NativeMihrabVolumeKeysSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * The volume buttons as page-turn keys — issue #68.
 *
 * Off unless JavaScript has asked for it: [captured] is set only while the
 * muṣḥaf is on screen with nothing selected, and cleared the moment an āyah
 * is selected or the reader is left. While it is clear this module does
 * nothing at all and the buttons change the volume as they always have.
 *
 * While it is set, [MainActivity] hands every volume key to [handle], which
 * emits `VolumeKey` ({ direction: "up" | "down" }) once per press and
 * CONSUMES the event — consuming it is what stops the system from also
 * changing the volume and drawing its slider. A held button repeats; the
 * repeats are consumed but not emitted, so holding it turns one page and
 * not forty.
 *
 * Starts cleared on every process, so a JS reload or a crash while it was
 * set cannot leave the buttons dead.
 */
class VolumeKeysModule(private val reactContext: ReactApplicationContext) :
  NativeMihrabVolumeKeysSpec(reactContext) {

  override fun getName(): String = NAME

  init {
    context = reactContext
    captured = false
  }

  override fun setCaptured(on: Boolean) {
    captured = on
  }

  // NativeEventEmitter requires both; there is nothing to start or stop.
  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  companion object {
    const val NAME = "MihrabVolumeKeys"

    @Volatile var captured: Boolean = false
    @Volatile private var context: ReactApplicationContext? = null

    private fun isVolumeKey(keyCode: Int) =
      keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN

    /** True if the event was taken and must not reach the system. */
    fun handle(keyCode: Int, event: KeyEvent): Boolean {
      if (!captured || !isVolumeKey(keyCode)) return false
      val ctx = context ?: return false
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
        val payload = Arguments.createMap()
        payload.putString(
          "direction",
          if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) "up" else "down",
        )
        ctx
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("VolumeKey", payload)
      }
      return true
    }
  }
}
