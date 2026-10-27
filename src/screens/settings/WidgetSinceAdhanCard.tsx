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
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../../components/ui';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { WIDGET_SINCE_ADHAN_CHOICES } from '../../settings/types';
import { SettingsBlock, SettingsGroup } from './SettingsGroup';

type Choice = `${(typeof WIDGET_SINCE_ADHAN_CHOICES)[number]}`;

function WidgetSinceAdhanCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update } = useWidgetSettings();
  const title = t('settings.widgetSinceAdhanTitle', 'Time since the adhan');
  return (
    <SettingsGroup
      title={title}
      footer={t(
        'settings.widgetSinceAdhanHelp',
        'For this long after each prayer comes in, the prayer times widgets show how long ago it was, then go back to counting down to the next prayer. If the next prayer is close, the countdown comes back sooner.',
      )}>
      <SettingsBlock>
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
      </SettingsBlock>
    </SettingsGroup>
  );
}

export const WidgetSinceAdhanCard = memo(WidgetSinceAdhanCardImpl);
