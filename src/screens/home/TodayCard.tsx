/**
 * Home's single "today" card (design review 2a).
 *
 * Replaces four floating slabs — hero, day table, carousel dots, month link —
 * with one object, in the order a person actually reads it:
 *
 *   how long have I got  →  which day am I looking at  →  the times
 *
 * That ordering is the whole point of the change. The old hero answered the
 * wrong question (64pt "12:59", a 14pt "in 3h 24m" pill) and then the table
 * repeated the same prayer one row down; the day switcher was six 6-px dots
 * wedged between two cards, which nobody swipes because they cannot see its
 * edge.
 *
 * The hero adapts rather than lies: a countdown only means something for
 * today, so on any other day that slot becomes the date, the hijri date and
 * the day's first prayer — same position, honest content. For the same
 * reason the next-prayer highlight and its rail appear only on today; on
 * Saturday nothing is next, so nothing is emphasised.
 *
 * Both gestures drive one selection: tap a chip, or swipe the card body the
 * way the carousel used to work.
 */
import { useWebScrollSettle } from '../../hooks/useWebScrollSettle';
import { useMinimalOffered } from '../../settings/useMinimalOffered';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type HostInstance,
} from 'react-native';
import { useWindowSize } from '../../responsive/windowSize';
import { rememberedTodayLayout, rememberTodayLayout } from './todayLayoutMemory';
import Svg, { Path } from 'react-native-svg';
import { MinimalGlyph } from './MinimalGlyph';
import { useTranslation } from 'react-i18next';
import { useIsOnScreen } from '../../hooks/useIsActive';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useLaunchRunActive } from '../../boot/launchWarp';
import { useAfterFirstPaint } from '../../boot/firstPaint';
import { holdLaunchSnapshot, setLaunchRunWanted } from '../../native/LaunchSnapshot';
import { registerPoseHero } from '../../boot/poseHero';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import {
  cycleAlertModePatch,
  shownAlertMode,
  type PrayerAlertMode,
} from '../../settings/alertModes';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import { TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS } from '../../types/prayer';
import {
  DARURI_CONFIDENCE,
  DARURI_KEYS,
  daruriRowState,
  type DaruriKey,
} from '../../prayer/daruriTimes';
import { lastTimeOfDay } from '../../prayer/dayRollover';
import type { TimingsMap } from '../../types/prayer';
import { addDays, eventAt, onClock, startOfLocalDay } from '../../utils/prayerTimes';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { desktopLayout } from '../../responsive/breakpoints';
import {
  isSalah,
  quickLogPhase,
  useQuickLog,
  type PassedPrayerAnswer,
} from '../../journal/quickLog';
import type { JournalPrayer } from '../../journal/journal';
import { pagerPosition } from './pagerPosition';
import { LogPassedPrayerSheet } from './LogPassedPrayerSheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { TodayTimesSheet, type TimesSheetDay, type TimesSheetRow } from './TodayTimesSheet';
import { pageRecess } from './MinimalSheet';
import { type SkyInkColors } from './skyModel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVerticalBarActions, useVerticalBar } from '../../native/VerticalBar';
import { QiblaChip } from './QiblaChip';
import { HelpMihrabChip } from './HelpMihrabChip';
import { PrayerRow } from './PrayerRow';
import {
  useNextAlertOverride,
  clearNextAlertOverride,
} from '../../notifications/adhanMute';
import { clearNativeAlertOverride } from '../../native/MihrabLiveActivity';
import { ymdLocal } from '../../notifications/scheduling';
import { QiblaChipCorner } from './QiblaChip';
import { HOME_TABLE_RADIUS } from './tokens';
import { SPACING } from '../../theme/tokens';
import { currentFontScale, HELP_CHIP_MAX_FONT_SCALE, HERO_FOOT_PAD, type HomeTier } from './homeBudget';
import { VerticalBarActionsBand } from '../../navigation/VerticalTabBar';

import { HeroToday, SWIPE_UP_PULL, SWIPE_UP_REACH } from './HeroToday';
import { styles } from './todayCardStyles';

// The launch run's steps, for the onboarding preview and the tests.
export { SKY_RUN_KEYFRAMES_MAX, SKY_RUN_STEPS } from './HeroToday';

/**
 * The day bar's step arrow: a stroked chevron, drawn rather than typed.
 *
 * It was the typographic ‹ › in a filled circle, which is two dated
 * idioms at once — a glyph whose weight and vertical placement belong to
 * a quotation mark, inside a button-shaped container the rest of this
 * screen stopped using in the redesign (redesign-plan P4: a control is
 * ink, not a box). This is the same 1.75pt round-capped stroke as the
 * check beside a prayer and the marks on the compass, with nothing behind
 * it and a generous hit slop instead.
 */
const CHEVRON_SIZE = 20;

