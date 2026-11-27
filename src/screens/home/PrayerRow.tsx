import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { ROW_PAD, type HomeTier } from './homeBudget';
import { AlertModeButton } from './AlertModeButton';
import { AlertOverrideChip } from './AlertOverrideChip';
import { LogCheck, LOG_CHECK_SIZE } from './LogCheck';
import type { LoggedStatus } from '../../journal/journal';
import type { QuickLogPhase } from '../../journal/quickLog';
import type { PrayerAlertMode } from '../../settings/alertModes';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, labelLineHeight } from '../../theme/typography';

/**
 * Single prayer row inside a day card.
 *
 * Memoized so DayCard re-renders don't cascade unless this row's specific
 * props changed (the `isNext` highlight is the only frequently-changing one).
 *
 * ── THE HIGHLIGHT MEANS "WHAT THE COUNTDOWN IS SHOWING" ───────────────
 *
 * It used to mean "next", which was the same thing until the countdown
 * could be pointed somewhere else. Now the emphasis follows the hero: pick
 * Isha in the morning and Isha is the row that lifts, because a highlight
 * that disagreed with the number above it would be worse than none.
 * `isChosen` adds the dot that says the choice was the user's.
 */
type PrayerRowProps = {
  prayerKey: string;
  rawTime: string;
  isNext: boolean;
  /** Picked by the user, rather than simply being the next one. */
  isChosen?: boolean;
  /** Absent for a row that cannot be aimed at — yesterday's, or passed. */
  onSelect?: () => void;
  /**
   * Non-salāh row (Sunrise, Islamic Midnight, Last Third) — rendered muted +
   * italic to read as a quieter, secondary entry beside the five daily prayers.
   */
  isSecondary: boolean;
  isLast: boolean;
  /**
   * When this prayer's preferred (ikhtiyārī) window closes — issue #19.
   *
   * Canonical `HH:mm`; the row formats it like every other clock. Absent
   * unless the user turned Mālikī second times on, and absent for a day
   * or a latitude where the sky does not produce the boundary.
   */
  daruriAt?: string;
  /**
   * Which window `daruriAt` closes — issue #38 (2). 'first' (the default)
   * is the preferred window, and the line reads "First time until"; once
   * that has passed on today's card the same line turns to the SECOND
   * window's end, "Second time until", so what is left of it is on the
   * row rather than nowhere. See `daruriRowState`.
   */
  daruriPhase?: 'first' | 'second';
  /**
   * True when that boundary is a model of something the eye judges — the
   * stars fading, the sun yellowing — rather than a solar position. The
   * row says "approx." for those, because printing all five in the same
   * confident type would claim more than the app knows.
   */
  daruriApprox?: boolean;
  /**
   * How this row announces itself, and the tap that cycles it. Absent
   * for a row that cannot be aimed at — yesterday's card, or the share
   * sheet — where a control that changes a setting has no business.
   */
  alertMode?: PrayerAlertMode;
  onCycleAlertMode?: () => void;
  /**
   * What THIS occurrence is set to, when the Live Activity's button has
   * put it on something other than the standing setting for this one
   * time. Absent — the usual case — means there is nothing to explain or
   * undo, and `alertMode` is the whole answer.
   *
   * Carried separately from `alertMode` because the two are shown in
   * different places and on different days. `alertMode` is the cycling
   * control, which only today's card has: a tap there changes every
   * Fajr, and that is not what a tap on tomorrow's row looks like it
   * does. This one belongs to a single instant, so it appears on
   * whichever day holds it — including tomorrow, which is where an
   * override set after Isha lands.
   */
  overrideMode?: PrayerAlertMode;
  /** What reset puts back: the row's standing setting. */
  standingAlertMode?: PrayerAlertMode;
  onResetAlertMode?: () => void;
  /**
   * The longest time on this card, which sizes the time column on EVERY
   * row of it.
   *
   * Without it the column is as wide as its own time, and the control
   * beside it moves with that width: on a 12-hour clock "11:09 PM" is a
   * digit wider than "5:36 AM", so one row's bell sat a digit to the left
   * of the other six. The card knows all the times, so it picks the
   * longest and hands the same string to every row.
   *
   * ── LONGEST IS NOT ALWAYS WIDEST ──────────────────────────────────
   *
   * The card compares string LENGTHS, which stands in for width only
   * while the numerals are tabular. `tabularNumeralStyle` asks for that,
   * but `fontVariant: ['tabular-nums']` is a request to the font, not a
   * guarantee: Android lets people choose a system font, and a
   * decorative one often ships no `tnum` table. The request then does
   * nothing, digits go back to their natural widths, and two times of
   * equal length no longer render equally wide.
   *
   * That is issue #26. On a handwriting system font the column was sized
   * by "00:46" and had to hold "02:23", which is wider in that face — so
   * the clock wrapped onto a second line mid-value ("02:2" / "3"), and
   * only on the rows whose digits happened to be the wide ones.
   *
   * So the sample is used only when it is genuinely longer than this
   * row's own time. At equal length the row sizes to its own time, which
   * is correct in any font. With tabular numerals every row's own time is
   * the same width and the column stays aligned exactly as before; with a
   * font that ignores the request, a row may sit a few pixels out of line
   * with its neighbours — which is the right thing to lose, because the
   * alternative is a prayer time broken across two lines.
   */
  timeSample?: string;
  /**
   * The card's other times: any of them may be the WIDEST.
   *
   * A row sized itself by the sample and by its own time, so a row whose
   * own time was wider than everything else stood alone at that width.
   * In Arabic on a 12-hour clock that is ʿAṣr: "12:52 م" is as long as
   * "11:40 ص" and wider, so its bell sat a few pixels out of the line the
   * other bells keep. Every row now carries each of these as a sizer with
   * no height, and the column is the widest of them on all rows alike.
   */
  timePeers?: readonly string[];
  /**
   * The Mālikī tag under the name instead of beside it — the card's
   * answer for all its rows, once one of them has reported
   * (`onDaruriWrap`) that the tag does not fit on the name's line.
   */
  daruriBelow?: boolean;
  onDaruriWrap?: () => void;
  /**
   * The check at the leading edge — today's five salāh only. `log` says
   * what today's journal holds for this prayer and where the clock is in
   * its window; `onToggleLog` records or un-records it (quickLog.ts).
   * Absent on secondary rows and on other days, where the slot is still
   * held so every name on the card starts on the same line.
   */
  log?: {
    status: LoggedStatus | null;
    phase: QuickLogPhase;
    /** The journal has been read — until then nothing can be recorded. */
    ready?: boolean;
  };
  onToggleLog?: () => void;
  /**
   * Whether this card has a check column at all. Today's does, so its
   * secondary rows hold the slot and every name starts on one line; the
   * other days have no checks and no slot — their names sit where they
   * always did. Reported: tomorrow's rows were indented for a control
   * that was not there.
   */
  hasCheckColumn?: boolean;
  /**
   * The page's size (homeBudget.ts). Roomy rows breathe a little more;
   * compact rows lose the air between them and keep the Mālikī line on
   * the current row alone — the one the eye is on — where the others'
   * is the same words five times. Same type, same columns, every tier.
   */
  tier?: HomeTier;
};

