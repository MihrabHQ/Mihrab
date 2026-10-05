/**
 * Settings → Notifications → Prayer sounds.
 *
 * The same per-prayer choice the home screen's bell/mosque button cycles
 * — adhan, default notification, or silent — laid out for all five at
 * once, for the person who wants Fajr quiet and Maghrib loud and would
 * rather set it in one sitting than tap five rows.
 *
 * It is NOT a second copy of the state. It reads and writes
 * `prayerAlertModes` through the same helpers the home row uses
 * (`shownAlertMode` / `alertModeFor`, `PrayerAlertMode`), so the two can
 * never disagree: changing one changes the other.
 *
 * There is no volume here, and that is deliberate. Android fixes a
 * notification's sound and volume when its channel is created and gives
 * an app no per-notification volume, so a loudness setting per prayer is
 * not something it can honestly offer. iOS is the same: a notification
 * plays at the phone's volume, and only critical alerts carry their own,
 * which needs an entitlement Apple does not give prayer apps. What a
 * prayer can reliably be is the adhan, the ordinary alert, or nothing.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import {
  modesFor,
  SALAH_KEYS,
  shownAlertMode,
  type PrayerAlertMode,
} from '../../../settings/alertModes';
import { SPACING } from '../../../theme/tokens';
import { TYPE } from '../../../theme/typography';
import { SettingsGroup } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';

/** Sunrise and the night marks, shown only while they are switched on —
 *  the same rule the home screen uses for which rows exist. */
const EXTRA_ROWS = [
  ['Sunrise', 'sunriseEnabled'],
  ['Midnight', 'islamicMidnightEnabled'],
  ['Firstthird', 'firstThirdEnabled'],
  ['Lastthird', 'lastThirdEnabled'],
] as const;

const MODE_LABEL: Record<PrayerAlertMode, string> = {
  adhan: 'settings.alertModeAdhan',
  notification: 'settings.alertModeNotification',
  silent: 'settings.alertModeSilent',
};

export function PrayerSoundsSettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const adhanChosen = settings.notificationSound !== 'default';

  const choose = (key: string, mode: PrayerAlertMode) => {
    updateSettings({
      prayerAlertModes: { ...settings.prayerAlertModes, [key]: mode },
      // Picking a sound for a prayer while the master switch is off turns
      // it back on, exactly as the home row does; picking silent does not
      // switch off the other four.
      ...(!settings.notificationsEnabled && mode !== 'silent'
        ? { notificationsEnabled: true }
        : {}),
    });
  };

  const extraKeys = EXTRA_ROWS.filter(([, flag]) => settings[flag]).map(
    ([key]) => key,
  );

  const renderRow = (key: string) => {
    const shown = shownAlertMode(
      key,
      settings.prayerAlertModes,
      adhanChosen,
      settings.notificationsEnabled,
    );
    return (
      <View key={key} style={styles.row}>
        <Text style={[styles.name, { color: palette.text }]}>
          {t(`prayer.${key}`)}
        </Text>
        <View
          style={[styles.segments, { backgroundColor: palette.bg }]}
          accessibilityRole="radiogroup"
        >
          {modesFor(key).map(mode => {
            const on = mode === shown;
            return (
              <Pressable
                key={mode}
                onPress={() => choose(key, mode)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t(`prayer.${key}`)}: ${t(
                  MODE_LABEL[mode],
                )}`}
                style={[
                  styles.segment,
                  on && { backgroundColor: palette.accent },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.segmentText,
                    { color: on ? palette.onAccent : palette.muted },
                  ]}
                >
                  {t(MODE_LABEL[mode])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SettingsPage>
      <SettingsGroup footer={t('settings.prayerSoundsFooter')}>
        {SALAH_KEYS.map(renderRow)}
      </SettingsGroup>
      {extraKeys.length > 0 && (
        <SettingsGroup footer={t('settings.prayerSoundsExtrasFooter')}>
          {extraKeys.map(renderRow)}
        </SettingsGroup>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  name: { fontSize: TYPE.body.fontSize, fontWeight: '500' },
  segments: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentText: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
});
