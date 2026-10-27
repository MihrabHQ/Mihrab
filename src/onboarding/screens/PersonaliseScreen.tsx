/**
 * Screen 5 — make it yours.  ·  NEW
 *
 * The shelf. Not a question, and the design has to say so without a
 * sentence: questions are one per screen with the question as the
 * headline; preferences are rows in a list. A user who has answered four
 * things and is then handed a list understands, without being told, that
 * the important part is over.
 *
 * ── WHY THESE ROWS AND NOT SEVENTY ────────────────────────────────────
 *
 * A preference earns a row only if all three hold (remake §2): it is off
 * or neutral by default so skipping costs nothing, it is discoverable
 * nowhere obvious, and it can be decided in one glance. `firstThirdEnabled`
 * fails the third — it is the subtlest of the night marks and needs the
 * explanation Settings gives it. `clockFormat` fails the first two: 'auto'
 * follows the phone and is right.
 *
 * `quranVerseByVerseEnabled` was added against the same test and passes:
 * off by default, buried in Settings → Quran where nobody trips over it,
 * and a switch. The third clause is the close call — somebody who has
 * never opened a surah does not yet know what either reader looks like —
 * which is why that row carries a help line describing the thing rather
 * than naming it. Argued in writing at remake §2, as §14 requires.
 *
 * ── BUILT FROM THE REAL SETTINGS COMPONENTS ───────────────────────────
 *
 * `SettingsGroup` and `SettingsToggleRow`, not a lookalike, so this IS
 * the Settings idiom rather than resembling it — the visual rhyme is the
 * teaching: this is where these things live. It also means the shelf
 * inherits their accessibility and RTL behaviour rather than
 * re-implementing it.
 *
 * ── SKIP WRITES NOTHING ───────────────────────────────────────────────
 *
 * One tap, top-trailing, no confirmation. A shelf that asks "are you sure
 * you want to skip?" is a question.
 */
