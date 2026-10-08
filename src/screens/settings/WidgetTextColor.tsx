// hover-ok: settings-row pressables — pressed feedback is the right affordance.
/**
 * The widgets' text colour — the one display option EVERY widget follows.
 *
 * It lives on Settings → Widgets in the "All widgets" card, and on the
 * settings screen of every widget (touch and hold → Settings). The
 * prayer-times widget's own options (city, countdown, table, time size) are
 * in PrayerWidgetCard.
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SettingsBlock } from './SettingsGroup';
import { tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * The preset text colours — Light is the card as it always was; Dark is for
 * a see-through card on a light wallpaper. The widget's own settings screen
 * (PrayerWidgetConfigureActivity.TEXT_PRESETS) lists the same ones.
 */
export const WIDGET_TEXT_SWATCHES = [
  { id: 'light', hex: '#E8EAED' },
  { id: 'white', hex: '#FFFFFF' },
  { id: 'cream', hex: '#F3E9D2' },
  { id: 'gold', hex: '#E5C07B' },
  { id: 'sky', hex: '#A8C7FA' },
  { id: 'dark', hex: '#1C1C1E' },
] as const;

const NAME_DEFAULTS: Record<string, string> = {
  light: 'Light',
  white: 'White',
  cream: 'Cream',
  gold: 'Gold',
  sky: 'Sky',
  dark: 'Dark',
};

/** "#abc123", "abc123", " #ABC123 " → "#ABC123"; anything else → null. */
export function normaliseHex(input: string): string | null {
  const t = input.trim().toUpperCase().replace(/^#/, '');
  return /^[0-9A-F]{6}$/.test(t) ? `#${t}` : null;
}

function WidgetTextColorImpl() {
  const { t } = useTranslation();
  const { slice: settings, update } = useWidgetSettings();
  const { palette } = useAppPalette();
  const current = settings.androidWidgetTextColor.toUpperCase();
  const isPreset = WIDGET_TEXT_SWATCHES.some(sw => sw.hex === current);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [draft, setDraft] = useState(isPreset ? '' : current);
  const draftHex = normaliseHex(draft);

  // A colour changed from the widget's own screen arrives here too.
  useEffect(() => {
    if (!isPreset) {
      setCustomOpen(true);
      setDraft(current);
    }
  }, [current, isPreset]);

  return (
    <SettingsBlock>
        <Text style={[styles.label, { color: palette.muted }]}>
          {t('settings.widgetTextColor', 'Text color')}
        </Text>
        <View style={styles.swatchRow}>
          {WIDGET_TEXT_SWATCHES.map(sw => {
            const selected = !customOpen && current === sw.hex;
            return (
              <Pressable
                key={sw.id}
                accessibilityRole="radio"
                accessibilityLabel={t(`settings.widgetText_${sw.id}`, NAME_DEFAULTS[sw.id])}
                accessibilityState={{ selected }}
                onPress={() => {
                  setCustomOpen(false);
                  update({ androidWidgetTextColor: sw.hex });
                }}
                style={[
                  styles.swatch,
                  {
                    backgroundColor: sw.hex, // tokens-ok-line: the swatch IS the colour it picks
                    borderColor: selected ? palette.accent : palette.border,
                    borderWidth: selected ? 3 : 2,
                  },
                ]}
              />
            );
          })}
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={t('settings.widgetTextCustom', 'Custom color')}
            accessibilityState={{ selected: customOpen }}
            onPress={() => {
              setCustomOpen(true);
              if (!draft) setDraft(current);
            }}
            style={[
              styles.swatch,
              styles.customSwatch,
              {
                backgroundColor: customOpen ? current : palette.card, // tokens-ok-line: shows the custom colour itself
                borderColor: customOpen ? palette.accent : palette.border,
                borderWidth: customOpen ? 3 : 2,
              },
            ]}>
            {customOpen ? null : <Text style={[styles.customGlyph, { color: palette.text }]}>#</Text>}
          </Pressable>
        </View>

        {customOpen ? (
          <View style={styles.customRow}>
            <TextInput
              value={draft}
              onChangeText={text => {
                setDraft(text);
                const hex = normaliseHex(text);
                if (hex) update({ androidWidgetTextColor: hex });
              }}
              placeholder="#RRGGBB"
              placeholderTextColor={palette.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              accessibilityLabel={t('settings.widgetTextCustom', 'Custom color')}
              style={[
                styles.hexInput,
                tabularNumeralStyle,
                {
                  color: palette.text,
                  borderColor: draft && !draftHex ? palette.danger : palette.border,
                },
              ]}
            />
            <Text style={[styles.hexHelp, { color: draft && !draftHex ? palette.danger : palette.muted }]}>
              {draft && !draftHex
                ? t('settings.widgetTextHexInvalid', 'Six hex digits, like #FFD27F')
                : t('settings.widgetTextHexHelp', 'Any color, as #RRGGBB')}
            </Text>
          </View>
        ) : null}
      </SettingsBlock>

  );
}

export const WidgetTextColor = memo(WidgetTextColorImpl);

const styles = StyleSheet.create({
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.xs },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.md },
  swatch: { width: 40, height: 40, borderRadius: RADIUS.xl },
  customSwatch: { alignItems: 'center', justifyContent: 'center' },
  customGlyph: { fontSize: TYPE.body.fontSize, fontWeight: '700' },
  customRow: { marginTop: SPACING.md },
  hexInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPE.body.fontSize,
  },
  hexHelp: { fontSize: TYPE.footnote.fontSize, marginTop: SPACING.xs },
});
