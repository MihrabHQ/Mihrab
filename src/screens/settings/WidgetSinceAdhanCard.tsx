/**
 * Settings → Widgets → Time since the adhan (issue #111). Both platforms.
 *
 * For a while after each of the five prayers comes in, the prayer-times
 * widgets count UP from it — "12:34 since Dhuhr" — and then go back to
 * counting down to what is next. So a glance answers "how long ago was the
 * adhan?" without working it out from the clock. Off by default: a widget
 * that suddenly counted the other way would read as broken to everyone who
 * did not ask for it.
 *
 * The window ends early, halfway to the next time on the card, so the
 * countdown to a prayer that is close is never hidden; Sunrise and the
 * night marks never start one. The rule is `sinceAdhanEnd`
 * (src/widget/widgetPayloadV2.ts), mirrored natively.
 *
 * ONE CONTROL, TWO PLACES. On Android it is the last row of the "Prayer
 * times widget" card (`WidgetSinceAdhanBlock`, with its name and its help
 * inside the row), beside the other options only those widgets read, and
 * the card here draws nothing. On iOS, which has none of those, it is the
 * card: the name is the group's title and the help its footer.
 */
import { memo } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../../components/ui';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { WIDGET_SINCE_ADHAN_CHOICES } from '../../settings/types';
import { SettingsBlock, SettingsGroup } from './SettingsGroup';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

type Choice = `${(typeof WIDGET_SINCE_ADHAN_CHOICES)[number]}`;

const HELP_DEFAULT =
  'For this long after each prayer comes in, the prayer times widgets show how long ago it was, then go back to counting down to the next prayer. If the next prayer is close, the countdown comes back sooner.';

/** The choice itself. `labelled`: with its name above and its help below, for a row inside another card. */
function WidgetSinceAdhanBlockImpl({ labelled }: { labelled?: boolean }) {
  const { t } = useTranslation();
  const { slice: settings, update } = useWidgetSettings();
  const { palette } = useAppPalette();
  const title = t('settings.widgetSinceAdhanTitle', 'Time since the adhan');
  return (
    <SettingsBlock>
      {labelled ? <Text style={[styles.label, { color: palette.muted }]}>{title}</Text> : null}
      <SegmentedControl<Choice>
        accessibilityLabel={title}
        testID="settings-widget-since-adhan"
        segments={WIDGET_SINCE_ADHAN_CHOICES.map(n => ({
          key: `${n}` as Choice,
          label:
            n === 0
              ? t('settings.widgetSinceAdhanOff', 'Off')
              : t('settings.widgetSinceAdhanMinutes', { minutes: n, defaultValue: '{{minutes}} min' }),
        }))}
        value={`${settings.widgetSinceAdhanMinutes}` as Choice}
        onChange={key => update({ widgetSinceAdhanMinutes: Number(key) })}
      />
      {labelled ? (
        <Text style={[styles.help, { color: palette.muted }]}>
          {t('settings.widgetSinceAdhanHelp', HELP_DEFAULT)}
        </Text>
      ) : null}
    </SettingsBlock>
  );
}

export const WidgetSinceAdhanBlock = memo(WidgetSinceAdhanBlockImpl);

function WidgetSinceAdhanCardImpl() {
  const { t } = useTranslation();
  // Android has it in the prayer-times widget's card (PrayerWidgetCard).
  if (Platform.OS === 'android') return null;
  return (
    <SettingsGroup
      title={t('settings.widgetSinceAdhanTitle', 'Time since the adhan')}
      footer={t('settings.widgetSinceAdhanHelp', HELP_DEFAULT)}>
      <WidgetSinceAdhanBlock />
    </SettingsGroup>
  );
}

export const WidgetSinceAdhanCard = memo(WidgetSinceAdhanCardImpl);

const styles = StyleSheet.create({
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.sm },
  help: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.md },
});
