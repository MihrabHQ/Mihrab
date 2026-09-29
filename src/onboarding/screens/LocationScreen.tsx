/**
 * Screen 2 — where you are.
 *
 * Substance unchanged from the old step: the whole `LocationSetup` widget
 * embedded, GPS or city search or manual coordinates, and **no skip
 * control**. App Store guideline 5.1.1(iv) requires a location
 * pre-permission screen to lead to the prompt with no exit or delay
 * affordance; the manual city path is the escape hatch and it is INSIDE
 * the widget, not beside it. A test pins the absence of that control,
 * because a redesign is exactly how it would be lost.
 *
 * ── ONCE IT IS ANSWERED, THE NEXT QUESTION ────────────────────────────
 *
 * The moment a location lands the flow moves straight on to the school.
 * It used to show the city and today's five times for 1.4 seconds first,
 * as proof the app works — and then pull them away before anyone could
 * read them, which looked like a stutter rather than a result. The proof
 * is not lost: the school screen shows the user's own ʿaṣr for the place
 * just set, and the last screen their real Today card.
 *
 * The times are still shown to someone who steps BACK to this screen to
 * check what they entered, with Continue to go on.
 */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { LocationSetup } from '../../components/LocationSetup';
import { SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { tabularNumeralStyle } from '../../theme/textScale';
import { previewCoords, previewDay, PREVIEW_ROWS } from '../previewTimes';
import {
  OnboardingFrame,
  OnboardingHeading,
  PrimaryAction,
} from '../OnboardingChrome';

export function LocationScreen({
  progress,
  onAdvance,
}: {
  progress: { now: number; total: number } | null;
  onAdvance: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings } = usePrayerSettings();
  const clock = useClockFormatter();
  const done = settings.locationOnboardingComplete;

  const coords = useMemo(() => previewCoords(settings), [settings]);
  const times = useMemo(
    () =>
      coords
        ? previewDay(coords, {
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          })
        : null,
    [coords, settings.calculationMethod, settings.school],
  );

  /**
   * Advance the moment the location lands HERE — never rendering the
   * times in between, not even for a frame.
   *
   * Only when it lands here: hardware back steps within the flow, so
   * somebody can come back to this screen to check what they entered. A
   * location that was already set when the screen mounted shows the times
   * and waits for Continue, rather than bouncing them forward off a screen
   * they came back to look at.
   */
  const wasDoneOnMount = useRef(done);
  const armed = done && wasDoneOnMount.current;
  useEffect(() => {
    if (done && !wasDoneOnMount.current) onAdvance();
  }, [done, onAdvance]);

  const city =
    settings.manualLocationLabel ?? settings.autoLocationLabel ?? undefined;

  return (
    <OnboardingFrame
      progress={progress}
      footer={
        // NO skip control on this screen, ever. The only button is the one
        // that moves forward once an answer exists.
        armed ? (
          <PrimaryAction
            testID="onboarding-location-continue"
            label={t('common.continue', 'Continue')}
            onPress={onAdvance}
          />
        ) : undefined
      }>
      <OnboardingHeading
        title={t('onboarding.location.title', 'Where are you?')}
        body={t(
          'onboarding.location.body',
          'Prayer times depend on where you stand. Your coordinates are encrypted on this device and never leave it.',
        )}
      />

      {armed && times ? (
        <View style={styles.proof}>
          {city ? (
            <Text
              style={[typeStyle('headline'), styles.city, { color: palette.text }]}>
              {t('onboarding.location.ready', { city, defaultValue: 'Today in {{city}}' })}
            </Text>
          ) : null}
          {PREVIEW_ROWS.map(row => (
            <View key={row} style={styles.row}>
              <Text style={[typeStyle('body'), { color: palette.muted }]}>
                {t(`prayer.${row}`, row)}
              </Text>
              <Text
                style={[
                  typeStyle('body'),
                  tabularNumeralStyle,
                  { color: palette.text },
                ]}>
                {clock(times[row])}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.embed}>
          <LocationSetup
            // This screen asks the question in its own type, in the same
            // voice as the five around it; the widget's own headline and
            // subtitle would ask it a second time, in different words,
            // four lines lower.
            hideIntro
            palette={{
              bg: palette.bg,
              text: palette.text,
              muted: palette.muted,
              border: palette.border,
              accent: palette.accent,
              accentBg: palette.accentBg,
              accentSolid: palette.accentSolid,
              onAccent: palette.onAccent,
              card: palette.card,
              danger: palette.danger,
              flatChrome: palette.flatChrome,
            }}
          />
        </View>
      )}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  embed: { minHeight: 320, marginTop: SPACING.sm },
  proof: { gap: SPACING.sm, marginTop: SPACING.lg },
  city: { textAlign: 'center', marginBottom: SPACING.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
});
