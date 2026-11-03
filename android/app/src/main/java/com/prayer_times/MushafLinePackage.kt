package com.prayer_times

import com.facebook.react.ReactPackage
import com.facebook.react.ViewManagerOnDemandReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * On demand: the bridgeless host reads the constants of every view manager
 * from every package that is not [ViewManagerOnDemandReactPackage] before
 * the first frame (docs/first-frame-plan.md). The muṣḥaf line is never on
 * Today's first frame; its manager is created when the reader opens a page.
 */
class MushafLinePackage : ReactPackage, ViewManagerOnDemandReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      emptyList()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      emptyList()

  override fun getViewManagerNames(reactContext: ReactApplicationContext): Collection<String> =
      listOf(MushafLineViewManager.NAME)

  override fun createViewManager(
      reactContext: ReactApplicationContext,
      viewManagerName: String,
  ): ViewManager<*, *>? =
      if (viewManagerName == MushafLineViewManager.NAME) MushafLineViewManager() else null
}
