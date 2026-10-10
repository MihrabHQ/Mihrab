package com.prayer_times

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/** JS's half of [LaunchSnapshot]: when to keep the screen, and when to let it go. */
class LaunchSnapshotModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "MihrabLaunchSnapshot"

  @ReactMethod
  fun setEligible(value: Boolean) = LaunchSnapshot.setEligible(value)

  @ReactMethod
  fun setLookKey(key: String) = LaunchSnapshot.setLookKey(reactApplicationContext, key)

  @ReactMethod
  fun hide() = LaunchSnapshot.hide()

  /** Keep the screen as it is now (if it is worth keeping): see LaunchSnapshot.ts. */
  @ReactMethod
  fun captureNow() {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread { LaunchSnapshot.capture(activity) }
  }

  @ReactMethod
  fun setHeroState(targetAt: Double, fromAt: Double) =
    LaunchSnapshot.setHeroState(targetAt.toLong(), fromAt.toLong())

  /** Read once, at the first render of the hero: see src/boot/launchWarp.ts. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getShownState(): String = LaunchSnapshot.shownState
}

class LaunchSnapshotPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(LaunchSnapshotModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
