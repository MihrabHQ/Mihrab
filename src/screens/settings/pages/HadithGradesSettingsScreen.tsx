/**
 * Settings → Hadith → What the grades mean.
 *
 * A reader meets "Authentic", "Hasan", "graded sahih by al-Albani" and a
 * line saying al-Bukhari's hadith "are not graded one by one here", and
 * nothing in the app said what any of it means or why some hadith of a
 * book are not in it. This is the short answer, on one page: what a grade
 * is and whose it is, sahih, hasan, the two Sahihs, and what is left out.
 *
 * It says what `docs/hadith-policy.md` says and no more — the app grades
 * nothing itself, and a hadith left out is not called weak — and ends on
 * the rule itself for whoever wants all of it. The definitions are the
 * ones the science of hadith gives; they are not a verdict on any hadith.
 * `__tests__/hadithGradesGuide.test.ts` holds the page to the policy.
 *
 * Reached from Settings → Hadith, and from the foot of every hadith.
 */
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text } from 'react-native';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { SPACING } from '../../../theme/tokens';
import { TYPE } from '../../../theme/typography';
import { SettingsBlock, SettingsGroup, SettingsLinkRow } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';
import { HADITH_POLICY_URL } from './AttributionsSettingsScreen';

/** The page's sections, in order: a title's key and its paragraph's. */
export const GRADE_SECTIONS = [
  ['sahihTitle', 'sahih'],
  ['hasanTitle', 'hasan'],
  ['sahihaynTitle', 'sahihayn'],
  ['leftOutTitle', 'leftOut'],
] as const;

export function HadithGradesSettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const paragraph = (key: string) => (
    <SettingsBlock>
      <Text style={[styles.body, { color: palette.text }]}>{t(`hadith.grades.${key}`)}</Text>
    </SettingsBlock>
  );

  return (
    <SettingsPage>
      <SettingsGroup>{paragraph('intro')}</SettingsGroup>
      {GRADE_SECTIONS.map(([title, body]) => (
        <SettingsGroup key={title} title={t(`hadith.grades.${title}`)}>
          {paragraph(body)}
        </SettingsGroup>
      ))}
      <SettingsGroup>
        <SettingsLinkRow
          title={t('hadith.grades.fullRule')}
          value={t('hadith.grades.fullRuleSub')}
          onPress={() => void Linking.openURL(HADITH_POLICY_URL).catch(() => undefined)}
          testID="settings-hadith-grades-rule"
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight, paddingVertical: SPACING.xs },
});
