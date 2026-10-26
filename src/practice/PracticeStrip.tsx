/**
 * The record by prayer — see practiceStrip.ts for why it exists.
 *
 * Drawn in INK, not in the accent. The heatmap's ramp was the accent at
 * five alphas, and under the Sky themes the accent is the hour's own light:
 * the same year was a brown graph at Fajr and a blue one at noon. A record
 * is the one thing on the screen about the past, so it is drawn in the ink
 * the text is, which is the same in every theme and every hour. The accent
 * is left to mean one thing here — the fast — and the danger colour one
 * thing — a missed prayer.
 *
 * Every cell is one fact, so a cell is a small rounded square and nothing
 * else: filled for on time, faint for late, hollow for a make-up, danger
 * for missed, the paper for nothing. No rings, no corner dots, no edges on
 * empty days — the record's shape comes from the days that have something
 * in them, and a bright screen is answered by the ink's own contrast.
 */
import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useLayoutRtl } from '../i18n/useLayoutRtl';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import { SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';
import { monthLabelFor, STRIP_PRAYERS, type StripDay, type StripStatus } from './stripRecord';
import { useHistoryScroll } from './useHistoryScroll';

/** One cell, and the gap after it; a wider gap after each week. */
export const CELL = 10;
const GAP = 3;
const DAY = CELL + GAP;
const WEEK_GAP = 6;
/** The average column, for the scroll arithmetic: growth is always whole weeks. */
const COLUMN = DAY + WEEK_GAP / 7;
const ROW = CELL + GAP;
const MONTH_ROW = 16;
/** How far the hollow make-up cell's line is from its edge. */
const HOLLOW = 1.5;

/** `#RRGGBB` at an alpha; anything else is passed back as it is. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${m[1]}${a}`;
}

type Props = {
  days: StripDay[];
  /** The day the Log is showing, drawn as a lit column. */
  selectedKey?: string;
  /** When set, every other column drops back — how an owed day is found. */
  emphasise?: Set<string>;
  onSelectDay?: (key: string) => void;
  /** The oldest column has been reached: hand back more weeks. */
  onReachOldest?: () => void;
};

