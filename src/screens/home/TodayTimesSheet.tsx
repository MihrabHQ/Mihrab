import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { LoggedStatus } from '../../journal/journal';
import type { QuickLogPhase } from '../../journal/quickLog';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ResponsiveModal } from '../../responsive/ResponsiveModal';
import { SPACING } from '../../theme/tokens';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
import { TYPE, typeStyle } from '../../theme/typography';
import { LogCheck, LOG_CHECK_SIZE } from './LogCheck';

/** One row of the sheet: a time, and the check beside it when it can be logged. */
export type TimesSheetRow = {
  key: string;
  name: string;
  time: string;
  secondary: boolean;
  /** The next prayer, lit. */
  lit: boolean;
  log?: {
    status: LoggedStatus | null;
    phase: QuickLogPhase;
    ready: boolean;
    onToggle: () => void;
  };
};

/**
 * The day's times, one tap away — the minimal Today's table
 * (settings.minimalUi). The page keeps the countdown and nothing else;
 * a tap or a drag up on it opens this: the full page's day bar in
 * small — the day in both calendars between a chevron each way and the
 * month's calendar — the rows with the log's check beside each salāh,
 * and under them the Qibla and the place, which were the full page's
 * chips. TodayCard builds the rows from the same record the full page
 * draws, so the two can never disagree about a day.
 */
function TodayTimesSheetImpl({
  visible,
  onClose,
  title,
  subtitle,
  rows,
  isToday,
  onPrev,
  onNext,
  onBackToToday,
  onMonth,
  qibla,
  place,
}: {
  visible: boolean;
  onClose: () => void;
  /** The day, in words, and under it the other calendar's date. */
  title: string;
  subtitle?: string;
  rows: TimesSheetRow[];
  isToday: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onBackToToday: () => void;
  onMonth?: () => void;
  qibla?: { bearing: number; onPress?: () => void };
  place?: { label: string; onPress?: () => void };
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const muted = String(palette.muted);
  return (
    <ResponsiveModal visible={visible} onClose={onClose} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        {/* The day bar: a chevron each way, the day between them, and the
            month's calendar at the trailing end. */}
        <View style={styles.dayBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.previousDay', 'Previous day')}
            onPress={onPrev}
            disabled={!onPrev}
            hitSlop={10}
            style={({ pressed }) => [styles.step, pressed && styles.pressed, !onPrev && styles.stepOff]}>
            <Chevron color={muted} back />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isToday ? title : `${title}. ${t('home.backToToday', 'Back to today')}`}
            onPress={isToday ? undefined : onBackToToday}
            disabled={isToday}
            style={styles.day}>
            <Text style={[typeStyle('title3'), styles.title, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.nextDay', 'Next day')}
            onPress={onNext}
            disabled={!onNext}
            hitSlop={10}
            style={({ pressed }) => [styles.step, pressed && styles.pressed, !onNext && styles.stepOff]}>
            <Chevron color={muted} />
          </Pressable>
          {onMonth ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.monthTimesLink')}
              accessibilityHint={t('a11y.openMonth')}
              onPress={() => {
                onClose();
                onMonth();
              }}
              hitSlop={10}
              style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
              <MonthGlyph color={muted} />
            </Pressable>
          ) : null}
        </View>
        {/* Off today, the way back — a line, as the full page's day bar has. */}
        {isToday ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.backToToday', 'Back to today')}
            onPress={onBackToToday}
            hitSlop={6}
            style={styles.backToToday}>
            <Text style={[styles.backToTodayText, { color: palette.accentSolid }]}>
              {t('home.backToToday', 'Back to today')}
            </Text>
          </Pressable>
        )}
        <View style={styles.rows}>
          {rows.map(row => {
            const ink = row.secondary && !row.lit ? palette.muted : palette.text;
            return (
              <View key={row.key} style={styles.row}>
                {/* The check, or its room: the names line up whether or not
                    a row can be logged (Sunrise cannot). */}
                <View style={styles.check}>
                  {row.log ? (
                    <LogCheck
                      status={row.log.status}
                      phase={row.log.phase}
                      ready={row.log.ready}
                      palette={palette}
                      prayerLabel={row.name}
                      onPress={row.log.onToggle}
                    />
                  ) : null}
                </View>
                <Text
                  style={[styles.name, { color: ink }, row.lit && styles.lit, row.secondary && styles.secondary]}
                  numberOfLines={1}>
                  {row.name}
                </Text>
                <Text
                  style={[styles.time, tabularNumeralStyle, { color: ink }, row.lit && styles.lit]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
                  accessibilityLanguage="en-US">
                  {row.time}
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

/** The day bar's chevron, the full page's. */
function Chevron({ color, back = false }: { color: string; back?: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d={back ? 'M12.5 4 6.5 10l6 6' : 'M7.5 4l6 6-6 6'}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** The month's calendar, the full page's day bar glyph. */
function MonthGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={3} y={4.5} width={14} height={12} rx={2} stroke={color} strokeWidth={1.6} fill="none" />
      <Path d="M3 8.5h14M7 3v3M13 3v3" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export const TodayTimesSheet = memo(TodayTimesSheetImpl);

const styles = StyleSheet.create({
  sheet: { gap: SPACING.sm },
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  stepOff: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
  day: { flex: 1, alignItems: 'center' },
  title: { textAlign: 'center' },
  subtitle: { fontSize: TYPE.footnote.fontSize, fontWeight: '400', textAlign: 'center', marginTop: 1 },
  backToToday: { alignSelf: 'center', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
  backToTodayText: { fontSize: TYPE.footnote.fontSize, fontWeight: '500' },
  rows: { gap: SPACING.xs, marginTop: SPACING.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs, gap: SPACING.sm },
  check: { width: LOG_CHECK_SIZE, height: LOG_CHECK_SIZE, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: TYPE.body.fontSize, fontWeight: '400' },
  secondary: { fontStyle: 'italic' },
  time: { fontSize: TYPE.body.fontSize, fontWeight: '400' },
  // The next prayer: the same face, a step heavier — the row's emphasis.
  lit: { fontWeight: '500' },
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
