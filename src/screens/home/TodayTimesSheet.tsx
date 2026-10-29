import { memo, useCallback, useEffect, useRef, useState } from 'react';
// The gesture handler's list, not React Native's: the sheet sits in a
// gesture handler's detector (MinimalSheet's drag down), and inside one a
// plain scroll view had its touch cancelled part way — the page stopped
// between two days and did not snap. This one is a native handler of its
// own that the drag, failing on a sideways move, hands the finger to.
import { FlatList } from 'react-native-gesture-handler';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
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
import { pagerPosition } from './pagerPosition';

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

/** One day of the sheet's pager: its offset from today, and its rows. */
export type TimesSheetDay = { offset: number; rows: TimesSheetRow[] };

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
  days,
  offset = 0,
  onTurn,
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
  /**
   * Every day the card has, in order — the full page's pages. Given with
   * `onTurn`, the rows are a pager the reader swipes, as the full page's
   * table is; without, the one day's `rows` are drawn on their own.
   */
  days?: TimesSheetDay[];
  /** The day on show, as an offset from today. */
  offset?: number;
  /** A swipe settled on another day. */
  onTurn?: (offset: number) => void;
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
        {days && onTurn && days.length > 1 ? (
          <DayPager days={days} offset={offset} onTurn={onTurn} rtl={rtl} />
        ) : (
          <DayRows rows={rows} />
        )}
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

/** One day's rows: the check, the name, the time. */
function DayRows({ rows }: { rows: TimesSheetRow[] }) {
  const { palette } = useAppPalette();
  return (
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
  );
}

/**
 * ── THE DAYS, SWIPED ───────────────────────────────────────────────────
 *
 * The full page's table is a pager: a swipe across the rows turns the day,
 * and the chevrons only say where the swipe would go. The sheet had the
 * chevrons alone, so under Minimal another day was a tap at a time on a
 * 36-point target. Here the rows are the same pager — one day a page, laid
 * left to right in every language with the pages stored backwards in a
 * right-to-left one (`pagerPosition`, the full page's reason) — and the day
 * bar follows the swipe: a settle reports the day (`onTurn`), and a day
 * chosen elsewhere (a chevron, "Back to today") scrolls the pager to it.
 *
 * The sheet's drag down fails on a horizontal move (MinimalSheet's
 * `failOffsetX`), so the two gestures do not fight over a finger.
 */
function DayPager({
  days,
  offset,
  onTurn,
  rtl,
}: {
  days: TimesSheetDay[];
  offset: number;
  onTurn: (offset: number) => void;
  rtl: boolean;
}) {
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlatList<TimesSheetDay>>(null);
  const count = days.length;
  const data = rtl ? days.slice().reverse() : days;
  const positionOf = useCallback(
    (o: number) => {
      const i = days.findIndex(d => d.offset === o);
      return pagerPosition(i < 0 ? 0 : i, count, rtl);
    },
    [days, count, rtl],
  );
  // The width exactly as laid out — not rounded. The page snaps to the
  // list's own width, and a page a fraction narrower drifted from it by that
  // fraction a day: two weeks along, the rows sat several points off their
  // page and the check column was cut.
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(prev => (Math.abs(prev - w) < 0.01 ? prev : w));
  }, []);
  // The day the pager is on, as it last settled or was sent: a day chosen
  // by a swipe needs no scroll back to itself.
  const shown = useRef(offset);
  useEffect(() => {
    if (width <= 0 || shown.current === offset) return;
    shown.current = offset;
    listRef.current?.scrollToIndex({ index: positionOf(offset), animated: true });
  }, [offset, width, positionOf]);
  const onSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const position = Math.round(e.nativeEvent.contentOffset.x / width);
      const day = days[pagerPosition(Math.max(0, Math.min(count - 1, position)), count, rtl)];
      if (!day) return;
      shown.current = day.offset;
      if (day.offset !== offset) onTurn(day.offset);
    },
    [width, days, count, rtl, offset, onTurn],
  );
  const layout = useCallback(
    (_: unknown, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  );
  // Out to the sheet's edges, each page padded back in: a scroll view clips
  // what it holds, and the checks' rings reach past the rows' start — inset,
  // they were cut in half. The swipe takes the sheet's whole width with it.
  return (
    <View onLayout={onLayout} style={styles.pager}>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          data={data}
          keyExtractor={d => String(d.offset)}
          initialNumToRender={count}
          initialScrollIndex={positionOf(offset)}
          getItemLayout={layout}
          onMomentumScrollEnd={onSettled}
          nestedScrollEnabled
          renderItem={({ item }) => (
            <View style={[styles.page, { width }]}>
              <DayRows rows={item.rows} />
            </View>
          )}
        />
      ) : (
        // Before the width is known: the day on show, on its own.
        <View style={styles.page}>
          <DayRows rows={days.find(d => d.offset === offset)?.rows ?? []} />
        </View>
      )}
    </View>
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
  // The sheet's card padding (MinimalSheet, SPACING.lg), undone and redone.
  pager: { marginHorizontal: -SPACING.lg },
  page: { paddingHorizontal: SPACING.lg },
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
