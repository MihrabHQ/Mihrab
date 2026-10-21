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
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type HostInstance,
} from 'react-native';
import { useWindowSize } from '../../responsive/windowSize';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useIsActive } from '../../hooks/useIsActive';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useIncreasedContrast } from '../../hooks/useIncreasedContrast';
import {
  easeOutCubic,
  launchRunDurationMs,
  type WarpStart,
  markLaunchRunReady,
  useLaunchRunActive,
  useLaunchWarp,
  warpPct,
  warpRemaining,
  warpSkyAt,
} from '../../boot/launchWarp';
import { useAfterFirstPaint } from '../../boot/firstPaint';
import { crossfadeScreen, holdLaunchSnapshot, setLaunchHeroState, setLaunchRunWanted } from '../../native/LaunchSnapshot';
import { forgetClockTicks, noteClockTick } from '../../utils/clockJumps';
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
import {
  TABULAR_MAX_FONT_SCALE,
  TITLE_BAND_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS } from '../../types/prayer';
import {
  DARURI_CONFIDENCE,
  DARURI_KEYS,
  daruriRowState,
  type DaruriKey,
} from '../../prayer/daruriTimes';
import { lastTimeOfDay } from '../../prayer/dayRollover';
import type { TimingsMap } from '../../types/prayer';
import {
  addDays,
  countdownPieces,
  eventAt,
  onClock,
  startOfLocalDay,
  wallClockDate,
} from '../../utils/prayerTimes';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import {
  isSalah,
  quickLogPhase,
  useQuickLog,
  type PassedPrayerAnswer,
} from '../../journal/quickLog';
import type { JournalPrayer } from '../../journal/journal';
import { pagerPosition } from './pagerPosition';
import { LogPassedPrayerSheet } from './LogPassedPrayerSheet';
import { HeroSky, type SkyRun } from './HeroSky';
import {
  HERO_Y,
  SKY_FADE_LOW_MID_AT,
  SKY_THEME_MID_AT,
  skyFrame,
  skyInkAt,
  skyMoment,
  themedSkyFrame,
  type SkyFrame,
  type SkyInkColors,
} from './skyModel';
import { skyMoodFor, type SkyVariant } from '../../theme/skyMoods';
import { setHeroSkyBand } from './heroSkyBand';
import { publishSkyTheme, skyDayKey } from '../../theme/skyTheme';
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
import { HOME_SCREEN_PADDING, HOME_TABLE_RADIUS } from './tokens';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { VerticalBarActionsBand } from '../../navigation/VerticalTabBar';

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
/** The countdown's halo under the Sky theme by night — its blur, and the room its text is given for it. */
const GLOW_RADIUS = 14;

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

/** Below this window height the rows go dense — see `renderDay`. */
export const DENSE_BELOW_HEIGHT = 720;
/** Past this many rows a day the rows go dense. */
export const DENSE_ABOVE_ROWS = 6;

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
  /** The location chip for the hero's top row, drawn in the sky's ink. */
  renderLocation?: (ink: SkyInkColors, column?: boolean) => ReactNode;
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

/**
 * The hero's top row — the location and Qibla chips, built by their
 * render props — and its eyebrow with the Help Mihrab chip. Memoised on
 * the ink, which changes with the sky's steps: a launch run redraws the
 * hero every frame, and these chips cost more to rebuild than the
 * countdown they sit above.
 */
const HeroTopRow = memo(function HeroTopRow({
  topRow,
  ink,
  onLayout,
}: {
  topRow: { renderLocation?: (ink: SkyInkColors, column?: boolean) => ReactNode; renderQibla?: (ink: SkyInkColors, column?: boolean) => ReactNode };
  ink: SkyInkColors;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.heroTopRow} onLayout={onLayout}>
      <View style={styles.heroTopLeading}>{topRow.renderLocation?.(ink)}</View>
      {topRow.renderQibla?.(ink)}
    </View>
  );
});

