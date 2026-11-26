// hover-ok: rows of a settings card — the pressed opacity is the
// affordance, as on every other row of these pages.
/**
 * Settings → Hadith.
 *
 * Hadith had a tab and no row in Settings: the one thing a reader sets
 * about it — where they are starting from — could only be changed from
 * the top of the tab's Learn page, and its downloads were found by
 * knowing they were under Downloads (Pixel 10 Pro, 2026-11-26). Both are
 * here. The level is the same record the tab writes
 * (`hadithRecord.setLevel`), so a change in either place is a change in
 * both; the packs are still kept and removed in Downloads, and this page
 * says how much they take and opens it.
 *
 * The size of the text is not here: it is the reader's own − A +, and
 * one size for the Qur'an's reading text and the hadith's
 * (`useReadingText`).
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { LEVELS, type Level } from '../../../hadith/catalog';
import { hadithBytes } from '../../../hadith/HadithDownloadsSection';
import { setLevel } from '../../../hadith/hadithRecord';
import { updateHadithRecord, useHadithRecord } from '../../../hadith/hadithStore';
import { usePackStatuses } from '../../../hadith/packs';
import { levelOf } from '../../../hadith/progress';
import type { RootStackParamList } from '../../../navigation/types';
import { formatBytes } from '../../../quran/downloadsUi';
import { SPACING } from '../../../theme/tokens';
import { TYPE } from '../../../theme/typography';
import { SettingsGroup, SettingsLinkRow } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';

export function HadithSettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const rec = useHadithRecord();
  const level = levelOf(rec);
  // Not asked yet: the level shown is only the one suggested, and no row is ticked.
  const answered = rec.level != null;
  const bytes = hadithBytes(usePackStatuses());

  const pick = (lv: Level) => void updateHadithRecord(r => setLevel(r, lv, Date.now()));

  return (
    <SettingsPage>
      <SettingsGroup title={t('hadith.levelPrompt')} footer={t('hadith.levelNote')}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('hadith.levelPrompt')}>
          {LEVELS.map((lv, i) => {
            const chosen = answered && lv === level;
            return (
              <Pressable
                key={lv}
                accessibilityRole="radio"
                accessibilityLabel={t(`hadith.level.${lv}`)}
                accessibilityState={{ selected: chosen, checked: chosen }}
                onPress={() => pick(lv)}
                testID={`settings-hadith-level-${lv}`}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border ?? palette.muted },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.title, { color: chosen ? palette.accentSolid : palette.text }]}>
                  {t(`hadith.level.${lv}`)}
                </Text>
                {chosen ? <Text style={[styles.tick, { color: palette.accentSolid }]}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsLinkRow
          title={t('settings.sectionDownloads')}
          value={bytes > 0 ? formatBytes(bytes) : t('hadith.settingsNoDownloads')}
          onPress={() => navigation.navigate('SettingsDownloads')}
          testID="settings-hadith-downloads"
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  title: { flex: 1, fontSize: TYPE.body.fontSize, fontWeight: '400' },
  tick: { fontSize: TYPE.body.fontSize, fontWeight: '500' },
  pressed: { opacity: 0.6 },
});
