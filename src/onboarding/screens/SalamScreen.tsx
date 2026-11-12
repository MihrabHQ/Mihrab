/**
 * Screen 1 — the greeting.
 *
 * Kept almost exactly as it was, because it is the best thing in the old
 * flow and the only part of first launch that sets a tone no other prayer
 * app sets. Three changes (onboarding-remake.md §3.1): the privacy
 * paragraph is one line instead of three clauses saying "no trackers"
 * twice, the step counter is gone, and there is a language chip in the
 * corner.
 *
 * ── WHY THE LANGUAGE CHIP IS HERE AND NOT ON THE SHELF ────────────────
 *
 * The shelf is at the END. Someone whose phone is in English while they
 * read Arabic cannot get there — they cannot read the four screens in
 * between. So the one setting that decides whether the rest of the flow
 * is legible is offered before any of it.
 *
 * Switching is live: `layoutDirectionFor()` derives the direction from
 * the language at `AppNavigationRoot`, so Arabic and Urdu re-lay the flow
 * out in place. No `I18nManager.forceRTL`, no restart. Worth knowing
 * before anyone "fixes" this with a reload.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { APP_LANGUAGES } from '../../i18n/languages';
import { LanguageModal } from '../../screens/settings/LanguageModal';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, typeStyle } from '../../theme/typography';
import type { AppLanguage } from '../../settings/types';
import { MihrabLogoIcon, TranslationIcon } from '../../theme/icons';
import { OnboardingFrame, PrimaryAction } from '../OnboardingChrome';
import { useVerticalBar } from '../../native/VerticalBar';
import Svg, { G, Path } from 'react-native-svg';
import { useWindowSize } from '../../responsive/windowSize';
import { radialGlow } from '../../screens/home/skyPaint';
import { SALAM_ASPECT, SALAM_PATHS, SALAM_TRANSFORM, SALAM_VIEWBOX } from '../salamCalligraphy';

/**
 * The salām — written, not typed.
 *
 * It was a line of Amiri: the greeting set as body text, two lines of it,
 * and the first screen of the app looked like a paragraph. It is now the
 * salām as a calligrapher composes it — a thuluth piece, traced to paths
 * (salamCalligraphy.ts) so it is drawn in the theme's accent at whatever
 * size the screen gives it, with no bitmap — standing in a soft light of
 * the same colour, over a hairline with the app's mark in its middle.
 *
 * Still no entrance (task #89): it does not fade, scale or slide. The
 * flow's own cross-fade brings the screen in.
 *
 * The piece reads "as-salāmu ʿalaykum wa raḥmatu llāhi wa barakātuh";
 * the spoken label (onboarding.salamA11y) says the same.
 */
/** The piece's width: this much of the screen's, and no wider than this (dp). */
export const SALAM_WIDTH_OF_SCREEN = 0.74;
export const SALAM_MAX_WIDTH = 340;
/** On a short screen it gives way: never taller than this much of the screen's height. */
export const SALAM_HEIGHT_OF_SCREEN = 0.3;
/** The light behind it: this much wider than the piece, at this strength. */
const SALAM_GLOW_SCALE = 1.7;
const SALAM_GLOW = 0.16;

function SalamHero({
  accentColor,
  mutedColor,
  lineColor,
}: {
  accentColor: string;
  mutedColor: string;
  lineColor: ColorValue;
}) {
  const { t } = useTranslation();
  const { width: winW, height: winH } = useWindowSize();
  const width = Math.round(
    Math.min(winW * SALAM_WIDTH_OF_SCREEN, SALAM_MAX_WIDTH, winH * SALAM_HEIGHT_OF_SCREEN * SALAM_ASPECT),
  );
  const height = Math.round(width / SALAM_ASPECT);
  const glow = Math.round(width * SALAM_GLOW_SCALE);
  return (
    <View style={salamStyles.wrap}>
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        {/* A square, centred on the piece: the one radial form React Native reads right (skyPaint.ts). */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: glow,
            height: glow,
            backgroundImage: radialGlow(accentColor, SALAM_GLOW),
          }}
        />
        <Svg
          width={width}
          height={height}
          viewBox={SALAM_VIEWBOX}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('onboarding.salamA11y', {
            defaultValue: 'As-salāmu ʿalaykum wa raḥmatu llāhi wa barakātuh',
          })}>
          <G transform={SALAM_TRANSFORM} fill={accentColor}>
            {SALAM_PATHS.map((d, i) => (
              <Path key={i} d={d} />
            ))}
          </G>
        </Svg>
      </View>
      <View style={salamStyles.rule}>
        <View style={[salamStyles.ruleLine, { backgroundColor: lineColor }]} />
        <MihrabLogoIcon size={22} color={accentColor} />
        <View style={[salamStyles.ruleLine, { backgroundColor: lineColor }]} />
      </View>
      <Text style={[salamStyles.translation, { color: mutedColor }]}>
        {t(
          'onboarding.welcome.salam',
          'Peace be upon you, and the mercy of Allah and His blessings.',
        )}
      </Text>
    </View>
  );
}

const salamStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: SPACING.lg,
  },
  // A hairline each side of the mark: the piece's foot, and what parts
  // the greeting from its translation.
  rule: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  ruleLine: { width: 56, height: StyleSheet.hairlineWidth },
  translation: {
    fontSize: TYPE.footnote.fontSize,
    lineHeight: 19,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: SPACING.lg,
  },
});

export function SalamScreen({ onAdvance }: { onAdvance: () => void }) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const vbar = useVerticalBar();
  const { settings, updateSettings } = usePrayerSettings();
  const [picker, setPicker] = useState(false);

  // Named in the language itself, never translated: somebody looking for
  // their own language is looking for the word they would write it with.
  const current =
    APP_LANGUAGES.find(l => l.id === settings.language)?.label ??
    APP_LANGUAGES.find(
      l => l.id === (i18n.language ?? '').slice(0, 2).toLowerCase(),
    )?.label ??
    'English';

  const choose = (lang: AppLanguage) => {
    // `languagePicked` is what stops the app following the phone from
    // here on — the same pair AppearanceSettingsScreen writes.
    updateSettings({ language: lang, languagePicked: true });
    setPicker(false);
  };

  return (
    <OnboardingFrame
      center
      progress={null}
      topRow={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.welcome.language', 'Language')}
          accessibilityHint={current}
          hitSlop={10}
          onPress={() => setPicker(true)}
          style={({ pressed }) => [
            styles.chip,
            vbar && styles.chipRound,
            {
              borderColor: palette.border,
              backgroundColor: palette.card,
              borderRadius: RADIUS.full,
            },
            pressed && { opacity: 0.6 },
          ]}>
          {/* The glyph is what makes the pill read as a control rather
              than as a label that happens to say "English". In the
              vertical bar's column (iPhone Duo) the glyph is the whole
              control: the column is too narrow for the name. */}
          <TranslationIcon size={vbar ? 18 : 14} color={palette.mutedSolid} />
          {vbar ? null : (
            <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
              {current}
            </Text>
          )}
        </Pressable>
      }
      footer={
        <PrimaryAction
          testID="onboarding-salam-continue"
          label={t('common.continue', 'Continue')}
          onPress={onAdvance}
        />
      }>
      {/* THE SALĀM IS THE SCREEN.
       *
       * The greeting, written, is the hero; the mark is the small thing
       * at its foot; and the app's name and what it does come last and
       * quietest — because
       * the salām has already done the welcoming, and a title the same
       * weight as it would be a second greeting arguing with the first.
       * The gap between the tiers is what says so; nothing is boxed or
       * ruled off. */}
      <SalamHero
        accentColor={palette.accentSolid}
        mutedColor={palette.mutedSolid}
        lineColor={palette.border}
      />
      <View style={styles.tail}>
        <Text
          style={[typeStyle('title2'), styles.name, { color: palette.text }]}>
          {t('onboarding.welcome.title', 'Welcome to Mihrab')}
        </Text>
        <Text
          style={[typeStyle('body'), styles.line, { color: palette.muted }]}>
          {t(
            'onboarding.welcome.body',
            'Prayer times and the Qur’an, with nothing watching you.',
          )}
        </Text>
      </View>
      <LanguageModal
        visible={picker}
        current={settings.language}
        palette={palette}
        onSelect={choose}
        onClose={() => setPicker(false)}
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  // In the vertical bar's column: a round button around the glyph.
  chipRound: { width: 40, height: 40, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' },
  // The one big gap on the screen, and the only thing separating the
  // greeting from the introduction.
  tail: { marginTop: SPACING.xxl, gap: SPACING.sm },
  name: { textAlign: 'center' },
  line: { textAlign: 'center' },
});