/** How long the day line carries an answer to a tap it could not record. */
const HINT_MS = 2600;
function Chevron({ back, color }: { back: boolean; color: string }) {
  return (
    <Svg width={CHEVRON_SIZE} height={CHEVRON_SIZE} viewBox="0 0 20 20">
      <Path
        d={back ? 'M12.25 4.25 L6.5 10 L12.25 15.75' : 'M7.75 4.25 L13.5 10 L7.75 15.75'}
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}


/**
 * A door's room on the day bar with no door in it: the glyphs' 20 dp in
 * the steps' padding. It stands opposite a lone door (the calendar, or
 * the switch to Minimal) so the day between them sits in the middle.
 */
function DayBarSlot() {
  return (
    <View style={styles.dayStep} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={styles.dayStepGlyph} />
    </View>
  );
}

/**
 * The month's glyph: a calendar's leaf — two rings, a frame, a rule — in
 * the chevrons' stroke, so the three controls on the bar read as one set.
 */
function MonthGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M4 5.5h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5zM2.5 9.5h15M7 3.5v3.5M13 3.5v3.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export type TodayCardProps = {
  /** Today first, then the next six days. */
  week: TimingsMap[];
  /**
   * The days before today, nearest first — `past[0]` is yesterday — as
   * far back as the cache reaches. The table turns back through these
   * (a prayer missed on the day is logged where it happened, not on a
   * strip that only looked forward); the hero, the countdown and the
   * alerts never read them.
   */
  past?: TimingsMap[];
  /**
   * Today's times UNFILTERED — with Sunrise whatever the rows setting
   * says — for the sky, which needs the sunrise to know where dawn ends.
   * The rows themselves come from `week`, which carries only what is
   * drawn. Optional; the sky falls back to `week[0]`.
   */
  skyTimings?: TimingsMap;
  /** The reader's coordinates, for the moon's tilt — see skyFrame. */
  latitude?: number;
  longitude?: number;
  /**
   * The clock the days are written on — a zone, or absent for the phone's
   * (`DEVICE_CLOCK`). A saved place in another zone shows its own clock's
   * times, and every instant here is read on it.
   */
  dayClock?: string;
  nextInfo: { name: string; at: Date } | null;
  /** Changing this returns the strip to today (e.g. the user moved city). */
  resetKey: string;
  /** "Today", "Tomorrow", "Yesterday", else the weekday — for a11y. */
  getDayLabel: (dayOffset: number) => string;
  getDayDate: (dayOffset: number) => string;
  getHijriDate?: (dayOffset: number) => string;
  /** The weekday's name, whatever day it is — the line over the table. */
  getWeekday: (dayOffset: number) => string;
  onOpenMonth?: () => void;
  /**
   * Qibla bearing in degrees from true north, or null when there is no
   * fix yet. Passed in rather than computed here because this card is
   * presentational and the coordinates live in settings.
   */
  qiblaBearing?: number | null;
  /** Opens the compass screen from the hero chip. */
  onOpenQibla?: () => void;
  /**
   * Opens Settings → About → Help Mihrab from the chip above the
   * countdown. Phone hero only (it rides in the full-bleed top row's
   * props); absent, there is no chip.
   */
  onHelpMihrab?: () => void;
  /** Wide iPad/Mac dashboard: the hero gets more presence. */
  expanded?: boolean;
  /**
   * The phone layout: the hero runs to the top edge of the screen, under
   * the status bar, and carries the location chip and the Qibla chip in
   * its top row — the screen's own header is hidden. The day strip and
   * the rows sit on the page beneath it, not in a card.
   */
  fullBleed?: boolean;
  /**
   * Something is drawn above the hero — a permission banner (HomeScreen).
   * The hero is then not under the status bar: it neither pads for it nor
   * paints its glyphs, and the notice above does both.
   */
  bannerAbove?: boolean;
  /**
   * A tablet held upright (see `HOME_ROOMY_MIN_HEIGHT`): full-bleed, but
   * the hero does NOT grow into the page's slack.
   *
   * On a phone the hero takes whatever the table leaves, because that is
   * a few dozen points and the alternative is a band of nothing under the
   * rows. Here the slack is most of the screen: the same rule gave the
   * sky six hundred points of empty middle, sank the countdown to the
   * waist of the page, and left the hero's white status-bar ink over the
   * cream margin beside the column, where it cannot be read. So the hero
   * takes a measured height, keeps its corners, stays clear of the status
   * bar, and the column centres itself in the page instead.
   */
  roomy?: boolean;
  /**
   * The page's size — roomy, comfortable or compact — picked by the
   * budget (homeBudget.ts) for every segment at once. Comfortable where
   * nobody budgets (the dashboard, the book, a roomy tablet).
   */
  tier?: HomeTier;
  /**
   * The hero's height, given — a foldable standing in tabletop posture,
   * where the hero fills the upright half down to the hinge and the table
   * lies on the flat one (HomeScreen). Absent, the hero sizes itself.
   */
  heroHeight?: number;
  /**
   * A wide Android screen (a foldable open): the card runs the screen's
   * full width so the sky reaches both edges, and the hero's content and
   * the table keep to the phone's measure in the middle — this much in
   * from each side. Zero everywhere else.
   */
  sideInset?: number;
  /** The location chip for the hero's top row, drawn in the sky's ink. */
  renderLocation?: (ink: SkyInkColors, column?: boolean) => ReactNode;
  /**
   * Minimal (settings.minimalUi), on the phone: the hero is the whole
   * card — no chips, no day bar, no rows, no month link — and a drag up on it
   * opens the day's times (`onOpenTimes`). `footer` is its last line.
   */
  minimal?: boolean;
  footer?: string;
  /** Minimal: the tab bar's inset, which the sky runs on under. */
  footInset?: number;
  /** Minimal: the place, named in the times sheet, and where a tap on it goes. */
  placeLabel?: string;
  onOpenPlace?: () => void;
  /** Minimal: whose times these are, said once under the sheet's rows. */
  timesSource?: string;
};

/**
 * The countdown half of the hero, isolated so the clock tick re-renders one
 * small component instead of the strip and eight rows with it — the same
 * containment `NextPrayerCard` was built for.
 *
 * ── WHY IT TICKS EVERY SECOND, AND ONLY WHEN LOOKED AT ────────────────
 *
 * It used to tick every thirty, which is all minutes need. Seconds are
 * shown now, so the interval has to match them — and a second-by-second
 * setState on a tab nobody is looking at is a wake-up per second for
 * nothing. The interval exists only while this screen has focus, and the
 * clock is re-read on the way back in so the number is never stale for a
 * frame.
 */
const noop = () => {};


function TodayCardImpl({
  week,
  past,
  nextInfo,
  resetKey,
  getDayLabel,
  getDayDate,
  getHijriDate,
  getWeekday,
  onOpenMonth,
  qiblaBearing,
  onOpenQibla,
  onHelpMihrab,
  expanded = false,
  fullBleed = false,
  bannerAbove = false,
  roomy = false,
  tier = 'comfortable',
  heroHeight,
  sideInset = 0,
  renderLocation,
  skyTimings,
  latitude,
  longitude,
  dayClock,
  minimal: minimalWanted = false,
  footer,
  footInset = 0,
  placeLabel,
  onOpenPlace,
  timesSource,
}: TodayCardProps) {
  // Only the phone's full-bleed page has a minimal face; the dashboard
  // and the book keep their cards.
  const minimal = minimalWanted && fullBleed && !roomy;
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();
  const { settings, updateSettings } = usePrayerSettings();
  // The day bar's shortcut into Minimal: not on the Mac, nor beside an
  // iPhone's vertical bar, where Minimal stands down (useMinimalOffered).
  const minimalOffered = useMinimalOffered();
  /**
   * The prayer the user aimed the countdown at, or null for "whatever is
   * next".
   *
   * Null is not the same as pointing it at the next prayer: the next prayer
   * moves on its own, and someone who never chose should keep getting the
   * one that moves.
   */
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const rtl = isRtlLanguage(i18n.language);
  /**
   * What the page's measured sizes depend on, as one key for the sizes
   * kept from launch to launch (todayLayoutMemory.ts): the layout, the
   * window and its insets, the system text size, the language (an Arabic
   * line is taller than a Latin one), and the rows the day has. A launch
   * whose key matches the last opens on the sizes it settled on; one that
   * does not measures afresh.
   */
  const layoutWindow = useWindowSize();
  const layoutInsets = useSafeAreaInsets();
  const layoutToday: TimingsMap = week[0] ?? ({} as TimingsMap);
  const layoutRows = DISPLAY_ORDER.filter(key => layoutToday[key]);
  const layoutDaruri = DISPLAY_ORDER.filter(key => layoutToday[`${key}Daruri` as keyof TimingsMap]);
  const layoutKey = fullBleed
    ? [
        minimal ? 'minimal' : 'full',
        roomy ? 'roomy' : tier,
        expanded ? 'x' : '',
        `${Math.round(layoutWindow.width)}x${Math.round(layoutWindow.height)}`,
        `${Math.round(layoutInsets.top)}/${Math.round(layoutInsets.bottom)}`,
        currentFontScale().toFixed(2),
        i18n.language,
        bannerAbove ? 'b' : '',
        `${sideInset}/${footInset}`,
        layoutRows.join(','),
        layoutDaruri.join(','),
      ].join('|')
    : undefined;
  // Minimal: the day's times, in a sheet, on the day it is turned to —
  // today when opened, a day behind or ahead by its chevrons.
  const [timesOpen, setTimesOpen] = useState(false);
  const [sheetOffset, setSheetOffset] = useState(0);
  const onOpenTimes = useCallback(() => {
    setSheetOffset(0);
    setTimesOpen(true);
  }, []);
  const onCloseTimes = useCallback(() => setTimesOpen(false), []);
  // The sheet's rise, 0..1, owned here so the page recedes with it — and
  // so a drag up on the page can start the retreat before the sheet is
  // there (MinimalSheet).
  const sheetProgress = useRef(new Animated.Value(0)).current;
  // The turn of the face.
  // An aim outlives the face it was taken on: the full page's rows aim
  // the countdown (`aimAt`), and the eyebrow says "· chosen" with a tap to
  // let it go. Minimal has neither — its sheet's rows log, they do not
  // aim — so an aim taken on the full page and carried into Minimal
  // would count to a prayer the page never says it chose, with no way
  // back but waiting for it. The turn to Minimal lets the aim go.
  // The other way, the sheet goes with the face it belongs to, and the
  // rise it owns is put back at rest: left at 1 (Minimal turned off from
  // the sheet's own door), the next Minimal page came up receded.
  useEffect(() => {
    if (minimal) {
      setChosenKey(null);
    } else {
      setTimesOpen(false);
      sheetProgress.stopAnimation();
      sheetProgress.setValue(0);
    }
  }, [minimal, sheetProgress]);
  // The sheet goes with Today. It is a Modal — on Android a window of its
  // own, over everything — so it stayed up over the Month page and the
  // Qibla its own buttons open, and over whichever tab a swipe or a dot
  // turned to from under it, taking the taps meant for that page. Focus
  // alone, not the foreground: the app put away and brought back keeps
  // the sheet it had.
  const todayFocused = useIsOnScreen();
  useEffect(() => {
    if (!todayFocused) setTimesOpen(false);
  }, [todayFocused]);
  const lastSheetRows = useRef<TimesSheetRow[]>([]);
  const lastSheetDays = useRef<TimesSheetDay[]>([]);
  const reduceMotion = useReduceMotion();

  /**
   * The pages, in the order they are swiped: the past, oldest first, then
   * today and the week ahead. `selected` is an OFFSET from today — negative
   * behind it — so every rule below that says "offset === 0" still means
   * today; only the pager translates between offsets and page indices.
   */
  const pastDays = useMemo(() => past ?? [], [past]);
  const pages = useMemo(
    () => pastDays.slice().reverse().concat(week),
    [pastDays, week],
  );
  const pagesReversed = useMemo(() => pages.slice().reverse(), [pages]);
  const todayIndex = pastDays.length;
  const dayAt = useCallback(
    (offset: number): TimingsMap | undefined =>
      offset < 0 ? pastDays[-offset - 1] : week[offset],
    [pastDays, week],
  );

  /**
   * ── THE DAY THE CARD LANDS ON ─────────────────────────────────────
   *
   * Today, until today is over, and then tomorrow.
   *
   * The hero has always done this: the countdown looks at tomorrow too, so
   * the instant Ishāʾ passes it is pointed at tomorrow's Fajr. The table
   * was not, and stayed on the calendar day until midnight — so for the
   * whole evening the top of the screen counted down to a time the rows
   * beneath it did not contain, and the times anyone would actually plan
   * around were a swipe away with nothing saying so.
   *
   * "Over" is the LAST row of the card, which is not always Ishāʾ — with
   * #14's toggle on, the First Third of the night sits a couple of hours
   * after it. `dayIsSpent` takes the latest instant rather than the last
   * key, which also keeps the two pre-dawn night times (already behind us
   * on this card) from answering. It is not a setting: the way back is the
   * bar below, which says "Back to today" in the accent and is one tap.
   */
  const [spentTick, setSpentTick] = useState(0);
  const lastToday = useMemo(
    () => lastTimeOfDay(week[0] ?? {}, startOfLocalDay(new Date()), dayClock),
    [week, dayClock],
  );
  /**
   * Only with a tomorrow to land on. A one-day week — the offline cache
   * down to its last day — has nowhere to go, and a card that landed on a
   * page it did not have would be blank.
   */
  const spent =
    week.length > 1 && lastToday != null && Date.now() > lastToday.getTime();
  const landing = spent ? 1 : 0;
  /**
   * One timeout to the last time of the day, so the turn happens AT it
   * rather than at whatever else next re-renders the card. The same shape
   * as the Mālikī boundary tick below, and for the same reason: the card
   * carries no per-second clock and this does not add one.
   */
  useEffect(() => {
    if (!lastToday) return undefined;
    const ms = lastToday.getTime() - Date.now();
    if (ms <= 0) return undefined;
    const id = setTimeout(
      () => setSpentTick(n => n + 1),
      Math.min(ms + 250, 0x7fffffff),
    );
    return () => clearTimeout(id);
  }, [lastToday, spentTick]);

  /**
   * Where the card is turned to. Starts where the day says; a reader who
   * chooses a day keeps it.
   */
  const landedAtMount = useRef(landing).current;
  const [selected, setSelected] = useState(landedAtMount);
  // Turned to another day, the table is not the one a launch opens on:
  // not a screen to keep for the next launch's first frame.
  const turnedAway = selected !== landing;
  useEffect(() => {
    holdLaunchSnapshot('day-pager', turnedAway);
    return () => holdLaunchSnapshot('day-pager', false);
  }, [turnedAway]);
  /**
   * Whether a human has picked the day on show — a chevron, the swipe, or
   * the way back. Nothing below may move the table under someone who has.
   *
   * Set from the DRAG rather than from the settle: the pager reports a
   * programmatic scroll the same way it reports a finger, so reading the
   * settle would have the card's own turn count as the reader's choice and
   * pin it there.
   */
  const chose = useRef(false);
  const prevLanding = useRef(landing);
  // A new city (or a fresh week of data) forgets the choice, so the effect
  // below can put the table back where the day says.
  useEffect(() => {
    chose.current = false;
  }, [resetKey]);
  useEffect(() => setChosenKey(null), [resetKey]);
  // Never leave the selection pointing off either end. Clamped rather than
  // reset: a week that grew or shrank must not also undo the day the card
  // landed on.
  useEffect(() => {
    setSelected(s =>
      Math.max(-pastDays.length, Math.min(week.length - 1, s)),
    );
  }, [week.length, pastDays.length]);

  /**
   * The days are PAGES under one hero.
   *
   * The card used to swap its whole body for the chosen day — the sky and
   * the countdown for a date and a "first prayer" pill — which turned the
   * one living thing on the screen into a dead panel the moment anyone
   * looked at Wednesday. Now the hero is always today, and only the table
   * under the strip turns: a paged list, one day per page, that the strip
   * selects and tracks. Swiping the rows is the gesture the carousel
   * taught; tapping a chip scrolls there.
   *
   * The pager needs the width of a page, which is the width of the table,
   * so it is measured; until it is (the first frame, and in a test
   * renderer) today's table is drawn on its own.
   */
  const [pageWidth, setPageWidth] = useState(0);
  const onTableLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setPageWidth(prev => (prev === w ? prev : w));
  }, []);
  /**
   * ── THE PAGER IS AS TALL AS THE DAY ON SHOW ──────────────────────────
   *
   * A horizontal list is as tall as its tallest page, and the pages are
   * not all one height: a row with a line under it — an alert overridden
   * "just this once", a Mālikī second time — is a line taller, and that
   * line can be on any day of the two weeks. So the whole table, today's
   * included, took the tallest day's height, and the hero above it (which
   * fills what the table leaves) gave up that line; and since the lines
   * come with what loads after the first frame (the journal, the
   * override), the table grew and the hero shrank half a second into
   * every launch — the page settling in front of the reader, 19dp on a
   * Pixel 10 Pro (2.35). Each page reports its height, and the list is
   * held to the height of the page on show; a taller day gets its height
   * as it is turned to.
   */
  const [pageHeights, setPageHeights] = useState<Record<number, number>>(() => {
    const kept = layoutKey ? rememberedTodayLayout(layoutKey)?.table : undefined;
    return kept ? { [landedAtMount]: kept } : {};
  });
  const onPageLayout = useCallback((offset: number, e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setPageHeights(prev => (prev[offset] === h ? prev : { ...prev, [offset]: h }));
  }, []);
  const landedHeight = pageHeights[landedAtMount];
  useEffect(() => {
    if (layoutKey && landedHeight) rememberTodayLayout(layoutKey, { table: landedHeight });
  }, [layoutKey, landedHeight]);
  const pagerRef = useRef<FlatList<TimingsMap>>(null);
  /** Where a page sits along the scroll axis — see `pagerPosition`. */
  const pagePosition = useCallback(
    (index: number) => pagerPosition(index, pages.length, rtl),
    [rtl, pages.length],
  );
  const scrollToDay = useCallback(
    (offset: number, animated: boolean) => {
      if (pageWidth <= 0) return;
      pagerRef.current?.scrollToIndex({
        index: pagePosition(offset + todayIndex),
        animated,
      });
    },
    [pageWidth, todayIndex, pagePosition],
  );
  /**
   * ── THE PAGES MOVE UNDER A PAGER THAT DOES NOT ──────────────────────
   *
   * The pager is told where to open once, at mount (`initialScrollIndex`),
   * and after that keeps its scroll offset. But the pages are the days
   * behind us THEN today and the week, and the days behind arrive late: the
   * first paint (the on-device week, or a cache read) can have none, the
   * real load a week of them. Every page index then moves by that many while
   * the offset stays put, and the page on screen is another day's — seen on
   * a device as yesterday's rows, with yesterday's log, under a bar saying
   * "Tomorrow", until the day was turned by hand. (Right to left the pages
   * are counted from the other end, so a week that grows moves them too.)
   * So whenever the layout of pages changes, put the pager back on the day
   * the card is on — without animation: nothing moved for the reader.
   */
  const pagesLayoutKey = `${todayIndex}:${pages.length}`;
  const laidOutAs = useRef(pagesLayoutKey);
  useEffect(() => {
    if (laidOutAs.current === pagesLayoutKey) return;
    laidOutAs.current = pagesLayoutKey;
    scrollToDay(selected, false);
  }, [pagesLayoutKey, selected, scrollToDay]);
  const onPageSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const position = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      const offset = pagePosition(position) - todayIndex;
      setSelected(Math.max(-pastDays.length, Math.min(week.length - 1, offset)));
    },
    [pageWidth, todayIndex, pastDays.length, week.length, pagePosition],
  );
  // A browser sends no momentum end: settle on the scroll coming to rest.
  const webSettle = useWebScrollSettle(onPageSettled);
  const pageLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  // Today's times, which the hero, the countdown and the check column all
  // work from whatever day the table is turned to. Memoised because the
  // aim-and-countdown memos below depend on it.
  const timings = useMemo(() => week[0] ?? {}, [week]);

  /**
   * How each row announces itself, and the tap that cycles it — v2.14.5.
   *
   * Read through `alertModeFor` rather than straight from the map: the
   * map is sparse, and an absent row means "whatever the app did before
   * this control existed", which depends on whether an adhan is chosen.
   * Writing is a merge for the same reason — one row's answer must not
   * become an answer for all five.
   */
  /**
   * The row and the master switch cannot disagree — see `shownAlertMode`
   * and `cycleAlertModePatch`, which is where the rule lives and where it
   * is tested. Both directions: off silences every row without forgetting
   * what it was, and switching a row on turns the master back on.
   */
  const alertsEnabled = settings.notificationsEnabled;
  const alertModeOf = useCallback(
    (key: string): PrayerAlertMode =>
      shownAlertMode(
        key,
        settings.prayerAlertModes,
        settings.notificationSound !== 'default',
        alertsEnabled,
      ),
    [alertsEnabled, settings.prayerAlertModes, settings.notificationSound],
  );
  const cycleAlertMode = useCallback(
    (key: string) => {
      updateSettings(
        cycleAlertModePatch(
          key,
          alertModeOf(key),
          settings.prayerAlertModes,
          alertsEnabled,
        ),
      );
    },
    [alertModeOf, alertsEnabled, settings.prayerAlertModes, updateSettings],
  );
  const visibleRows = useMemo(
    () => DISPLAY_ORDER.filter(key => timings[key]),
    [timings],
  );
  /**
   * The one occurrence the Live Activity's button has put on a different
   * alert — and which row of THIS day, if any, that is.
   *
   * Matched on the event AND the day it falls on, which is what an
   * occurrence is: silencing tonight's Ishāʾ says nothing about
   * tomorrow's, and the name alone would put the marker on both.
   *
   * The day comes from `eventAt`, the scheduler's own answer to "when
   * does this row happen" — not from the card's date. The First Third of
   * the night belongs to the evening it starts in, so at a long summer
   * latitude it sits on this card while its instant is tomorrow's; asking
   * any other way named a different occurrence than the one the alert was
   * written against, and the marker never appeared for it at all.
   *
   * It follows the occurrence onto whichever card holds it, which after
   * Ishāʾ is tomorrow's.
   */
  const override = useNextAlertOverride();
  const overrideKeyFor = useCallback(
    (offset: number, dayTimings: TimingsMap, rows: readonly string[]): string | null => {
      if (!override) return null;
      // WITH NOTIFICATIONS OFF THERE IS NOTHING TO EXPLAIN. The master
      // switch has already made every row silent, so a line promising
      // "Alert just this once" would be promising an alert that cannot
      // happen. The override is inert, not gone: turn the switch back on
      // before that instant and the line returns with it.
      if (!alertsEnabled) return null;
      const base = addDays(startOfLocalDay(new Date()), offset);
      for (const key of rows) {
        if (key !== override.name) continue;
        if (ymdLocal(eventAt(key, dayTimings, base, dayClock)) !== override.date) continue;
        // AND ONLY WHEN IT STILL DIFFERS FROM THE ROW. An override is
        // written against an instant and the standing setting can move
        // under it: silence one Fajr from the card, then set the Fajr row
        // to silent here, and the two now say the same thing. Calling that
        // "just this once" would tell the reader their permanent change had
        // not taken. The card drops its own marker on the same test, and
        // the two must not disagree about whether anything is temporary.
        return override.mode === alertModeOf(key) ? null : key;
      }
      return null;
    },
    [override, alertsEnabled, alertModeOf, dayClock],
  );
  /**
   * What the row is set to when nobody has overridden it — what reset
   * puts back. Read the same way the cycling control reads it, master
   * switch included, so the word this promises matches the word that
   * appears once it is pressed.
   */
  const standingModeOf = alertModeOf;
  const resetOverride = useCallback(async () => {
    // Both copies. JS holds the one the scheduler reads; native holds the
    // one the card's button labels itself from, so clearing only this
    // side would leave the button still saying "· once" for a prayer the
    // app had just put back.
    await clearNextAlertOverride();
    await clearNativeAlertOverride();
  }, []);
  /**
   * The longest time on this card, which sizes the time column on all of
   * its rows — see `timeSample` in PrayerRow.
   *
   * Length is the comparison because two times in the same locale and
   * clock format differ only in how many digits they carry — but that
   * stands in for WIDTH only while the numerals really are tabular, and
   * `fontVariant: ['tabular-nums']` is a request a font is free to
   * ignore. A row therefore falls back to its own time when this sample
   * is no longer than it (issue #26, and the long note in PrayerRow).
   */
  const timeSampleFor = useCallback(
    (dayTimings: TimingsMap, rows: readonly string[]) =>
      rows.reduce((widest, key) => {
        const shown = clock(dayTimings[key]);
        return shown.length > widest.length ? shown : widest;
      }, ''),
    [clock],
  );
  /** Which way the day bar can step, and whether it is on today. */
  const onToday = selected === 0;
  const canGoBack = selected > -pastDays.length;
  const canGoForward = selected < week.length - 1;
  const handleSelect = useCallback(
    (offset: number) => {
      chose.current = true;
      setSelected(offset);
      scrollToDay(offset, true);
    },
    [scrollToDay],
  );
  /**
   * Put the table where the day says, and take the pager with it.
   *
   * Three occasions, one rule: the first frame, a new city or a fresh week
   * (`resetKey`), and the moment the last time of the day passes. Never
   * once a human has chosen a day — the `chose` guard above — because a
   * table that moved under a reader looking at Thursday would be the card
   * overruling them to show them something they did not ask for.
   */
  useEffect(() => {
    if (chose.current) return;
    const wasHere = prevLanding.current === landing;
    prevLanding.current = landing;
    setSelected(landing);
    // Animated only when the day turned under someone watching it, which
    // is the one case `spentTick` counts. Arriving already past the hour —
    // opening the app at midnight, or the week loading a beat after the
    // first frame — should simply BE on tomorrow rather than slide there.
    scrollToDay(landing, !wasHere && spentTick > 0);
  }, [landing, resetKey, scrollToDay, spentTick]);

  /**
   * What the hero counts down to, and which rows can be aimed at.
   *
   * Only today has either. A row is aimable only while it is still ahead —
   * counting down to a time that has passed is a negative number dressed up
   * as information — and the set is recomputed whenever the next prayer
   * changes, which is the moment one of them stops being ahead.
   */
  const now = nextInfo ? new Date() : null;
  const aimable = useMemo(() => {
    const out = new Set<string>();
    if (!now) return out;
    for (const key of visibleRows) {
      const raw = timings[key];
      if (!raw) continue;
      if (eventAt(key, timings, now, dayClock).getTime() > now.getTime()) {
        out.add(key);
      }
    }
    return out;
    // `now` is deliberately not a dependency: it is re-read on every render
    // this memo would run for anyway, and adding it would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timings, visibleRows.join(','), nextInfo?.name, dayClock]);

  const target = useMemo(() => {
    if (!nextInfo) return null;
    if (!chosenKey) return nextInfo;
    const raw = timings[chosenKey];
    if (!raw) return nextInfo;
    return {
      name: chosenKey,
      at: eventAt(chosenKey, timings, new Date(), dayClock),
    };
  }, [nextInfo, chosenKey, timings, dayClock]);

  /**
   * The check beside each salāh — see quickLog.ts. Today only: a tap on
   * tomorrow's Fajr has nothing to record, and yesterday is the Log's.
   */
  const quickLog = useQuickLog();
  const tomorrow = week[1];
  /**
   * The sky's day and tomorrow's Fajr on the PHONE's clock: the sky places
   * the sun by the phone's own clock, which a saved place in another zone
   * is not written on. The same objects when the days are on the phone's.
   */
  const skyDay = useMemo(() => {
    const day = skyTimings ?? timings;
    const base = startOfLocalDay(new Date());
    return onClock(day, base, dayClock, undefined);
  }, [skyTimings, timings, dayClock]);
  const skyTomorrowFajr = useMemo(() => {
    if (!tomorrow?.Fajr) return undefined;
    const base = addDays(startOfLocalDay(new Date()), 1);
    return onClock({ Fajr: tomorrow.Fajr }, base, dayClock, undefined).Fajr;
  }, [tomorrow?.Fajr, dayClock]);
  const logNow = new Date();
  /**
   * The question a tap on a passed prayer opens — see quickLog.ts. Holds
   * the prayer and the day it is about; the sheet reads the labels off it
   * and `answerPassed` writes the answer to that day.
   */
  const [question, setQuestion] = useState<{
    prayer: JournalPrayer;
    offset: number;
    /** What may be answered at this moment, and which question fits — #40. */
    answers: readonly PassedPrayerAnswer[];
    secondOpen: boolean;
  } | null>(null);
  /**
   * The answer to a tap that could not be recorded — shown under the day,
   * in the line the Hijri date sits on, for a moment.
   *
   * A check whose prayer has not come cannot record anything; it used to
   * take no press at all, which is a control that looks live and does
   * nothing, and it was reported as exactly that. It takes the press now
   * and says why — and at one in the morning, when none of today's
   * prayers has come, the way to yesterday is the chevron beside it.
   */
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((message: string) => {
    setHint(message);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );
  const toggleLog = useCallback(
    async (prayer: JournalPrayer, dayTimings: TimingsMap, offset: number) => {
      const day = addDays(startOfLocalDay(new Date()), offset);
      const options = { day, tomorrow: dayAt(offset + 1), clock: dayClock };
      const outcome = await quickLog.toggle(prayer, dayTimings, options);
      if (outcome === 'nothing') {
        // The one reason a tap is refused that the reader can act on: the
        // prayer has not come. (An unread journal takes no press at all.)
        if (
          quickLogPhase(prayer, dayTimings, new Date(), options.tomorrow, day, dayClock) ===
          'not-yet'
        ) {
          say(t('journal.notYet', 'Not yet — its time has not come'));
        }
        return;
      }
      if (outcome !== 'ask') return;
      const { phase, answers } = quickLog.askedAt(prayer, dayTimings, options);
      // A set that came back empty would be a sheet with nothing on it:
      // the phase changed under the tap (the boundary fell between the
      // two reads), and doing nothing is better than an empty card.
      if (!answers.length) return;
      setQuestion({
        prayer,
        offset,
        answers,
        secondOpen: phase === 'after-first',
      });
    },
    [quickLog, dayAt, say, t, dayClock],
  );
  const answerPassed = useCallback(
    (status: PassedPrayerAnswer) => {
      const q = question;
      setQuestion(null);
      if (!q) return;
      void quickLog.record(
        q.prayer,
        addDays(startOfLocalDay(new Date()), q.offset),
        status,
      );
    },
    [question, quickLog],
  );
  const dismissQuestion = useCallback(() => setQuestion(null), []);

  /**
   * Re-render at the instant a preferred window closes today, so the
   * line under that row turns from "first time until" to "second time
   * until" AT the boundary — issue #38 (2). Two of the five boundaries
   * are prayer rows and the card re-renders for those anyway; the isfār
   * and iṣfirār angles are not, and without this the line would sit on
   * a boundary already behind it until the next prayer came in. One
   * timeout to the nearest boundary ahead, re-armed when it fires; the
   * card carries no per-second clock, and this does not add one.
   */
  const [daruriTick, setDaruriTick] = useState(0);
  useEffect(() => {
    const today = week[0];
    if (!today) return undefined;
    const nowMs = Date.now();
    let next = Infinity;
    for (const k of DARURI_KEYS) {
      const clockOf = today[k];
      if (!clockOf) continue;
      try {
        const at = eventAt(k, today, new Date(nowMs), dayClock).getTime();
        if (at > nowMs && at < next) next = at;
      } catch {
        /* a malformed boundary is a line not drawn, not a timer */
      }
    }
    if (!Number.isFinite(next)) return undefined;
    const id = setTimeout(
      () => setDaruriTick(n => n + 1),
      Math.min(next - nowMs + 250, 0x7fffffff),
    );
    return () => clearTimeout(id);
  }, [week, daruriTick, dayClock]);

  const clearChosen = useCallback(() => setChosenKey(null), []);
  const aimAt = useCallback(
    (key: string) => setChosenKey(current => (current === key ? null : key)),
    [],
  );

  const insets = useSafeAreaInsets();
  /**
   * iPhone Duo: the card runs the full width so its sky reaches under the
   * vertical bar's column — the one thing allowed there — while the hero's
   * content (the chips, the countdown) and the table keep clear of it.
   */
  const vbar = useVerticalBar();
  const wideInset = fullBleed && !roomy && !vbar ? Math.max(0, sideInset) : 0;
  const columnPad =
    fullBleed && !roomy && vbar
      ? vbar.side === 'right'
        ? { paddingRight: vbar.width } // rtl-safe: the vertical bar is on a physical side
        : { paddingLeft: vbar.width } // rtl-safe: the vertical bar is on a physical side
      : wideInset > 0
        ? { paddingHorizontal: wideInset }
        : null;
  const heroColumnPad =
    fullBleed && !roomy && vbar
      ? vbar.side === 'right'
        ? { paddingRight: SPACING.xl + vbar.width } // rtl-safe: the vertical bar is on a physical side
        : { paddingLeft: SPACING.xl + vbar.width } // rtl-safe: the vertical bar is on a physical side
      : wideInset > 0
        ? { paddingHorizontal: SPACING.xl + wideInset }
        : null;
  // How far the sky reaches past the hero's box, each side.
  const skySide = SPACING.xl + wideInset;
  const windowHeight = useWindowSize().height;
  // Full-bleed: the hero's top padding clears the status bar; the sky
  // bleeds up under it. The card chrome — radius, edge, glass — is gone:
  // the hero is a panel of the page, and the rows sit on the page.
  // Roomy: the hero is a panel inside the page, so it takes the page's
  // own top padding rather than clearing the status bar.
  // Under the status bar only when the hero is the top of the page: a
  // full-bleed phone layout with nothing above it.
  const underStatusBar = fullBleed && !roomy && !bannerAbove;
  const heroTop = underStatusBar ? insets.top + SPACING.md : SPACING.lg;
  // The posed twin's place and pose: the real hero's box in the wrap, and
  // the interval it counts (boot/poseHero.ts).
  const [heroBox, setHeroBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [interval, setInterval_] = useState<{ fromAt: number; targetAt: number } | null>(null);
  const poseRef = useRef<HostInstance>(null);
  const onRealHeroLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setHeroBox(prev =>
      prev && prev.x === x && prev.y === y && prev.w === width && prev.h === height
        ? prev
        : { x, y, w: width, h: height },
    );
  }, []);
  const onInterval = useCallback((fromAt: number, targetAt: number) => {
    setInterval_(fromAt > 0 && targetAt > fromAt ? { fromAt, targetAt } : null);
  }, []);
  // Not while the launch run draws: the twin would be drawn for nothing.
  // Nor before the launch's first paint and the run are over: the twin's
  // sky is a second SVG to mount, 70–100 ms of JS right where the run's
  // first frames go. Nor with the run turned off: nothing would run from
  // the pose, and a twin is a second hero to lay out and draw on every tick.
  const fullBleedRunHeld = useLaunchRunActive();
  const twinMayMount = useAfterFirstPaint();
  /**
   * The day pager too: its two weeks of pages — eighty-odd rows — were
   * mounted the frame after the first paint, under the launch run, and
   * were the run's one stall (65 ms on a Pixel 10 Pro, 2.35). The plain
   * day stands in, the same height to the pixel, until the run is over;
   * a return (no run) mounts it at once, as before.
   */
  const pagerMayMount = twinMayMount;
  const runWanted = settings.launchAnimation;
  useEffect(() => setLaunchRunWanted(runWanted), [runWanted]);
  const twinUp = !!(
    target && heroBox && interval && chosenKey === null && !fullBleedRunHeld && twinMayMount && runWanted
  );
  useEffect(() => {
    if (!twinUp || !interval) return undefined;
    registerPoseHero({ ref: poseRef, fromAt: interval.fromAt, targetAt: interval.targetAt });
    return () => registerPoseHero(null);
  }, [twinUp, interval]);
  /**
   * The hero's height on a roomy page: about a third of the window, never
   * under 300 and never over 460. A third keeps the sky the backdrop it
   * is meant to be while leaving the sun or the moon somewhere to sit;
   * the floor is the countdown block plus a strip of sky, and the ceiling
   * stops a 13-inch iPad from turning the hero back into the page.
   */
  // The column's share of the posed twin's box, by physical side.
  const columnActions = useVerticalBarActions();
  const twinBarLeft = columnPad && vbar && vbar.side === 'left' ? vbar.width : 0;
  const twinBarRight = columnPad && vbar && vbar.side === 'right' ? vbar.width : 0;
  const roomyHeroHeight = roomy
    ? heroHeight != null
      ? Math.round(heroHeight)
      : Math.round(Math.min(Math.max(windowHeight * 0.34, 300), 460))
    : undefined;
  const Outer = fullBleed ? View : GlassSurface;
  // Minimal: the sky runs on under the dots at the page's foot, so the
  // hero's foot takes the bar's inset as well as its own padding.
  const footPad = HERO_FOOT_PAD[fullBleed ? tier : 'comfortable'] + (minimal ? footInset : 0);
  // Minimal: a drag up on the hero opens the day's times too — only a
  // clearly upward one, so a sideways drag is still the tabs' and a drag
  // down the page's (the pull to refresh).
  // The page answers the finger before the sheet is there: it eases back
  // a little as the drag rises (a third of the way at most), and the
  // sheet's own rise carries on from wherever the finger let go — or the
  // page springs back if it let go short.
  const swipeUp = useMemo(
    () =>
      Gesture.Pan()
        .enabled(minimal)
        .activeOffsetY(-14)
        .failOffsetX([-18, 18])
        .runOnJS(true)
        .onUpdate(e => {
          if (reduceMotion) return;
          sheetProgress.setValue(Math.min(SWIPE_UP_PULL, Math.max(0, -e.translationY / SWIPE_UP_REACH)));
        })
        .onEnd((e, success) => {
          // A release opens; a drag taken from the finger (another
          // handler, the system) only puts the page back.
          if (success && (e.translationY < -30 || e.velocityY < -400)) {
            onOpenTimes();
          } else {
            Animated.spring(sheetProgress, {
              toValue: 0,
              damping: 24,
              stiffness: 320,
              mass: 1,
              useNativeDriver: true,
            }).start();
          }
        }),
    [minimal, onOpenTimes, reduceMotion, sheetProgress],
  );
  // Minimal: the hero's foreground recedes under the sheet — see
  // MinimalSheet. Built once: the card renders every second with the
  // countdown, and each build is a new native node on the rise.
  const recess = useMemo(
    () => (minimal ? { transform: pageRecess(sheetProgress, reduceMotion) } : null),
    [minimal, sheetProgress, reduceMotion],
  );
  // Minimal: the drag up opens the day's times, and only the drag — a tap
  // on the page opened them too, and a page that opens a sheet wherever it
  // is touched is a page that cannot be touched. A screen reader, which
  // has no drag up, opens them from the prayer's line (HeroToday).
  const HeroWrap = View;
  const compact = fullBleed && tier === 'compact';
  const renderQibla = (ink: SkyInkColors, column?: boolean) =>
    fullBleed && qiblaBearing != null ? (
      <QiblaChip bearing={qiblaBearing} onPress={onOpenQibla} ink={ink} column={column} />
    ) : null;
  // Not at a large text size: the heart's line would open across the
  // eyebrow's words. Help Mihrab is still in Settings → About.
  const renderHelp = (ink: SkyInkColors) =>
    onHelpMihrab && currentFontScale() < HELP_CHIP_MAX_FONT_SCALE ? (
      <HelpMihrabChip ink={ink} onPress={onHelpMihrab} />
    ) : null;

  /**
   * One day's table. Today's rows carry the live things — the next-prayer
   * emphasis, the aim, the alert bells, the check column; another day's
   * rows carry the times and the Mālikī boundaries and nothing that
   * pretends a tap on Thursday changes Thursday.
   */
  const renderDay = (offset: number) => {
    const dayTimings = dayAt(offset) ?? {};
    const isToday = offset === 0;
    // A day behind us: every prayer on it has come, and each one can be
    // recorded — that is what the table turns back for. Nothing else
    // that is live on today's rows belongs on it.
    const isPast = offset < 0;
    const loggable = isToday || isPast;
    const day = addDays(startOfLocalDay(logNow), offset);
    const nextDay = dayAt(offset + 1);
    const rows = DISPLAY_ORDER.filter(key => dayTimings[key]);
    const overrideKey = overrideKeyFor(offset, dayTimings, rows);
    const timeSample = timeSampleFor(dayTimings, rows);
    const daruriRows: Record<
      string,
      { phase: 'first' | 'second'; at: string; approx: boolean } | null
    > = {};
    for (const key of rows) {
      const daruriKey = `${key}Daruri` as DaruriKey;
      if (!dayTimings[daruriKey]) continue;
      daruriRows[key] = isToday
        ? daruriRowState(
            week,
            logNow,
            daruriKey,
            logNow,
            isSalah(key) && quickLog.statusOf(key) != null,
            dayClock,
          )
        : {
            phase: 'first',
            at: dayTimings[daruriKey],
            approx: DARURI_CONFIDENCE[daruriKey] === 'modelled',
          };
    }
    return rows.map((key, rowIndex) => (
      <PrayerRow
        key={key}
        prayerKey={key}
        rawTime={dayTimings[key]}
        // Only today can have one — on Thursday nothing is next, and an
        // emphasis that means nothing is just decoration. It follows the
        // hero rather than the clock: see PrayerRow.
        isNext={isToday && target?.name === key}
        isChosen={isToday && chosenKey === key}
        onSelect={isToday && aimable.has(key) ? () => aimAt(key) : undefined}
        isSecondary={(OPTIONAL_TIME_KEYS as readonly string[]).includes(key)}
        isLast={rowIndex === rows.length - 1}
        // Mālikī second times (issue #19). The boundaries ride in the
        // same map under keys nothing else iterates, so a row that has
        // one shows it and every other row is unchanged. On today's card
        // the line follows the clock — first window, then second, then
        // nothing (issue #38); another day's card states the first
        // boundary and leaves it at that.
        daruriAt={daruriRows[key]?.at}
        daruriPhase={daruriRows[key]?.phase}
        daruriApprox={daruriRows[key]?.approx}
        // Only on today's card. On yesterday's or tomorrow's the
        // control would still change a setting for every day, which
        // is not what a tap on a past row looks like it does.
        // The bell shows what will ACTUALLY happen at this time, which
        // is the override when there is one. A row that showed the
        // standing setting while the card showed something else would
        // be the app holding two answers about one prayer — the thing
        // the alert-mode button exists to stop.
        alertMode={
          isToday
            ? overrideKey === key && override
              ? override.mode
              : alertModeOf(key)
            : undefined
        }
        onCycleAlertMode={isToday ? () => cycleAlertMode(key) : undefined}
        // Not gated on `isToday`: this one belongs to an instant, and
        // after Isha that instant is on tomorrow's card.
        overrideMode={overrideKey === key ? override?.mode : undefined}
        standingAlertMode={overrideKey === key ? standingModeOf(key) : undefined}
        onResetAlertMode={overrideKey === key ? resetOverride : undefined}
        timeSample={timeSample}
        log={
          loggable && isSalah(key)
            ? {
                status: quickLog.statusOf(key, day),
                phase: quickLogPhase(key, dayTimings, logNow, nextDay, day, dayClock),
                // Until the journal has been read there is nothing to
                // show and nothing safe to record: the ring at a whisper,
                // exactly as for a prayer whose time has not come — and
                // nothing to answer a tap with either, so that one state
                // alone takes no press.
                ready: quickLog.hydrated,
              }
            : undefined
        }
        onToggleLog={
          loggable && isSalah(key)
            ? () => void toggleLog(key, dayTimings, offset)
            : undefined
        }
        hasCheckColumn={loggable}
        tier={fullBleed ? tier : 'comfortable'}
      />
    ));
  };

  /**
   * The minimal sheet's rows for a day: the same record `renderDay` draws,
   * with the check beside each salāh on today and the days behind, so a
   * tap on it logs as a tap on the row would — and asks the same question
   * about a prayer that has passed (`toggleLog`).
   */
  const sheetRows = (offset: number): TimesSheetRow[] => {
    const dayTimings = dayAt(offset) ?? {};
    const loggable = offset <= 0;
    const day = addDays(startOfLocalDay(logNow), offset);
    const nextDay = dayAt(offset + 1);
    return DISPLAY_ORDER.filter(key => dayTimings[key]).map(key => ({
      key,
      name: t(`prayer.${key}`),
      time: clock(dayTimings[key] as string),
      secondary: (OPTIONAL_TIME_KEYS as readonly string[]).includes(key),
      lit: offset === 0 && target?.name === key,
      log:
        loggable && isSalah(key)
          ? {
              status: quickLog.statusOf(key, day),
              phase: quickLogPhase(key, dayTimings, logNow, nextDay, day, dayClock),
              ready: quickLog.hydrated,
              onToggle: () => void toggleLog(key, dayTimings, offset),
            }
          : undefined,
    }));
  };

  // The sheet's rows only while it is open: they were rebuilt every second
  // with the countdown — five log phases worked out for a sheet nobody
  // could see. Closed, it keeps the last rows it showed, so the sheet
  // still has them as it slides away.
  const liveSheetRows = minimal && timesOpen ? sheetRows(sheetOffset) : null;
  if (liveSheetRows) lastSheetRows.current = liveSheetRows;
  const sheetRowsShown = liveSheetRows ?? lastSheetRows.current;
  // …and every day's, for the sheet's pager: the full page's pages, swiped
  // the same way. Built on the same terms — only while the sheet is open.
  const liveSheetDays =
    minimal && timesOpen
      ? pages.map((_, index) => {
          const offset = index - todayIndex;
          return { offset, rows: offset === sheetOffset && liveSheetRows ? liveSheetRows : sheetRows(offset) };
        })
      : null;
  if (liveSheetDays) lastSheetDays.current = liveSheetDays;
  const sheetDaysShown = liveSheetDays ?? lastSheetDays.current;

  return (
    <Outer
      style={
        fullBleed
          ? roomy
            ? styles.cardRoomy
            : styles.cardBleed
          : [styles.card, { borderRadius: HOME_TABLE_RADIUS, ...cardEdgeStyle(palette) }]
      }>
      {/* Full-bleed, the hero GROWS: the card fills the page and the hero
          takes whatever the table leaves, so the sky ends at the tab bar
          and the page has no band of nothing under the rows. */}
      <GestureDetector gesture={swipeUp}>
      <HeroWrap
        // Minimal: the whole hero is the way to the day's times — by the
        // drag up above, and for a screen reader by its prayer's line.
        {...(minimal
          ? {
              // Not an element of its own: as one it swallowed the page —
              // the figures, the prayer's line, the footer and the heart
              // inside it were one "button" that said none of them. Its
              // children are read instead, and the prayer's line is the
              // screen reader's way to the times (HeroToday, `onOpenTimes`).
              accessible: false,
            }
          : {})}
        style={[
          styles.heroWrap,
          { paddingBottom: footPad },
          heroColumnPad,
          { paddingTop: heroTop },
          fullBleed && !roomy && styles.heroWrapBleed,
          // Tabletop (a foldable half open, flat on a table): the hero
          // stands to the hinge, not to the page's slack — see `heroHeight`.
          fullBleed && !roomy && heroHeight != null && { flexGrow: 0, height: Math.round(heroHeight) },
          roomy && [styles.heroWrapRoomy, { height: roomyHeroHeight }],
          // Full-bleed, the sky IS the wrap's ground — a tint under it
          // would show as a band wherever the two disagreed by a pixel.
          { backgroundColor: fullBleed ? 'transparent' : palette.accentBg },
        ]}>
        {/* The posed twin, under the real hero and never seen: what the
            kept launch picture shows instead of the hero as it is —
            boot/poseHero.ts. Only when there is an interval to pose at,
            nothing chosen, and no launch run drawing. */}
        {twinUp && interval && heroBox && target ? (
          // THE CAPTURED BOX IS THE SKY'S, NOT THE HERO'S. The twin is
          // drawn to a file by its ref (poseHero.ts, view-shot), and the
          // file is the ref's own bounds: the hero's box, which its sky
          // bleeds out of — under the status bar and out to the edges.
          // Captured at the box, the picture lost the bleed, and the
          // kept launch picture drew the posed hero into a frame of the
          // real hero's sky as it was when the picture was taken: under
          // the Sky theme, where the sky moves through a prayer, a dark
          // square of Fajr inside the dawn's rose. So the ref is a view
          // the size of the sky, and the hero sits inside it at the
          // bleed's inset — the same box as before, drawn whole.
          <View
            ref={poseRef}
            collapsable={false}
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            // Beside a vertical bar the sky also runs on under the column
            // (HeroSky), so the box takes that in too — cut at the hero's
            // edge, the picture showed the column's strip of sky as it was
            // when kept, beside the posed one.
            style={{
              position: 'absolute',
              left: heroBox.x - skySide - twinBarLeft,
              top: heroBox.y - heroTop,
              width: heroBox.w + skySide * 2 + twinBarLeft + twinBarRight,
              height: heroBox.h + heroTop + SPACING.lg,
            }}>
            {vbar && (twinBarLeft || twinBarRight) ? (
              <View
                style={[
                  styles.twinColumn,
                  twinBarRight ? { right: 0 } : { left: 0 }, // rtl-safe: the vertical bar is on a physical side
                  {
                    width: vbar.width,
                    top: vbar.occludedTo + SPACING.md - (heroBox.y - heroTop),
                  },
                ]}>
                <VerticalBarActionsBand actions={columnActions} />
              </View>
            ) : null}
            <View
              collapsable={false}
              style={{
                position: 'absolute',
                left: skySide + twinBarLeft,
                top: heroTop,
                width: heroBox.w,
                height: heroBox.h,
              }}>
            <HeroToday
              target={target}
              chosen={false}
              onExpire={noop}
              today={timings}
              skyToday={skyDay}
              latitude={latitude}
              longitude={longitude}
              tomorrowFajr={skyTomorrowFajr}
              dayClock={dayClock}
              expanded={expanded}
              tier={fullBleed ? tier : 'comfortable'}
              bleed={{ horizontal: skySide, top: heroTop, bottom: footPad }}
              statusBarInset={underStatusBar ? insets.top : 0}
              fill={fullBleed}
              topRow={fullBleed ? (minimal ? { renderHelp } : { renderLocation, renderQibla }) : undefined}
              minimal={minimal}
              footer={footer}
              frozenAt={interval.fromAt}
              skyTheme={settings.appearance === 'sky'}
              skyVariant={settings.skyVariant}
              heroLook={settings.heroLook}
              band={desktopLayout}
            />
            </View>
          </View>
        ) : null}
        {target ? (
          <HeroToday
            target={target}
            chosen={chosenKey !== null}
            onExpire={clearChosen}
            onInterval={onInterval}
            onLayout={onRealHeroLayout}
            launchRun={runWanted}
            skyTheme={settings.appearance === 'sky'}
            skyVariant={settings.skyVariant}
            heroLook={settings.heroLook}
            band={desktopLayout}
            today={timings}
            skyToday={skyDay}
            latitude={latitude}
            longitude={longitude}
            tomorrowFajr={skyTomorrowFajr}
            dayClock={dayClock}
            layoutKey={layoutKey}
            expanded={expanded}
            tier={fullBleed ? tier : 'comfortable'}
            bleed={{ horizontal: skySide, top: heroTop, bottom: footPad }}
            statusBarInset={underStatusBar ? insets.top : 0}
            fill={fullBleed}
            topRow={fullBleed ? (minimal ? { renderHelp } : { renderLocation, renderQibla, renderHelp }) : undefined}
            minimal={minimal}
            recess={recess}
            footer={footer}
            onOpenTimes={minimal ? onOpenTimes : undefined}
            // Not on a roomy page: the hero is not under the status bar
            // there, so the bar takes the page's ink like every other tab.
            ownsStatusBar={underStatusBar}
          />
        ) : null}
        {/* Parked in the corner rather than in the hero's own markup, and
            LAST among the wrapper's children on purpose: the eyebrow above
            the countdown is a full-width `Text`, so it overlaps the corner,
            and a later sibling wins the hit test whatever `zIndex` says. */}
        {/* Keyed on the BEARING, not on the callback: on a Mac there is
            no compass screen to open and `onOpenQibla` is undefined, but
            the bearing is trigonometry on two coordinates and is just as
            true there. The chip becomes a readout. */}
        {/* No ink here: the corner variant is only used on the roomy
            layouts, where the hero is a card on the page rather than the
            page itself, and the chip reads against that card. The ink
            belongs to the full-bleed top row, where the sky IS the
            background — and it is computed inside the hero, which this
            sits outside of on purpose (see the note above). */}
        {fullBleed ? null : (
          <QiblaChipCorner
            bearing={qiblaBearing ?? null}
            onPress={onOpenQibla}
          />
        )}
      </HeroWrap>
      </GestureDetector>

      {/* Minimal: no table — the day’s times are a drag up away (HomeScreen's
          sheet), and the hero has the page. */}
      {minimal ? null : (
      <View style={[fullBleed ? styles.tableBleed : null, columnPad]}>
        {/* THE DAY LINE, where the week strip was. The strip put seven
            chips where the eye lands under the hero and answered "which
            day am I looking at" with a highlighted 9 — and could not look
            back. This says it in words: the weekday, the two dates, and
            on the trailing edge a mark that reads "Today" while the table
            shows today and becomes the way back once it has been swiped
            off it. The days themselves are the swipe, both ways. */}
        {/* THE DAY BAR.
            A drawn chevron at each edge steps a day; the block between
            them says which day is on show, in both calendars, and is the
            way back to today once the table has been turned off it.

            It replaced a line of type with a dot at the end, which said
            what day it was and offered nothing to do about it: the only
            way to another day was a swipe nobody could see. Nothing here
            is in a box — the chevrons are ink with a hit slop, and "back
            to today" is a word in the accent rather than a tinted pill,
            because every other control on this page reads that way. */}
        <View style={[styles.dayBar, compact && styles.dayBarCompact, { backgroundColor: palette.bg }]}>
          {/* The chevrons at the edges, where a thumb finds them; beside the
              day, its doors: the month's calendar on the trailing side and
              — with the data statistics on, a diagnostic setting — the way
              into Minimal on the leading one, a quick switch for someone
              working on the two faces, not a control everyone needs. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.previousDay', 'Previous day')}
            accessibilityState={{ disabled: !canGoBack }}
            disabled={!canGoBack}
            onPress={() => handleSelect(selected - 1)}
            hitSlop={14}
            style={({ pressed }) => [
              styles.dayStep,
              !canGoBack && styles.dayStepOff,
              pressed && canGoBack && styles.dayStepPressed,
            ]}>
            <Chevron back={!rtl} color={String(palette.muted)} />
          </Pressable>

          {/* Not under the system's colours either: Minimal takes them
              off, which Settings only does with a restart (#110) — a
              shortcut that did it in place left the mounted surfaces in
              the colours the setting no longer said. */}
          {settings.showDataStats && minimalOffered && !settings.useSystemDynamicTheme ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={t('settings.minimalUi', 'Minimal')}
              accessibilityState={{ checked: settings.minimalUi }}
              onPress={() => updateSettings({ minimalUi: !settings.minimalUi })}
              hitSlop={14}
              style={({ pressed }) => [styles.dayStep, pressed && styles.dayStepPressed]}>
              <MinimalGlyph color={String(palette.muted)} />
            </Pressable>
          ) : onOpenMonth ? (
            // An empty slot the calendar's size, so the day stands in the
            // middle of the bar whichever doors are offered.
            <DayBarSlot />
          ) : null}
          <Pressable
            accessibilityRole={onToday ? 'header' : 'button'}
            accessibilityLabel={
              onToday
                ? `${getDayLabel(selected)} — ${getDayDate(selected)}`
                : `${getDayLabel(selected)} — ${getDayDate(selected)}. ${t('home.backToToday', 'Back to today')}`
            }
            disabled={onToday}
            onPress={() => handleSelect(0)}
            style={({ pressed }) => [
              styles.dayFace,
              pressed && !onToday && styles.dayStepPressed,
            ]}>
            <View style={styles.dayFaceLine}>
              {onToday ? (
                <View
                  style={[styles.todayDot, { backgroundColor: palette.accentSolid }]}
                />
              ) : null}
              <Text
                style={[styles.dayWeekday, { color: palette.text }]}
                numberOfLines={1}
                maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
                {/* "Tomorrow", not "Monday", for the one day the card
                    turned to by itself — otherwise the bar would announce
                    a change of day with the same words it uses for every
                    other day, and the reader would have to work out from
                    the date that the table had moved. A weekday everywhere
                    else, including tomorrow reached by a swipe on an
                    ordinary afternoon, so the word means exactly one
                    thing. */}
                {spent && selected === 1
                  ? getDayLabel(1)
                  : getWeekday(selected)}
                <Text style={[styles.dayDate, { color: palette.muted }]}>
                  {'  '}
                  {getDayDate(selected)}
                </Text>
              </Text>
              {/* The dot's twin, unseen, on the other side: the words are
                  centred on the bar, not the words and the dot. */}
              {onToday ? <View style={styles.todayDot} /> : null}
            </View>
            {/* One line, two things it may say: the day's Hijri date, or
                — for a moment after a tap that could not be recorded —
                why. Never both, and never a line of different height:
                the table below must not move under the thumb. */}
            <Text
              style={[
                styles.dayHijri,
                compact && styles.dayHijriCompact,
                { color: hint ? palette.accent : palette.muted },
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
              {hint ?? (getHijriDate ? getHijriDate(selected) : '')}
              {onToday || hint ? null : (
                <Text style={[styles.dayBack, { color: palette.accent }]}>
                  {'   '}
                  {t('home.backToToday', 'Back to today')}
                </Text>
              )}
            </Text>
          </Pressable>

          {onOpenMonth ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.monthTimesLink')}
              accessibilityHint={t('a11y.openMonth')}
              onPress={onOpenMonth}
              hitSlop={14}
              style={({ pressed }) => [styles.dayStep, pressed && styles.dayStepPressed]}>
              <MonthGlyph color={String(palette.muted)} />
            </Pressable>
          ) : settings.showDataStats && minimalOffered && !settings.useSystemDynamicTheme ? (
            <DayBarSlot />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.nextDay', 'Next day')}
            accessibilityState={{ disabled: !canGoForward }}
            disabled={!canGoForward}
            onPress={() => handleSelect(selected + 1)}
            hitSlop={14}
            style={({ pressed }) => [
              styles.dayStep,
              !canGoForward && styles.dayStepOff,
              pressed && canGoForward && styles.dayStepPressed,
            ]}>
            <Chevron back={rtl} color={String(palette.muted)} />
          </Pressable>
          {/* THE MONTH, as a glyph at the bar's trailing end. It was a row
              of its own under the table — "Prayer times for the whole
              month →", 42 dp for one line of text, 330 dp away from the
              bar that already holds the calendar's other controls. The
              bar is where the days are stepped; the month is the same
              thing, further. Its own hit slop, the chevrons' size. */}
        </View>

        <View onLayout={onTableLayout}>
          {pageWidth > 0 && pagerMayMount ? (
            <FlatList
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              // Two weeks of pages, all light: mount them all so a swipe
              // never lands on a blank page mid-render — and open on
              // today, which is not the first of them any more.
              initialNumToRender={pages.length}
              // …and on the day the card is on — the day it landed on
              // (after the last time of the night, tomorrow), or the one a
              // chevron turned to before the pager was mounted. Read once,
              // at mount, which is the only time this prop is.
              initialScrollIndex={pagePosition(todayIndex + selected)}
              // And the scroll view OPENS there. `initialScrollIndex` alone
              // mounts the pages after a spacer the width of the days
              // before today and only then scrolls to them, so the pager's
              // first frames — six of them on a Pixel (2.35) — were the
              // spacer: a table that blanked out for a fifth of a second as
              // the plain day under it was swapped for the pager.
              contentOffset={{ x: pagePosition(todayIndex + selected) * pageWidth, y: 0 }}
              // Left to right whatever the language: see `pagerPosition`.
              style={[styles.pager, pageHeights[selected] != null && { height: pageHeights[selected] }]}
              contentContainerStyle={styles.pagerContent}
              data={rtl ? pagesReversed : pages}
              keyExtractor={(_, position) =>
                String(pagePosition(position) - todayIndex)
              }
              getItemLayout={pageLayout}
              onMomentumScrollEnd={onPageSettled}
              {...webSettle}
              // A finger on the pager is a choice of day, and the card
              // stops turning itself from here on. The settle cannot say
              // this: a programmatic scroll settles identically.
              onScrollBeginDrag={() => {
                chose.current = true;
              }}
              // Nested in the page's vertical scroll: this one owns only
              // clearly horizontal drags.
              nestedScrollEnabled
              renderItem={({ index }) => {
                const offset = pagePosition(index) - todayIndex;
                return (
                  <View
                    onLayout={e => onPageLayout(offset, e)}
                    style={[
                      { width: pageWidth },
                      rtl ? styles.pageRtl : styles.pageLtr,
                    ]}>
                    {renderDay(offset)}
                  </View>
                );
              }}
            />
          ) : (
            // Before the page has been measured (the first frame, and a
            // test renderer) there is no pager — so draw the day the card
            // is on, not today, or an evening open would show today's
            // rows for a frame under a bar already saying tomorrow.
            renderDay(selected)
          )}
        </View>
      </View>
      )}
      {/* The question a tap on a passed prayer opens — from the rows, or
          from the minimal sheet's checks. */}
      <LogPassedPrayerSheet
        question={
          question
            ? {
                prayer: t(`prayer.${question.prayer}`),
                day: `${getDayLabel(question.offset)} · ${getDayDate(question.offset)}`,
                answers: question.answers,
                secondOpen: question.secondOpen,
              }
            : null
        }
        onAnswer={answerPassed}
        onCancel={dismissQuestion}
      />
      {minimal ? (
        <TodayTimesSheet
          visible={timesOpen}
          progress={sheetProgress}
          onClose={onCloseTimes}
          title={`${getDayLabel(sheetOffset)} · ${getDayDate(sheetOffset)}`}
          subtitle={getHijriDate ? getHijriDate(sheetOffset) : undefined}
          hint={hint}
          rows={sheetRowsShown}
          days={sheetDaysShown}
          offset={sheetOffset}
          onTurn={setSheetOffset}
          isToday={sheetOffset === 0}
          onPrev={dayAt(sheetOffset - 1) ? () => setSheetOffset(o => o - 1) : undefined}
          onNext={dayAt(sheetOffset + 1) ? () => setSheetOffset(o => o + 1) : undefined}
          onBackToToday={() => setSheetOffset(0)}
          onMonth={onOpenMonth}
          onToggleMinimal={settings.showDataStats ? () => updateSettings({ minimalUi: false }) : undefined}
          qibla={qiblaBearing != null ? { bearing: qiblaBearing, onPress: onOpenQibla } : undefined}
          place={placeLabel ? { label: placeLabel, onPress: onOpenPlace } : undefined}
          source={timesSource}
        />
      ) : null}
    </Outer>
  );
}

export const TodayCard = memo(TodayCardImpl);
