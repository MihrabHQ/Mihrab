/**
 * The Sky theme's two colourings, each shown by its six skies: Realistic
 * (the sky as it looks — the default, so first) and Vibrant (bold,
 * representative colours). A look is chosen by seeing it; the chosen one
 * wears the accent's ring, as a swatch in the accent shelf does. Shared by
 * the walkthrough and Settings → Appearance, so the two cannot drift.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SkyMoodStrip } from './SkyMoodStrip';
import { SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import type { SkyVariant } from '../theme/skyMoods';

type Props = {
  value: SkyVariant;
  onChange: (v: SkyVariant) => void;
  accent: string;
  text: string;
  muted: string;
  testID?: string;
};

export function SkyVariantPicker({ value, onChange, accent, text, muted, testID }: Props) {
  const { t } = useTranslation();
  const options: ReadonlyArray<{ key: SkyVariant; label: string }> = [
    { key: 'realistic', label: t('settings.skyVariantRealistic', 'Realistic') },
    { key: 'vibrant', label: t('settings.skyVariantVibrant', 'Vibrant') },
  ];
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={styles.list}>
      {options.map(o => {
        const selected = value === o.key;
        return (
          <View key={o.key}>
            <Text
              style={[
                typeStyle('footnote'),
                styles.label,
                { color: selected ? text : muted, fontWeight: selected ? '400' : '400' },
              ]}>
              {o.label}
            </Text>
            <SkyMoodStrip
              testID={testID ? `${testID}-${o.key}` : undefined}
              variant={o.key}
              selected={selected}
              accent={accent}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.key)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACING.md },
  label: { marginBottom: SPACING.xs },
});
