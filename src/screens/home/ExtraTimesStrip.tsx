/**
 * The times that are not prayers, on one thin line.
 *
 * Sunrise, Islamic Midnight and the thirds of the night were a row each
 * on the Today card, the height of a prayer's: with all four on, four of
 * nine rows — and none of them has a check to tick or a second time to
 * show, which is what a prayer's row is that tall for. A run of them now
 * shares a strip (`groupDayRows`): the name, the time and the bell, small,
 * one after another, and onto a second line only if they do not fit.
 *
 * Everything a row did, an item still does: it takes the accent when the
 * countdown is on it, a tap aims the countdown at it, and its bell cycles
 * its alert. It starts at the names' column, so it reads as a note in the
 * table and not as a row of it.
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
import { LOG_CHECK_SIZE } from './LogCheck';
import { STRIP_PAD, type HomeTier } from './homeBudget';

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

/**
 * A prayer's Mālikī tag, borrowed onto this line: Fajr's, on a display
 * too narrow to keep it beside the name, when Sunrise's strip is under
 * Fajr anyway — the tag first, then Sunrise, and Fajr's row stays one
 * line tall. Only Fajr's: the strip under Isha holds the night's marks,
 * and a second time among them would read as one of them.
 */
export type StripLead = {
  /** The prayer it belongs to — its testID is the tag's own (`daruri-Fajr`). */
  prayerKey: string;
  /** The short tag, as the row writes it ("1st to ~07:18"). */
  text: string;
  /** The whole sentence, with the prayer's name, for a screen reader. */
  label: string;
};

type Props = {
  /** Before the items (see `StripLead`). */
  lead?: StripLead;
  items: readonly ExtraTimeItem[];
  /** The card has a check column: the strip starts where the names do. */
  hasCheckColumn?: boolean;
  isLast?: boolean;
  tier?: HomeTier;
};

function ExtraTimesStripImpl({ lead, items, hasCheckColumn = false, isLast = false, tier = 'comfortable' }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    <View style={[styles.strip, { paddingVertical: STRIP_PAD[tier] }]} testID="extra-times-strip">
      {!isLast && !palette.flatChrome ? (
        <View pointerEvents="none" style={[styles.divider, { backgroundColor: palette.border }]} />
      ) : null}
      {hasCheckColumn ? <View style={styles.checkSlot} /> : null}
      <View style={styles.items}>
        {lead ? (
          <Text
            style={[styles.lead, { color: palette.muted }]}
            numberOfLines={1}
            accessibilityLabel={lead.label}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
            testID={`daruri-${lead.prayerKey}`}>
            {lead.text}
          </Text>
        ) : null}
        {items.map(item => {
          const ink = item.isNext ? palette.accent : palette.muted;
          const Item = item.onSelect ? Pressable : View;
          const interactive = item.onSelect
            ? {
                accessibilityRole: 'button' as const,
                accessibilityState: { selected: !!item.isChosen },
                accessibilityHint: item.isChosen ? t('a11y.countdownHere') : t('a11y.countdownTo'),
                onPress: item.onSelect,
                hitSlop: 6,
              }
            : {};
          return (
            <View key={item.key} style={styles.item}>
              <Item
                {...interactive}
                accessible
                accessibilityLabel={`${item.name}, ${item.time}`}
                style={styles.label}
                testID={`extra-time-${item.key}`}>
                {item.isChosen ? <View style={[styles.dot, { backgroundColor: palette.accent }]} /> : null}
                {/* Between two thin spaces: a slanted name leans past its
                    own measure, and Android cuts it there (PrayerRow). */}
                <Text style={[styles.name, { color: ink }]} maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                  {`\u2009${item.name}\u2009`}
                </Text>
                <Text
                  style={[styles.time, tabularNumeralStyle, { color: item.isNext ? palette.accent : palette.text }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                  {item.time}
                </Text>
              </Item>
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
    </View>
  );
}

export const ExtraTimesStrip = memo(ExtraTimesStripImpl);

const LINE = labelLineHeight(TYPE.footnote.fontSize);

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.xl,
    position: 'relative',
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    start: SPACING.xl,
    end: SPACING.xl,
    height: StyleSheet.hairlineWidth,
  },
  checkSlot: { width: LOG_CHECK_SIZE, marginEnd: SPACING.md },
  items: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: SPACING.md,
    rowGap: SPACING.xs,
    // The names open with a thin space; this keeps them on the column.
    marginStart: -4,
  },
  item: { flexDirection: 'row', alignItems: 'center' },
  // The tag as a row writes it (PrayerRow `daruri`): the caption size,
  // upright, so it does not read as one more of the strip's names. The
  // items' column starts 4 to the left for their thin space; this has none.
  lead: {
    fontSize: TYPE.caption.fontSize,
    lineHeight: LINE,
    marginStart: 4,
    flexShrink: 0,
    maxWidth: '100%',
  },
  label: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: RADIUS.xs, marginEnd: SPACING.xs },
  name: { fontSize: TYPE.footnote.fontSize, lineHeight: LINE, fontStyle: 'italic' },
  time: { fontSize: TYPE.footnote.fontSize, lineHeight: LINE, marginStart: SPACING.xs },
  // The bell is taller than the line; it overflows into the strip's
  // padding instead of setting the strip's height.
  bellBox: { height: LINE, justifyContent: 'center' },
});