const HeroEyebrow = memo(function HeroEyebrow({
  label,
  ink,
  renderHelp,
}: {
  label: string;
  ink: SkyInkColors;
  renderHelp?: (ink: SkyInkColors) => ReactNode;
}) {
  return (
    <View style={styles.heroEyebrowRow}>
      <Text
        style={[styles.heroEyebrow, styles.heroEyebrowText, { color: ink.muted }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
        {label}
      </Text>
      {renderHelp?.(ink)}
    </View>
  );
});
/** How many times the hero's ink is re-read from the sky over a launch run (see HeroToday). */
export const SKY_RUN_STEPS = 30;
/** The most keyframes the run's native sky is built from (HeroSky, `SkyRunLayers`). */
export const SKY_RUN_KEYFRAMES_MAX = 9;

const HeroToday = memo(function HeroToday({
  target,
  chosen,
  onExpire,
  today,
  skyToday,
  latitude,
  longitude,
  tomorrowFajr,
  expanded,
  bleed,
  topRow,
  ownsStatusBar = false,
  statusBarInset = 0,
  fill = false,
  frozenAt,
  onInterval,
  onLayout,
  launchRun: launchRunWanted = true,
  skyTheme = false,
  skyVariant = 'realistic',
  dayClock,
}: {
  /** The clock `today` is written on (`TodayCardProps.dayClock`). */
  dayClock?: string;
  /** What the countdown is aimed at: the next prayer, or the user's pick. */
  target: { name: string; at: Date };
  /** True when the user aimed it rather than it simply being next. */
  chosen: boolean;
  /** Called when a chosen prayer's time arrives, to hand the hero back. */
  onExpire: () => void;
  today: TimingsMap;
  /**
   * The day for the SKY — unfiltered, Sunrise included — where `today`
   * is the day as drawn. The rail reads `today`, so its "from" is always
   * a row the reader can see; the sky reads this, because it needs the
   * sunrise whether or not the row is on.
   */
  skyToday?: TimingsMap;
  /**
   * Where the reader is, for the moon's tilt alone — see skyFrame. Absent
   * until a location is set, and the moon falls back to the northern
   * hemisphere's angle.
   */
  latitude?: number;
  longitude?: number;
  /** Tomorrow's Fajr, `HH:mm`, which closes tonight's sky. */
  tomorrowFajr?: string;
  expanded: boolean;
  /**
   * Full-bleed (phone): how far the hero's padding reaches above and to
   * the sides, so the sky covers it — the top includes the status bar.
   */
  bleed?: { horizontal: number; top: number; bottom: number };
  /** The top row: location chip leading, Qibla chip trailing. */
  topRow?: {
    renderLocation?: (ink: SkyInkColors, column?: boolean) => ReactNode;
    /** A render function, not a node: it takes the sky's ink like the
        location beside it — see QiblaChip's `ink`. */
    renderQibla?: (ink: SkyInkColors, column?: boolean) => ReactNode;
    /** Above the countdown, on the sky: the way into Help Mihrab. */
    renderHelp?: (ink: SkyInkColors) => ReactNode;
  };
  /** The status bar's glyphs follow the sky while this hero is on screen. */
  ownsStatusBar?: boolean;
  /** The status bar's height, which the sky's bodies keep out of. */
  statusBarInset?: number;
  /** The launch run setting (settings.launchAnimation): off, none runs. */
  launchRun?: boolean;
  /**
   * The app is in the Sky theme (theme/skyTheme.ts): the hero's gradient is
   * the hour's mood, not the real sky's colours, and runs into the page.
   */
  skyTheme?: boolean;
  /**
   * Whose colours the Sky theme's hero wears (settings.skyVariant). Asked
   * for here rather than read from skyMoods' module state, so a change
   * repaints the hero at once rather than at its next minute.
   */
  skyVariant?: SkyVariant;
  /**
   * Full-bleed: the hero grows to fill what the page leaves it, the
   * countdown block sits at its foot, and the sky's sun, moon and stars
   * are laid out in the room between the top row and that block — so
   * nothing drawn is ever under the status bar, the camera, the location
   * chip or the countdown.
   */
  fill?: boolean;
  /**
   * Posed: the hero as it was at this instant, and not a moment later —
   * no ticking, no launch run. The twin the kept launch picture is drawn
   * from (boot/poseHero.ts), posed at the start of the current interval.
   */
  frozenAt?: number;
  /** The interval the rail measures, when it has one: last prayer, next. */
  onInterval?: (fromAt: number, targetAt: number) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  // iPhone Duo: the location and the Qibla stand in the vertical bar's
  // column instead (HomeScreen hands them to the tab bar there).
  const vbar = useVerticalBar();
  const { t } = useTranslation();
  const clock = useClockFormatter();
  // Focus AND foreground. `useIsFocused()` on its own kept this ticking once
  // a second in the user's pocket: backgrounding the app from the Today tab
  // leaves Today the focused route, so the timer never stopped.
  const active = useIsActive();
  const reduceMotion = useReduceMotion();
  const posed = frozenAt != null;
  const [liveNow, setNow] = useState(() => new Date());
  // THE POSE FOLLOWS THE INTERVAL. The twin is mounted once and stays up
  // all day, and `frozenAt` moves on at every prayer; read into state once
  // at mount, the twin stood at the prayer it mounted at while its target
  // moved on — "Dhuhr in 7h 35m" from Fajr, the rail Fajr → Dhuhr, in the
  // kept picture of a morning that had passed sunrise, and every launch
  // opened on that before jumping to the real one. Derived, not stored:
  // the frozen instant is the prop's, in the same render it arrives in,
  // so no frame — and no capture (poseHero.ts) — sees the old pose with
  // the new target.
  const frozenNow = useMemo(() => (frozenAt != null ? new Date(frozenAt) : null), [frozenAt]);
  const now = frozenNow ?? liveNow;

  useEffect(() => {
    if (!active || posed) return undefined;
    // Immediately, not on the first interval: coming back from the background
    // the displayed countdown is as stale as the time spent away.
    setNow(new Date());
    // Then on the clock's own seconds, so the countdown turns when the
    // status bar's clock does — and a picture of it taken at any instant
    // shows exactly the second that instant reads (launchWarp).
    let id: ReturnType<typeof setInterval> | null = null;
    const align = setTimeout(() => {
      setNow(new Date());
      id = setInterval(() => {
        const t = Date.now();
        // A tick far from a second after the last is the clock jumping
        // (set by hand, corrected): the day may be another, and the
        // watchdog that decides it looks now rather than in half a minute.
        noteClockTick(t);
        setNow(new Date(t));
      }, 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(align);
      if (id) clearInterval(id);
      forgetClockTicks();
    };
  }, [active, posed]);

  const remainingSeconds = Math.max(
    0,
    Math.floor((target.at.getTime() - now.getTime()) / 1000),
  );

  // A choice that has come and gone is not a choice any more. Handing the
  // hero back is better than counting down to zero forever, or than showing
  // a prayer that is now in the past.
  useEffect(() => {
    if (chosen && remainingSeconds <= 0) onExpire();
  }, [chosen, remainingSeconds, onExpire]);

  /**
   * The rail measures the CURRENT interval — from the prayer that has most
   * recently passed to the one being counted down to. Without a previous
   * time to anchor it (before Fajr, or when the day's earlier entries are
   * hidden by the optional-times toggles) there is no interval to be a
   * fraction of, so the rail is simply not drawn.
   */
  const rail = useMemo(() => {
    // An evening row past midnight (Isha, the First Third — a Stockholm
    // June Isha is "00:47") belongs to tomorrow's date: `eventAt`'s rule.
    // Read as today's it had already "passed" at 23:00, and the rail ran
    // from Isha to Isha with nothing in it.
    const instant = (key: string): Date => eventAt(key, today, now, dayClock);
    // Today's instants AND yesterday's: before Fajr nothing of today has
    // passed, and the rail used to vanish for the whole small-hours
    // stretch — the one time a "how far into the night" bar is the most
    // use. Last night's Isha is the same clock a day earlier.
    const passed = DISPLAY_ORDER.map(key => ({
      key,
      raw: today[key],
    }))
      .filter(e => e.raw)
      .flatMap(e => {
        const at = instant(e.key);
        const yesterday = new Date(at);
        yesterday.setDate(yesterday.getDate() - 1);
        return [
          { key: e.key, at },
          { key: e.key, at: yesterday },
        ];
      })
      .filter(e => e.at.getTime() <= now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const from = passed[passed.length - 1];
    if (!from) return null;
    const span = target.at.getTime() - from.at.getTime();
    if (span <= 0) return null;
    const pct = Math.max(
      0,
      Math.min(1, (now.getTime() - from.at.getTime()) / span),
    );
    return { from, pct };
  }, [today, now, target.at, dayClock]);

  /**
   * A cold start that opened on the kept picture of this screen draws the
   * hero first with the picture's numbers — the posed ones, at the prayer
   * — so the fade from picture to live is invisible, then runs them to
   * the live ones: src/boot/launchWarp.ts. Not for the posed twin, and
   * not with the setting off — then the hero is live from the first
   * frame and changes inside the fade.
   */
  const launchRun = useLaunchWarp(reduceMotion || !launchRunWanted, !posed, rail?.from.at.getTime() ?? null);
  /**
   * A PICTURE OF A PRAYER THAT HAS PASSED runs from THIS prayer's start.
   * The picture is kept posed at the prayer the hero was counting from
   * when the app was left; left in the background across a prayer, it
   * opens on a picture of the last one — "Dhuhr in 5h 26m" at a quarter
   * past two. Run from that, the hero swept from sunrise's sky to now,
   * the countdown from a number that was never this prayer's. The
   * picture is still what the fade opens on (there is no other), but the
   * run starts where every launch is meant to: at the start of the
   * interval the hero is in, the countdown whole, the rail empty, the sky
   * at the prayer's hour. Decided once, when the run is: the start must
   * not move under a run.
   */
  const ownStart = useRef<WarpStart | null>(null);
  const ownDecided = useRef(false);
  const pictured = launchRun?.start ?? null;
  if (!launchRun) {
    ownStart.current = null;
    ownDecided.current = false;
  } else if (!ownDecided.current) {
    ownDecided.current = true;
    // No picture at all (launchWarp.ts, `decide`), or a picture of a
    // prayer that has passed: the interval's own start.
    if (rail && (!pictured || pictured.targetAt !== target.at.getTime())) {
      ownStart.current = {
        remaining: Math.max(0, Math.floor((target.at.getTime() - rail.from.at.getTime()) / 1000)),
        pct: 0,
        at: rail.from.at.getTime(),
        targetAt: target.at.getTime(),
      };
    }
  }
  const warp = ownStart.current ?? pictured;
  const warpE = launchRun?.e ?? 1;
  /**
   * The run's sky is drawn off the JS thread (HeroSky, `SkyRunLayers`):
   * built once when the run is decided — the sky at a few keyframes from
   * the picture's hour to now — and driven by this one native value, the
   * run's eased progress, set once a frame below. Kept for the run and
   * let go when it is over, when the live sky takes over in one render.
   */
  const runProgress = useRef<Animated.Value | null>(null);
  if (!runProgress.current) runProgress.current = new Animated.Value(0, { useNativeDriver: true });
  /**
   * The hero's sky as drawn: the Sky theme's design — three stops, the
   * horizon's glow low in the sky, running into the page — in every look.
   * Under Sky, the chosen colours over a page that wears the hour; under
   * System, Light and Dark, Realistic's colours run into the page the
   * theme draws. (The real sky's two-stop gradient, which stopped at the
   * page with an edge, is what the other looks had before.)
   */
  const { palette: pagePalette } = useAppPalette();
  const heroVariant: SkyVariant = skyTheme ? skyVariant : 'realistic';
  const pageBg = String(pagePalette.bg);
  const pageDark = pagePalette.isDark;
  // Where the sky starts fading into a page of the other polarity: just
  // under the countdown block's foot, once the growing hero has measured
  // it (set below), so the block is all on the sky.
  const [lowMidAt, setLowMidAt] = useState(SKY_FADE_LOW_MID_AT);
  const paint = useCallback(
    (f: SkyFrame): SkyFrame => {
      const mood = skyMoodFor(f.passage, f.t, undefined, heroVariant);
      if (skyTheme) return themedSkyFrame(f, mood);
      return themedSkyFrame(
        f,
        { ...mood, heroFoot: pageBg },
        mood.isDark === pageDark ? SKY_THEME_MID_AT : lowMidAt,
      );
    },
    [skyTheme, heroVariant, pageBg, pageDark, lowMidAt],
  );
  const skyRunRef = useRef<SkyRun | null>(null);
  if (launchRun && warp && !skyRunRef.current) {
    const nowMs = now.getTime();
    const from = warpSkyAt(warp, nowMs, 0);
    const hours = Math.abs(nowMs - from) / 3600_000;
    const K = Math.max(2, Math.min(SKY_RUN_KEYFRAMES_MAX, Math.ceil(hours) + 1));
    const day = skyToday ?? today;
    const frames = Array.from({ length: K }, (_, i) => {
      const at = new Date(Math.floor(warpSkyAt(warp, nowMs, i / (K - 1)) / 60_000) * 60_000);
      return paint(skyFrame(skyMoment(day, at, tomorrowFajr), at, { latitude, longitude }));
    });
    runProgress.current.setValue(0);
    skyRunRef.current = { frames, progress: runProgress.current };
  } else if (!launchRun && skyRunRef.current) {
    skyRunRef.current = null;
  }
  const skyRun = skyRunRef.current;
  // THE SKY RUNS ON ITS OWN CLOCK, NATIVE. The run's progress was set
  // into the native value once a frame from here; on the phone the first
  // third of a morning's run drew no change of sky at all and then the
  // whole of it at once — the per-frame values did not reach the layers
  // in time, whatever queue they waited in, while the countdown beside
  // them ran. So once the run begins, the sky's value is animated by
  // native itself, from where the run is to its end over the run's
  // remaining length, with the same easing from that point — one start,
  // no frames to deliver. The countdown and the rail stay the frames'
  // (stall-tolerant, launchWarp.ts): a stall then parts them for its
  // length, the sky a little ahead, which is nothing beside a sky that
  // stands and jumps.
  const skyAnim = useRef<Animated.CompositeAnimation | null>(null);
  useLayoutEffect(() => {
    const v = runProgress.current;
    if (!v) return;
    if (!launchRun) {
      skyAnim.current?.stop();
      skyAnim.current = null;
      return;
    }
    if (skyAnim.current) return;
    const duration = launchRunDurationMs();
    if (duration == null) {
      v.setValue(warpE);
      return;
    }
    const e0 = warpE;
    const k0 = 1 - Math.cbrt(Math.max(0, 1 - e0));
    const left = Math.max(1, Math.round(duration * (1 - k0)));
    v.setValue(e0);
    skyAnim.current = Animated.timing(v, {
      toValue: 1,
      duration: left,
      easing: t => (e0 >= 1 ? 1 : (easeOutCubic(k0 + t * (1 - k0)) - e0) / (1 - e0)),
      useNativeDriver: true,
    });
    skyAnim.current.start();
  });
  // The run waits for its sky (launchWarp.ts): native calls this listener
  // once the value has reached it — the layers are wired and listening —
  // and the run may begin. Until then its first frames would set a value
  // no layer took, and the sky would jump to catch up. The listener is
  // kept only while there is a run to wait for.
  const waiting = !!(launchRun && skyRun && !launchRun.e);
  useEffect(() => {
    const v = runProgress.current;
    if (!waiting || !v) return undefined;
    const id = v.addListener(() => markLaunchRunReady());
    // A value to take: the one the run starts from.
    v.setValue(0);
    return () => v.removeListener(id);
  }, [waiting]);

  const units = useMemo(
    () => ({
      hour: t('home.countdownUnitHour', 'h'),
      minute: t('home.countdownUnitMinute', 'm'),
      second: t('home.countdownUnitSecond', 's'),
    }),
    [t],
  );
  const pieces = countdownPieces(
    warp ? warpRemaining(warp, remainingSeconds, warpE) : remainingSeconds,
    units,
  );
  // Latin units are a clock run, read left to right whatever the app's
  // language; a language's own letters ("س") are read in its direction.
  const unitLang = /^[a-z]*$/i.test(units.hour) ? 'en-US' : undefined;

  /**
   * The sky, from the CLOCK — not from the target. Someone aiming the
   * countdown at Isha in the morning still sees the morning. Recomputed
   * once a minute (the moment is rounded to the minute) so the SVG is not
   * redrawn on every tick; a passage is hours long, so a minute is a
   * fraction of a percent of it.
   */
  //
  // During the launch run the drawn sky is the native layers' (above);
  // this frame is read for the ink and the status-bar band, and moves in
  // SKY_RUN_STEPS steps rather than once a frame — the ink is text colour,
  // and thirty steps of it over a second read as one change.
  const skyE = launchRun ? Math.floor(warpE * SKY_RUN_STEPS) / SKY_RUN_STEPS : warpE;
  const skyAt = warp ? warpSkyAt(warp, now.getTime(), skyE) : now.getTime();
  const minuteKey = Math.floor(skyAt / 60_000);
  const frame = useMemo(
    () =>
      paint(
        skyFrame(
          skyMoment(skyToday ?? today, new Date(minuteKey * 60_000), tomorrowFajr),
          new Date(minuteKey * 60_000),
          // The reader's own coordinates, for the moon alone: the crescent
          // hangs at a different angle in Jakarta than in Stockholm, and
          // upside down in Cape Town. Nothing else in the sky uses them.
          { latitude, longitude },
        ),
      ),
    [today, skyToday, tomorrowFajr, minuteKey, latitude, longitude, paint],
  );
  /**
   * The hero's ink comes from the sky, not the theme (skyModel.ts), and
   * per element: the eyebrow sits over the sky's top, the countdown over
   * its middle, the rail and the date over its foot — and at dawn those
   * three can be three different skies. The accent does not appear on the
   * hero at all; the countdown is the ink, and its size is its rank.
   */
  /**
   * In the growing hero the block is at the foot and the hero is as tall
   * as the page allows, so where each element actually sits is measured:
   * the hero's height, the top row's, the block's top and height. Until
   * the first layout — and in the card, which does not grow — the fixed
   * fractions the design was drawn at stand in.
   */
  const [heroH, setHeroH] = useState(0);
  const [topRowH, setTopRowH] = useState(0);
  const [block, setBlock] = useState<{ y: number; h: number } | null>(null);
  const onHeroLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setHeroH(Math.round(e.nativeEvent.layout.height));
      onLayout?.(e);
    },
    [onLayout],
  );
  const onTopRowLayout = useCallback((e: LayoutChangeEvent) => {
    setTopRowH(Math.round(e.nativeEvent.layout.height));
  }, []);
  const onBlockLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setBlock({ y: Math.round(y), h: Math.round(height) });
  }, []);
  // The hero's box excludes the bleed, so a fraction of the SKY (which is
  // the box plus the bleed) is offset by the bleed's top.
  const bleedTop = bleed?.top ?? 0;
  const bleedBottom = bleed?.bottom ?? 0;
  const skyH = heroH + bleedTop + bleedBottom;
  const measured = fill && heroH > 0 && block !== null;
  const heroY = measured
    ? {
        eyebrow: (bleedTop + block.y) / skyH,
        countdown: (bleedTop + block.y + block.h * 0.35) / skyH,
        foot: (bleedTop + block.y + block.h) / skyH,
      }
    : HERO_Y;
  const footY = heroY.foot;
  useEffect(() => {
    const at = measured ? Math.min(0.97, Math.round((footY + 0.015) * 200) / 200) : SKY_FADE_LOW_MID_AT;
    setLowMidAt(prev => (prev === at ? prev : Math.max(SKY_FADE_LOW_MID_AT, at)));
  }, [measured, footY]);
  /**
   * The band behind the status bar wears this sky — it is the one view
   * that has to know the gradient without being inside it. Published only
   * by the phone's growing hero: the card on a dashboard does not run
   * under the status bar, so nothing there has a strip to cover. See
   * `heroSkyBand.ts`.
   */
  useEffect(() => {
    if (!fill || !(skyH > 0)) return;
    return setHeroSkyBand({ top: frame.top, bottom: frame.bottom, mid: frame.mid, midAt: frame.midAt, skyH });
  }, [fill, frame.top, frame.bottom, frame.mid, frame.midAt, skyH]);
  /**
   * The sky as it is NOW, for the app's Sky theme (theme/skyTheme.ts) —
   * not the launch run's sweep: the chrome takes the colours the run is
   * heading for, in one change, while the hero runs there. The twin, posed
   * at the prayer, says nothing.
   */
  const liveMinuteKey = Math.floor(now.getTime() / 60_000);
  const running = launchRun != null;
  const liveSky = useMemo(() => {
    if (!running) return frame;
    const at = new Date(liveMinuteKey * 60_000);
    return skyFrame(skyMoment(skyToday ?? today, at, tomorrowFajr), at, { latitude, longitude });
  }, [running, frame, liveMinuteKey, skyToday, today, tomorrowFajr, latitude, longitude]);
  useEffect(() => {
    if (posed) return;
    // With the day's times, so the next launch can work the sky out for
    // its own clock before the hero has drawn (theme/skyTheme.ts).
    publishSkyTheme(
      { top: liveSky.top, bottom: liveSky.bottom, passage: liveSky.passage, t: liveSky.t },
      { day: skyDayKey(new Date(liveMinuteKey * 60_000)), times: skyToday ?? today, tomorrowFajr },
    );
  }, [posed, liveSky.top, liveSky.bottom, liveSky.passage, liveSky.t, liveMinuteKey, skyToday, today, tomorrowFajr]);

  // Memoised on the sky's step and the measured heights: the top row and
  // the eyebrow below are memoised on their ink, and the launch run
  // redraws the hero every frame.
  const yEyebrow = measured ? heroY.eyebrow : HERO_Y.eyebrow;
  const yCountdown = measured ? heroY.countdown : HERO_Y.countdown;
  const yFoot = measured ? heroY.foot : HERO_Y.foot;
  /**
   * Under the Sky theme, by night, the countdown glows: a soft halo of the
   * hour's accent behind the white digits — cyan at night, coral at dawn,
   * magenta in the evening — which is what makes a dark page read as lit
   * rather than merely dark. By day the ink is dark on a light sky and a
   * glow would only blur it, so there is none.
   */
  /**
   * The hero is the first thing to repaint when the hour turns from dark to
   * light or back (its sky is read every minute; the app's palette follows
   * from what the hero publishes, a commit later). So the hero asks for the
   * crossfade (native/LaunchSnapshot.ts, `crossfadeScreen`) BEFORE it
   * repaints — a still of the screen as it is, faded over both commits —
   * and the store's own ask a moment later finds one up and does nothing.
   */
  const moodDark = skyTheme ? skyMoodFor(frame.passage, frame.t, undefined, heroVariant).isDark : null;
  const lastMoodDark = useRef<boolean | null>(null);
  // Not during a launch run: the run's sky crosses the switch in its own
  // native layers, and the page already wears the hour the run is heading
  // for (`liveSky`). A still taken mid-run froze the countdown for the
  // fade's length and let it go at the run's end — the jump the run
  // exists to avoid.
  if (!posed && !launchRun && moodDark != null && lastMoodDark.current != null && lastMoodDark.current !== moodDark) {
    crossfadeScreen();
  }
  lastMoodDark.current = moodDark;
  const moreContrast = useIncreasedContrast();
  const glow = useMemo(() => {
    // The digits' halo on a night sky, in every look now that every look
    // has the Sky theme's hero.
    if (moreContrast) return null;
    const mood = skyMoodFor(frame.passage, frame.t, undefined, heroVariant);
    if (!mood.isDark) return null;
    return {
      textShadowColor: `${mood.accent}73`,
      textShadowRadius: GLOW_RADIUS,
      textShadowOffset: { width: 0, height: 0 },
      // UIKit draws a text view's shadow inside the view's own frame, so a
      // halo wider than the glyphs was cut square at the frame — on the
      // Mac a hard-edged box round each piece, sharpest at the right of
      // the minutes. The frame is grown by the halo and the room taken
      // back, so the halo has room and the row does not move.
      padding: GLOW_RADIUS,
      margin: -GLOW_RADIUS,
    };
  }, [heroVariant, moreContrast, frame.passage, frame.t]);
  const inkTop = useMemo(() => skyInkAt(frame, yEyebrow), [frame, yEyebrow]);
  const ink = useMemo(() => skyInkAt(frame, yCountdown), [frame, yCountdown]);
  const inkFoot = useMemo(() => skyInkAt(frame, yFoot), [frame, yFoot]);
  const eyebrowLabel = useMemo(
    () =>
      t('home.nextPrayerIn', {
        defaultValue: '{{prayer}} in',
        prayer: t(`prayer.${target.name}`),
      }),
    [t, target.name],
  );
  const targetLabel = useMemo(() => t(`prayer.${target.name}`), [t, target.name]);
  const railFromKey = rail?.from.key;
  const railFromLabel = useMemo(() => (railFromKey ? t(`prayer.${railFromKey}`) : ''), [t, railFromKey]);
  // On the day's clock, as the rows are: a saved place's own time.
  const targetClock = useMemo(
    () => clock.fromDate(wallClockDate(target.at, dayClock)),
    [clock, target.at, dayClock],
  );
  // The band the bodies keep out of: the status bar and the top row above,
  // the countdown block (and the hero's foot padding) below.
  const sceneTop = fill ? statusBarInset + topRowH + SPACING.md : 0;
  const sceneBottom = fill && block ? heroH - block.y + bleedBottom : 0;


  // What the countdown is aimed at, and the rail's start: kept with the
  // next launch picture so that launch can run from them (launchWarp).
  const railFromAt = rail ? rail.from.at.getTime() : 0;
  useEffect(() => {
    if (posed) return;
    setLaunchHeroState(target.at.getTime(), railFromAt);
    onInterval?.(railFromAt, target.at.getTime());
  }, [posed, target.at, railFromAt, onInterval]);
  const railPct = rail ? (warp ? warpPct(warp, rail.pct, warpE) : rail.pct) : 0;

  return (
    <View
      style={[styles.hero, expanded && styles.heroExpanded, fill && styles.heroFill]}
      onLayout={fill || onLayout ? onHeroLayout : undefined}>
      {/* The sky, under everything and out to the card's edges — and, on
          the phone, up under the status bar. */}
      <HeroSky
        frame={frame}
        run={skyRun ?? undefined}
        denseStars
        sceneTop={sceneTop}
        sceneBottom={sceneBottom}
        bleed={
          bleed ?? {
            horizontal: SPACING.xl,
            top: expanded ? SPACING.lg + SPACING.md : SPACING.lg,
            bottom: expanded ? SPACING.lg + SPACING.md : SPACING.lg,
          }
        }
      />
      {/* The status bar sits over the sky, so its glyphs take the sky's
          ink — only while this screen is the one on show: the tabs keep
          their screens mounted, and a bar styled by an unseen hero would
          be wrong on every other tab. Unmounting hands the root's back.
          `active` (focus AND foreground) rather than `useIsFocused`, the
          same gate as the countdown, so nothing here runs in a pocket. */}
      {ownsStatusBar && active ? (
        <StatusBar
          barStyle={inkTop.text === '#FFFFFF' ? 'light-content' : 'dark-content'}
          animated
        />
      ) : null}
      {topRow && fill && vbar ? null : topRow ? (
        <HeroTopRow topRow={topRow} ink={inkTop} onLayout={fill ? onTopRowLayout : undefined} />
      ) : null}
      {/* The room the sky's bodies move in. */}
      {fill ? <View style={styles.heroScene} /> : null}
      <View onLayout={fill ? onBlockLayout : undefined}>
      {/* "Fajr in" leading, and on the trailing end of the same line —
          the side with nothing on it — the heart that opens Help Mihrab. */}
      <HeroEyebrow label={eyebrowLabel} ink={inkTop} renderHelp={topRow?.renderHelp} />
      {/* Hours, minutes and seconds as pieces, so the row's direction puts
          them in reading order — hours first from the right in Arabic, from
          the left in English (#71). One string kept them left to right
          inside a right-to-left row, with the seconds on the wrong side. */}
      <View style={styles.heroCountdownRow}>
        <View style={[styles.heroMain, expanded && styles.heroMainExpanded]}>
          {pieces.hours ? (
            <Text
              style={[
                styles.heroCountdown,
                expanded && styles.heroCountdownExpanded,
                tabularNumeralStyle,
                { color: ink.text },
                glow,
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
              accessibilityLanguage={unitLang}>
              {pieces.hours}
            </Text>
          ) : null}
          <Text
            style={[
              styles.heroCountdown,
              expanded && styles.heroCountdownExpanded,
              tabularNumeralStyle,
              { color: ink.text },
              glow,
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
            accessibilityLanguage={unitLang}>
            {pieces.minutes}
          </Text>
        </View>
        <Text
          style={[
            styles.heroSeconds,
            expanded && styles.heroSecondsExpanded,
            tabularNumeralStyle,
            { color: ink.muted },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          accessibilityLanguage={unitLang}>
          {pieces.seconds}
        </Text>
        <Text
          style={[styles.heroAt, tabularNumeralStyle, { color: ink.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          accessibilityLanguage="en-US">
          {targetClock}
        </Text>
      </View>
      {rail ? (
        <View style={styles.railWrap}>
          <View style={[styles.railTrack, { backgroundColor: inkFoot.track }]}>
            <View
              style={[
                styles.railFill,
                {
                  backgroundColor: inkFoot.fill,
                  // Unrounded: on a launch the rail slides from where the
                  // kept picture left it (launchWarp), and whole percents
                  // would step.
                  width: `${(railPct * 100).toFixed(2)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.railLabels}>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: inkFoot.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {railFromLabel}
            </Text>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: inkFoot.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {targetLabel}
            </Text>
          </View>
        </View>
      ) : null}
      </View>
    </View>
  );
});

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
  renderLocation,
  skyTimings,
  latitude,
  longitude,
  dayClock,
}: TodayCardProps) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();
  const { settings, updateSettings } = usePrayerSettings();
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
  const columnPad =
    fullBleed && !roomy && vbar
      ? vbar.side === 'right'
        ? { paddingRight: vbar.width } // rtl-safe: the vertical bar is on a physical side
        : { paddingLeft: vbar.width } // rtl-safe: the vertical bar is on a physical side
      : null;
  const heroColumnPad =
    fullBleed && !roomy && vbar
      ? vbar.side === 'right'
        ? { paddingRight: SPACING.xl + vbar.width } // rtl-safe: the vertical bar is on a physical side
        : { paddingLeft: SPACING.xl + vbar.width } // rtl-safe: the vertical bar is on a physical side
      : null;
  /**
   * Dense rows when the page would not otherwise hold the day: a short
   * phone (under 720dp of window), or a table past six rows — the extra
   * times, the Mālikī boundaries. The design's whole point is the day on
   * one screen; 4dp less air per row is the cheapest way to keep it.
   */
  const windowHeight = useWindowSize().height;
  const shortScreen = windowHeight > 0 && windowHeight < DENSE_BELOW_HEIGHT;
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
    ? Math.round(Math.min(Math.max(windowHeight * 0.34, 300), 460))
    : undefined;
  const Outer = fullBleed ? View : GlassSurface;
  const renderQibla = (ink: SkyInkColors, column?: boolean) =>
    fullBleed && qiblaBearing != null ? (
      <QiblaChip bearing={qiblaBearing} onPress={onOpenQibla} ink={ink} column={column} />
    ) : null;
  const renderHelp = (ink: SkyInkColors) =>
    onHelpMihrab ? <HelpMihrabChip ink={ink} onPress={onHelpMihrab} /> : null;

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
    // A Mālikī boundary is a second line on the row, so a table carrying
    // them weighs two rows more than its count says.
    const withDaruri = rows.some(key => dayTimings[`${key}Daruri`]);
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
    const dense = fullBleed && (shortScreen || rows.length + (withDaruri ? 2 : 0) > DENSE_ABOVE_ROWS);
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
        dense={dense}
      />
    ));
  };

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
      <View
        style={[
          styles.heroWrap,
          heroColumnPad,
          { paddingTop: heroTop },
          fullBleed && !roomy && styles.heroWrapBleed,
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
              left: heroBox.x - SPACING.xl - twinBarLeft,
              top: heroBox.y - heroTop,
              width: heroBox.w + SPACING.xl * 2 + twinBarLeft + twinBarRight,
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
                left: SPACING.xl + twinBarLeft,
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
              bleed={{ horizontal: SPACING.xl, top: heroTop, bottom: SPACING.lg }}
              statusBarInset={underStatusBar ? insets.top : 0}
              fill={fullBleed}
              topRow={fullBleed ? { renderLocation, renderQibla } : undefined}
              frozenAt={interval.fromAt}
              skyTheme={settings.appearance === 'sky'}
              skyVariant={settings.skyVariant}
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
            today={timings}
            skyToday={skyDay}
            latitude={latitude}
            longitude={longitude}
            tomorrowFajr={skyTomorrowFajr}
            dayClock={dayClock}
            expanded={expanded}
            bleed={{ horizontal: SPACING.xl, top: heroTop, bottom: SPACING.lg }}
            statusBarInset={underStatusBar ? insets.top : 0}
            fill={fullBleed}
            topRow={fullBleed ? { renderLocation, renderQibla, renderHelp } : undefined}
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
      </View>

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
        <View style={[styles.dayBar, { backgroundColor: palette.bg }]}>
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
            </View>
            {/* One line, two things it may say: the day's Hijri date, or
                — for a moment after a tap that could not be recorded —
                why. Never both, and never a line of different height:
                the table below must not move under the thumb. */}
            <Text
              style={[
                styles.dayHijri,
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
        </View>

        <View onLayout={onTableLayout}>
          {pageWidth > 0 ? (
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
              // …and on the day the card LANDS on, which after the last
              // time of the night is tomorrow. Read once, at mount, which
              // is the only time this prop is.
              initialScrollIndex={pagePosition(todayIndex + landedAtMount)}
              // Left to right whatever the language: see `pagerPosition`.
              style={styles.pager}
              data={rtl ? pagesReversed : pages}
              keyExtractor={(_, position) =>
                String(pagePosition(position) - todayIndex)
              }
              getItemLayout={pageLayout}
              onMomentumScrollEnd={onPageSettled}
              // A finger on the pager is a choice of day, and the card
              // stops turning itself from here on. The settle cannot say
              // this: a programmatic scroll settles identically.
              onScrollBeginDrag={() => {
                chose.current = true;
              }}
              // Nested in the page's vertical scroll: this one owns only
              // clearly horizontal drags.
              nestedScrollEnabled
              renderItem={({ index }) => (
                <View
                  style={[
                    { width: pageWidth },
                    rtl ? styles.pageRtl : styles.pageLtr,
                  ]}>
                  {renderDay(pagePosition(index) - todayIndex)}
                </View>
              )}
            />
          ) : (
            // Before the page has been measured (the first frame, and a
            // test renderer) there is no pager — so draw the day the card
            // is on, not today, or an evening open would show today's
            // rows for a frame under a bar already saying tomorrow.
            renderDay(selected)
          )}
        </View>
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

        {onOpenMonth ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.monthTimesLink')}
            accessibilityHint={t('a11y.openMonth')}
            onPress={onOpenMonth}
            style={[
              styles.monthRow,
              { borderTopColor: palette.border ?? palette.muted },
            ]}>
            <Text
              style={[styles.monthLabel, { color: palette.accent }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
              {t('home.monthTimesLink')}
            </Text>
            <Text style={[styles.monthChevron, { color: palette.accent }]}>
              {rtl ? '←' : '→'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Outer>
  );
}

export const TodayCard = memo(TodayCardImpl);

const styles = StyleSheet.create({
  // Over the twin's sky, which runs on under the column.
  twinColumn: { position: 'absolute', alignItems: 'center', zIndex: 1 },
  card: { overflow: 'hidden' },
  // Full-bleed: no radius — the sky meets the day bar as one plane, not
  // a card foot over the page. Grow to fill the page; never shrink under
  // the content. `flex: 1` would set flexBasis 0 and let a long table
  // (extra times, the Mālikī boundaries) squash the hero to nothing;
  // with basis auto the hero keeps its own height and the page scrolls
  // the little it then has to.
  cardBleed: { overflow: 'hidden', flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  // Roomy: natural height, and the page centres it — see `roomy`.
  cardRoomy: { overflow: 'hidden' },
  heroWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },
  heroWrapBleed: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    overflow: 'hidden',
  },
  // No side padding: the rows are the page's now, edge to edge, and they
  // carry the hero's own inset (`SPACING.xl`) themselves — see PrayerRow.
  // The 16dp this used to add kept the table inside the ghost of the
  // card it once sat in, a step in from where the hero's text begins.
  // Roomy: a panel with all four corners, inset from the page's edges
  // like the cards on every other tab.
  heroWrapRoomy: {
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: HOME_TABLE_RADIUS,
    overflow: 'hidden',
    marginHorizontal: HOME_SCREEN_PADDING,
  },
  tableBleed: {},
  /**
   * The day bar: a chevron at each edge and the day between them.
   * Same solid ground as the prayer table — sky and page are two surfaces;
   * they meet with a clean cut, not a blend.
   */
  dayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  /** Ink with a hit slop, not a button with a fill. */
  // The day pager scrolls left to right in every language — see `pagerPosition`.
  pager: { direction: 'ltr' },
  pageLtr: { direction: 'ltr' },
  pageRtl: { direction: 'rtl' },
  dayStep: { padding: SPACING.xs, alignItems: 'center', justifyContent: 'center' },
  /** At either end of the record there is nowhere to step. */
  dayStepOff: { opacity: 0.25 },
  dayStepPressed: { opacity: 0.55 },
  /** The day itself — the bar's middle, and the way back to today. */
  dayFace: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  dayFaceLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  todayDot: { width: 5, height: 5, borderRadius: 2.5 },
  dayWeekday: { fontSize: TYPE.callout.fontSize, fontWeight: '600' },
  dayDate: { fontWeight: '400' },
  dayHijri: { fontSize: TYPE.caption.fontSize, marginTop: 2 },
  dayBack: { fontWeight: '700' },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  /**
   * The location chip, ON the hero's content edge.
   *
   * The chip is a pressable with its own touch padding, and it fills a
   * flexible slot — so it stretched across the room between the edge and
   * the Qibla chip and centred its pin inside that, leaving a void to the
   * chip's left and putting the city out of line with the countdown and
   * the date beneath it. `flex-start` sizes the slot's child to its
   * content, and the negative start margin cancels the chip's padding so
   * the pin's own edge lands where the hero's text begins; the tap target
   * keeps its full size.
   */
  heroTopLeading: {
    flexShrink: 1,
    flexGrow: 1,
    alignItems: 'flex-start',
    marginStart: -SPACING.sm,
  },
  hero: {},
  heroExpanded: { paddingVertical: SPACING.md },
  heroFill: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  /** Grows; the sun and moon cross it — and gives way first when the
   *  table needs the room (the sky then hides its bodies, see HeroSky). */
  // Never below a moon's worth of sky: the table may push the page into
  // a scroll, but it may not take the night out of the hero.
  heroScene: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 64 },
  // Sentence case, quiet: the countdown is the thing the eye lands on and
  // the eyebrow only names what it counts to. It was an uppercase,
  // letterspaced overline — the 2016 idiom (docs/design/redesign-plan.md
  // §2.1, the `label` token).
  heroEyebrow: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '600',
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroEyebrowText: { flex: 1 },
  heroCountdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginTop: 2,
  },
  // The space a "5h 25m" string had between its hours and its minutes, at
  // the countdown's size.
  heroMain: { flexDirection: 'row', alignItems: 'baseline', gap: 13 }, // tokens-ok-line: a word space at 54
  heroMainExpanded: { gap: 19 }, // tokens-ok-line: a word space at 78
  // The question the app is opened to answer, at the size that says so.
  heroCountdown: { fontSize: 54, fontWeight: '700' }, // tokens-ok-line: display or Arabic scale, sized by hand
  heroCountdownExpanded: { fontSize: 78 }, // tokens-ok-line: display or Arabic scale, sized by hand
  // Two thirds of the "at" line's weight and a third of the countdown's
  // size: present, readable, and never the thing the eye lands on first.
  heroSeconds: { fontSize: TYPE.title2.fontSize, fontWeight: '600', marginStart: -3 },
  heroSecondsExpanded: { fontSize: 28 }, // tokens-ok-line: display or Arabic scale, sized by hand
  heroAt: { fontSize: TYPE.title3.fontSize, fontWeight: '600' },
  railWrap: { marginTop: SPACING.md },
  railTrack: { height: 5, borderRadius: RADIUS.xs, overflow: 'hidden' },
  railFill: { height: '100%', borderRadius: RADIUS.xs },
  railLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  railLabel: { fontSize: TYPE.label.fontSize, fontWeight: '600' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  monthLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  monthChevron: { fontSize: TYPE.callout.fontSize },
});
