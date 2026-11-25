package com.prayer_times

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.prayer_times.specs.NativeMihrabLaunchSnapshotSpec
import com.facebook.react.uimanager.ViewManager

/** JS's half of [LaunchSnapshot]: when to keep the screen, and when to let it go. */
class LaunchSnapshotModule(reactContext: ReactApplicationContext) :
  NativeMihrabLaunchSnapshotSpec(reactContext) {

  override fun getName(): String = "MihrabLaunchSnapshot"

  override fun setEligible(value: Boolean) = LaunchSnapshot.setEligible(value)

  override fun setLookKey(key: String, nightMatters: Boolean) = LaunchSnapshot.setLookKey(reactApplicationContext, key, nightMatters)

  override fun hide() = LaunchSnapshot.hide()

  /**
   * Keep the screen as it is now (if it is worth keeping), with the posed
   * hero in `heroFile` drawn at (x, y) dp when given: see LaunchSnapshot.ts.
   */
  override fun captureNow(heroFile: String?, x: Double, y: Double) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread { LaunchSnapshot.capture(activity, heroFile, x.toFloat(), y.toFloat(), fromJs = true) }
  }

  /** A still of the screen, faded out over the next screen: see LaunchSnapshot.crossfade. */
  override fun crossfade(durationMs: Double) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread { LaunchSnapshot.crossfade(activity, durationMs.toLong()) }
  }

  override fun setHeroState(targetAt: Double, fromAt: Double, posed: Boolean) =
    LaunchSnapshot.setHeroState(targetAt.toLong(), fromAt.toLong(), posed)

  /** Read once, at the first render of the hero: see src/boot/launchWarp.ts. */
  override fun getShownState(): String = LaunchSnapshot.shownState
}

class LaunchSnapshotPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(LaunchSnapshotModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
