/**
 * Settings → About → Help Mihrab.
 *
 * The ways a reader who likes the app can pass it on, in one place:
 *
 *   1. A rating, where this build came from — the App Store's review page,
 *      the Play listing, or GitHub for the builds no store rates
 *      (`rateApp`). The row says which, so nobody taps "rate" and lands
 *      somewhere they did not expect.
 *   2. Telling people: the system share sheet with a line and the
 *      website, which is where every way of installing it is listed —
 *      not one store's link, which half the people it reaches cannot use.
 *   3. The month's prayer-time sheet, to send or to print and hand out.
 *      It is the one thing the app makes that is useful to someone who
 *      does not have the app, and it carries the site's address, so it
 *      travels as an introduction too. The row opens the month screen on
 *      the sheet, with the month switcher and the export beside it.
 *
 * "Rate Mihrab" used to be the first row of About. It moved here with the
 * other two rather than staying as a duplicate.
 */
import { Share, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../../hooks/useAppPalette';
import type { RootStackParamList } from '../../../navigation/types';
import { rateApp, ratingDestination } from '../../../polish/rateApp';
import { MIHRAB_WEBSITE } from '../../../config/links';
import { SettingsBlock, SettingsGroup, SettingsLinkRow } from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';
import { SPACING } from '../../../theme/tokens';
import { TYPE } from '../../../theme/typography';

export function HelpMihrabSettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const destination = ratingDestination();
  const rateTitle =
    destination === 'appStore'
      ? t('helpMihrab.rateAppStore', 'Rate it on the App Store')
      : destination === 'play'
        ? t('helpMihrab.ratePlay', 'Rate it on Google Play')
        : t('helpMihrab.rateGithub', 'Star it on GitHub');
  const rateHelp =
    destination === 'github'
      ? t(
          'helpMihrab.rateGithubHelp',
          'Where you got Mihrab there are no ratings; a star on GitHub is the closest thing.',
        )
      : t(
          'helpMihrab.rateStoreHelp',
          'A rating and a few words help people find it when they search the store.',
        );

  const tellPeople = () => {
    const message = t('helpMihrab.shareMessage', {
      url: MIHRAB_WEBSITE,
      defaultValue: 'I use Mihrab for prayer times and the Quran. Have a look: {{url}}',
    });
    // `message` alone: on iOS a separate `url` is sent as a second item
    // and some apps then post the link twice.
    void Share.share({ message }).catch(() => undefined);
  };

  return (
    <SettingsPage>
      <SettingsGroup>
        <SettingsBlock>
          <Text style={[styles.intro, { color: palette.text }]}>
            {t(
              'helpMihrab.intro',
              'Mihrab grows by word of mouth. If it has been useful to you, here are three ways to pass it on.',
            )}
          </Text>
        </SettingsBlock>
      </SettingsGroup>

      <SettingsGroup title={t('settings.rateApp', 'Rate Mihrab')}>
        <SettingsLinkRow
          testID="help-mihrab-rate"
          title={rateTitle}
          help={rateHelp}
          onPress={() => {
            void rateApp();
          }}
          accessory={
            <Text style={[styles.star, { color: palette.accent }]}>★</Text>
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t('helpMihrab.tellTitle', 'Tell family and friends')}>
        <SettingsLinkRow
          testID="help-mihrab-tell"
          title={t('helpMihrab.tellRow', 'Send them Mihrab')}
          help={t(
            'helpMihrab.tellRowHelp',
            "A link to Mihrab's website, which has every way to download it, sent through any app you choose.",
          )}
          onPress={tellPeople}
        />
      </SettingsGroup>

      <SettingsGroup title={t('helpMihrab.monthTitle', 'Share the prayer times')}>
        <SettingsLinkRow
          testID="help-mihrab-month"
          title={t('helpMihrab.monthRow', "This month's timetable")}
          help={t(
            'helpMihrab.monthRowHelp',
            "This month's prayer times where you are, on one page to send or print.",
          )}
          onPress={() => navigation.navigate('MonthTimes', { share: true })}
        />
      </SettingsGroup>
      {/* Its own paragraph, not the group's `footer`: a footer past 140
          characters is clamped to two lines behind a ⓘ, and the part about
          printing copies to hand out is the point of this section, not a
          detail to open. */}
      <Text style={[styles.after, { color: palette.muted }]}>
        {t(
          'helpMihrab.monthFooter',
          "Send it to the people you love, or print copies to hand out at your mosque, to family and to neighbours. Every sheet carries Mihrab's address, so whoever it reaches can find the app.",
        )}
      </Text>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: TYPE.callout.fontSize, lineHeight: 22 },
  star: { fontSize: TYPE.title3.fontSize },
  // Sits where a group footer would: tucked under the card above it.
  // The group's own footer style, pulled up past the group's bottom gap.
  after: {
    fontSize: TYPE.label.fontSize,
    lineHeight: 17,
    marginTop: SPACING.sm - SPACING.xl,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.xs,
  },
});
