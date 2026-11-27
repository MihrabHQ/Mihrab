// hover-ok: settings-row pressables — pressed feedback is the right affordance.
/**
 * Whose colour the widgets' card is — every Android widget follows it.
 *
 * "App" is the card as it always was: the app's own colouring — its Sky
 * theme's hour, its tinted surfaces, else the neutral dark. Someone who
 * likes the app under Sky but wants the home screen to hold still had no
 * way to say so. Dark, Light and a colour of one's own are a card that
 * stays whatever the app looks like (PrayerWidgetProvider
 * `PREFS_WIDGET_BG_MODE`). The strength below still applies to all four,
 * and the widgets' text stays readable on whichever is chosen
 * (PrayerWidgetDisplay `legibleOnSky`).
 *
 * The widget's own settings screen (touch and hold → Settings) has the
 * same choice; one made there arrives here (syncWidgetUiHints).
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../../components/ui';
import { useAppearanceSettings, useWidgetSettings } from '../../context/PrayerSettingsContext';
import { widgetPatchForAccent } from '../../settings/widgetAccent';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { WidgetBackgroundMode } from '../../settings/types';
import { tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { SettingsBlock } from './SettingsGroup';
import { normaliseHex } from './WidgetTextColor';

function WidgetBackgroundImpl() {
  const { t } = useTranslation();
  const { slice: settings, update } = useWidgetSettings();
  const { slice: appearance } = useAppearanceSettings();
  const { palette } = useAppPalette();
  const mode = settings.androidWidgetBackgroundMode;
  const stored = settings.androidWidgetBackgroundCustomHex.toUpperCase();
  const [draft, setDraft] = useState(stored);
  const draftHex = normaliseHex(draft);

  // A colour changed from the widget's own screen arrives here too.
  useEffect(() => {
    setDraft(d => (normaliseHex(d) === stored ? d : stored));
  }, [stored]);

  return (
    <SettingsBlock>
      <Text style={[styles.label, { color: palette.muted }]}>
        {t('settings.widgetBackgroundColor', 'Background color')}
      </Text>
      <SegmentedControl<WidgetBackgroundMode>
        accessibilityLabel={t('settings.widgetBackgroundColor', 'Background color')}
        testID="widget-background-mode"
        segments={[
          { key: 'app', label: t('settings.widgetBackground_app', 'App') },
          { key: 'dark', label: t('settings.widgetText_dark', 'Dark') },
          { key: 'light', label: t('settings.widgetText_light', 'Light') },
          // "#", as the colour swatches write a colour of one's own.
          { key: 'custom', label: '#', accessibilityLabel: t('settings.widgetTextCustom', 'Custom color') },
        ]}
        value={mode}
        onChange={next =>
          update({
            androidWidgetBackgroundMode: next,
            // Back to the app's card is back to the app's highlight: with a
            // background of their own the widgets had one of their own
            // (WidgetCard), and "App" is the app's colours whole.
            ...(next === 'app' && !appearance.useSystemDynamicTheme
              ? widgetPatchForAccent(appearance.appAccentId, appearance.appAccentCustomHex)
              : {}),
          })
        }
      />
      {mode === 'custom' ? (
        <View style={styles.customRow}>
          <TextInput
            value={draft}
            onChangeText={text => {
              setDraft(text);
              const hex = normaliseHex(text);
              if (hex) update({ androidWidgetBackgroundCustomHex: hex });
            }}
            placeholder="#RRGGBB"
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            accessibilityLabel={t('settings.widgetTextCustom', 'Custom color')}
            testID="widget-background-hex"
            style={[
              styles.hexInput,
              tabularNumeralStyle,
              { color: palette.text, borderColor: draft && !draftHex ? palette.danger : palette.border },
            ]}
          />
          <Text style={[styles.help, { color: draft && !draftHex ? palette.danger : palette.muted }]}>
            {draft && !draftHex
              ? t('settings.widgetTextHexInvalid', 'Six hex digits, like #FFD27F')
              : t('settings.widgetTextHexHelp', 'Any color, as #RRGGBB')}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.help, { color: palette.muted }]}>
        {t(
          'settings.widgetBackgroundHelp',
          'App follows the app’s colors: its Sky theme and its tinted surfaces. Dark, Light or a color of your own stays the same whatever the app looks like.',
        )}
      </Text>
    </SettingsBlock>
  );
}

export const WidgetBackground = memo(WidgetBackgroundImpl);

const styles = StyleSheet.create({
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.xs },
  customRow: { marginTop: SPACING.md },
  hexInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPE.body.fontSize,
  },
  help: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.sm },
});