import { minimalOn } from '../../settings/minimalLook';
import { useMinimalOffered } from '../../settings/useMinimalOffered';
import { PALETTE_STEPS, skyMoodFor } from '../../theme/skyMoods';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  usePrayerSettings,
} from '../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from '../../screens/settings/SettingsGroup';
import { sharedSettingsStyles as s } from '../../screens/settings/sharedStyles';
import { SegmentedControl } from '../../components/ui';
import { AccentShelf } from '../../components/AccentShelf';
import { SkyVariantPicker } from '../../components/SkyVariantPicker';
import { LayoutPicker } from '../../components/LayoutPicker';
import { useSkyTheme } from '../../theme/skyTheme';
import type { AppearancePreference } from '../../settings/types';
import { SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { previewCoords, previewNightMarks } from '../previewTimes';
import {
  OnboardingFrame,
  OnboardingHeading,
  PrimaryAction,
  QuietAction,
} from '../OnboardingChrome';

export function PersonaliseScreen({
  progress,
  onAdvance,
}: {
  progress: { now: number; total: number } | null;
  onAdvance: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  // Minimal is offered on the phone and the iPad, not on the Mac nor
  // beside an iPhone's vertical bar (useMinimalOffered) — and not while
  // the system's colours are on: Minimal takes them off, which Settings
  // only does with a restart (#110), and the walkthrough has none to
  // offer. Where it is not offered, a `minimalUi` carried over reads as
  // off, for the colour theme's shelf as for the layout.
  const minimalOffered = useMinimalOffered();
  const minimalActive = minimalOffered && minimalOn(settings);
  const clock = useClockFormatter();

  const coords = useMemo(() => previewCoords(settings), [settings]);
  const night = useMemo(
    () =>
      coords
        ? previewNightMarks(coords, {
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          })
        : null,
    [coords, settings.calculationMethod, settings.school],
  );

  // A switch labelled with a concept is worth less than one labelled with
  // a time. No coordinates means a dash, never a zero and never (0,0).
  const mark = (value: string | undefined) => (value ? clock(value) : '—');

  /**
   * Dynamic colours drive both the app and the widget from the OS, so
   * the accent row is not shown at all in that mode — the same rule
   * Settings follows, and the reason the shelf itself never has to ask.
   */
  const dynamicColours =
    settings.appearance === 'system' &&
    settings.useSystemDynamicTheme &&
    (Platform.OS === 'android' || Platform.OS === 'ios');

  const alertsOn = settings.notificationsEnabled;

  // The Sky theme paints the whole palette from the hour's sky, so the
  // colour theme has nothing left to choose — the same rule Settings
  // follows. It is offered here as a picture of its six moods, with a
  // line of what it does; the picture is the control.
  const skyActive = settings.appearance === 'sky';
  // The hour's sky as Today paints it (the mood's stops), for the layout
  // pictures — see the same note in AppearanceCard.
  const sky = useSkyTheme(skyActive);
  const previewSky = skyActive ? skyMoodFor(sky.passage, sky.t, PALETTE_STEPS, undefined, sky.light) : null;
  return (
    <OnboardingFrame
      progress={progress}
      topRow={
        <QuietAction
          testID="onboarding-personalise-skip"
          align="end"
          label={t('onboarding.skip', 'Skip')}
          onPress={onAdvance}
        />
      }
      footer={
        <PrimaryAction
          testID="onboarding-personalise-done"
          label={t('common.done', 'Done')}
          onPress={onAdvance}
        />
      }>
      <OnboardingHeading
        title={t('onboarding.personalise.title', 'Make it yours')}
        body={t('onboarding.personalise.body', 'None of this is required.')}
      />

      {/* No "Remind me before" here. It is a preference by the shelf's own
          test and the spec lists it among the seven — but it lives on the
          alerts screen, one tap back, beside the permission it depends on.
          Offering it on two consecutive screens is the redundancy the
          shelf exists to avoid. */}

      <SettingsGroup title={t('onboarding.personalise.groupTimes', 'Times')}>
        <SettingsToggleRow
          testID="personalise-sunrise"
          title={t('settings.sunriseTime', 'Sunrise')}
          value={settings.sunriseEnabled}
          onValueChange={v => updateSettings({ sunriseEnabled: v })}
        />
        <SettingsToggleRow
          testID="personalise-midnight"
          title={t('settings.islamicMidnight', 'Islamic Midnight')}
          help={mark(night?.Midnight)}
          value={settings.islamicMidnightEnabled}
          onValueChange={v => updateSettings({ islamicMidnightEnabled: v })}
        />
        <SettingsToggleRow
          testID="personalise-last-third"
          title={t('settings.lastThird', 'Last Third of the Night')}
          help={mark(night?.Lastthird)}
          value={settings.lastThirdEnabled}
          onValueChange={v => updateSettings({ lastThirdEnabled: v })}
        />
      </SettingsGroup>

      {alertsOn ? (
        <SettingsGroup title={t('onboarding.personalise.groupDaily', 'Daily')}>
          <SettingsToggleRow
            testID="personalise-adhkar"
            title={t('onboarding.personalise.adhkar', 'Morning & evening adhkār')}
            // One habit, one switch, two keys. They are both window-derived
            // — after Fajr before sunrise, after ʿAṣr before sunset — so
            // neither needs a time picker, which is the whole reason this
            // can be a row rather than a page.
            value={
              settings.morningDuaReminderEnabled &&
              settings.eveningDuaReminderEnabled
            }
            onValueChange={v =>
              updateSettings({
                morningDuaReminderEnabled: v,
                eveningDuaReminderEnabled: v,
              })
            }
          />
        </SettingsGroup>
      ) : null}

      {/* Titled with the tab's own name rather than "Reading": the row
          changes what a surah opens as, and the place to change it again
          later is the Qur'an's own settings. The title is the signpost. */}
      <SettingsGroup title={t('nav.quran', 'Quran')}>
        <SettingsToggleRow
          testID="personalise-verse-by-verse"
          title={t('quran.verseByVerse', 'Verse-by-verse view')}
          // The one row on this shelf whose subject the user has not seen
          // yet — they have not opened the reader, so "verse-by-verse"
          // names a thing rather than describing one. The help line does
          // the describing, and says what it is BESIDE so that leaving it
          // off does not read as leaving the translation out entirely.
          help={t('onboarding.personalise.verseByVerseHelp', {
            defaultValue:
              'A second way to read a surah: each verse with its translation under it, beside the mushaf page.',
          })}
          value={settings.quranVerseByVerseEnabled}
          onValueChange={v => updateSettings({ quranVerseByVerseEnabled: v })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('onboarding.personalise.groupLook', 'Look')}>
        <SettingsBlock>
          <Text style={[typeStyle('label'), styles.label, { color: palette.muted }]}>
            {t('onboarding.personalise.theme', 'Theme')}
          </Text>
          <SegmentedControl
            accessibilityLabel={t('onboarding.personalise.theme', 'Theme')}
            segments={
              [
                { key: 'system', label: t('settings.themeSystem') },
                { key: 'light', label: t('settings.themeLight') },
                { key: 'dark', label: t('settings.themeDark') },
                { key: 'sky', label: t('settings.themeSky') },
              ] as ReadonlyArray<{ key: AppearancePreference; label: string }>
            }
            value={settings.appearance}
            onChange={appearance => updateSettings({ appearance })}
          />
          {/* The six moods belong to Sky and show only under it. Shown
              beside System, Light and Dark they read as more choices on
              the same control — six swatches that pick nothing of their
              own — and sat above the colour theme, which they do not
              belong to either. Sky is the default, so a first run sees
              them; switching away takes them with it, and the colour
              theme comes in their place. */}
          {skyActive ? (
            <>
              {/* Sky's two colourings, each by its six skies: Realistic
                  (the default) and Vibrant. */}
              <View style={styles.strip}>
                <SkyVariantPicker
                  testID="personalise-sky-variant"
                  value={settings.skyVariant}
                  onChange={skyVariant => updateSettings({ skyVariant })}
                  accent={String(palette.accent)}
                  text={String(palette.text)}
                  muted={String(palette.muted)}
                />
              </View>
              <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
                {t('settings.themeSkyHelp')}
              </Text>
            </>
          ) : null}
        </SettingsBlock>
        {/* Minimal wears the classic colours (settings/minimalLook.ts). */}
        {dynamicColours || skyActive || minimalActive ? null : (
          <SettingsBlock>
            <Text
              style={[typeStyle('label'), styles.label, { color: palette.muted }]}>
              {t('settings.colourTheme', 'Colour theme')}
            </Text>
            {/* Same colour-theme control as Settings → Appearance: Classic
                (paper and ink) or a preset that themes dark mode. Custom
                hex stays an accent only. Smaller here — one row in a shelf
                of preferences, not a card about this alone. */}
            <AccentShelf
              size={36}
              testIDPrefix="personalise-accent"
              classic={{
                selected: !settings.tintedSurfaces,
                label: t('settings.classicTheme', 'Classic'),
                onPress: () => updateSettings({ tintedSurfaces: false }),
              }}
              onPick={id =>
                updateSettings({ tintedSurfaces: id !== 'custom' })
              }
            />
            <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
              {t(
                'settings.colourThemeHelp',
                'Classic keeps the app’s own paper and ink. Pick a colour to theme dark mode in it — light mode stays classic.',
              )}
            </Text>
          </SettingsBlock>
        )}
        {/* Today's two faces, shown: the full page, chosen until changed,
            and Minimal (Settings → Appearance → Minimal). */}
        {minimalOffered && !settings.useSystemDynamicTheme ? (
          <SettingsBlock>
            <Text style={[typeStyle('label'), styles.label, { color: palette.muted }]}>
              {t('onboarding.personalise.layout', 'Layout')}
            </Text>
            <LayoutPicker
              testID="personalise-layout"
              value={minimalActive ? 'minimal' : 'full'}
              onChange={v => updateSettings({ minimalUi: v === 'minimal' })}
              skyTop={previewSky ? previewSky.heroTop : String(palette.accentBg)}
              skyFoot={previewSky ? previewSky.heroMid : String(palette.bg)}
              page={String(palette.bg)}
              text={String(palette.text)}
              muted={String(palette.muted)}
              accent={String(palette.accent)}
              border={String(palette.border)}
            />
            <Text style={[s.help, { color: palette.muted, marginTop: SPACING.sm }]}>
              {t('settings.minimalUiHelp')}
            </Text>
          </SettingsBlock>
        ) : null}
      </SettingsGroup>

    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: SPACING.sm },
  strip: { marginTop: SPACING.md },
});
