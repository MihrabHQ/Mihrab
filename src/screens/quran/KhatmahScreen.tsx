/**
 * The khatmah's own page — issue: the Qur'an tab was a wall of controls.
 *
 * Everything the khatmah card on the Qur'an tab used to hold is here,
 * unchanged in what it does: the plan's account of itself (the book, the
 * day, the pace), the day's reading done, the options menu, the pacing
 * sheet, and — with no plan — the ways to start one. The tab keeps one
 * row that says where the plan stands and leads here (`KhatmahEntry`).
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useIslamicDay } from '../../hijri/useIslamicDay';
import {
  formatDeadline,
  KhatmahPacingSheet,
  type PacingKind,
} from '../../quran/KhatmahPacingSheet';
import { MUSHAF_TOTAL_PAGES } from '../../quran/mushafImages';
import { totalPagesForRiwayah } from '../../quran/pages';
import { useQuranState } from '../../quran/quranState';
import {
  activeKhatmah,
  khatmahReachAyah,
  khatmahUnreadPages,
  KHATMAH_TOTAL_AYAHS,
} from '../../quran/khatmahProgress';
import {
  khatmahDayAnchor,
  khatmahDatePassed,
  khatmahDeadline,
  planDays as khatmahPlanDays,
} from '../../quran/khatmahSchedule';
import {
  khatmahCanFinish,
  khatmahFinishTarget,
  khatmahDay,
  khatmahBehindBy,
  khatmahDaysLeft,
  khatmahPaceOutgrown,
  khatmahPerDayPages,
  khatmahPages,
} from '../../quran/khatmahStatus';
import {
  abandonKhatmah,
  finishKhatmahPortion,
  setKhatmahDeadline,
  setKhatmahDuration,
  resetKhatmahAll,
  resetKhatmahToday,
  startKhatmah,
  stepKhatmahBack,
} from '../../quran/khatmahActions';
import { formatDayWhen, khatmahDayWhen } from '../../quran/khatmahDayWhen';
import type { RootStackParamList } from '../../navigation/types';
import { useBreakpoint } from '../../responsive/breakpoints';
import { useTabBarInset } from '../../navigation/tabBarInset';
import { cardEdgeStyle } from '../../theme/chrome';
import { TYPE } from '../../theme/typography';
import { RADIUS, SPACING } from '../../theme/tokens';

export function KhatmahScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const keyboardInset = useKeyboardInset();
  const quran = useQuranState();
  const wide = useBreakpoint() !== 'compact';
  const tabBarInset = useTabBarInset();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [khatmahMenuVisible, setKhatmahMenuVisible] = useState(false);
  // Custom khatmah length (v2.7.31) — the 30/60/90 presets plus a
  // free-form day count entered in a small modal.
  const [customDaysVisible, setCustomDaysVisible] = useState(false);
  /**
   * The pacing sheet — making a plan, or re-pacing the live one.
   *
   * `kind` is only where it OPENS: the segment inside it switches freely,
   * so a reader who tapped "By a date…" can still come out having chosen
   * a length, and the card's day chips are the same choice made without
   * opening anything.
   */
  const [pacingSheet, setPacingSheet] = useState<{
    mode: 'start' | 'change';
    kind: PacingKind;
  } | null>(null);
  const [customDaysText, setCustomDaysText] = useState('');
  // Blank means "from the opening", which is what most khatmahs are.
  const [customFromText, setCustomFromText] = useState('');
  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
  const plan = activeKhatmah(quran);
  // The day's portion turns at maghrib, and no state this screen holds
  // turns with it.
  useIslamicDay();
  // The day's portion, how much of it is read, and anything read past it.
  const day = plan ? khatmahDay(plan) : null;
  // The day "done" would finish, or null when pressing would do nothing
  // (only skipped pages left: `khatmahCanFinish`). Worked out once.
  const finishDay = plan && khatmahCanFinish(plan) ? khatmahFinishTarget(plan).day : null;
  // And the same thing in pages, of the muṣḥaf this reader is in — see
  // `khatmahPages`. A page is the unit a reader plans in; an ayah count
  // is a number nobody can picture.
  const pages = plan ? khatmahPages(plan, quran.prefs.riwayah) : null;
  const daysLeft = plan ? khatmahDaysLeft(plan) : 0;
  /**
   * THE ONE NUMBER ON THIS CARD THAT IS THE CALENDAR'S (issue #53).
   *
   * `daysLeft` counts PORTIONS remaining, not days until a date — a plan
   * is a duration here, and skipping a day does not spend one. That is
   * deliberate and it is why nothing re-cuts itself at midnight. But the
   * card said "18 days left" on a plan whose thirtieth day falls in
   * fourteen, and a reader has no way to hear that as anything but a
   * countdown, so it read as a frozen counter rather than a different
   * question being answered.
   *
   * The deficit was already computed and already on the WIDGET. It just
   * never reached the screen the reader is looking at, which left the
   * widget the more honest of the two surfaces.
   */
  const behindPages = plan ? khatmahBehindBy(plan) : 0;
  /**
   * THE DEADLINE MODE'S OWN NUMBERS (issue #53).
   *
   * `deadline` is the plan's mode: with one, `daysLeft` above is already
   * the calendar's answer and `behindPages` is deliberately zero — the
   * missed reading is inside today's quota rather than beside it. What
   * the card adds here is the pace itself, which is the same fact said
   * forwards, and the date it is paced to.
   */
  const deadline = plan ? khatmahDeadline(plan) : null;
  /**
   * In the reader's OWN muṣḥaf, like every other page count on this card.
   * The cut behind them is made in Ḥafṣ pages and does not move when the
   * riwayah does; these two are the sentence about it, and a sentence
   * counting Ḥafṣ pages at someone reading Warsh is quietly wrong by a
   * page here and there all the way down the book.
   */
  const perDayPages =
    plan && deadline ? khatmahPerDayPages(plan, Date.now(), quran.prefs.riwayah) : 0;
  const unreadPages = plan
    ? khatmahUnreadPages(plan, quran.prefs.riwayah)
    : totalPagesForRiwayah(quran.prefs.riwayah);
  // Asked of the DATE. `daysLeft` is zero for a finished khatmah too, and
  // deriving it from that told a reader who had just completed one that
  // they were late for it.
  const deadlinePassed = plan != null && khatmahDatePassed(plan);
  /**
   * WHEN THE PACE HAS OUTGROWN THE READER, SAY SO — AND OFFER A DATE.
   *
   * The rule, and the reason there are two halves to it, is with
   * `khatmahPaceOutgrown`: a plan being kept must never trigger it, and a
   * plan that never fitted should be caught early rather than at the end.
   * All this line does is decide whether to say it.
   */
  const paceOutgrown =
    plan != null && !deadlinePassed && khatmahPaceOutgrown(plan);
  const deadlineLabel = useMemo(
    () => (deadline ? formatDeadline(deadline, i18n.language) : ''),
    [deadline, i18n.language],
  );
  // The reach, like the rest of the card: the bar must not wind back to a
  // hole the card is separately offering to send the reader to.
  const readAyahs = plan ? khatmahReachAyah(plan) : 0;

  /**
   * Start the plan the sheet describes.
   *
   * A blank or unusable page means "from the opening" rather than an
   * error: the field is an addition to the sheet, not a hurdle in front
   * of it, and a khatmah nobody could start because they typed the wrong
   * thing in an optional box is worse than one that starts at page one.
   */
  const startCustomKhatmah = useCallback(() => {
    const n = Number(customDaysText);
    if (!Number.isFinite(n) || n < 1) return;
    const total = totalPagesForRiwayah(quran.prefs.riwayah);
    const raw = Number(customFromText);
    const from =
      customFromText.trim() !== '' && Number.isFinite(raw) && raw >= 2
        ? { page: Math.min(total, Math.round(raw)), riwayah: quran.prefs.riwayah }
        : undefined;
    // A khatmah can't be shorter than a day per page-set beyond the
    // mushaf itself — clamp to 1..604 days.
    startKhatmah(Math.min(604, Math.round(n)), from);
    setCustomDaysVisible(false);
  }, [customDaysText, customFromText, quran.prefs.riwayah]);

  // The plan is gone (deleted, or finished): there is nothing left on this
  // page to look at, and the tab is where a new one is started from.
  const closeAfter = useCallback(
    (action: () => void) => {
      action();
      navigation.goBack();
    },
    [navigation],
  );

  return (
    <>
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarInset + SPACING.xl },
        wide ? styles.contentWide : null,
      ]}>
      <View
        style={[
          styles.khatmahCard,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        {plan && pages && day ? (
          <>
            <View style={styles.khatmahTop}>
              <Text style={[styles.khatmahTitle, { color: palette.text }]}>
                {t('quran.khatmah', 'Khatmah')}
              </Text>
              <Text style={[styles.khatmahMeta, { color: palette.muted }]}>
                {[
                  // A deadline plan counts DAYS to the date; a duration
                  // plan counts the portions it has left, which is a
                  // different question and reads the same way (#53).
                  deadlinePassed
                    ? t('quran.khatmahDatePassed', {
                        defaultValue: 'Date passed — {{count}} pages left',
                        count: unreadPages,
                      })
                    : t('quran.khatmahDaysLeft', {
                        defaultValue: '{{count}} days of reading left',
                        count: daysLeft,
                      }),
                  deadline && !deadlinePassed
                    ? t('quran.khatmahByDate', {
                        defaultValue: 'by {{date}}',
                        date: deadlineLabel,
                      })
                    : null,
                  // Only when there IS a deficit: a reader on schedule
                  // does not need telling they are not behind. A deadline
                  // plan never has one — the pace moved instead.
                  behindPages > 0
                    ? t('quran.khatmahBehindPages', {
                        defaultValue: '{{count}} pages behind',
                        count: behindPages,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {/* The book. The lighter run at its end is reading done past
                the day's portion — the accent at less strength, not a
                second colour (redesign-plan P6). */}
            <View style={[styles.khatmahTrack, { backgroundColor: palette.accentBg }]}>
              <View
                style={[
                  styles.khatmahFill,
                  {
                    backgroundColor: palette.accentSolid,
                    width: `${pct(readAyahs - day.extra, KHATMAH_TOTAL_AYAHS)}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.khatmahFill,
                  styles.khatmahFillExtra,
                  {
                    backgroundColor: palette.accentSolid,
                    width: `${pct(day.extra, KHATMAH_TOTAL_AYAHS)}%`,
                  },
                ]}
              />
            </View>
            {/* Pages, not ayahs. The bar above is drawn from the ayah
                count because that is what progress is KEPT in and what
                every riwayah agrees on; the sentence under it is for a
                person, and a person plans in pages. */}
            <Text style={[styles.khatmahMeta, { color: palette.muted }]}>
              {t('quran.khatmahPageProgress', {
                defaultValue:
                  '{{pages}} pages left · day {{day}} of {{days}}',
                pages: pages.remaining,
                day: day.portion.day,
                // The plan's length, which on a deadline plan is the
                // calendar's and not the number it was made with.
                days: khatmahPlanDays(plan),
              })}
            </Text>

            {/* THE PACE, on a plan that has a date to keep (#53). The
                number that moves when a day is missed — said forwards,
                as what today asks for, rather than backwards as a debt. */}
            {deadline ? (
              <Text style={[styles.khatmahMeta, { color: palette.muted }]}>
                {paceOutgrown || deadlinePassed ? (
                  <>
                    {t('quran.khatmahPaceNow', {
                      defaultValue: 'That is {{count}} pages a day now.',
                      count: perDayPages,
                    })}{' '}
                    <Text
                      accessibilityRole="button"
                      // Named for a screen reader, which cannot see that
                      // the sentence before it is about the pace.
                      accessibilityLabel={t(
                        'quran.khatmahMoveDateA11y',
                        'Change the date this khatmah is paced to',
                      )}
                      onPress={() =>
                        setPacingSheet({ mode: 'change', kind: 'date' })
                      }
                      style={{ color: palette.accentSolid, fontWeight: '600' }}>
                      {t('quran.khatmahMoveDate', 'Move the date?')}
                    </Text>
                  </>
                ) : (
                  t('quran.khatmahPerDayToFinish', {
                    defaultValue: '{{count}} pages a day to finish on time',
                    count: perDayPages,
                  })
                )}
              </Text>
            ) : null}

            {/* The day. Its own portion, and anything read past it. */}
            <View style={styles.khatmahDayRow}>
              <Text
                style={[
                  styles.khatmahDayLabel,
                  { color: day.done ? palette.accentSolid : palette.text },
                ]}>
                {day.done
                  ? t('quran.khatmahDayDone', {
                      defaultValue: "✓ Today's reading done",
                    })
                  : t('quran.khatmahPagesLeftToday', {
                      defaultValue: '{{count}} pages left today',
                      count: Math.max(1, pages.leftToday),
                    })}
              </Text>
              {pages.extraToday > 0 ? (
                <Text
                  style={[styles.khatmahMeta, { color: palette.muted }]}>
                  {t('quran.khatmahExtraPages', {
                    defaultValue: '+{{count}} pages extra',
                    count: pages.extraToday,
                  })}
                </Text>
              ) : null}
            </View>
            <View style={[styles.khatmahTrack, { backgroundColor: palette.accentBg }]}>
              <View
                style={[
                  styles.khatmahFill,
                  {
                    backgroundColor: palette.accentSolid,
                    width: `${pct(day.read, day.length + day.extra)}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.khatmahFill,
                  styles.khatmahFillExtra,
                  {
                    backgroundColor: palette.accentSolid,
                    width: `${pct(day.extra, day.length + day.extra)}%`,
                  },
                ]}
              />
            </View>
            {/* One primary — the day's reading done — and the rest behind
                "more". The way INTO the plan is the doors card above this
                one (#41), so this card is the plan's own account of itself
                and the button is what changes that account. */}
            <View style={styles.khatmahActions}>
              {/* Not when pressing would do nothing: with only skipped
                  pages left the last portion is already read
                  (`khatmahCanFinish`), and the Home door says what is. */}
              {finishDay != null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('quran.khatmahMarkDone', {
                    day: finishDay,
                    defaultValue: "Mark day {{day}}'s reading done",
                  })}
                  onPress={finishKhatmahPortion}
                  style={[styles.khatmahBtn, { backgroundColor: palette.accentSolid }]}>
                  <Text
                  style={[styles.khatmahBtnLabel, { color: palette.onAccent }]}
                  numberOfLines={1}>
                    {/* The strings carry a leading "✓" from when this was the
                        only filled button on the card; a secondary button
                        does not need to shout it, and the glyph was what
                        pushed the label into an ellipsis at 2 : 3. */}
                    {(day.done
                      ? t('quran.khatmahMarkNext', {
                          day: finishDay,
                          // Which day that is, in calendar terms — a plan's
                          // day number says nothing on its own.
                          when: formatDayWhen(
                            khatmahDayWhen(
                              // Not the plan's birthday: a re-paced plan's
                              // day numbers were recut, and counting them
                              // from the start would call tomorrow today.
                              khatmahDayAnchor(plan),
                              finishDay,
                            ),
                            (key: string, opts: { defaultValue: string }) =>
                              t(key, opts) as string,
                            i18n.language,
                          ),
                          defaultValue: '✓ Finish day {{day}} ({{when}}) too',
                        })
                      : t('quran.khatmahMarkToday', {
                          defaultValue: "✓ Today's reading done",
                        })
                    ).replace(/^✓\s*/, '')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahMore', 'More khatmah options')}
                onPress={() => setKhatmahMenuVisible(true)}
                hitSlop={8}
                style={[styles.khatmahMore, { borderColor: palette.border }]}>
                <Text style={[styles.khatmahMoreGlyph, { color: palette.muted }]}>
                  ⋯
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.khatmahTitle, { color: palette.text }]}>
              {t('quran.startKhatmah', 'Start a khatmah')}
            </Text>
            <View style={styles.khatmahChips}>
              {[30, 60, 90].map(days => (
                <Pressable
                  key={days}
                  accessibilityRole="button"
                  accessibilityLabel={t('quran.khatmahDays', {
                    defaultValue: '{{count}} days',
                    count: days,
                  })}
                  onPress={() => startKhatmah(days)}
                  style={[styles.chip, { borderColor: palette.border }]}>
                  <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: TYPE.footnote.fontSize }}>
                    {t('quran.khatmahDays', {
                      defaultValue: '{{count}} days',
                      count: days,
                    })}
                  </Text>
                </Pressable>
              ))}
              {/* The other way to say how long: a date rather than a
                  number of days, re-pacing itself as days are missed
                  (issue #53). Beside the durations, not instead of them. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahByDateTitle', 'Finish by a date')}
                onPress={() => setPacingSheet({ mode: 'start', kind: 'date' })}
                style={[styles.chip, { borderColor: palette.border }]}>
                <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: TYPE.footnote.fontSize }}>
                  {t('quran.khatmahByDateChip', 'By a date…')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahCustom', 'Custom…')}
                onPress={() => {
                  setCustomDaysText('');
                  setCustomFromText('');
                  setCustomDaysVisible(true);
                }}
                style={[styles.chip, { borderColor: palette.border }]}>
                <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: TYPE.footnote.fontSize }}>
                  {t('quran.khatmahCustom', 'Custom…')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
      {plan ? null : (
        <Text style={[styles.help, { color: palette.muted }]}>
          {t('quran.khatmahPacingHelp', {
            defaultValue:
              'A khatmah is paced either by a length — the portions wait for you — or by a date, which re-cuts what is left over the days that remain. You can move between the two at any point; nothing you have read is affected.',
          })}
        </Text>
      )}
    </ScrollView>

      {/* Khatmah reset menu (v2.7.28): today / whole plan / delete. */}
      <Modal
        visible={khatmahMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setKhatmahMenuVisible(false)}>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setKhatmahMenuVisible(false)}
        />
        {/**
         * CENTRED IN THE SAFE AREA, NOT PINNED TO A NUMBER.
         *
         * This card had no vertical anchor at all. When the anchor moved
         * out of `menuCard` into `menuCardResting` — so the keyboard-lifted
         * sheets could take one or the other — the other two dialogs were
         * given it and this one was not, so it sat at the top of the
         * window with its title drawn through the clock and the camera.
         *
         * Not `menuCardResting` either: "a quarter of the way down" is a
         * guess about how tall the card is, and this one is the tallest in
         * the app — five rows, two lines each, at whatever text size the
         * reader has chosen. So it is centred between the status bar and
         * the home indicator, and the rows scroll if they ever do not fit.
         * `box-none` lets a tap beside the card reach the backdrop, which
         * is what closes it.
         */}
        <View
          pointerEvents="box-none"
          style={[
            styles.menuCentre,
            {
              paddingTop: insets.top + SPACING.lg,
              paddingBottom: insets.bottom + SPACING.lg,
            },
          ]}>
        <View style={[styles.menuCardCentred, { backgroundColor: palette.card }]}>
          <Text style={[styles.menuTitle, { color: palette.text }]}>
            {/* Not only resets any more: the date this plan is paced to
                is changed from here too (issue #53). */}
            {t('quran.khatmahOptionsTitle', 'Khatmah options')}
          </Text>
          <ScrollView
            style={styles.menuRows}
            contentContainerStyle={styles.menuRowsContent}
            bounces={false}>
          {(
            [
              [
                t('quran.khatmahPrevDay', '‹ Previous day').replace(/^‹\s*/, ''),
                t(
                  'quran.khatmahPrevDayHelp',
                  "Undo today's mark and step back to the previous day's portion.",
                ),
                () => stepKhatmahBack(),
                false,
              ],
              [
                t('quran.khatmahPacingTitle', 'How it is paced'),
                /* What it is paced by NOW, and the other way it could be
                   — the row is the switch as much as it is the setting,
                   so it names both. */
                deadline
                  ? t('quran.khatmahPacingDateHelp', {
                      defaultValue:
                        'By {{date}} — what is left is re-cut every morning. Move it, or go back to a number of days.',
                      date: deadlineLabel,
                    })
                  : t('quran.khatmahPacingDaysHelp', {
                      defaultValue:
                        'A length rather than a date, so the portions wait for you. Change it, or finish by a date instead.',
                    }),
                () => setPacingSheet({ mode: 'change', kind: deadline ? 'date' : 'days' }),
                false,
              ],
              [
                t('quran.khatmahResetToday', "Reset today's reading"),
                t(
                  'quran.khatmahResetTodayHelp',
                  'Rewinds only the pages recorded today.',
                ),
                () => resetKhatmahToday(),
                false,
              ],
              [
                t('quran.khatmahResetAll', 'Restart the khatmah'),
                t(
                  'quran.khatmahResetAllHelp',
                  'Back to where the plan began, with a fresh schedule.',
                ),
                () => resetKhatmahAll(),
                false,
              ],
              [
                t('quran.khatmahDelete', 'Delete the khatmah'),
                t('quran.khatmahDeleteHelp', 'Removes the plan entirely.'),
                () =>
                  closeAfter(() => {
                    const p = activeKhatmah(quran);
                    if (p) abandonKhatmah(p.id);
                  }),
                true,
              ],
            ] as Array<[string, string, () => void, boolean]>
          ).map(([label, help, action, destructive]) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => {
                setKhatmahMenuVisible(false);
                action();
              }}
              style={[styles.menuRow, { borderColor: palette.border }]}>
              <Text
                style={{
                  color: destructive ? palette.danger : palette.text,
                  fontWeight: '600',
                  fontSize: TYPE.callout.fontSize,
                }}>
                {label}
              </Text>
              <Text style={{ color: palette.muted, fontSize: TYPE.label.fontSize, marginTop: 2 }}>
                {help}
              </Text>
            </Pressable>
          ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={() => setKhatmahMenuVisible(false)}
            style={styles.menuCancel}>
            <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </View>
        </View>
      </Modal>

      {/* Custom khatmah length (v2.7.31). */}
      {/* MOUNTED ONLY WHILE IT IS OPEN, and that is load-bearing: the
          sheet seeds its date from the plan's current one in `useState`,
          which runs when the component mounts. Left mounted with the
          screen it would have seeded on a screen that had no plan yet,
          and re-opening it on a dated plan would offer a date a month out
          instead of the one the reader already chose. */}
      {pacingSheet ? (
      <KhatmahPacingSheet
        visible
        mode={pacingSheet.mode}
        initialKind={pacingSheet.kind}
        current={pacingSheet.mode === 'change' ? deadline : null}
        // A plan being re-paced opens on the reading it has left, so the
        // first thing the reader sees is what they are changing FROM.
        currentDays={pacingSheet.mode === 'change' ? daysLeft : undefined}
        unreadPages={
          pacingSheet.mode === 'change' ? unreadPages : MUSHAF_TOTAL_PAGES
        }
        onClose={() => setPacingSheet(null)}
        onChoose={choice => {
          const opening = pacingSheet.mode === 'start';
          setPacingSheet(null);
          if (choice.kind === 'days') {
            /**
             * The same sentence either side of the plan's birth: "what is
             * left should take this many days". On a new plan that is the
             * whole book, which is `targetDays` as it always was; on a
             * live one the store solves for the length that leaves the
             * reader those days (`setKhatmahDuration`).
             */
            if (opening) startKhatmah(choice.days);
            else setKhatmahDuration(choice.days);
            return;
          }
          const by = choice.deadline;
          if (opening) {
            /**
             * A plan made from a date still carries a LENGTH, and it is
             * the length that date implies rather than a default thirty:
             * it is what the outgrown-pace line is measured against, and
             * what the plan falls back to if the date is ever taken off
             * by an older build.
             */
            const span = Math.max(
              1,
              Math.min(604, Math.round((Date.parse(`${by}T12:00:00`) - Date.now()) / 86_400_000) + 1),
            );
            startKhatmah(span, undefined, by);
            return;
          }
          setKhatmahDeadline(by);
        }}
      />
      ) : null}

      <Modal
        visible={customDaysVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomDaysVisible(false)}>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setCustomDaysVisible(false)}
        />
        <View
          style={[
            styles.menuCard,
            { backgroundColor: palette.card },
            // Top-anchored, so padding cannot lift it. Re-anchoring to
            // `bottom` puts the card just above the keyboard rather than
            // leaving an autoFocus field underneath it — a Modal on
            // Android does not resize. See useKeyboardInset.
            keyboardInset > 0
              ? { bottom: keyboardInset + SPACING.xl }
              : styles.menuCardResting,
          ]}>
          <Text style={[styles.menuTitle, { color: palette.text }]}>
            {t('quran.khatmahSetUpTitle', 'Start a khatmah')}
          </Text>
          <Text style={[styles.customFieldLabel, { color: palette.muted }]}>
            {t('quran.khatmahLengthTitle', 'Khatmah length (days)')}
          </Text>
          <TextInput
            value={customDaysText}
            onChangeText={setCustomDaysText}
            keyboardType="number-pad"
            autoFocus
            maxLength={3}
            accessibilityLabel={t('quran.khatmahLengthTitle', 'Khatmah length (days)')}
            placeholder="1–604"
            placeholderTextColor={String(palette.muted)}
            style={[
              styles.customDaysInput,
              { color: palette.text, borderColor: palette.border },
            ]}
            onSubmitEditing={startCustomKhatmah}
          />
          {/* Issue #17. A khatmah already under way has a place in it, and
              without somewhere to say so the tracker can only be started
              by someone at page one. Blank is the ordinary case, and the
              placeholder says so rather than making the reader work it
              out. The page is theirs — of the muṣḥaf they are reading —
              which is why the count beside it is `total`. */}
          <Text style={[styles.customFieldLabel, { color: palette.muted }]}>
            {t('quran.khatmahFromPageTitle', 'Already reading? Start at page')}
          </Text>
          <TextInput
            value={customFromText}
            onChangeText={setCustomFromText}
            keyboardType="number-pad"
            maxLength={3}
            accessibilityLabel={t(
              'quran.khatmahFromPageTitle',
              'Already reading? Start at page',
            )}
            placeholder={t('quran.khatmahFromPageHint', {
              defaultValue: 'From the beginning',
            })}
            placeholderTextColor={String(palette.muted)}
            style={[
              styles.customDaysInput,
              { color: palette.text, borderColor: palette.border },
            ]}
            onSubmitEditing={startCustomKhatmah}
          />
          <View style={styles.customDaysRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel', 'Cancel')}
              onPress={() => setCustomDaysVisible(false)}
              style={styles.menuCancel}>
              <Text style={{ color: palette.muted, fontWeight: '600' }}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.khatmahStartCta', 'Start')}
              onPress={startCustomKhatmah}
              style={styles.menuCancel}>
              <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
                {t('quran.khatmahStartCta', 'Start')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md },
  contentWide: { maxWidth: 640, alignSelf: 'center', width: '100%' },
  help: { fontSize: TYPE.caption.fontSize, lineHeight: 17, paddingHorizontal: SPACING.xs },
  khatmahCard: { padding: SPACING.lg, borderRadius: RADIUS.md, gap: SPACING.sm },
  khatmahTop: { flexDirection: 'row', justifyContent: 'space-between' },
  khatmahTitle: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  khatmahMeta: { fontSize: TYPE.label.fontSize, fontVariant: ['tabular-nums'] },
  khatmahTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  khatmahFill: { height: '100%' },
  khatmahFillExtra: { opacity: 0.45 },
  khatmahMore: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khatmahMoreGlyph: { fontSize: TYPE.title3.fontSize, fontWeight: '700', lineHeight: 20 },
  khatmahDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  khatmahDayLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '700' },
  khatmahChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  customDaysInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPE.title3.fontSize,
    fontVariant: ['tabular-nums'],
    marginTop: SPACING.xs,
  },
  customFieldLabel: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
    marginTop: SPACING.md,
  },
  customDaysRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
  },
  khatmahActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  khatmahBtn: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  khatmahBtnLabel: { fontWeight: '700', fontSize: TYPE.footnote.fontSize },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menuCard: {
    position: 'absolute',
    // rtl-safe: a dialog pinned to both edges — symmetric, direction-agnostic
    left: 24,
    right: 24,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  menuCardResting: { top: '25%' },
  menuCentre: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    // rtl-safe: symmetric on both edges, the same 24 the pinned cards use
    paddingHorizontal: 24,
  },
  menuCardCentred: {
    maxHeight: '100%',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  menuRows: { flexGrow: 0, flexShrink: 1 },
  menuRowsContent: { gap: SPACING.md },
  menuTitle: { fontSize: TYPE.title3.fontSize, fontWeight: '700', marginBottom: SPACING.xs },
  menuRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  menuCancel: { alignItems: 'center', paddingVertical: SPACING.sm },
});
