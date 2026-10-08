// hover-ok: settings-row pressables — pressed feedback is the right affordance.
/**
 * Settings → Appearance → Prayer times widget (Android).
 *
 * The options that ONLY the prayer-times widgets read — Next prayer and
 * Prayer times, in every size (PrayerGlanceWidget): the text colour, which
 * parts are shown, and the size of the times. They sit apart from the
 * general Widgets card (background, highlight), which every widget follows,
 * and say so at the top, because a text colour that changed one widget and
 * not the Tasbih card beside it would otherwise read as a bug.
 *
 * The same options are on the widget's own settings screen (touch and hold
 * the widget → Settings); `syncWidgetUiHints` reads those back.
 */
import { memo, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  WIDGET_TIME_SCALE_MAX,
  WIDGET_TIME_SCALE_MIN,
  WIDGET_TIME_SCALE_STEP,
} from '../../settings/types';
import { SettingsBlock, SettingsGroup, SettingsToggleRow } from './SettingsGroup';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
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

function PrayerWidgetCardImpl() {
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

  if (Platform.OS !== 'android') return null;

  const scale = settings.androidWidgetTimeScale;

  return (
    <SettingsGroup
      title={t('settings.prayerWidgetTitle', 'Prayer times widget')}
      footer={t(
        'settings.prayerWidgetFooter',
        'The same options are on the widget itself: touch and hold it, then Settings.',
      )}>
      <View
        style={[styles.banner, { backgroundColor: palette.accentBg }]}
        accessibilityRole="text">
        <Text style={[styles.bannerText, { color: palette.accent }]}>
          {t(
            'settings.prayerWidgetOnly',
            'Only for the prayer times widgets (Next prayer and Prayer times). Other widgets are not affected.',
          )}
        </Text>
      </View>

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

      <SettingsToggleRow
        title={t('settings.widgetShowLocation', 'Show the city')}
        value={settings.androidWidgetShowLocation}
        onValueChange={v => update({ androidWidgetShowLocation: v })}
      />
      <SettingsToggleRow
        title={t('settings.widgetShowCountdown', 'Show the countdown')}
        value={settings.androidWidgetShowCountdown}
        onValueChange={v => update({ androidWidgetShowCountdown: v })}
      />
      <SettingsToggleRow
        title={t('settings.widgetShowTable', 'Show the day’s times')}
        help={t('settings.widgetShowTableHelp', 'Off: the widget shows only the next prayer.')}
        value={settings.androidWidgetShowTable}
        onValueChange={v => update({ androidWidgetShowTable: v })}
      />

      <SettingsBlock>
        <Text style={[styles.label, { color: palette.muted }]}>
          {t('settings.widgetTimeSize', 'Prayer time size')}
        </Text>
        <View style={styles.stepRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetTimeSizeSmaller', 'Smaller')}
            disabled={scale <= WIDGET_TIME_SCALE_MIN}
            onPress={() =>
              update({ androidWidgetTimeScale: Math.max(WIDGET_TIME_SCALE_MIN, scale - WIDGET_TIME_SCALE_STEP) })
            }
            style={[styles.stepBtn, { borderColor: palette.border, opacity: scale <= WIDGET_TIME_SCALE_MIN ? 0.4 : 1 }]}>
            <Text style={[styles.stepGlyph, { color: palette.text }]}>−</Text>
          </Pressable>
          <Text
            style={[styles.stepValue, tabularNumeralStyle, { color: palette.text }]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {scale}%
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.widgetTimeSizeLarger', 'Larger')}
            disabled={scale >= WIDGET_TIME_SCALE_MAX}
            onPress={() =>
              update({ androidWidgetTimeScale: Math.min(WIDGET_TIME_SCALE_MAX, scale + WIDGET_TIME_SCALE_STEP) })
            }
            style={[styles.stepBtn, { borderColor: palette.border, opacity: scale >= WIDGET_TIME_SCALE_MAX ? 0.4 : 1 }]}>
            <Text style={[styles.stepGlyph, { color: palette.text }]}>+</Text>
          </Pressable>
        </View>
        <Text style={[styles.help, { color: palette.muted }]}>
          {t('settings.widgetTimeSizeHelp', 'Larger sizes are used where the widget has room for them.')}
        </Text>
      </SettingsBlock>
    </SettingsGroup>
  );
}

export const PrayerWidgetCard = memo(PrayerWidgetCardImpl);

const styles = StyleSheet.create({
  banner: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    margin: SPACING.md,
  },
  bannerText: { fontSize: TYPE.footnote.fontSize, fontWeight: '600', lineHeight: 18 },
  label: { fontSize: TYPE.footnote.fontSize, marginBottom: SPACING.xs },
  help: { fontSize: TYPE.footnote.fontSize, lineHeight: 18, marginTop: SPACING.md },
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
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
    marginTop: SPACING.sm,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: TYPE.title2.fontSize },
  stepValue: { fontSize: TYPE.title3.fontSize, fontWeight: '600', minWidth: 52, textAlign: 'center' },
});
