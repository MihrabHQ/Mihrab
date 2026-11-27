// hover-ok: settings-row pressables — pressed feedback is the right affordance.
/**
 * The widgets' text colour — a display option EVERY widget follows.
 *
 * It lives on Settings → Widgets in the "All widgets" card, and on the
 * settings screen of every widget (touch and hold → Settings). The
 * prayer-times widget's own options (city, countdown, table, time size) are
 * in PrayerWidgetCard.
 *
 * AUTOMATIC, OR ONE COLOUR OF YOUR OWN. This was six swatches — Light,
 * White, Cream, Gold, Sky, Dark — from when every card was dark and the
 * text was the one thing to choose. A card can be light now (the widgets'
 * background; the app's Sky page by day), and the widget does not leave a
 * text on a card it cannot be read on: five of the six were replaced there
 * without a word, and the sixth existed only for a see-through card on a
 * pale wallpaper. So the choice is the one that does something: Automatic —
 * light on a dark card, dark on a light one — or a colour of the reader's
 * own, used wherever it can be read (cardfit/CardInk.kt).
 *
 * Automatic is stored as the light text every card had
 * (`WIDGET_TEXT_AUTO`), so nothing stored needs changing: whoever never
 * touched the setting is on Automatic, and a swatch someone picked is now
 * their own colour.
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '../../components/ui';
import { useWidgetSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { DEFAULT_SETTINGS } from '../../settings/types';
import { SettingsBlock } from './SettingsGroup';
import { tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * Automatic, as it is stored: the widgets' light text
 * (PrayerWidgetConfigureActivity.AUTO_TEXT, PrayerWidgetDisplay.DEFAULT_TEXT).
 */
export const WIDGET_TEXT_AUTO = DEFAULT_SETTINGS.androidWidgetTextColor.toUpperCase();

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
  const isAuto = current === WIDGET_TEXT_AUTO;
  const [customOpen, setCustomOpen] = useState(!isAuto);
  const [draft, setDraft] = useState(isAuto ? '' : current);
  const draftHex = normaliseHex(draft);

  // A colour changed from the widget's own screen arrives here too.
  useEffect(() => {
    if (!isAuto) {
      setCustomOpen(true);
      setDraft(d => (normaliseHex(d) === current ? d : current));
    }
  }, [current, isAuto]);

  return (
    <SettingsBlock>
      <Text style={[styles.label, { color: palette.muted }]}>
        {t('settings.widgetTextColor', 'Text color')}
      </Text>
      <SegmentedControl<'auto' | 'custom'>
        accessibilityLabel={t('settings.widgetTextColor', 'Text color')}
        testID="widget-text-mode"
        segments={[
          { key: 'auto', label: t('settings.widgetTextAuto', 'Automatic') },
          // "#", as the background writes a colour of one's own.
          { key: 'custom', label: '#', accessibilityLabel: t('settings.widgetTextCustom', 'Custom color') },
        ]}
        value={customOpen ? 'custom' : 'auto'}
        onChange={next => {
          if (next === 'auto') {
            setCustomOpen(false);
            update({ androidWidgetTextColor: WIDGET_TEXT_AUTO });
          } else {
            // Automatic stays in force until the field holds a colour.
            setCustomOpen(true);
            if (draftHex) update({ androidWidgetTextColor: draftHex });
          }
        }}
      />

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
            testID="widget-text-hex"
            style={[
              styles.hexInput,
              tabularNumeralStyle,
              {
                color: palette.text,
                borderColor: draft && !draftHex ? palette.danger : palette.border,
              },
            ]}
          />
          {draft && !draftHex ? (
            <Text style={[styles.help, { color: palette.danger }]}>
              {t('settings.widgetTextHexInvalid', 'Six hex digits, like #FFD27F')}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text style={[styles.help, { color: palette.muted }]}>
        {t(
          'settings.widgetTextAutoHelp',
          'Automatic is light on a dark card and dark on a light one. # is a color of your own, used where it can be read.',
        )}
      </Text>
    </SettingsBlock>
  );
}

export const WidgetTextColor = memo(WidgetTextColorImpl);

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
