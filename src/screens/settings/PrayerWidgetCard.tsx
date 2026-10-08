// hover-ok: settings-row pressables — pressed feedback is the right affordance.
/**
 * Settings → Widgets → Prayer times widget (Android).
 *
 * The options that ONLY the prayer-times widgets read — Next prayer and
 * Prayer times, in every size (PrayerGlanceWidget): which parts are shown
 * and the size of the times. They sit apart from the "All widgets" card
 * (background, highlight, text colour), which every widget follows, and
 * say so at the top, because a switch that changed one widget and not the
 * Tasbih card beside it would otherwise read as a bug.
 *
 * The same options are on the prayer-times widget's own settings screen
 * (touch and hold the widget → Settings); `syncWidgetUiHints` reads those
 * back.
 */
import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  WIDGET_TIME_SCALE_MAX,
  WIDGET_TIME_SCALE_MIN,
  WIDGET_TIME_SCALE_STEP,
} from '../../settings/types';
import { SettingsBlock, SettingsGroup, SettingsToggleRow } from './SettingsGroup';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

function PrayerWidgetCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update } = useWidgetSettings();
  const { palette } = useAppPalette();
  if (Platform.OS !== 'android') return null;

  const scale = settings.androidWidgetTimeScale;

  return (
    <SettingsGroup
      title={t('settings.prayerWidgetTitle', 'Prayer times widget')}
      footer={t(
        'settings.prayerWidgetFooter',
        'The same options are on the widget itself: touch and hold it, then Settings.',
      )}>
      <View
        style={[styles.banner, { backgroundColor: palette.accentBg }]}
        accessibilityRole="text">
        <Text style={[styles.bannerText, { color: palette.accent }]}>
          {t(
            'settings.prayerWidgetOnly',
            'Only for the prayer times widgets (Next prayer and Prayer times). Other widgets are not affected.',
          )}
        </Text>
      </View>

      <SettingsToggleRow
        title={t('settings.widgetShowLocation', 'Show the city')}
        value={settings.androidWidgetShowLocation}
        onValueChange={v => update({ androidWidgetShowLocation: v })}
      />
      <SettingsToggleRow
        title={t('settings.widgetShowCountdown', 'Show the countdown')}
        value={settings.androidWidgetShowCountdown}
        onValueChange={v => update({ androidWidgetShowCountdown: v })}
      />
      <SettingsToggleRow
        title={t('settings.widgetShowTable', 'Show the day’s times')}
        help={t('settings.widgetShowTableHelp', 'Off: the widget shows only the next prayer.')}
        value={settings.androidWidgetShowTable}
        onValueChange={v => update({ androidWidgetShowTable: v })}
      />

      <SettingsBlock>
        <Text style={[styles.label, { color: palette.muted }]}>
          {t('settings.widgetTimeSize', 'Prayer time size')}
        </Text>
        <View style={styles.stepRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetTimeSizeSmaller', 'Smaller')}
            disabled={scale <= WIDGET_TIME_SCALE_MIN}
            onPress={() =>
              update({ androidWidgetTimeScale: Math.max(WIDGET_TIME_SCALE_MIN, scale - WIDGET_TIME_SCALE_STEP) })
            }
            style={[styles.stepBtn, { borderColor: palette.border, opacity: scale <= WIDGET_TIME_SCALE_MIN ? 0.4 : 1 }]}>
            <Text style={[styles.stepGlyph, { color: palette.text }]}>−</Text>
          </Pressable>
          <Text
            style={[styles.stepValue, tabularNumeralStyle, { color: palette.text }]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {scale}%
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetTimeSizeLarger', 'Larger')}
            disabled={scale >= WIDGET_TIME_SCALE_MAX}
            onPress={() =>
              update({ androidWidgetTimeScale: Math.min(WIDGET_TIME_SCALE_MAX, scale + WIDGET_TIME_SCALE_STEP) })
            }
            style={[styles.stepBtn, { borderColor: palette.border, opacity: scale >= WIDGET_TIME_SCALE_MAX ? 0.4 : 1 }]}>
            <Text style={[styles.stepGlyph, { color: palette.text }]}>+</Text>
          </Pressable>
        </View>
        <Text style={[styles.help, { color: palette.muted }]}>
          {t('settings.widgetTimeSizeHelp', 'Larger sizes are used where the widget has room for them.')}
        </Text>
      </SettingsBlock>
    </SettingsGroup>
  );
}

export { WIDGET_TEXT_SWATCHES, normaliseHex } from './WidgetTextColor';
export const PrayerWidgetCard = memo(PrayerWidgetCardImpl);

const styles = StyleSheet.create({
  banner: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    margin: SPACING.md,
  },
  bannerText: { fontSize: TYPE.footnote.fontSize, fontWeight: '600', lineHeight: 18 },
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.xs },
  help: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.md },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.md },
  swatch: { width: 40, height: 40, borderRadius: RADIUS.xl },
  customSwatch: { alignItems: 'center', justifyContent: 'center' },
  customGlyph: { fontSize: TYPE.body.fontSize, fontWeight: '700' },
  customRow: { marginTop: SPACING.md },
  hexInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPE.body.fontSize,
  },
  hexHelp: { fontSize: TYPE.footnote.fontSize, marginTop: SPACING.xs },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
    marginTop: SPACING.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: TYPE.title2.fontSize },
  stepValue: { fontSize: TYPE.title3.fontSize, fontWeight: '600', minWidth: 52, textAlign: 'center' },
});