function PrayerRowImpl({
  prayerKey,
  rawTime,
  isNext,
  isChosen = false,
  onSelect,
  isSecondary,
  isLast,
  daruriAt,
  daruriPhase = 'first',
  daruriApprox = false,
  alertMode,
  onCycleAlertMode,
  overrideMode,
  standingAlertMode,
  onResetAlertMode,
  timeSample,
  timePeers,
  daruriBelow = false,
  onDaruriWrap,
  log,
  onToggleLog,
  hasCheckColumn = false,
  tier = 'comfortable',
}: PrayerRowProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();

  const shown = clock(rawTime);
  // The card's sample only when it really is longer — see `timeSample`.
  const sizingTime =
    timeSample && timeSample.length > shown.length ? timeSample : shown;

  const Row = onSelect ? Pressable : View;
  const interactive = onSelect
    ? {
        accessibilityRole: 'button' as const,
        accessibilityState: { selected: isChosen },
        accessibilityHint: isChosen
          ? t('a11y.countdownHere')
          : t('a11y.countdownTo'),
        onPress: onSelect,
      }
    : {};

  return (
    <Row
      {...interactive}
      style={[
        styles.row,
        tier === 'compact' && styles.rowCompact,
        tier === 'roomy' && styles.rowRoomy,
      ]}>
      {/* The current prayer's mark: the bar at the row's start, and the
          accent on its name and time. It had a tinted fill across the
          whole row as well — the one block in a table that is otherwise
          hairlines and type, and the bar already says "now". */}
      {isNext && (
        <View
          style={[styles.activeBar, { backgroundColor: palette.accent }]}
        />
      )}
      {/* An inset hairline, not a full-bleed one: the divider starts where
          the text does (redesign-plan P2). Drawn as a child so the current
          prayer's tinted fill still runs edge to edge above it. */}
      {!isLast && !palette.flatChrome ? (
        <View
          pointerEvents="none"
          style={[styles.divider, { backgroundColor: palette.border }]}
        />
      ) : null}
      {/* The checklist column. A salāh row on today's card carries the
          check; every other row holds its width, so the names line up
          whether or not there is anything to check. */}
      {log && onToggleLog ? (
        <View style={styles.lineBox}>
          <LogCheck
            status={log.status}
            phase={log.phase}
            ready={log.ready}
            palette={palette}
            prayerLabel={t(`prayer.${prayerKey}`)}
            onPress={onToggleLog}
          />
        </View>
      ) : hasCheckColumn ? (
        <View style={styles.checkSlot} />
      ) : null}
      <View style={styles.nameWrap}>
        {/* The name, and at the line's far end the Mālikī boundary as a
            short tag ("1st to 07:10"). It was a second line under the
            name: with it on, five rows of the table each grew by a line,
            and on a card already carrying the night times that was the
            hero's room. On the row's own line it costs no height, and it
            sits beside the bell and the time it is about. The whole
            sentence is still what a screen reader says. */}
        <View style={styles.nameLine}>
          <Text
            style={[
              styles.name,
              isSecondary && styles.nameSlanted,
              {
                color: isNext ? palette.accent : isSecondary ? palette.muted : palette.text,
                fontStyle: isSecondary ? 'italic' : 'normal',
              },
            ]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {isSecondary ? `\u2009${t(`prayer.${prayerKey}`)}\u2009` : t(`prayer.${prayerKey}`)}
          </Text>
          {daruriAt && !daruriBelow ? (
            <Text
              style={[styles.daruri, { color: palette.muted }]}
              // Wrapped onto a line of its own: it does not fit here. The
              // card moves every row's tag under its name.
              onLayout={e => {
                if (e.nativeEvent.layout.y > 4) onDaruriWrap?.();
              }}
              numberOfLines={1}
              accessibilityLabel={t(
                daruriPhase === 'second' ? 'prayer.secondTimeUntil' : 'prayer.firstTimeUntil',
                {
                  time: daruriApprox
                    ? `${t('prayer.approx', { defaultValue: 'approx.' })} ${clock(daruriAt)}`
                    : clock(daruriAt),
                },
              )}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
              testID={`daruri-${prayerKey}`}>
              {t(daruriPhase === 'second' ? 'prayer.secondTimeShort' : 'prayer.firstTimeShort', {
                // The clock keeps its own direction inside the sentence
                // (first-strong isolate): "5:31 م" stays as the time
                // column writes it, in an Arabic line or a Latin one.
                // The "~" rides inside with it: outside, an Urdu line put
                // it after "7:18 AM" instead of before.
                time: `\u2068${daruriApprox ? '~' : ''}${clock(daruriAt)}\u2069`,
                interpolation: { escapeValue: false },
              })}
            </Text>
          ) : null}
        </View>
        {/* Under the name, where the card has found the tags do not fit
            beside it — on every row that has one. The smallest layout
            used to keep this line on the current prayer alone, which on a
            small phone read as the other four having no second time. */}
        {daruriAt && daruriBelow ? (
        <Text
            style={[styles.daruri, styles.daruriBelow, { color: palette.muted }]}
            numberOfLines={1}
            accessibilityLabel={t(
              daruriPhase === 'second' ? 'prayer.secondTimeUntil' : 'prayer.firstTimeUntil',
              {
                time: daruriApprox
                  ? `${t('prayer.approx', { defaultValue: 'approx.' })} ${clock(daruriAt)}`
                  : clock(daruriAt),
              },
            )}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
            testID={`daruri-${prayerKey}`}>
            {t(daruriPhase === 'second' ? 'prayer.secondTimeShort' : 'prayer.firstTimeShort', {
              // The clock keeps its own direction inside the sentence
              // (first-strong isolate): "5:31 م" stays as the time
              // column writes it, in an Arabic line or a Latin one.
              // The "~" rides inside with it: outside, an Urdu line put
              // it after "7:18 AM" instead of before.
              time: `\u2068${daruriApprox ? '~' : ''}${clock(daruriAt)}\u2069`,
              interpolation: { escapeValue: false },
            })}
          </Text>
        ) : null}
        {/* Under the name for the same reason the line above is, and for
            one more: the trailing edge is a COLUMN, aligned across every
            row of the card. A control that appeared on one row would push
            that row's bell and time out of line with the other six — the
            defect the held dot slot and the sizing sample below both
            exist to prevent. See AlertOverrideChip. */}
        {overrideMode && standingAlertMode && onResetAlertMode ? (
          <AlertOverrideChip
            mode={overrideMode}
            standingMode={standingAlertMode}
            palette={palette}
            onPress={onResetAlertMode}
            prayerLabel={t(`prayer.${prayerKey}`)}
          />
        ) : null}
      </View>
      {/* The control and the time travel together on the trailing edge.
          The row is `space-between`, so a third child left loose in the
          middle floats there — halfway between the name and the time,
          belonging to neither. Grouped, it reads as what it is: a
          setting about THIS time, next to it. */}
      <View style={styles.trailing}>
        {alertMode && onCycleAlertMode ? (
          <View style={styles.lineBox}>
            <AlertModeButton
              mode={alertMode}
              palette={palette}
              onPress={onCycleAlertMode}
              prayerLabel={t(`prayer.${prayerKey}`)}
              secondary={isSecondary}
              // The accent only where this prayer differs from the standing
              // setting: a list on the default reads quiet, and the one Fajr
              // set differently is what stands out (redesign-plan §3.1).
              emphasised={!!overrideMode}
            />
          </View>
        ) : null}
        {/* Only for a row the user aimed at. The next prayer is already
            emphasised, and marking it too would say nothing.

            Its slot is held on every row, dot or no dot: it sits between
            the control and the time, so a slot that appeared only on the
            chosen row would slide that row's control left — the same
            misalignment the sizing sample below exists to prevent. */}
        <View
          style={[
            styles.chosenDot,
            isChosen && { backgroundColor: palette.accent },
          ]}
        />
        <View style={styles.timeCol}>
          {/* Invisible, and hidden from screen readers: it is here only
              to give the column a width. It carries this row's own time,
              or the card's sample when that is longer, at the heaviest
              weight the column ever uses — so the real time below can
              never outgrow it whatever the font does with `tnum`. */}
          <Text
            aria-hidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[styles.time, tabularNumeralStyle, styles.timeSampleRoom, styles.timeSample]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {sizingTime}
          </Text>
          {/* …and this row's own time, at the heaviest weight, with no
              height: the column is then the WIDER of the two, not the
              longer. Length stands in for width only in Latin: in Arabic
              "6:01 ص" is shorter than "12:57 م" and still wider, because
              ص is twice the width of م — so the bold next-prayer time did
              not fit the column sized for the other and lost its ص to an
              ellipsis (#71). */}
          <Text
            aria-hidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[styles.time, tabularNumeralStyle, styles.timeSampleRoom, styles.timeSample, styles.timeOwnWidth]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {shown}
          </Text>
          {timePeers?.map(peer =>
            peer === shown || peer === sizingTime ? null : (
              <Text
                key={peer}
                aria-hidden
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={[styles.time, tabularNumeralStyle, styles.timeSampleRoom, styles.timeSample, styles.timeOwnWidth]}
                numberOfLines={1}
                maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                {peer}
              </Text>
            ),
          )}
          <Text
            style={[
              styles.time,
              tabularNumeralStyle,
              styles.timeReal,
              {
                color: isNext
                  ? palette.accent
                  : isSecondary
                    ? palette.muted
                    : palette.text,
              },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {shown}
          </Text>
        </View>
      </View>
    </Row>
  );
}

export const PrayerRow = memo(PrayerRowImpl);

const styles = StyleSheet.create({
  // The row's inset is the hero's: its name begins where the hero's text
  // does and its time ends where the hero's rail does (`SPACING.xl` on
  // both sides), and the row itself runs edge to edge — the current
  // prayer's tint and the bar at its start reach the screen's edge. It
  // used to sit a step in on both sides, inside the ghost of the card it
  // was drawn in before the page went full-bleed.
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: ROW_PAD.comfortable,
    paddingHorizontal: SPACING.xl,
    position: 'relative',
  },
  rowCompact: { paddingVertical: ROW_PAD.compact },
  rowRoomy: { paddingVertical: ROW_PAD.roomy },
  // Inset to the same edge as the text above it, on both sides.
  divider: {
    position: 'absolute',
    bottom: 0,
    start: SPACING.xl,
    end: SPACING.xl,
    height: StyleSheet.hairlineWidth,
  },
  nameWrap: {
    flexShrink: 1,
    flexGrow: 1,
  },
  // The check and the bell are taller than the row's line of text, and a
  // row that carried them (today's) stood 7 px taller than one that did not
  // (any other day's): the table changed size as the day was paged. Each
  // sits in a box the height of the line, centred and overflowing it into
  // the row's own padding, so every day's row is the text's.
  lineBox: {
    height: labelLineHeight(TYPE.title3.fontSize),
    justifyContent: 'center',
  },
  checkSlot: { width: LOG_CHECK_SIZE, marginEnd: SPACING.md },
  // No `gap`: the dot's slot carries the spacing on both of its sides, so
  // the control-to-time distance is the same whether the dot is drawn or
  // not.
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // One line: the name and, at its far end, the tag…
  // …and where the two do not fit on one line — a narrow phone, a large
  // text size, a long name — the tag goes under the name whole, as it
  // used to sit, instead of being cut mid-time on the line it was moved
  // to. `maxWidth` is for the size at which it does not fit there either.
  nameLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  daruri: {
    fontSize: TYPE.caption.fontSize,
    lineHeight: labelLineHeight(TYPE.caption.fontSize),
    flexShrink: 0,
    maxWidth: '100%',
    marginStart: SPACING.sm,
    // And the tag keeps its distance from the bell, for the same reason.
    marginEnd: SPACING.lg,
  },
  daruriBelow: {
    marginTop: 2,
    marginStart: 0,
    marginEnd: 0,
  },
  // Inset, rounded indicator pill instead of a full-bleed block — reads
  // as a quieter, more refined "current" marker against the tinted row.
  activeBar: {
    position: 'absolute',
    start: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopEndRadius: 3,
    borderBottomEndRadius: 3,
  },
  // The line is the Latin one in every script (`labelLineHeight`). Left to
  // the font, an Arabic, Bengali or Devanagari name made its row several
  // points taller than the same row in English, and six rows of that came
  // out of the hero above.
  name: { fontSize: TYPE.title3.fontSize, lineHeight: labelLineHeight(TYPE.title3.fontSize) },
  // A slanted name leans out past the width its letters measure to, and
  // Android cuts a text there: "الشروق" lost the top of its first letter
  // at the right edge. Padding does not help — the cut is at the text's
  // own measure, not the view's — so the name is written between two
  // thin spaces (a fifth of an em, the room the lean needs), and this
  // takes that width back so the name still starts on the column's line.
  nameSlanted: { marginHorizontal: -4 },
  chosenDot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.xs,
    // Tight: the bell belongs to the time beside it. With the slot at its
    // old 26 dp the bell stood nearer the Mālikī tag on its other side
    // than the time it sets the alert for — plainest in Arabic, where a
    // "م" time is narrower than the column and sits further off still.
    marginStart: SPACING.xs,
    marginEnd: SPACING.xs,
    backgroundColor: 'transparent',
  },
  timeCol: { justifyContent: 'center' },
  // The column's one weight: the accent alone marks the current time.
  timeSample: { opacity: 0 },
  // A hair of room at the leading edge. The time laid over the sizer
  // measures to the same width, and Android rounds the two apart: in
  // Swedish ʿAṣr's "12:52 em", the one time on the card as wide as the
  // column, lost its "m" to an ellipsis.
  timeSampleRoom: { paddingStart: 2 },
  // Width without height: see the own-time sizer above.
  timeOwnWidth: { height: 0, overflow: 'hidden' },
  // Laid over the sample, flush with the trailing edge — `end`, so it is
  // the right edge in English and the left in Arabic.
  timeReal: { position: 'absolute', top: 0, end: 0 },
  time: { fontSize: TYPE.title3.fontSize, lineHeight: labelLineHeight(TYPE.title3.fontSize) },
});
