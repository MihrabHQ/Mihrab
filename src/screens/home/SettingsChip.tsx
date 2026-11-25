// hover-ok: compact chip inside the hero; the pressed opacity is the
// right affordance here, as on the other home chips.
/**
 * The way into Settings, from Today — since Settings left the tab bar.
 *
 * A cog alone at the trailing end of the hero's top row, after the Qibla
 * chip: the corner where a phone keeps its settings, and a glyph rather
 * than a word because the cog is the one icon every reader already knows.
 * Always there, whatever else the row shows: on the full page beside the
 * location and the Qibla, under Minimal beside the heart and nothing else,
 * in the iPhone Duo's column, and in the dashboard's and the Mac's header.
 *
 * On the sky it takes the sky's ink and no container, like the chips
 * beside it; in the Duo's column it is a chip again, the column's size.
 */
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SettingsGearIcon } from '../../theme/icons';
import { RADIUS, SPACING } from '../../theme/tokens';
import { COLUMN_CHIP_W } from './QiblaChip';
import type { SkyInkColors } from './skyModel';

type Props = {
  onPress: () => void;
  ink?: Pick<SkyInkColors, 'text' | 'muted'>;
  column?: boolean;
};

/** The glyph's side, dp: the Qibla chip's line height, so the row stays one height. */
const GLYPH = 18;

function SettingsChipImpl({ onPress, ink, column = false }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const color = ink ? ink.text : palette.accentSolid;
  const skin =
    ink && !column
      ? null
      : { backgroundColor: palette.card, borderColor: palette.border, borderWidth: StyleSheet.hairlineWidth };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('nav.settings')}
      accessibilityHint={t('a11y.openSettings')}
      onPress={onPress}
      hitSlop={10}
      testID="today-settings"
      style={({ pressed }) => [styles.chip, skin, column && styles.column, pressed && styles.pressed]}>
      <SettingsGearIcon color={color} size={column ? 20 : GLYPH} strokeWidth={1.8} />
    </Pressable>
  );
}

export const SettingsChip = memo(SettingsChipImpl);

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  column: {
    width: COLUMN_CHIP_W,
    height: COLUMN_CHIP_W,
    padding: 0,
  },
  pressed: { opacity: 0.6 },
});
