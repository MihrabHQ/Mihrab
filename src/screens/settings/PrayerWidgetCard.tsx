// hover-ok: settings-row pressables — pressed feedback is the right affordance.
/**
 * Settings → Widgets → Prayer times widget (Android).
 *
 * The options that ONLY the prayer-times widgets read — Next prayer and
 * Prayer times, in every size (PrayerGlanceWidget): which parts are shown
 * the size of the times, and what they count after a prayer comes in
 * (#111). They sit apart from the "All widgets" card (background,
 * highlight, text colour), which every widget follows, and the group's
 * footer says so, because a switch that changed one widget and not the
 * Tasbih card beside it would otherwise read as a bug. It was a coloured
 * notice above the first switch once: the loudest thing on the page, for
 * a sentence that is a footnote.
 *
 * "Time since the adhan" was a third card of its own under this one. It is
 * a prayer-times-widget option like the rest, so on Android it is the last
 * row here; iOS, which has none of the others, keeps it as its own card
 * (WidgetSinceAdhanCard).
 *
 * The same options are on the prayer-times widget's own settings screen
 * (touch and hold the widget → Settings); `syncWidgetUiHints` reads those
 * back.
 */
import { memo } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stepper } from '../../components/ui';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  WIDGET_TIME_SCALE_MAX,
  WIDGET_TIME_SCALE_MIN,
  WIDGET_TIME_SCALE_STEP,
} from '../../settings/types';
import { SettingsBlock, SettingsGroup, SettingsToggleRow } from './SettingsGroup';
import { WidgetSinceAdhanBlock } from './WidgetSinceAdhanCard';
import { SPACING } from '../../theme/tokens';
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
        'settings.prayerWidgetOnly',
        'Only for the prayer times widgets (Next prayer and Prayer times). Other widgets are not affected.',
      )}>
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
        <Stepper
          title={`${scale}%`}
          prevLabel={t('settings.widgetTimeSizeSmaller', 'Smaller')}
          nextLabel={t('settings.widgetTimeSizeLarger', 'Larger')}
          onPrev={
            scale <= WIDGET_TIME_SCALE_MIN
              ? undefined
              : () => update({ androidWidgetTimeScale: Math.max(WIDGET_TIME_SCALE_MIN, scale - WIDGET_TIME_SCALE_STEP) })
          }
          onNext={
            scale >= WIDGET_TIME_SCALE_MAX
              ? undefined
              : () => update({ androidWidgetTimeScale: Math.min(WIDGET_TIME_SCALE_MAX, scale + WIDGET_TIME_SCALE_STEP) })
          }
        />
        <Text style={[styles.help, { color: palette.muted }]}>
          {t('settings.widgetTimeSizeHelp', 'Larger sizes are used where the widget has room for them.')}
        </Text>
      </SettingsBlock>

      <WidgetSinceAdhanBlock labelled />
    </SettingsGroup>
  );
}

export { WIDGET_TEXT_SWATCHES, normaliseHex } from './WidgetTextColor';
export const PrayerWidgetCard = memo(PrayerWidgetCardImpl);

const styles = StyleSheet.create({
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.xs },
  help: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.md },
});
