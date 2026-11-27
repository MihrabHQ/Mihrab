/**
 * Settings → Notifications: the end-of-day log prompt, and how a log made
 * from a notification is timed.
 *
 * Both sat on the Additional times page. That page went to Prayer times,
 * where it belongs; these two are about notifications and stayed. The
 * end-of-day switch also lives on the Log screen, beside what it affects.
 */
import { useTranslation } from 'react-i18next';
import { useNotificationsSettings } from '../../context/PrayerSettingsContext';
import { ensureNotifPermission } from '../../notifications/ensureNotifPermission';
import { SettingsGroup, SettingsToggleRow } from './SettingsGroup';

export function LogRemindersGroup() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useNotificationsSettings();

  const onToggleEndOfDayLog = async (value: boolean) => {
    if (!value) {
      updateSettings({ endOfDayLogReminderEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ endOfDayLogReminderEnabled: true });
  };

  return (
    <SettingsGroup title={t('settings.logSection', 'Log')}>
      <SettingsToggleRow
        title={t('settings.endOfDayLog')}
        help={t('settings.endOfDayLogHelp')}
        value={settings.endOfDayLogReminderEnabled}
        onValueChange={onToggleEndOfDayLog}
      />
      {/* Issue #74, off by default: a log made from outside the app
          takes the clock's answer — see journal/logTiming. */}
      <SettingsToggleRow
        title={t('settings.logLateByClock')}
        help={t('settings.logLateByClockHelp')}
        value={settings.logLateByClock}
        onValueChange={v => updateSettings({ logLateByClock: v })}
      />
    </SettingsGroup>
  );
}
