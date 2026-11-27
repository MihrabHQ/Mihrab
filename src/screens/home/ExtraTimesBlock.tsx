/**
 * The times that are not prayers, in one block under the table.
 *
 * Sunrise, Islamic Midnight and the thirds of the night were a row each
 * on the Today card, the height of a prayer's: with all four on, four of
 * nine rows — and none of them has a check to tick or a second time to
 * show, which is what a prayer's row is that tall for. They were then
 * thin strips between the prayers, which broke the list of five into
 * pieces. Now the five prayers are an unbroken list, and whichever of
 * these are switched on stand together under it, in the order the day
 * reaches them: a small name over its time, side by side, in equal
 * columns. One, two, three or four of them is the same block with fewer
 * columns; none is no block.
 *
 * Everything a row did, a cell still does: it takes the accent when the
 * countdown is on it, a tap aims the countdown at it, and its bell cycles
 * its alert.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { PrayerAlertMode } from '../../settings/alertModes';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, labelLineHeight } from '../../theme/typography';
import { AlertModeButton } from './AlertModeButton';
import { EXTRA_BLOCK_PAD, type HomeTier } from './homeBudget';

export type ExtraTimeItem = {
  key: string;
  /** The localised name. */
  name: string;
  /** The time as the reader's clock writes it. */
  time: string;
  /** The countdown is on this time. */
  isNext?: boolean;
  /** The reader aimed the countdown at it. */
  isChosen?: boolean;
  onSelect?: () => void;
  alertMode?: PrayerAlertMode;
  onCycleAlertMode?: () => void;
  /** Its alert differs from the standing setting, this once. */
  emphasised?: boolean;
};

type Props = {
  items: readonly ExtraTimeItem[];
  tier?: HomeTier;
};

function ExtraTimesBlockImpl({ items, tier = 'comfortable' }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  if (items.length === 0) return null;
  return (
    <View style={[styles.block, { paddingVertical: EXTRA_BLOCK_PAD[tier] }]} testID="extra-times-block">
      {items.map(item => {
        const Cell = item.onSelect ? Pressable : View;
        const interactive = item.onSelect
          ? {
              accessibilityRole: 'button' as const,
              accessibilityState: { selected: !!item.isChosen },
              accessibilityHint: item.isChosen ? t('a11y.countdownHere') : t('a11y.countdownTo'),
              onPress: item.onSelect,
            }
          : {};
        return (
          <View key={item.key} style={styles.cell}>
            <Cell
              {...interactive}
              accessible
              accessibilityLabel={`${item.name}, ${item.time}`}
              style={styles.label}
              testID={`extra-time-${item.key}`}>
              {/* Two lines at most, so "Islamic Midnight" fits a quarter
                  of a phone; the cells sit on their last line, so the
                  times stay level whichever name wrapped. */}
              <Text
                style={[styles.name, { color: item.isNext ? palette.accent : palette.muted }]}
                numberOfLines={2}
                maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                {item.name}
              </Text>
              <View style={styles.timeLine}>
                {item.isChosen ? <View style={[styles.dot, { backgroundColor: palette.accent }]} /> : null}
                <Text
                  style={[styles.time, tabularNumeralStyle, { color: item.isNext ? palette.accent : palette.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                  {item.time}
                </Text>
              </View>
            </Cell>
            {item.alertMode && item.onCycleAlertMode ? (
              <View style={styles.bellBox}>
                <AlertModeButton
                  mode={item.alertMode}
                  palette={palette}
                  onPress={item.onCycleAlertMode}
                  prayerLabel={item.name}
                  secondary
                  emphasised={!!item.emphasised}
                  compact
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export const ExtraTimesBlock = memo(ExtraTimesBlockImpl);

const NAME_LINE = labelLineHeight(TYPE.caption.fontSize);
const TIME_LINE = labelLineHeight(TYPE.footnote.fontSize);

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.xl,
    columnGap: SPACING.sm,
  },
  cell: { flex: 1, alignItems: 'center' },
  label: { alignItems: 'center', alignSelf: 'stretch' },
  name: {
    fontSize: TYPE.caption.fontSize,
    lineHeight: NAME_LINE,
    fontStyle: 'italic',
    textAlign: 'center',
    // A slanted last letter leans past its measure (see PrayerRow).
    paddingHorizontal: 2,
  },
  timeLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: RADIUS.xs, marginEnd: SPACING.xs },
  time: { fontSize: TYPE.footnote.fontSize, lineHeight: TIME_LINE, textAlign: 'center' },
  // The bell under its time, small: four of them across are a quiet row
  // of their own, and each is unmistakably its column's.
  bellBox: { height: 22, justifyContent: 'center' },
});
