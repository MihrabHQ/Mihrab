package com.prayer_times

import android.app.ActivityManager
import android.app.Application
import android.os.SystemClock
import android.graphics.Typeface
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.modules.network.OkHttpClientProvider
import com.google.android.material.color.DynamicColors
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(PrayerWidgetPackage())
          add(PrayerBuildInfoPackage())
          add(AppVersionPackage())
          add(SystemClockPackage())
          add(SystemThemePackage())
          add(MihrabLiveActivityPackage())
          add(MushafFontPackage())
          add(MushafLinePackage())
          add(PrayerSilencePackage())
          add(FullScreenAlarmPackage())
          add(CustomAdhanPackage())
          add(SecureRandomPackage())
          add(WordPlayerPackage())
          add(MihrabClipboardPackage())
          add(SyncFolderPackage())
          add(ScanQrPackage())
          add(CompassPackage())
          add(DisplayCutoutPackage())
          add(FoldPosturePackage())
          add(RotationCoverPackage())
          add(VolumeKeysPackage())
          add(LaunchSnapshotPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    val appStart = SystemClock.uptimeMillis()
    // First: the kept screen decodes while everything below runs.
    LaunchSnapshot.preload(this)
    // ── NO WEBVIEW IN THIS PROCESS ─────────────────────────────────────
    // React Native's HTTP client keeps cookies through android.webkit's
    // CookieManager, and the first fetch of the day (the times, an update
    // file, the town lookup) loaded the whole Chromium WebView into the
    // app's process to hold them — some twenty megabytes of library and
    // relro for cookies nothing here sends. NoCookieJar keeps none and
    // ignores the WebView-backed jar the networking module hands it, so
    // the WebView is never asked for — and it is still the container
    // Fresco insists on (a plain NO_COOKIES jar crashed the launch).
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClient.Builder()
        .connectTimeout(0, TimeUnit.MILLISECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(0, TimeUnit.MILLISECONDS)
        .cookieJar(NoCookieJar())
        .build()
    }
    DynamicColors.applyToActivitiesIfAvailable(this)
    registerBundledFonts()
    loadReactNative(this)
    // The JavaScript runtime and the bundle, started here rather than when
    // the activity asks for them: the two run on their own thread while the
    // activity is created and the kept screen is put up, so the live screen
    // arrives that much sooner. Only when this process is being started to
    // show a window — a process the system started for a widget's refresh
    // or an alarm would be running a whole app for nothing.
    val importance = ActivityManager.RunningAppProcessInfo().also { ActivityManager.getMyMemoryState(it) }.importance
    Log.i("MihrabBoot", "process importance at start: $importance")
    if (importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
      try {
        reactHost.start()
      } catch (t: Throwable) {
        Log.w("MihrabBoot", "could not start React Native early", t)
      }
    }
    BootTimes.app(appStart, SystemClock.uptimeMillis())
  }

  /**
   * THE BUNDLED FACES, AT EVERY WEIGHT.
   *
   * React Native finds a bundled font by file name and STYLE: asked for
   * "Amiri" at weight 600 or 700 it looks for `fonts/Amiri_bold.ttf`, and
   * when there is none — there is not; each face ships one weight — it
   * falls back to `Typeface.create("Amiri", BOLD)`, which is the SYSTEM's
   * Arabic font under our name. Silently: the riwayah chip in the reader
   * header, set in Amiri at 700, was drawn in the system face.
   *
   * Registered here, a family answers every weight from its own file, and
   * a bold request becomes a synthesised bold of the same letters rather
   * than someone else's. Before `loadReactNative`, so no text is laid out
   * before the registry is filled.
   */
  private fun registerBundledFonts() {
    val manager = ReactFontManager.getInstance()
    // The UI face: a font XML, so 400/500/700 and italic are real files
    // (res/font/roboto.xml — and why the app carries its own Roboto).
    try {
      manager.addCustomFont(this, UI_FONT, R.font.roboto)
    } catch (e: RuntimeException) {
      Log.w("Mihrab", "could not register the UI font", e)
    }
    for (family in BUNDLED_FONTS) {
      try {
        manager.addCustomFont(family, Typeface.createFromAsset(assets, "fonts/$family.ttf"))
      } catch (e: RuntimeException) {
        // A missing asset leaves React Native's own lookup in place, which
        // is what every build before this one did.
        Log.w("Mihrab", "could not register bundled font $family", e)
      }
    }
  }

  private companion object {
    /** The family every Text asks for on Android — see src/theme/androidUiFont.ts. */
    const val UI_FONT = "Roboto"
    /** File names in android/app/src/main/assets/fonts, without `.ttf`. */
    val BUNDLED_FONTS = listOf("Amiri", "AmiriQuran", "SurahNames", "MihrabMedallion")
  }
}