function PracticeStripImpl({ days, selectedKey, emphasise, onSelectDay, onReachOldest }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const rtl = useLayoutRtl();
  const ink = String(palette.textSolid);
  const accent = String(palette.accentSolid);
  const danger = String(palette.danger);

  const scroll = useHistoryScroll({ columns: days.length, columnWidth: COLUMN, rtl, onReachOldest });

  const rowLabels = useMemo(
    () => [
      ...STRIP_PRAYERS.map(p => t(`prayer.${p}`)),
      t('log.fastRow', 'Fast'),
      t('log.sunnahRow', 'Sunnah'),
    ],
    [t],
  );

  /** The fill of a prayer's cell. */
  const prayerCell = (status: StripStatus, day: StripDay) => {
    if (day.future || day.beforeRecord) return styles.cellNone;
    switch (status) {
      case 'on-time':
        return { backgroundColor: withAlpha(ink, 0.85) };
      case 'late':
        return { backgroundColor: withAlpha(ink, 0.38) };
      case 'qadha':
        return { borderWidth: HOLLOW, borderColor: withAlpha(ink, 0.85) };
      case 'missed':
        return { backgroundColor: withAlpha(danger, 0.8) };
      default:
        return { backgroundColor: withAlpha(ink, 0.07) };
    }
  };
  const faint = { backgroundColor: withAlpha(ink, 0.07) };

  const statusWord = (s: StripStatus) => (s ? t(`journal.status.${s}`) : '');

  return (
    <View style={styles.strip}>
      <View style={styles.labels}>
        <View style={styles.monthSpacer} />
        {rowLabels.map((label, i) => (
          <View key={i} style={styles.labelCell}>
            <Text
              style={[styles.labelText, { color: palette.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <ScrollView
        ref={scroll.scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={scroll.onContentSizeChange}
        onLayout={scroll.onLayout}
        scrollEventThrottle={64}
        onScrollBeginDrag={scroll.onScrollBeginDrag}
        onScroll={scroll.onScroll}
        directionalLockEnabled
        nestedScrollEnabled
        contentContainerStyle={styles.scrollBody}>
        <View style={styles.columns}>
          {days.map(day => {
            const selected = !day.future && day.key === selectedKey;
            const dim = emphasise !== undefined && !emphasise.has(day.key) && !day.future && !selected;
            const endOfWeek = day.weekday === 6;
            const a11y = [
              day.key,
              ...STRIP_PRAYERS.map((p, i) =>
                day.prayers[i] ? `${t(`prayer.${p}`)} ${statusWord(day.prayers[i])}` : '',
              ).filter(Boolean),
              day.fasted ? t('log.fasted', 'fasted') : '',
              day.sunnah >= 1 ? t('sunnah.a11yAll', 'all sunnah') : '',
              day.qiyam ? t('sunnah.qiyam', 'Qiyam al-Layl') : '',
              day.unaccounted ? t('log.unlogged') : '',
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <Pressable
                key={day.key}
                testID={day.key}
                disabled={day.future || !onSelectDay}
                onPress={() => onSelectDay?.(day.key)}
                accessibilityRole={onSelectDay ? 'button' : 'image'}
                accessibilityState={{ selected }}
                accessibilityLabel={a11y}
                style={[styles.column, endOfWeek && styles.weekEnd, dim && styles.dim]}>
                <View style={styles.monthCell}>
                  {day.monthStart ? (
                    <Text
                      style={[styles.monthText, { color: palette.muted }]}
                      numberOfLines={1}>
                      {monthLabelFor(day.key, i18n.language)}
                    </Text>
                  ) : null}
                </View>
                {/* The lit column: where you are, behind the cells, with
                    nothing drawn on the cells themselves. */}
                {selected ? (
                  <View pointerEvents="none" style={[styles.lit, { backgroundColor: String(palette.accentBg) }]} />
                ) : null}
                {day.prayers.map((status, i) => (
                  <View key={i} style={[styles.cell, prayerCell(status, day)]} />
                ))}
                <View
                  style={[
                    styles.cell,
                    day.future || day.beforeRecord
                      ? styles.cellNone
                      : day.fasted
                        ? { backgroundColor: accent }
                        : faint,
                  ]}
                />
                <View style={[styles.cell, day.future || day.beforeRecord ? styles.cellNone : faint]}>
                  {!day.future && day.sunnah > 0 ? (
                    <View
                      style={[
                        styles.sunnahBar,
                        {
                          height: Math.max(2, Math.round(CELL * Math.min(1, day.sunnah))),
                          backgroundColor: day.qiyam ? accent : withAlpha(ink, 0.6),
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export const PracticeStrip = memo(PracticeStripImpl);

/** What the cells mean, in words — for the options sheet's key. */
export function StripLegend() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const ink = String(palette.textSolid);
  const items: Array<[object, string]> = [
    [{ backgroundColor: withAlpha(ink, 0.85) }, t('journal.status.on-time')],
    [{ backgroundColor: withAlpha(ink, 0.38) }, t('journal.status.late')],
    [{ borderWidth: HOLLOW, borderColor: withAlpha(ink, 0.85) }, t('journal.status.qadha')],
    [{ backgroundColor: withAlpha(String(palette.danger), 0.8) }, t('journal.status.missed')],
    [{ backgroundColor: String(palette.accentSolid) }, t('log.fastRow', 'Fast')],
  ];
  return (
    <View style={styles.legend}>
      {items.map(([style, label], i) => (
        <View key={i} style={styles.legendItem}>
          <View style={[styles.cell, style]} />
          <Text style={[styles.labelText, { color: palette.muted }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'flex-start' },
  labels: { marginEnd: SPACING.sm },
  monthSpacer: { height: MONTH_ROW },
  labelCell: { height: ROW, justifyContent: 'center' },
  labelText: { fontSize: TYPE.caption.fontSize, lineHeight: ROW },
  scrollBody: { paddingEnd: SPACING.xs },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { width: DAY, alignItems: 'flex-start' },
  weekEnd: { marginEnd: WEEK_GAP },
  dim: { opacity: 0.3 },
  monthCell: { height: MONTH_ROW, width: DAY },
  monthText: {
    position: 'absolute',
    insetInlineStart: 0,
    top: 0,
    width: 48,
    fontSize: TYPE.caption.fontSize,
    lineHeight: MONTH_ROW,
  },
  lit: {
    position: 'absolute',
    top: MONTH_ROW - 2,
    bottom: GAP - 2,
    insetInlineStart: -2,
    width: CELL + 4,
    borderRadius: 4,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
    marginBottom: GAP,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  cellNone: { backgroundColor: 'transparent' },
  sunnahBar: { width: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
