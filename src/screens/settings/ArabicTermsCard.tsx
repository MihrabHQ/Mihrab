/**
 * Settings → Appearance: which Arabic names are shown in Arabic while the
 * app itself stays in another language (`i18n/arabicTerms.ts`).
 *
 * For someone who reads Arabic and keeps an English (or Swedish, or
 * Turkish) interface. Each kind of name is its own switch, because the
 * answer differs by reader: one wants الظهر on the day's rows and still
 * "Sahih al-Bukhari" in a list, another the reverse. Not drawn in
 * Arabic, where there is nothing to choose.
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings } from '../../context/PrayerSettingsContext';
import { ARABIC_TERM_GROUPS, coerceArabicTerms, type ArabicTermGroup } from '../../i18n/arabicTerms';
import { SettingsGroup, SettingsToggleRow } from './SettingsGroup';

function ArabicTermsCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useAppearanceSettings();
  if (settings.language === 'ar') return null;
  const chosen = coerceArabicTerms(settings.arabicTerms);
  const toggle = (group: ArabicTermGroup, on: boolean) =>
    updateSettings({ arabicTerms: ARABIC_TERM_GROUPS.filter(g => (g === group ? on : chosen.includes(g))) });
  return (
    <SettingsGroup title={t('settings.arabicTerms.title')} footer={t('settings.arabicTerms.help')}>
      {ARABIC_TERM_GROUPS.map(group => (
        <SettingsToggleRow
          key={group}
          title={t(`settings.arabicTerms.${group}`)}
          help={t(`settings.arabicTerms.${group}Help`)}
          value={chosen.includes(group)}
          onValueChange={on => toggle(group, on)}
          testID={`settings-arabic-terms-${group}`}
        />
      ))}
    </SettingsGroup>
  );
}

export const ArabicTermsCard = memo(ArabicTermsCardImpl);
