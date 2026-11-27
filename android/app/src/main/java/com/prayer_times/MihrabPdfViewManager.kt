package com.prayer_times

import androidx.annotation.RequiresApi
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/** `MihrabPdfView` to JS — see `src/native/MihrabPdfViewNativeComponent.ts` for the props. */
@RequiresApi(28)
class MihrabPdfViewManager : SimpleViewManager<MihrabPdfReaderView>() {
  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): MihrabPdfReaderView = MihrabPdfReaderView(context)

  @ReactProp(name = "path")
  fun setPath(view: MihrabPdfReaderView, value: String?) {
    view.path = value ?: ""
  }

  @ReactProp(name = "page", defaultInt = 0)
  fun setPage(view: MihrabPdfReaderView, value: Int) {
    view.page = value
  }

  // A page to go to and a zoom to take are asked for, not states to be in: each comes with a key that
  // changes when it is asked for again, so the same page can be gone to twice.
  @ReactProp(name = "goTo")
  fun setGoTo(view: MihrabPdfReaderView, value: com.facebook.react.bridge.ReadableMap?) {
    if (value != null) view.goTo(value.getInt("page"), value.getInt("key"))
  }

  @ReactProp(name = "zoomTo")
  fun setZoomTo(view: MihrabPdfReaderView, value: com.facebook.react.bridge.ReadableMap?) {
    if (value != null) view.zoomTo(value.getDouble("step"), value.getInt("key"))
  }

  override fun onAfterUpdateTransaction(view: MihrabPdfReaderView) {
    super.onAfterUpdateTransaction(view)
    view.commit()
  }

  override fun onDropViewInstance(view: MihrabPdfReaderView) {
    view.close()
    super.onDropViewInstance(view)
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
      mapOf(
          "topPdfViewport" to mapOf("registrationName" to "onPdfViewport"),
          "topPdfError" to mapOf("registrationName" to "onPdfError"),
      )

  companion object {
    const val NAME = "MihrabPdfView"
    /** The PDF library's own floor: Android 9. */
    const val MIN_SDK = 28
  }
}
