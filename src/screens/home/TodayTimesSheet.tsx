import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { ResponsiveModal } from '../../responsive/ResponsiveModal';
import { SPACING } from '../../theme/tokens';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
import { TYPE, typeStyle } from '../../theme/typography';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS, type TimingsMap } from '../../types/prayer';

/**
 * The day's times, one tap away — the minimal Today's table
 * (settings.minimalUi). The page keeps the countdown and nothing else;
 * a tap on it opens this: the day as the rows would draw it, name and
 * time, the next prayer in the text ink and the rest in the muted one,
 * and no bells, checks or aims — those are the full page's, and the
 * full page is a switch away.
 */
function TodayTimesSheetImpl({
  visible,
  onClose,
  timings,
  next,
  title,
  qibla,
  place,
}: {
  visible: boolean;
  onClose: () => void;
  /** The day as drawn: the rows the reader has on. */
  timings: TimingsMap;
  /** The next prayer's key, lit. */
  next?: string | null;
  /** The sheet's heading: the day, in words. */
  title: string;
  /**
   * The two doors the full page's chips were: the Qibla (its bearing,
   * and the compass when there is one) and the place (its name, and the
   * location settings). Quiet links under the times, not chips.
   */
  qibla?: { bearing: number; onPress?: () => void };
  place?: { label: string; onPress?: () => void };
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();
  const rows = DISPLAY_ORDER.filter(key => timings[key]);
  return (
    <ResponsiveModal visible={visible} onClose={onClose} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <Text style={[typeStyle('title3'), { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.rows}>
          {rows.map(key => {
            const lit = key === next;
            const secondary = (OPTIONAL_TIME_KEYS as readonly string[]).includes(key);
            const ink = lit ? palette.text : secondary ? palette.muted : palette.text;
            return (
              <View key={key} style={styles.row} accessible accessibilityRole="text">
                <Text
                  style={[
                    styles.name,
                    { color: ink },
                    lit && styles.lit,
                    secondary && styles.secondary,
                  ]}
                  numberOfLines={1}>
                  {t(`prayer.${key}`)}
                </Text>
                <Text
                  style={[styles.time, tabularNumeralStyle, { color: ink }, lit && styles.lit]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
                  accessibilityLanguage="en-US">
                  {clock(timings[key] as string)}
                </Text>
              </View>
            );
          })}
        </View>
        {qibla || place ? (
          <View style={styles.doors}>
            {place ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={place.label}
                onPress={() => {
                  onClose();
                  place.onPress?.();
                }}
                disabled={!place.onPress}
                hitSlop={8}>
                <Text style={[styles.door, { color: palette.muted }]} numberOfLines={1}>
                  {place.label}
                </Text>
              </Pressable>
            ) : null}
            {qibla ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('nav.compass', 'Qibla')}
                onPress={() => {
                  onClose();
                  qibla.onPress?.();
                }}
                disabled={!qibla.onPress}
                hitSlop={8}>
                <Text
                  style={[styles.door, tabularNumeralStyle, { color: palette.muted }]}
                  numberOfLines={1}>
                  {`${t('nav.compass', 'Qibla')} · ${Math.round(qibla.bearing)}°`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
          onPress={onClose}
          style={[styles.close, { backgroundColor: palette.accentBg }]}>
          <Text style={[typeStyle('headline'), { color: palette.accentSolid }]}>
            {t('common.close', 'Close')}
          </Text>
        </Pressable>
      </View>
    </ResponsiveModal>
  );
}

export const TodayTimesSheet = memo(TodayTimesSheetImpl);

const styles = StyleSheet.create({
  sheet: { gap: SPACING.md },
  rows: { gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  name: { fontSize: TYPE.body.fontSize, fontWeight: '400' },
  secondary: { fontStyle: 'italic' },
  time: { fontSize: TYPE.body.fontSize, fontWeight: '400' },
  // The next prayer: the same face, a step heavier — the row's emphasis.
  lit: { fontWeight: '500' },
  // The doors: one line, the place leading and the Qibla trailing.
  doors: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  door: { fontSize: TYPE.footnote.fontSize, fontWeight: '400', flexShrink: 1 },
  close: {
    alignSelf: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 999,
    marginTop: SPACING.xs,
  },
});
