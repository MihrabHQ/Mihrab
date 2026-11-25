/* eslint-disable */
// WIP ONLY — not to land. Calls a harmless method of every typed module at
// launch and logs what came back, so a build can be read from the log.
import { Platform } from 'react-native';

type Probe = [string, () => unknown];

export function runTurboCheck(): void {
  const specs: Record<string, any> = {
    SecureRandom: require('./specs/NativeSecureRandom').default,
    MihrabClipboard: require('./specs/NativeMihrabClipboard').default,
    AppVersion: require('./specs/NativeAppVersion').default,
    PrayerBuildInfo: require('./specs/NativePrayerBuildInfo').default,
    SystemClock: require('./specs/NativeSystemClock').default,
    MushafFont: require('./specs/NativeMushafFont').default,
    ScanQr: require('./specs/NativeScanQr').default,
    MihrabSecureStore: require('./specs/NativeMihrabSecureStore').default,
    SyncFolder: require('./specs/NativeSyncFolder').default,
    WordPlayer: require('./specs/NativeWordPlayer').default,
    MihrabLaunchSnapshot: require('./specs/NativeMihrabLaunchSnapshot').default,
    MihrabRotationCover: require('./specs/NativeMihrabRotationCover').default,
    CustomAdhan: require('./specs/NativeCustomAdhan').default,
    CompassModule: require('./specs/NativeCompassModule').default,
    BackgroundLocation: require('./specs/NativeBackgroundLocation').default,
    PrayerWidget: require('./specs/NativePrayerWidget').default,
    DisplayCutout: require('./specs/NativeDisplayCutout').default,
    MihrabFoldPosture: require('./specs/NativeMihrabFoldPosture').default,
    FullScreenAlarm: require('./specs/NativeFullScreenAlarm').default,
    GarminWatch: require('./specs/NativeGarminWatch').default,
    MihrabLiveActivity: require('./specs/NativeMihrabLiveActivity').default,
    PrayerSilence: require('./specs/NativePrayerSilence').default,
    SystemTheme: require('./specs/NativeSystemTheme').default,
    MihrabVolumeKeys: require('./specs/NativeMihrabVolumeKeys').default,
    AdhanPlayer: require('./specs/NativeAdhanPlayer').default,
    AudioRouteWatcher: require('./specs/NativeAudioRouteWatcher').default,
    Haptics: require('./specs/NativeHaptics').default,
    MihrabKeyCommands: require('./specs/NativeMihrabKeyCommands').default,
    MihrabKeepAwake: require('./specs/NativeMihrabKeepAwake').default,
    NowPlayingState: require('./specs/NativeNowPlayingState').default,
    PrayerAlarms: require('./specs/NativePrayerAlarms').default,
    PrayerLiveActivity: require('./specs/NativePrayerLiveActivity').default,
    RateApp: require('./specs/NativeRateApp').default,
    MihrabVerticalBar: require('./specs/NativeMihrabVerticalBar').default,
    WidgetQueueWatcher: require('./specs/NativeWidgetQueueWatcher').default,
  };
  const present = Object.keys(specs).filter(k => specs[k] != null);
  const absent = Object.keys(specs).filter(k => specs[k] == null);
  console.log(`[turbo] ${Platform.OS} present=${present.length} ${present.join(',')}`);
  console.log(`[turbo] ${Platform.OS} absent=${absent.length} ${absent.join(',')}`);
  const m = specs;
  const probes: Probe[] = [
    ['SecureRandom.bytes', () => m.SecureRandom?.bytes(4)],
    ['AppVersion.getConstants', () => m.AppVersion?.getConstants()],
    ['PrayerBuildInfo.getConstants', () => m.PrayerBuildInfo?.getConstants()],
    ['SystemClock.getConstants', () => m.SystemClock?.getConstants()],
    ['SystemClock.readIs24Hour', () => m.SystemClock?.readIs24Hour()],
    ['SystemClock.readTimeZone', () => (Platform.OS === 'android' ? m.SystemClock?.readTimeZone() : 'n/a')],
    ['SystemClock.readNetworkCountryIso', () => (Platform.OS === 'android' ? m.SystemClock?.readNetworkCountryIso() : 'n/a')],
    ['MushafFont.isValidFont', () => m.MushafFont?.isValidFont('/nonexistent.ttf')],
    ['ScanQr.isAvailable', () => m.ScanQr?.isAvailable()],
    ['MihrabSecureStore.getItem', () => m.MihrabSecureStore?.getItem('__turbo_check__')],
    ['SyncFolder.defaultFolder', () => m.SyncFolder?.defaultFolder()],
    ['SyncFolder.hasAccess', () => m.SyncFolder?.hasAccess('nope')],
    ['WordPlayer.stop', () => m.WordPlayer?.stop()],
    ['MihrabLaunchSnapshot.getShownState', () => m.MihrabLaunchSnapshot?.getShownState()],
    ['MihrabRotationCover.getConstants', () => m.MihrabRotationCover?.getConstants()],
    ['CustomAdhan.current', () => m.CustomAdhan?.current()],
    ['CompassModule.sensorsAccess', () => (Platform.OS === 'android' ? m.CompassModule?.sensorsAccess() : 'n/a')],
    ['CompassModule.hasSystemCompass', () => (Platform.OS === 'android' ? m.CompassModule?.hasSystemCompass() : 'n/a')],
    ['CompassModule.stopUpdates', () => m.CompassModule?.stopUpdates()],
    ['BackgroundLocation.status', () => m.BackgroundLocation?.status()],
    ['PrayerWidget.getAndroidWidgetAppearance', () => (Platform.OS === 'android' ? m.PrayerWidget?.getAndroidWidgetAppearance() : 'n/a')],
    ['PrayerWidget.getAndroidPrayerWidgetDisplay', () => (Platform.OS === 'android' ? m.PrayerWidget?.getAndroidPrayerWidgetDisplay() : 'n/a')],
    ['DisplayCutout.getCutout', () => m.DisplayCutout?.getCutout()],
    ['DisplayCutout.getRoundedCorners', () => m.DisplayCutout?.getRoundedCorners()],
    ['MihrabFoldPosture.read', () => m.MihrabFoldPosture?.read()],
    ['FullScreenAlarm.canUse', () => m.FullScreenAlarm?.canUse()],
    ['GarminWatch.status', () => m.GarminWatch?.status()],
    ['MihrabLiveActivity.promotionStatus', () => m.MihrabLiveActivity?.promotionStatus()],
    ['PrayerSilence.hasAccess', () => m.PrayerSilence?.hasAccess()],
    ['PrayerSilence.isActive', () => m.PrayerSilence?.isActive()],
    ['SystemTheme.resolveAccentHex', () => m.SystemTheme?.resolveAccentHex()],
    ['SystemTheme.getColorScheme', () => m.SystemTheme?.getColorScheme()],
    ['SystemTheme.isButtonNavigation', () => m.SystemTheme?.isButtonNavigation()],
    ['SystemTheme.buttonNavigationHeight', () => m.SystemTheme?.buttonNavigationHeight()],
    ['MihrabVolumeKeys.setCaptured', () => m.MihrabVolumeKeys?.setCaptured(false)],
    ['AdhanPlayer.isPlaying', () => m.AdhanPlayer?.isPlaying()],
    ['Haptics.prepare', () => m.Haptics?.prepare()],
    ['MihrabKeyCommands.setArrowPriority', () => m.MihrabKeyCommands?.setArrowPriority(false)],
    ['MihrabKeepAwake.deactivate', () => m.MihrabKeepAwake?.deactivate()],
    ['PrayerAlarms.isAvailable', () => m.PrayerAlarms?.isAvailable()],
    ['PrayerAlarms.authorizationState', () => m.PrayerAlarms?.authorizationState()],
    ['PrayerLiveActivity.isAvailable', () => m.PrayerLiveActivity?.isAvailable()],
    ['MihrabVerticalBar.read', () => m.MihrabVerticalBar?.read()],
  ];
  const show = (v: unknown) => {
    try {
      return JSON.stringify(v)?.slice(0, 140);
    } catch {
      return String(v);
    }
  };
  for (const [name, fn] of probes) {
    try {
      const out = fn();
      if (out && typeof (out as Promise<unknown>).then === 'function') {
        (out as Promise<unknown>).then(
          v => console.log(`[turbo] ok ${name} -> ${show(v)}`),
          e => console.log(`[turbo] REJECT ${name} -> ${String(e?.message ?? e)}`),
        );
      } else {
        console.log(`[turbo] ok ${name} = ${show(out)}`);
      }
    } catch (e) {
      console.log(`[turbo] THROW ${name} -> ${String((e as Error)?.message ?? e)}`);
    }
  }
}
