// hover-ok: compact chip inside the hero; the pressed opacity is the
// right affordance here, as on the other home chips.
/**
 * The way into Settings, from Today — since Settings left the tab bar.
 *
 * A cog alone, a glyph rather than a word because the cog is the one icon
 * every reader already knows. Always there, whatever else the page shows:
 *
 *   the full page   at the row's right-hand end, AFTER the Qibla chip
 *                   and on the row's own line. For a while it stood
 *                   UNDER the chip, on a line of its own in the air
 *                   beneath the row, because "◎ Qibla 148° ⚙" had read
 *                   as one chip with an icon at each end — and there, on
 *                   a phone, it hung by itself below everything else at
 *                   the page's top. The maintainer, on his own phone
 *                   (2026-11-26), wants it on the line, beside the
 *                   Qibla: the row's own gap stands between the two, and
 *                   the chip's words end before the cog begins.
 *   Minimal         at the row's right-hand end, the heart at the left:
 *                   the two things the row has, one to a corner.
 *
 * On the RIGHT on both, in every language: the hero's top row does not
 * mirror (todayCardStyles.heroTopRow), so the corner Settings is in is
 * the same one in Arabic and Urdu as in English.
 *   the iPhone Duo  in the bar's column (`column`), a chip of its size.
 *   the dashboard   in the header (HomeHeaderControls), and the Mac's.
 *
 * On the sky it takes the sky's ink and no container, like the chips
 * beside it.
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
/** The cog as Minimal's row draws it — its side and its line — which the heart across from it takes too (HelpMihrabChip). */
export const SETTINGS_GLYPH = GLYPH;
export const SETTINGS_GLYPH_STROKE = 1.8;

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
      <SettingsGearIcon color={color} size={column ? 20 : GLYPH} strokeWidth={SETTINGS_GLYPH_STROKE} />
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
