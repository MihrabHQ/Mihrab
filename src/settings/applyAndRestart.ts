/**
 * A change of settings that needs a fresh start to take: system colours
 * (PlatformColor refs resolve once), and on Android the layout — the two
 * layouts are two navigators over the same pages, and Fabric does not
 * survive trading one for the other in a running app.
 *
 * Saved to disk DIRECTLY and awaited before the restart, not through
 * `updateSettings`' own save: the process's exit can kill a write in
 * flight, and the next launch then reads the old value (#114).
 *
 * One function for every place that asks — Settings → Appearance, and
 * the layout shortcut on Today.
 */
import { Alert, BackHandler, NativeModules, Platform } from 'react-native';
import type { TFunction } from 'i18next';
import { restartApp as nativeRestartApp } from '../native/SystemTheme';
import { enteringMinimal, minimalLook } from './minimalLook';
import { saveSettings } from './storage';
import type { PrayerAppSettings } from './types';

export function applySettingsAndRestart(
  full: PrayerAppSettings,
  patch: Partial<PrayerAppSettings>,
  updateSettings: (patch: Partial<PrayerAppSettings>) => void,
  t: TFunction,
): void {
  void (async () => {
    const next = minimalLook(enteringMinimal(full, { ...full, ...patch }));
    try {
      await saveSettings(next);
    } catch (e) {
      console.warn('Failed to persist toggle before restart:', e);
    }
    updateSettings(patch);
    const tryReload = () => {
      try {
        const dev = (NativeModules as { DevSettings?: { reload?: () => void } })
          .DevSettings;
        if (dev?.reload) {
          dev.reload();
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };
    if (Platform.OS === 'android') {
      if (nativeRestartApp()) return;
      if (!tryReload()) BackHandler.exitApp();
    } else if (!tryReload()) {
      Alert.alert(
        t('settings.themeRestartManualTitle', 'Reopen the app'),
        t(
          'settings.themeRestartManualBody',
          'iOS does not allow apps to restart themselves. Please force-quit Prayer Times and reopen it for the new theme to take effect.',
        ),
        [{ text: t('common.ok', 'OK'), style: 'default' }],
      );
    }
  })();
}
