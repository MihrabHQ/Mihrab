package com.prayer_times

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * The app's own native modules, in one package: each is made when
 * JavaScript first asks for it by name, and not before.
 *
 * ── WHY ONE PACKAGE, AND NOT ONE EACH ──────────────────────────────────
 *
 * Until 2.39 every module had a `ReactPackage` of its own whose
 * `createNativeModules` handed over a new instance. React Native keeps
 * that door open for old packages, and what it does behind it is build
 * every module of every such package while the host starts — twenty-four
 * of ours, before the first frame, whether the launch needed them or not
 * (a QR scanner, the Garmin link, the folder sync) — and mark each for
 * initialising at once (`ReactPackageTurboModuleManagerDelegate`, "legacy
 * packages"). All twenty-four are typed TurboModules now
 * (src/native/specs), so they are listed here by name and built on
 * demand, which is what a TurboModule is for.
 *
 * ── A MODULE THAT LISTENS ──────────────────────────────────────────────
 *
 * Some register with the host as they are built: for the activity's
 * results (CustomAdhan, ScanQr, SyncFolder) or its life (PrayerWidget,
 * MihrabFoldPosture). None of them needs to exist before JavaScript has
 * asked it for something — a result only follows a call, and a listener
 * added while the activity is in front is told so at once
 * (`ReactContext.addLifecycleEventListener`). MihrabVolumeKeys is asked by
 * `MainActivity` through its companion, which answers "not captured"
 * until the module exists.
 *
 * ── NOT HERE ───────────────────────────────────────────────────────────
 *
 * The muṣḥaf line (a view manager, `MushafLinePackage`), the location
 * module (`geolocation/GeolocationPackage`) and the alerts' engine
 * (`io.invertase.notifee.NotifeePackage`) keep packages of their own.
 *
 * A NEW MODULE is added in two places below — the `when` and the list —
 * and `__tests__/androidModulesOnDemand.test.ts` fails if they differ,
 * or if a name is not the one the module answers to.
 */
class MihrabPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      when (name) {
        "AppVersion" -> AppVersionModule(reactContext)
        "BackgroundLocation" -> BackgroundLocationModule(reactContext)
        "CompassModule" -> CompassModule(reactContext)
        "CustomAdhan" -> CustomAdhanModule(reactContext)
        "DisplayCutout" -> DisplayCutoutModule(reactContext)
        "FullScreenAlarm" -> FullScreenAlarmModule(reactContext)
        "GarminWatch" -> GarminWatchModule(reactContext)
        "MihrabClipboard" -> MihrabClipboardModule(reactContext)
        "MihrabFoldPosture" -> FoldPostureModule(reactContext)
        "MihrabLaunchSnapshot" -> LaunchSnapshotModule(reactContext)
        "MihrabLiveActivity" -> MihrabLiveActivityModule(reactContext)
        "MihrabPdf" -> MihrabPdfModule(reactContext)
        "MihrabRotationCover" -> RotationCoverModule(reactContext)
        "MihrabSecureStore" -> SecureStoreModule(reactContext)
        "MihrabVolumeKeys" -> VolumeKeysModule(reactContext)
        "MushafFont" -> MushafFontModule(reactContext)
        "PrayerBuildInfo" -> PrayerBuildInfoModule(reactContext)
        "PrayerSilence" -> PrayerSilenceModule(reactContext)
        "PrayerWidget" -> PrayerWidgetModule(reactContext)
        "ScanQr" -> ScanQrModule(reactContext)
        "SecureRandom" -> SecureRandomModule(reactContext)
        "SyncFolder" -> SyncFolderModule(reactContext)
        "SystemClock" -> SystemClockModule(reactContext)
        "SystemTheme" -> SystemThemeModule(reactContext)
        "WordPlayer" -> WordPlayerModule(reactContext)
        else -> null
      }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    MODULES.associate { (name, type) ->
      name to
          ReactModuleInfo(
              name,
              type.name,
              false, // canOverrideExistingModule
              false, // needsEagerInit: built when first asked for
              false, // isCxxModule
              true, // isTurboModule
          )
    }
  }

  private companion object {
    val MODULES: List<Pair<String, Class<out NativeModule>>> =
        listOf(
            "AppVersion" to AppVersionModule::class.java,
            "BackgroundLocation" to BackgroundLocationModule::class.java,
            "CompassModule" to CompassModule::class.java,
            "CustomAdhan" to CustomAdhanModule::class.java,
            "DisplayCutout" to DisplayCutoutModule::class.java,
            "FullScreenAlarm" to FullScreenAlarmModule::class.java,
            "GarminWatch" to GarminWatchModule::class.java,
            "MihrabClipboard" to MihrabClipboardModule::class.java,
            "MihrabFoldPosture" to FoldPostureModule::class.java,
            "MihrabLaunchSnapshot" to LaunchSnapshotModule::class.java,
            "MihrabLiveActivity" to MihrabLiveActivityModule::class.java,
            "MihrabPdf" to MihrabPdfModule::class.java,
            "MihrabRotationCover" to RotationCoverModule::class.java,
            "MihrabSecureStore" to SecureStoreModule::class.java,
            "MihrabVolumeKeys" to VolumeKeysModule::class.java,
            "MushafFont" to MushafFontModule::class.java,
            "PrayerBuildInfo" to PrayerBuildInfoModule::class.java,
            "PrayerSilence" to PrayerSilenceModule::class.java,
            "PrayerWidget" to PrayerWidgetModule::class.java,
            "ScanQr" to ScanQrModule::class.java,
            "SecureRandom" to SecureRandomModule::class.java,
            "SyncFolder" to SyncFolderModule::class.java,
            "SystemClock" to SystemClockModule::class.java,
            "SystemTheme" to SystemThemeModule::class.java,
            "WordPlayer" to WordPlayerModule::class.java,
        )
  }
}
