import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { LoggedStatus } from '../../journal/journal';
import type { QuickLogPhase } from '../../journal/quickLog';
import { useAppPalette } from '../../hooks/useAppPalette';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { MinimalSheet } from './MinimalSheet';
import type { Animated } from 'react-native';
import { SPACING } from '../../theme/tokens';
import { TABULAR_MAX_FONT_SCALE, tabularNumeralStyle } from '../../theme/textScale';
import { TYPE, typeStyle } from '../../theme/typography';
import { LogCheck, LOG_CHECK_SIZE } from './LogCheck';
import { MinimalGlyph } from './MinimalGlyph';
import { MapPinIcon } from '../../theme/icons';
import { CompassIcon } from '../../components/HeaderToolbarIcons';

/** The doors' glyphs: a step under the type's cap, as the Qibla chip's small one. */
const DOOR_ICON = 15;

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
  progress,
  onClose,
  title,
  subtitle,
  hint,
  rows,
  isToday,
  onPrev,
  onNext,
  onBackToToday,
  onMonth,
  onToggleMinimal,
  qibla,
  place,
  source,
}: {
  visible: boolean;
  /** The sheet's rise, 0..1 — the page's, so it recedes as the sheet comes up. */
  progress: Animated.Value;
  onClose: () => void;
  /** The day, in words, and under it the other calendar's date. */
  title: string;
  subtitle?: string;
  /**
   * For a moment after a tap on a check that could not be recorded, why
   * — in the subtitle's place, as the full page's day bar says it. The
   * full page is the only place it was said; under Minimal a tap on a
   * prayer whose time has not come did nothing and said nothing.
   */
  hint?: string | null;
  rows: TimesSheetRow[];
  isToday: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onBackToToday: () => void;
  onMonth?: () => void;
  /** With the data statistics on: the way back to the full page, opposite the calendar. */
  onToggleMinimal?: () => void;
  qibla?: { bearing: number; onPress?: () => void };
  place?: { label: string; onPress?: () => void };
  /** Whose times: the source, or the method the reader chose. */
  source?: string;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const muted = String(palette.muted);
  // The chevrons point the way the day goes, as the full page's do: in a
  // right-to-left language the day before is on the right, and its
  // chevron points right. The glyph is a drawn path, not a character, so
  // the layout's mirroring does not turn it.
  const rtl = isRtlLanguage(i18n.language);
  return (
    <MinimalSheet visible={visible} onClose={onClose} progress={progress} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        {/* The day bar, as the full page's: the chevrons at the edges, and
            beside the day its doors — the month's calendar trailing, and
            the way back to the full page leading when it is offered. */}
        <View style={styles.dayBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.previousDay', 'Previous day')}
            onPress={onPrev}
            disabled={!onPrev}
            hitSlop={10}
            style={({ pressed }) => [styles.step, pressed && styles.pressed, !onPrev && styles.stepOff]}>
            <Chevron color={muted} back={!rtl} />
          </Pressable>
          {onToggleMinimal ? (
            <Pressable
              accessibilityRole="button"
              // The door out of Minimal — named by where it goes, not by
              // the glyph: "Minimal" on the one control that turns it off.
              accessibilityLabel={t('onboarding.personalise.layoutFull', 'Full')}
              onPress={() => {
                onClose();
                onToggleMinimal();
              }}
              hitSlop={10}
              style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
              <MinimalGlyph color={muted} />
            </Pressable>
          ) : onMonth ? (
            // An empty slot the calendar's size, so the day stands in the
            // middle of the bar whichever doors are offered.
            <View style={styles.step} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />
          ) : null}
          <Pressable
            // Today's date is a heading, as the full page's is; another
            // day's is the way back. The hint is said with it: the line it
            // stands on is inside this element, and would go unread.
            accessibilityRole={isToday ? 'header' : 'button'}
            accessibilityLabel={[
              title,
              hint ?? subtitle,
              isToday ? null : t('home.backToToday', 'Back to today'),
            ]
              .filter(Boolean)
              .join('. ')}
            onPress={isToday ? undefined : onBackToToday}
            style={styles.day}>
            <Text style={[typeStyle('title3'), styles.title, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
            {hint || subtitle ? (
              <Text
                style={[styles.subtitle, { color: hint ? palette.accent : palette.muted }]}
                numberOfLines={1}
                accessibilityLiveRegion={hint ? 'polite' : 'none'}>
                {hint ?? subtitle}
              </Text>
            ) : null}
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
          ) : onToggleMinimal ? (
            <View style={styles.step} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.nextDay', 'Next day')}
            onPress={onNext}
            disabled={!onNext}
            hitSlop={10}
            style={({ pressed }) => [styles.step, pressed && styles.pressed, !onNext && styles.stepOff]}>
            <Chevron color={muted} back={rtl} />
          </Pressable>
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
        {source ? (
          <Text style={[styles.source, { color: palette.muted }]} numberOfLines={1}>
            {`${t('provider.timesSource')} · ${source}`}
          </Text>
        ) : null}
        {/* The foot, one row: the place at the start, the Qibla at the
            end. No Close button — the sheet goes by a swipe down, a tap
            on the sky above it, or Back. */}
        <View style={styles.foot}>
          <View style={[styles.footSide, styles.footStart]}>
            {place ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={place.label}
                onPress={() => {
                  onClose();
                  place.onPress?.();
                }}
                disabled={!place.onPress}
                hitSlop={8}
                style={({ pressed }) => [styles.doorPill, { borderColor: palette.border }, pressed && styles.pressed]}>
                <MapPinIcon size={DOOR_ICON} color={muted} />
                <Text style={[styles.door, { color: palette.text }]} numberOfLines={1}>
                  {place.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.footSide, styles.footEnd]}>
            {qibla ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('nav.compass', 'Qibla')}
                onPress={() => {
                  onClose();
                  qibla.onPress?.();
                }}
                disabled={!qibla.onPress}
                hitSlop={8}
                style={({ pressed }) => [styles.doorPill, { borderColor: palette.border }, pressed && styles.pressed]}>
                <CompassIcon size={DOOR_ICON} color={muted} />
                <Text
                  style={[styles.door, tabularNumeralStyle, { color: palette.text }]}
                  numberOfLines={1}>
                  {`${t('nav.compass', 'Qibla')} · ${Math.round(qibla.bearing)}°`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </MinimalSheet>
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
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  footSide: { flex: 1, flexDirection: 'row', minWidth: 0 },
  footStart: { justifyContent: 'flex-start' },
  footEnd: { justifyContent: 'flex-end' },
  /**
   * The place and the Qibla as doors, not captions: a hairline pill with
   * its glyph.
   */
  doorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexShrink: 1,
    minHeight: 36,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 999,
    borderWidth: 1,
  },
  door: { fontSize: TYPE.footnote.fontSize, fontWeight: '400', flexShrink: 1 },
  source: { fontSize: TYPE.label.fontSize, fontWeight: '400', textAlign: 'center', marginTop: SPACING.xs, opacity: 0.8 },
});
