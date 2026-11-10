// hover-ok: settings-row pressables — pressed feedback is the right affordance.
import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useAppearanceSettings,
  useWidgetSettings,
} from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  APP_ACCENT_SWATCHES,
  widgetPatchForAccent,
  widgetSwatchSelected,
} from '../../settings/widgetAccent';
import { Stepper } from '../../components/ui';
import { SettingsBlock, SettingsGroup } from './SettingsGroup';
import { WidgetTextColor } from './WidgetTextColor';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * Widget settings card — what EVERY Android widget follows: background
 * strength, text colour, and the widget's own highlight colour in the one
 * case the app accent cannot supply it.
 *
 * It sits on the Appearance page. It had a section of its own until the
 * unification below took its colour picker away and left one slider
 * behind, which is not a destination.
 *
 * The highlight used to live here as a separate swatch picker, but #127
 * unified it with the app accent in AppearanceCard so users pick a colour
 * once and both follow.
 *
 * THAT UNIFICATION HAD ONE ASSUMPTION, AND IT IS NO LONGER TRUE. It held
 * because turning Material You on sent BOTH to the OS palette, which is
 * why AppearanceCard hides its accent picker in that mode — there was
 * nothing left to choose. Since 2026-08-27 the Android widget does not
 * follow Material You at all. The app still may; the widget takes the
 * colour that was chosen for it. So with system colours on there was a
 * widget with a colour, no picker in Appearance, and nothing here either
 * — a setting the user could see the result of and not change.
 *
 * The picker comes back for exactly that case, and only that case: when
 * the unified one is on screen, a second control writing the same setting
 * would be two answers to one question.
 */
const OPACITY_STEP = 4;

function WidgetCardImpl() {
  const { t } = useTranslation();
  // Subscribes only to the widget slice (task #11) — toggling theme or
  // notifications elsewhere will not re-render this card.
  const { slice: settings, update: updateSettings } = useWidgetSettings();
  // …and to appearance, because whether the unified picker is on screen
  // is what decides whether this card needs one.
  const { slice: appearance } = useAppearanceSettings();
  const { palette, isDark } = useAppPalette();

  // No swatch picker on iOS at all — widget always follows app accent
  // via the AppearanceCard picker, and there is no Android-specific
  // opacity control to render.
  if (Platform.OS !== 'android') {
    return null;
  }

  // The same condition AppearanceCard uses to hide its accent picker —
  // no longer tied to the System appearance, since system colours can now
  // be chosen under Light and Dark too.
  const needsOwnPicker = appearance.useSystemDynamicTheme;
  const opacity = settings.androidWidgetBackgroundOpacity;

  return (
    // Titled now. This used to be the whole of a page called Home screen
    // and needed no heading of its own; on Appearance it is the third
    // card down and an untitled group of controls under "Language" reads
    // as more language settings.
    <SettingsGroup
      // On the Widgets page, beside the prayer-times widget's own card:
      // these are the ones EVERY widget follows.
      title={t('settings.widgetsAllTitle', 'All widgets')}
      // The accent the widget follows is picked two cards up, on this
      // same page, so the sentence that used to send people to Appearance
      // would now be sending them here. What is left is the hint that
      // there is a second way in, from the widget itself.
      footer={t('settings.widgetConfigureHint')}>
      <SettingsBlock>
        <Text style={[styles.label, { color: palette.muted }]}>
          {t('settings.widgetBackgroundOpacity')}
        </Text>
        {/* The design system's stepper (components/ui), as Month and the
            Log step: one control for "a value with a before and an after",
            not a pair of boxed − and + drawn for this card alone. */}
        <Stepper
          title={`${opacity}%`}
          prevLabel={`${t('settings.widgetBackgroundOpacity')} −${OPACITY_STEP}%`}
          nextLabel={`${t('settings.widgetBackgroundOpacity')} +${OPACITY_STEP}%`}
          onPrev={
            opacity <= 0
              ? undefined
              : () => updateSettings({ androidWidgetBackgroundOpacity: Math.max(0, opacity - OPACITY_STEP) })
          }
          onNext={
            opacity >= 100
              ? undefined
              : () => updateSettings({ androidWidgetBackgroundOpacity: Math.min(100, opacity + OPACITY_STEP) })
          }
        />
      </SettingsBlock>

      <WidgetTextColor />

      {needsOwnPicker ? (
        <SettingsBlock>
          <Text style={[styles.label, { color: palette.muted }]}>
            {t('settings.widgetHighlight')}
          </Text>
          <View style={styles.swatchRow}>
            {APP_ACCENT_SWATCHES.map(sw => {
              const selected = widgetSwatchSelected(
                sw,
                settings.widgetHighlightId,
                settings.widgetHighlightCustomHex,
              );
              return (
                <Pressable
                  key={sw.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(`settings.accent_${sw.id}`, sw.id)}
                  accessibilityState={{ selected }}
                  onPress={() => updateSettings(widgetPatchForAccent(sw.id))}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: isDark ? sw.dark : sw.light,
                      borderColor: selected ? palette.accent : palette.border,
                      borderWidth: selected ? 3 : 2,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={[styles.help, { color: palette.muted }]}>
            {t(
              'settings.widgetColorOwnHelp',
              'The app is following your system colors, which the widget does not. Pick the widget\u2019s highlight here.',
            )}
          </Text>
        </SettingsBlock>
      ) : null}
    </SettingsGroup>
  );
}

export const WidgetCard = memo(WidgetCardImpl);

const styles = StyleSheet.create({
  // Reads like AppearanceCard's inner labels ("Theme", "Accent color"),
  // not like a second group heading.
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.xs },
  help: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.md },
  // Same geometry as the Appearance card's row, so the two read as one
  // control that moved rather than two different pickers.
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.xl,
  },
});
