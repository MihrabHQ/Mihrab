// hover-ok: compact chip inside the hero; the pressed opacity is the
// right affordance here, as on the other home chips.
/**
 * The way into Settings, from Today — since Settings left the tab bar.
 *
 * A cog alone, a glyph rather than a word because the cog is the one icon
 * every reader already knows. Always there, whatever else the page shows:
 *
 *   the full page   UNDER the Qibla chip, at the row's right-hand end
 *                   (`under`). It stood after the chip in the row, and
 *                   "◎ Qibla 148° ⚙" read as one chip with an icon at
 *                   each end. Beside nothing — no place set yet, so no
 *                   Qibla — it is in the row, where the chip would be.
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
 *
 * ── UNDER THE QIBLA CHIP, AND STILL NOT IN THE SKY ─────────────────────
 *
 * The line under the top row is where the sky begins: the band the sun,
 * the moon and the stars are drawn in started at the row's foot. A cog
 * hung there would have had the night's star at 90 % across standing in
 * it wherever the band is short (a compact page, a long table), and the
 * moon behind it when it is high in the west. The sun is never that high
 * at either end of its arc. So the cog takes the twelve points of air
 * the row already had under it and four of the band's own
 * (`SETTINGS_UNDER_LINE`), and the sky's band begins at its foot
 * (HeroToday's `sceneTop`): the page is not a point taller, and nothing
 * is drawn behind the glyph. Not a line of its own: the compact page
 * fits an iPhone SE with two points to spare (homeBudget.ts), and a line
 * for a cog would have made that page scroll.
 *
 * The four points are the air between the chip and the cog: the glyph
 * begins at the row's foot, not inside the row, where it stood a hair
 * under the bearing. Four and no more — the compact page's band is 44
 * at its least, and under 40 the sky stops drawing its sun and moon
 * (HeroSky's SKY_CRAMPED_BELOW).
 *
 * Its box is larger than its glyph downward and toward the page's middle
 * — that is the touch target, over empty sky — and it is laid out as a
 * child of the band's own view, rising out of it (HeroToday), because a
 * touch is only heard inside a view's own box and its children's.
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
  /** Under the Qibla chip, in the air beneath the top row (see above). */
  under?: boolean;
};

/** The glyph's side, dp: the Qibla chip's line height, so the row stays one height. */
const GLYPH = 18;
/** Under the Qibla chip: the size of the chip's own words, not of a control beside them. */
const GLYPH_UNDER = 16;
/** Above the glyph, inside its box. */
const UNDER_PAD_TOP = 2;
/** How far the glyph's foot goes into the band's own view, dp: the air between the chip and the cog. */
export const SETTINGS_UNDER_DROP = SPACING.xs;
/**
 * The cog's line, dp from the top row's foot to the glyph's: the row's
 * own bottom margin (todayCardStyles.heroTopRow) and the drop. The glyph
 * begins at the row's foot and is this tall.
 */
export const SETTINGS_UNDER_LINE = SPACING.md + SETTINGS_UNDER_DROP;
/** From the top of the band's view up to the top of the cog's box, dp. */
export const SETTINGS_UNDER_RISE = GLYPH_UNDER + UNDER_PAD_TOP - SETTINGS_UNDER_DROP;
const UNDER_HIT_SLOP = { top: 0, bottom: 10, left: 8, right: 8 };

function SettingsChipImpl({ onPress, ink, column = false, under = false }: Props) {
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
      // Under the chip: none upward, where the Qibla chip's own touch is.
      hitSlop={under ? UNDER_HIT_SLOP : 10}
      testID="today-settings"
      style={({ pressed }) => [styles.chip, skin, column && styles.column, under && styles.under, pressed && styles.pressed]}>
      <SettingsGearIcon color={color} size={column ? 20 : under ? GLYPH_UNDER : GLYPH} strokeWidth={1.8} />
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
  // The glyph's right-hand edge under the chip's own (the Qibla chip pads
  // its words by `sm`), and the rest of the box the room a thumb needs:
  // down into the sky and toward the page's middle, where nothing else
  // is. Start and end are sides here: its holder is laid out left to
  // right (todayCardStyles.heroCogUnder).
  under: {
    paddingTop: UNDER_PAD_TOP,
    paddingBottom: SPACING.lg,
    paddingStart: SPACING.md + 2,
    paddingEnd: SPACING.sm,
  },
  pressed: { opacity: 0.6 },
});
