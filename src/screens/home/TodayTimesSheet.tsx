import { memo, useCallback, useEffect, useRef, useState } from 'react';
// The gesture handler's list, not React Native's: the sheet sits in a
// gesture handler's detector (MinimalSheet's drag down), and inside one a
// plain scroll view had its touch cancelled part way — the page stopped
// between two days and did not snap. This one is a native handler of its
// own that the drag, failing on a sideways move, hands the finger to.
import { useWebScrollSettle } from '../../hooks/useWebScrollSettle';
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
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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
import { AlertModeButton } from './AlertModeButton';
import type { PrayerAlertMode } from '../../settings/alertModes';
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
  /**
   * A Mālikī second time beside the prayer's own (settings: Mālikī second
   * times): "1st to ~17:10". On ʿAṣr and Ishāʾ only — Ẓuhr's boundary is
   * ʿAṣr's row and Maghrib's is Ishāʾ's, and saying them again would be the
   * same number twice on a sheet of five lines. `label` is how it is read
   * aloud.
   */
  tag?: { text: string; label: string };
  /**
   * Fajr's second time, said FIRST on the line this time is on — Sunrise's:
   * it falls before sunrise, and the line is there either way, so Fajr's row
   * does not grow for it.
   */
  lead?: { text: string; label: string };
  /**
   * How this time announces itself, and the tap that changes it — the full
   * page's bell, on today's rows only (a tap on another day's would change
   * a setting for every day).
   */
  alert?: { mode: PrayerAlertMode; onCycle: () => void; emphasised: boolean };
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
  qibla?: { bearing: number; onPress?: () => void };
  place?: { label: string; onPress?: () => void };
  /** Whose times: the source, or the method the reader chose. */
  source?: string;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const muted = palette.mutedSolid;
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
            the way back to today leading on any other day. */}
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
          {!isToday ? (
            // The way back to today, opposite the calendar: a door of the
            // bar like it, in the accent — the one thing on the bar that
            // is only there because the day is not today.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.backToToday', 'Back to today')}
              onPress={onBackToToday}
              hitSlop={10}
              testID="sheet-back-to-today"
              style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
              <TodayGlyph color={String(palette.accentSolid)} />
            </Pressable>
          ) : onMonth ? (
            // An empty slot the calendar's size, so the day stands in the
            // middle of the bar whether or not the way back is on it.
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
          ) : !isToday ? (
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
        {days && onTurn && days.length > 1 ? (
          <DayPager days={days} offset={offset} onTurn={onTurn} rtl={rtl} />
        ) : (
          <DayRows rows={rows} />
        )}
        {/* The foot, one row: the place at the start, where the times come
            from in the middle — "Times source" over the provider, small, so
            the two doors keep their room either side — and the Qibla at the
            end. No Close button — the sheet goes by a swipe down, a tap on
            the sky above it, or Back. */}
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
          {source ? (
            <View
              style={styles.sourceBox}
              accessible
              accessibilityLabel={`${t('provider.timesSource')} · ${source}`}>
              <Text
                style={[styles.source, { color: palette.muted }]}
                numberOfLines={1}
                maxFontSizeMultiplier={SOURCE_MAX_SCALE}>
                {t('provider.timesSource')}
              </Text>
              <Text
                style={[styles.source, styles.sourceName, { color: palette.muted }]}
                // Two lines: "Sweden (Islamiska Förbundet)" is whose times
                // they are, and one line cut the name off at "Förbun…".
                numberOfLines={2}
                maxFontSizeMultiplier={SOURCE_MAX_SCALE}>
                {source}
              </Text>
            </View>
          ) : null}
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
  // The prayers are the sheet's rows. The times that are not prayers —
  // Sunrise, Islamic Midnight, the thirds of the night — were rows as
  // tall, with an empty place where a check would be: on a sheet whose
  // whole point is five lines, up to four more. Each run of them is now
  // one quiet line where it falls in the day, in the small type the
  // sheet's foot uses: no check, no column, just the name and its time.
  const groups: ({ kind: 'row'; row: TimesSheetRow } | { kind: 'aside'; rows: TimesSheetRow[] })[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (!row.secondary) groups.push({ kind: 'row', row });
    else if (last?.kind === 'aside') last.rows.push(row);
    else groups.push({ kind: 'aside', rows: [row] });
  }
  return (
    <View style={styles.rows}>
      {groups.map(group => {
        if (group.kind === 'aside') {
          // Fajr's second time leads the line it shares with Sunrise.
          const lead = group.rows.find(r => r.lead)?.lead;
          // A bell ends its item, so nothing else need part two of them —
          // and a dot between them opened the second line when the run
          // wrapped ("· Tengah malam 23:29"). Dots only where there are no
          // bells: another day's sheet.
          const dots = !group.rows.some(r => r.alert);
          return (
            <View key={group.rows.map(r => r.key).join('+')} style={styles.aside} testID="sheet-extra-times">
              {lead ? (
                <Text
                  style={[styles.asideText, tabularNumeralStyle, { color: palette.muted }]}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
                  accessibilityLabel={lead.label}
                  testID="sheet-lead">
                  {'\u2009'}
                  {lead.text.replace(/ /g, '\u00A0')}
                  {/* Its dot stays with it, so it never opens a line. */}
                  {'\u00A0\u00A0·'}
                </Text>
              ) : null}
              {group.rows.map((r, i) => (
                // Each item whole — its name, its time, its bell, nothing
                // broken between or inside them; the line breaks only
                // between items. In Russian "Исламская полночь 10:23 PM" ran
                // to the line's end and left "PM" alone on the next, and
                // then "полночь" without "Исламская".
                <View key={r.key} style={styles.asideItem}>
                  {i > 0 && dots ? <Text style={[styles.asideText, { color: palette.muted }]}>·</Text> : null}
                  <Text
                    style={[styles.asideText, { color: palette.muted }, r.lit && [styles.lit, { color: palette.text }]]}
                    maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                    {/* A thin space before the slanted name: it leans past
                        its own measure, and Android cuts it at the line's
                        start (the first letter of "الثلث الأخير"). */}
                    {'\u2009'}
                    <Text style={styles.secondary}>{r.name.replace(/ /g, '\u00A0')}</Text>
                    {'\u00A0\u00A0'}
                    <Text style={[tabularNumeralStyle, !r.lit && { color: palette.text }]}>{r.time.replace(/ /g, '\u00A0')}</Text>
                  </Text>
                  {r.alert ? (
                    <AlertModeButton
                      mode={r.alert.mode}
                      palette={palette}
                      onPress={r.alert.onCycle}
                      prayerLabel={r.name}
                      secondary
                      emphasised={r.alert.emphasised}
                      compact
                    />
                  ) : null}
                </View>
              ))}
            </View>
          );
        }
        const row = group.row;
        const ink = palette.text;
        return (
          <View
            key={row.key}
            style={styles.row}>
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
            {/* The name, and a second time beside it where the row has one:
                toward the time while there is room on the line, under the
                name's line when there is not (a wide clock, large type). */}
            <View style={styles.nameBox}>
              <Text
                style={[styles.name, { color: ink }, row.lit && styles.lit, row.secondary && styles.secondary]}
                numberOfLines={1}>
                {row.name}
              </Text>
              {row.tag ? (
                <Text
                  style={[styles.tag, tabularNumeralStyle, { color: palette.muted }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
                  accessibilityLabel={row.tag.label}
                  testID={`sheet-tag-${row.key}`}>
                  {row.tag.text}
                </Text>
              ) : null}
            </View>
            <Text
              style={[styles.time, tabularNumeralStyle, { color: ink }, row.lit && styles.lit]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
              accessibilityLanguage="en-US">
              {row.time}
            </Text>
            {row.alert ? (
              <AlertModeButton
                mode={row.alert.mode}
                palette={palette}
                onPress={row.alert.onCycle}
                prayerLabel={row.name}
                emphasised={row.alert.emphasised}
                compact
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Back to now: an arrow turning round to a dot — the day that is today. */
function TodayGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M4.2 10a5.8 5.8 0 1 0 1.9-4.3M3.6 3.4v3.2h3.2"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={10} cy={10} r={1.7} fill={color} />
    </Svg>
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
/** The sheet's rise, and a beat: after this the other days are built. */
export const DAYS_AFTER_RISE_MS = 450;

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
  // The sheet has risen (MinimalSheet's spring): the other days may be built.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), DAYS_AFTER_RISE_MS);
    return () => clearTimeout(t);
  }, []);
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
  // A browser sends no momentum end: settle on the scroll coming to rest.
  const webSettle = useWebScrollSettle(onSettled);
  // Out to the sheet's edges, each page padded back in: a scroll view clips
  // what it holds, and the checks' rings reach past the rows' start — inset,
  // they were cut in half. The swipe takes the sheet's whole width with it.
  return (
    <View onLayout={onLayout} style={styles.pager}>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          // On the list itself too, as the full page's is: see `pager` below.
          style={styles.pageLtr}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          data={data}
          keyExtractor={d => String(d.offset)}
          // THE DAY ON SHOW FIRST, THE REST ONCE THE SHEET IS UP. Every day
          // was rendered at once (the list's initial count was all of them): two weeks
          // of rows and checks, built the moment the list had its width —
          // which is in the middle of the sheet's rise, on the thread the
          // rise is drawn on. The sheet opens on one day now, and the
          // others come in behind it two at a time after it has landed
          // (`ready`, below), long before a finger can have swiped to one.
          initialNumToRender={1}
          windowSize={ready ? 21 : 1}
          maxToRenderPerBatch={2}
          initialScrollIndex={positionOf(offset)}
          getItemLayout={layout}
          onMomentumScrollEnd={onSettled}
          {...webSettle}
          nestedScrollEnabled
          renderItem={({ item }) => (
            <View style={[styles.page, { width }, rtl ? styles.pageRtl : styles.pageLtr]}>
              <DayRows rows={item.rows} />
            </View>
          )}
        />
      ) : (
        // Before the width is known: the day on show, on its own.
        <View style={[styles.page, rtl ? styles.pageRtl : styles.pageLtr]}>
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

/** The source's two lines follow the text size only so far: they share a row with the two doors. */
const SOURCE_MAX_SCALE = 1.3;

const styles = StyleSheet.create({
  sheet: { gap: SPACING.sm },
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  stepOff: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
  day: { flex: 1, alignItems: 'center' },
  title: { textAlign: 'center' },
  subtitle: { fontSize: TYPE.footnote.fontSize, fontWeight: '400', textAlign: 'center', marginTop: 1 },
  rows: { gap: SPACING.xs, marginTop: SPACING.xs },
  // The sheet's card padding (MinimalSheet, SPACING.lg), undone and redone.
  // LEFT TO RIGHT WHATEVER THE LANGUAGE, as the full page's pager is
  // (`pagerPosition`): the pages are stored backwards in a right-to-left
  // language, and a list the system mirrors as well opens one page early —
  // in Arabic the sheet rose on YESTERDAY's times under today's date, with
  // "Back to today" on them. Each page is then given the language's own
  // direction back, so its rows read as they should.
  pager: { marginHorizontal: -SPACING.lg, direction: 'ltr' },
  page: { paddingHorizontal: SPACING.lg },
  pageLtr: { direction: 'ltr' },
  pageRtl: { direction: 'rtl' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs, gap: SPACING.sm },
  check: { width: LOG_CHECK_SIZE, height: LOG_CHECK_SIZE, alignItems: 'center', justifyContent: 'center' },
  // The name and, where there is one, the second time: on one line while
  // they fit, the second time pushed toward the clock; on two when not.
  nameBox: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: SPACING.sm },
  name: { flexShrink: 1, fontSize: TYPE.body.fontSize, fontWeight: '400' },
  tag: { marginStart: 'auto', fontSize: TYPE.footnote.fontSize, fontWeight: '400' },
  secondary: { fontStyle: 'italic' },
  // A run of the optional times: one line, indented to the names' column
  // (the check's width and the row's gap), wrapping if it must.
  aside: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: SPACING.sm,
    marginStart: LOG_CHECK_SIZE + SPACING.sm - 3,
  },
  asideItem: { flexDirection: 'row', alignItems: 'center', columnGap: SPACING.xs },
  asideText: {
    fontSize: TYPE.footnote.fontSize,
    lineHeight: Math.round(TYPE.footnote.fontSize * 1.5),
  },
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
  // Where the times come from, between the doors: two short lines in the
  // caption's size, the label quieter than the name, never wider than it
  // must be — a long provider is cut rather than pushing the doors off.
  sourceBox: { flexShrink: 1, maxWidth: '36%', alignItems: 'center' },
  source: { fontSize: TYPE.caption.fontSize, lineHeight: TYPE.caption.lineHeight, fontWeight: '400', textAlign: 'center', opacity: 0.7 },
  sourceName: { opacity: 0.95 },
});
