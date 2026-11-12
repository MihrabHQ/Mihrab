/**
 * The Today card's hero: the sky, the countdown, the rail — and under
 * Minimal, the whole page. One component (`HeroToday`), drawn by
 * `TodayCard` for today and posed for the launch picture.
 *
 * Split out of TodayCard.tsx, which had grown to 3,400 lines holding the
 * hero and the day's table both; the card's own notes (the order of the
 * page, why the hero adapts) are at the top of that file.
 */
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StatusBar,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { rememberedTodayLayout, rememberTodayLayout } from './todayLayoutMemory';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useIsActive } from '../../hooks/useIsActive';
import { useLively } from '../../hooks/useLively';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import {
  easeOutCubic,
  launchRunDurationMs,
  type WarpStart,
  markLaunchRunReady,
  useLaunchWarp,
  warpPct,
  warpRemaining,
  warpSkyAt,
} from '../../boot/launchWarp';
import { crossfadeScreen, setLaunchHeroState } from '../../native/LaunchSnapshot';
import { useHeroClock } from './useHeroClock';
import { dayRailOf, intervalRail } from './heroRail';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import {
  TABULAR_MAX_FONT_SCALE,
  TITLE_BAND_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import type { TimingsMap } from '../../types/prayer';
import { countdownPieces, wallClockDate } from '../../utils/prayerTimes';
import { isRtlLanguage } from '../../i18n/layoutDirection';
import { HeroSky, type SkyRun } from './HeroSky';
import { trackFrame, trackWindow } from './trackModel';
import { TrackExplainer, useTrackExplain } from './TrackExplainer';
import type { HeroLook } from '../../settings/types';
import {
  HERO_Y,
  SKY_FADE_LOW_MID_AT,
  SKY_THEME_MID_AT,
  skyFrame,
  skyInkAt,
  HERO_SPAN,
  skyMoment,
  themedSkyFrame,
  type SkyFrame,
  type SkyInkColors,
} from './skyModel';
import { skyMoodFor, type SkyVariant } from '../../theme/skyMoods';
import { setHeroSkyBand } from './heroSkyBand';
import { publishSkyTheme, skyDayKey } from '../../theme/skyTheme';
import { useVerticalBar } from '../../native/VerticalBar';
import { SPACING } from '../../theme/tokens';
import { HERO_COUNTDOWN_SIZE, HERO_SCENE_MIN, HERO_SECONDS_SIZE, type HomeTier } from './homeBudget';

import { RAIL_LINE, RAIL_TICK, RAIL_TICK_TARGET, styles } from './todayCardStyles';

/** Minimal under the Track: the chart goes on under the line to its floor (see `trackDepth`). */
const MINIMAL_TRACK_DEPTH = true;
/** Minimal: the seconds appear this close to the prayer — the last five minutes. */
const MINIMAL_SECONDS_UNDER = 5 * 60;
/** The unit letters' size in the figures' em, and the seconds' unit in theirs. */
const UNIT_EM = 0.4;
const SECONDS_UNIT_EM = 0.7;
/** The dashboard card's sky band, dp: the room a desktop has to spare. */
const HERO_SCENE_EXPANDED = 96;
/** The hair space (U+200A) between a figure and its unit letter. */
const UNIT_HAIR = '\u200A';

/** A system face's ascender, in ems — only until the real one is measured. */
const HERO_ASCENT_EM = 0.93;

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

/**
 * "Fajr in" — and, when the hero has been aimed at a row by a tap, a
 * word after it saying so, and a tap on the line to hand the hero back.
 * Without the word the aimed hero looked exactly like the ordinary one,
 * and a reader who had forgotten the tap saw the app counting down to
 * the wrong prayer (2.33). The row's own marker says the same thing; the
 * eyebrow is where the eye reads what is being counted.
 */
const HeroEyebrow = memo(function HeroEyebrow({
  label,
  chosen,
  chosenA11y,
  onClear,
  ink,
  renderHelp,
}: {
  label: string;
  /** The word after the label while the hero is aimed by a tap, else null. */
  chosen?: string | null;
  chosenA11y?: string;
  onClear?: () => void;
  ink: SkyInkColors;
  renderHelp?: (ink: SkyInkColors) => ReactNode;
}) {
  const text = (
    <Text
      style={[styles.heroEyebrow, chosen ? null : styles.heroEyebrowText, { color: ink.muted }]}
      numberOfLines={1}
      maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
      {label}
      {chosen ? <Text style={{ color: ink.text }}>{` · ${chosen}`}</Text> : null}
    </Text>
  );
  return (
    <View style={styles.heroEyebrowRow}>
      {chosen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={chosenA11y}
          onPress={onClear}
          hitSlop={8}
          style={({ pressed }) => [styles.heroEyebrowText, pressed && styles.dayStepPressed]}>
          {text}
        </Pressable>
      ) : (
        text
      )}
      {renderHelp?.(ink)}
    </View>
  );
});
/** How many times the hero's ink is re-read from the sky over a launch run (see HeroToday). */
/**
 * Minimal's figures (settings.minimalUi): larger than any tier's, since
 * nothing shares the page with them — and still light, still one line.
 */
const MINIMAL_COUNTDOWN_SIZE = 76; // tokens-ok-line: display scale, sized by hand
/**
 * Minimal: how far a drag up on the page takes the sheet's rise before
 * the finger lets go — a third at most, over about a hand's height of
 * drag — so the page is seen to answer the finger, and the sheet's own
 * spring still has most of the way to come.
 */
export const SWIPE_UP_PULL = 0.35;
export const SWIPE_UP_REACH = 260;
const MINIMAL_SECONDS_SIZE = 28; // tokens-ok-line: display scale, sized by hand
export const SKY_RUN_STEPS = 30;
/** The most keyframes the run's native sky is built from (HeroSky, `SkyRunLayers`). */
export const SKY_RUN_KEYFRAMES_MAX = 9;

export const HeroToday = memo(function HeroToday({
  target,
  chosen,
  onExpire,
  today,
  skyToday,
  latitude,
  longitude,
  tomorrowFajr,
  expanded,
  tier = 'comfortable',
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
  heroLook = 'sky',
  band = false,
  dayClock,
  minimal = false,
  recess,
  footer,
  onOpenTimes,
  layoutKey,
}: {
  /** The band: the painted sky, or the Track (settings `heroLook`, trackModel.ts). */
  heroLook?: HeroLook;
  /**
   * A card with a sky band of its own above the text — the desktop's
   * cards, wide (the dashboard) or narrow (a window the size of a
   * phone): the page's structure, in a card. Without it the card is the
   * short one the tablet's roomy page and the dashboard's neighbours
   * draw, laid out for a sky that is the whole hero.
   */
  band?: boolean;
  /**
   * Minimal: open the day's times — for a screen reader, from the prayer's
   * line. A finger opens them by the drag up on the page (TodayCardImpl).
   */
  onOpenTimes?: () => void;
  /**
   * What the hero's measured sizes depend on (TodayCardImpl, `layoutKey`):
   * with it the sizes kept under that key from the last launch stand in
   * until this one's measure, so the first frame is already the settled
   * one (todayLayoutMemory.ts). Absent on the dashboard's card.
   */
  layoutKey?: string;
  /** The clock `today` is written on (`TodayCardProps.dayClock`). */
  dayClock?: string;
  /**
   * Minimal (settings.minimalUi): the hero is the whole page. No top row
   * and no eyebrow; the countdown stands in the middle of the sky with
   * the prayer's name and time under it, the rail under that, and the
   * footer line at the foot. Nothing on it takes a tap of its own — the
   * drag up on the card around it opens the day's times.
   */
  minimal?: boolean;
  /**
   * Minimal: the transform the hero's FOREGROUND takes as the day's
   * times come up — the figures, the rail and the footer ease back under
   * the sheet while the sky stays where it is, out to every edge. (The
   * whole page scaled once, and the sky's bleed showed its edges and a
   * cut along the top.) See MinimalSheet.
   */
  recess?: Animated.WithAnimatedValue<ViewStyle> | null;
  /** Minimal: the line at the foot — where, which day, whose times. */
  footer?: string;
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
  /** The page's size (homeBudget.ts): the scene's floor and the figures' size. */
  tier?: HomeTier;
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
  const { t, i18n } = useTranslation();
  const rtl = isRtlLanguage(i18n.language);
  const clock = useClockFormatter();
  // Focus AND foreground. `useIsFocused()` on its own kept this ticking once
  // a second in the user's pocket: backgrounding the app from the Today tab
  // leaves Today the focused route, so the timer never stopped.
  const active = useIsActive();
  const reduceMotion = useReduceMotion();
  const posed = frozenAt != null;
  // Minimal: the rail head's breath. Only while looked at (focus AND
  // foreground, the countdown's own gate), never under Reduce Motion,
  // never in the posed twin. One native loop; nothing on the JS thread —
  // and only for a while after the page comes in front (useLively): a
  // loop that never ends keeps the renderer drawing every frame for as
  // long as the page is up.
  const lively = useLively(active && !posed);
  /**
   * MINIMAL UNDER THE TRACK HAS NO RAIL. The Track draws the day as the
   * sun's path with the body on it and the stretch to the next prayer
   * bolder — the progress the rail was there to show, twice over on a page
   * of two things. The line under the figures stays ("Fajr · 04:57").
   * Without coordinates the Track does not draw (the painted sky stands),
   * and the rail is back. Its numbers are still worked out: the launch run
   * reads them.
   */
  const railHidden = minimal && heroLook === 'track' && typeof latitude === 'number' && typeof longitude === 'number';
  /**
   * MINIMAL'S TRACK GOES UNDER THE LINE. With the rail gone the page had
   * half a screen of empty sky under the figures, and the chart squeezed
   * into a strip at the top. The chart takes the room: the horizon comes
   * down to the page's middle and the countdown stands under it, and the
   * chart goes on under the line to its floor, to the same scale — the
   * sun's path down into the twilights and back, Fajr's and Isha's rings
   * at the depth those prayers are reckoned by. Under it the band follows
   * the sun all night, since that depth is what the night's prayers are.
   */
  const trackDepth = railHidden && MINIMAL_TRACK_DEPTH;
  const breathing = minimal && !railHidden && lively && !reduceMotion && !posed;
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!breathing) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathing, breath]);
  /**
   * What the hero last showed — the numbers on screen, warped or live —
   * so a return after time away can run from them (launchWarp.ts,
   * `startResumeRun`). Written on every render, read on the return.
   */
  const shown = useRef<WarpStart | null>(null);
  // Read on the return, through a ref: a change of the setting must not
  // tear the clock down and set it up again.
  const resumeWanted = useRef(false);
  resumeWanted.current = launchRunWanted && !reduceMotion && !posed;
  // The clock: on the seconds, or on Minimal's minute (useHeroClock.ts).
  const liveNow = useHeroClock({
    running: active && !posed,
    targetMs: target.at.getTime(),
    secondsUnder: minimal ? MINIMAL_SECONDS_UNDER : null,
    shown,
    resumeWanted,
  });
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


  // The rail between the last prayer and the next, and Minimal's rail of
  // the whole day: heroRail.ts.
  const rail = useMemo(() => intervalRail(today, now, target.at, dayClock), [today, now, target.at, dayClock]);
  const dayRail = useMemo(() => (minimal ? dayRailOf(today, now, dayClock) : null), [minimal, today, now, dayClock]);

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
      const mood = skyMoodFor(f.passage, f.t, undefined, heroVariant, f.light);
      if (skyTheme) return themedSkyFrame(f, mood);
      return themedSkyFrame(
        f,
        { ...mood, heroFoot: pageBg },
        mood.isDark === pageDark ? SKY_THEME_MID_AT : lowMidAt,
      );
    },
    [skyTheme, heroVariant, pageBg, pageDark, lowMidAt],
  );
  /**
   * The Track look (trackModel.ts) at a moment: the band as a chart of
   * the sky, from the reader's coordinates — nothing without them, when
   * the painted sky stands. By night the band follows the moon from the
   * evening's Maghrib to the morning's sunrise; otherwise the sun over the
   * local day. Read once a minute for the live hero, and once per
   * keyframe for a launch run's ride along it.
   */
  const targetAtMs = target.at.getTime();
  const trackPrevAtMs = rail ? rail.from.at.getTime() : null;
  const trackAt = useCallback(
    (at: Date, passage: SkyFrame['passage']) => {
      if (heroLook !== 'track' || typeof latitude !== 'number' || typeof longitude !== 'number') return null;
      // Under the line the sun is followed through the night, so the window
      // is the 24 hours that END at the next prayer, not the calendar's
      // day: it holds now and the next prayer at once — at 18:00 the
      // evening behind and tomorrow's Fajr ahead — and stays the same for
      // the whole of a prayer's interval (one sampling per interval).
      // Across is by azimuth, so whichever 24 hours they are, the loop is
      // the day's one loop; where it closes, a day apart, the two ends are
      // a fraction of a degree out, and that seam is under the ring.
      // By night, in either layout, the same: the sun through the night.
      // And by day too when the next prayer is past the day's midnight —
      // a Maghrib or Isha after midnight in a northern summer, tomorrow's
      // Dhuhr under the midnight sun — or its ring would have no place.
      const throughNight = trackDepth || passage === 'night';
      const day = trackWindow(at);
      const window = throughNight || targetAtMs > day.to.getTime()
        ? {
            kind: 'sun' as const,
            from: new Date(Math.min(at.getTime(), targetAtMs - 24 * 3_600_000)),
            to: new Date(Math.max(at.getTime(), targetAtMs)),
          }
        : day;
      return trackFrame({
        ...window,
        now: at,
        latitude,
        longitude,
        nextAt: new Date(targetAtMs),
        // Under the line, the interval's other end too: Isha's place on the
        // right while the night runs to Fajr on the left.
        prevAt: throughNight && trackPrevAtMs != null ? new Date(trackPrevAtMs) : null,
      });
    },
    [heroLook, latitude, longitude, targetAtMs, trackDepth, trackPrevAtMs],
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
      const f = paint(skyFrame(skyMoment(day, at, tomorrowFajr), at, { latitude, longitude }));
      return { at: at.getTime(), passage: f.passage, frame: f };
    });
    // The chart's body at the same keyframes, for the Track to ride.
    const tracks = frames.map(f => trackAt(new Date(f.at), f.passage));
    runProgress.current.setValue(0);
    skyRunRef.current = { frames: frames.map(f => f.frame), progress: runProgress.current, tracks };
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
  const shownRemaining = warp ? warpRemaining(warp, remainingSeconds, warpE) : remainingSeconds;
  const pieces = countdownPieces(shownRemaining, units);
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
  // From the last launch's settled sizes, where they are kept for this
  // key; measured afresh, and kept again, below.
  const kept = fill && layoutKey ? rememberedTodayLayout(layoutKey) : null;
  const [heroH, setHeroH] = useState(kept?.heroH ?? 0);
  const [topRowH, setTopRowH] = useState(kept?.topRowH ?? 0);
  const [block, setBlock] = useState<{ y: number; h: number } | null>(kept?.block ?? null);
  useEffect(() => {
    if (!fill || !layoutKey || heroH <= 0 || block == null) return;
    rememberTodayLayout(layoutKey, { heroH, topRowH, block });
  }, [fill, layoutKey, heroH, topRowH, block]);
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
    const next = { y: Math.round(y), h: Math.round(height) };
    setBlock(prev => (prev && prev.y === next.y && prev.h === next.h ? prev : next));
  }, []);
  // The hero's box excludes the bleed, so a fraction of the SKY (which is
  // the box plus the bleed) is offset by the bleed's top.
  const bleedTop = bleed?.top ?? 0;
  const bleedBottom = bleed?.bottom ?? 0;
  const skyH = heroH + bleedTop + bleedBottom;
  // The band is measured on the page AND in the dashboard's card: the
  // card used to draw the sun — and now the Track — over its own eyebrow,
  // laid out for a sky that was the whole hero. Only the roomy tablet
  // card, whose height is the hinge's, keeps the drawn fractions.
  const banded = fill || expanded || band;
  const measured = banded && heroH > 0 && block !== null;
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
      { top: liveSky.top, bottom: liveSky.bottom, passage: liveSky.passage, t: liveSky.t, light: liveSky.light },
      {
        day: skyDayKey(new Date(liveMinuteKey * 60_000)),
        times: skyToday ?? today,
        tomorrowFajr,
        where: typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : undefined,
      },
    );
  }, [posed, liveSky.top, liveSky.bottom, liveSky.passage, liveSky.t, liveSky.light, liveMinuteKey, skyToday, today, tomorrowFajr, latitude, longitude]);

  // Memoised on the sky's step and the measured heights: the top row and
  // the eyebrow below are memoised on their ink, and the launch run
  // redraws the hero every frame.
  const yEyebrow = measured ? heroY.eyebrow : HERO_Y.eyebrow;
  const yCountdown = measured ? heroY.countdown : HERO_Y.countdown;
  const yFoot = measured ? heroY.foot : HERO_Y.foot;
  /**
   * The countdown is flat ink, in every sky and both colour sets: no halo
   * of the hour's accent behind it by night, no tint toward it in Minimal.
   * The sky carries the hour's colour; the figures are only read, and a
   * glow or a tint blurred them and made them a colour of the theme.
   */
  /**
   * The hero is the first thing to repaint when the hour turns from dark to
   * light or back (its sky is read every minute; the app's palette follows
   * from what the hero publishes, a commit later). So the hero asks for the
   * crossfade (native/LaunchSnapshot.ts, `crossfadeScreen`) BEFORE it
   * repaints — a still of the screen as it is, faded over both commits —
   * and the store's own ask a moment later finds one up and does nothing.
   */
  const moodDark = skyTheme ? skyMoodFor(frame.passage, frame.t, undefined, heroVariant, frame.light).isDark : null;
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
  /**
   * The baselines of the countdown and of the time, from the text engine.
   *
   * Each is the first line's top plus its ascender, inside its own view;
   * both views start at the row's top, so the difference is how far the
   * time has to come down to stand on the countdown's baseline. Until both
   * have been laid out once, the ascender is estimated from the sizes.
   */
  const [countdownBase, setCountdownBase] = useState<number | null>(null);
  const [atBase, setAtBase] = useState<number | null>(null);
  const onCountdownLine = useCallback((e: { nativeEvent: { lines: Array<{ y: number; ascender: number }> } }) => {
    const l = e.nativeEvent.lines[0];
    if (l) setCountdownBase(prev => (prev != null && Math.abs(prev - (l.y + l.ascender)) < 0.5 ? prev : l.y + l.ascender));
  }, []);
  const onAtLine = useCallback((e: { nativeEvent: { lines: Array<{ y: number; ascender: number }> } }) => {
    const l = e.nativeEvent.lines[0];
    if (l) setAtBase(prev => (prev != null && Math.abs(prev - (l.y + l.ascender)) < 0.5 ? prev : l.y + l.ascender));
  }, []);
  // Minimal: the figures are the page, and sized as the page's one thing.
  const countdownSize = minimal ? MINIMAL_COUNTDOWN_SIZE : HERO_COUNTDOWN_SIZE[tier];
  const secondsSize = minimal ? MINIMAL_SECONDS_SIZE : HERO_SECONDS_SIZE[tier];
  const bigSize = expanded ? styles.heroCountdownExpanded.fontSize : countdownSize;
  // Precision follows the distance (see the line below): the seconds are
  // kept inside the last hour on the full page, and under Minimal only
  // inside the last minutes, where the page quickens as the prayer comes.
  const showSeconds = minimal ? shownRemaining < MINIMAL_SECONDS_UNDER : pieces.h === 0;
  const atShift = Math.max(
    0,
    countdownBase != null && atBase != null
      ? countdownBase - atBase
      : HERO_ASCENT_EM * (bigSize - styles.heroAt.fontSize),
  );
  const inkTop = useMemo(() => skyInkAt(frame, yEyebrow, HERO_SPAN.eyebrow), [frame, yEyebrow]);
  const ink = useMemo(() => skyInkAt(frame, yCountdown, HERO_SPAN.countdown), [frame, yCountdown]);
  /**
   * The Track look (trackModel.ts): the band as a chart of the sky, from
   * the reader's coordinates — nothing without them, when the painted sky
   * stands. Once a minute, with the frame: the body moves on the engine's
   * tick, the ring at the next prayer, the track once a day. By night the
   * band follows the moon from the evening's Maghrib to the morning's
   * sunrise; otherwise the sun over the local day.
   */
  const track = useMemo(
    () => trackAt(new Date(minuteKey * 60_000), frame.passage),
    [trackAt, minuteKey, frame.passage],
  );
  /**
   * Where a sky turns into a page of the other polarity (a night sky over
   * the Light theme's page, a day's over the Dark's) it does so under the
   * block, in the last of the hero. The rail and its two names are the
   * block's foot: on the sky, not in the turn. Sampled across the turn,
   * the foot's ink came out the PAGE's — a black rail and black names on
   * a night sky, every night under Light — so there it is taken from the
   * sky just above the turn.
   */
  const turnAt = frame.midAt != null && frame.midAt > SKY_THEME_MID_AT ? frame.midAt : null;
  const yFootInk = turnAt != null ? Math.min(yFoot, turnAt - HERO_SPAN.foot) : yFoot;
  const inkFoot = useMemo(() => skyInkAt(frame, yFootInk, HERO_SPAN.foot), [frame, yFootInk]);
  /**
   * Minimal stacks the countdown, its line and the rail in the middle of
   * the page, and the rail took the foot's ink while the figures over it
   * took the middle's: on an evening sky, where the glow's band lies
   * between them, white figures stood over a black rail. One stack, one
   * ink — the figures'. The full page keeps the rail at the foot, in the
   * foot's.
   */
  const railInk = minimal ? ink : inkFoot;
  /**
   * Minimal's footer is at the page's foot, far under the block's, and it
   * was inked for the block's foot: dark words on the night band under an
   * evening sky. Its own ink, at where it is.
   */
  const [footerAt, setFooterAt] = useState<number | null>(null);
  const onFooterLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    const mid = Math.round(y + height / 2);
    setFooterAt(prev => (prev === mid ? prev : mid));
  }, []);
  const yFooter =
    minimal && footerAt != null && skyH > 0 ? Math.min(1, (bleedTop + footerAt) / skyH) : yFoot;
  const inkFooter = useMemo(() => skyInkAt(frame, yFooter, HERO_SPAN.eyebrow), [frame, yFooter]);
  // The units: under half the figures' size, the muted ink, plain weight,
  // untracked — small caps beside the digits, on their baseline.
  const unitStyle = useMemo(
    () => [styles.heroUnit, { fontSize: Math.round(bigSize * UNIT_EM), color: ink.muted }],
    [bigSize, ink.muted],
  );
  const secondsUnitStyle = useMemo(
    () => [styles.heroUnit, { fontSize: Math.round(secondsSize * SECONDS_UNIT_EM), color: ink.muted }],
    [secondsSize, ink.muted],
  );
  const digitInk = ink.text;
  const eyebrowLabel = useMemo(
    () =>
      t('home.nextPrayerIn', {
        defaultValue: '{{prayer}} in',
        prayer: t(`prayer.${target.name}`),
      }),
    [t, target.name],
  );
  const targetLabel = useMemo(() => t(`prayer.${target.name}`), [t, target.name]);
  // Tap the band and the Track names its parts (TrackExplainer).
  const explain = useTrackExplain();
  const trackLabels = useMemo(
    () =>
      track
        ? {
            open: explain.open,
            opacity: explain.opacity,
            path:
              track.kind === 'moon'
                ? t('home.trackLabelMoonPath', "Moon's path")
                : t('home.trackLabelSunPath', "Sun's path"),
            below:
              track.kind === 'moon'
                ? t('home.trackLabelMoonBelow', 'Moon below the horizon')
                : t('home.trackLabelSunBelow', 'Sun below the horizon'),
            horizon: t('home.trackLabelHorizon', 'Horizon'),
            prayer: targetLabel,
          }
        : undefined,
    [track, explain.open, explain.opacity, t, targetLabel],
  );
  const railFromKey = rail?.from.key;
  const railFromLabel = useMemo(() => (railFromKey ? t(`prayer.${railFromKey}`) : ''), [t, railFromKey]);
  // On the day's clock, as the rows are: a saved place's own time.
  const targetClock = useMemo(
    () => clock.fromDate(wallClockDate(target.at, dayClock)),
    [clock, target.at, dayClock],
  );
  // The band the bodies keep out of: the status bar and the top row above,
  // the countdown block (and the hero's foot padding) below.
  // In the card the sky bleeds past the box by the hero's own padding, so
  // the band's top is the bleed and the top row, as the status bar and the
  // top row are on the page.
  const sceneTop = banded ? (fill ? statusBarInset : bleedTop + (expanded ? SPACING.md : 0)) + topRowH + SPACING.md : 0;
  const sceneBottom = banded && block ? heroH - block.y + bleedBottom : 0;


  // What the countdown is aimed at, and the rail's start: kept with the
  // next launch picture so that launch can run from them (launchWarp).
  const railFromAt = rail ? rail.from.at.getTime() : 0;
  useEffect(() => {
    if (posed) return;
    setLaunchHeroState(target.at.getTime(), railFromAt);
    onInterval?.(railFromAt, target.at.getTime());
  }, [posed, target.at, railFromAt, onInterval]);
  // Minimal reads the day rail's fraction; the full page the interval's.
  const liveRailPct = dayRail ? dayRail.pct : rail ? rail.pct : null;
  const railPct = liveRailPct != null ? (warp ? warpPct(warp, liveRailPct, warpE) : liveRailPct) : 0;
  // The numbers on screen this render, for a return run to start from.
  if (!posed) {
    shown.current = { remaining: shownRemaining, pct: rail ? railPct : null, at: now.getTime(), targetAt: target.at.getTime() };
  }

  const Fore = (minimal ? Animated.View : Unwrapped) as typeof Animated.View;
  return (
    <View
      style={[styles.hero, expanded && styles.heroExpanded, fill && styles.heroFill]}
      onLayout={banded || onLayout ? onHeroLayout : undefined}>
      {/* The sky, under everything and out to the card's edges — and, on
          the phone, up under the status bar. */}
      <HeroSky
        frame={frame}
        run={skyRun ?? undefined}
        denseStars
        // Still once the arrival has passed (useLively) as well as posed:
        // the stars twinkle for a while after the page comes in front,
        // then the sky stands.
        still={posed || !lively}
        sceneTop={sceneTop}
        sceneBottom={sceneBottom}
        track={track}
        trackInk={inkTop.text}
        trackLabelInk={inkTop.muted}
        trackLabels={trackLabels}
        trackDepth={trackDepth}
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
      {/* Minimal: the foreground is one view over the sky, so it can
          ease back under the sheet as one thing — see `recess`. The
          column it keeps is the hero's own, so nothing moves at rest. */}
      <Fore style={minimal ? [styles.heroFore, recess] : undefined}>
      {minimal ? (
        // Minimal keeps the heart alone, at the trailing end of the top
        // row where the Qibla chip stood — the way into Help Mihrab, and
        // (as on the full page) the place to put it away.
        topRow?.renderHelp ? (
          <View style={styles.heroTopRow} onLayout={banded ? onTopRowLayout : undefined}>
            <View style={styles.heroTopLeading} />
            {topRow.renderHelp(inkTop)}
          </View>
        ) : null
      ) : topRow && fill && vbar ? null : topRow ? (
        <HeroTopRow topRow={topRow} ink={inkTop} onLayout={banded ? onTopRowLayout : undefined} />
      ) : null}
      {/* The room the sky's bodies move in. */}
      {/* The dashboard's card does not grow, so its band is a fixed
          height — the room a desktop has to spare — rather than a share. */}
      {fill ? (
        track ? (
          // Under the Track the band is a tap target that explains the chart.
          <TrackExplainer
            kind={track.kind}
            prayer={targetLabel}
            onPress={explain.toggle}
            style={[styles.heroScene, minimal && (railHidden ? styles.heroSceneAboveTrack : styles.heroSceneAbove), { minHeight: HERO_SCENE_MIN[tier] }]}
          />
        ) : (
          <View style={[styles.heroScene, minimal && styles.heroSceneAbove, { minHeight: HERO_SCENE_MIN[tier] }]} />
        )
      ) : expanded || band ? (
        track ? (
          <TrackExplainer kind={track.kind} prayer={targetLabel} onPress={explain.toggle} style={{ height: HERO_SCENE_EXPANDED }} />
        ) : (
          <View style={{ height: HERO_SCENE_EXPANDED }} />
        )
      ) : null}
      <View onLayout={banded ? onBlockLayout : undefined}>
      {/* "Fajr in" leading, and on the trailing end of the same line —
          the side with nothing on it — the heart that opens Help Mihrab.
          Minimal says it under the figures instead. */}
      {minimal ? null : (
        <HeroEyebrow
          label={eyebrowLabel}
          chosen={chosen ? t('home.chosenTarget', 'chosen') : null}
          chosenA11y={t('a11y.countdownHere')}
          onClear={onExpire}
          ink={inkTop}
          renderHelp={topRow?.renderHelp}
        />
      )}
      {/*
        THE COUNTDOWN IS ONE LINE OF TEXT, AND THE TIME IS AT THE OTHER END.

        Hours, minutes and seconds used to be three Text views in a row
        aligned on 'baseline' — which the layout engine does not honour for
        text here, so the small seconds sat high beside the big figures on
        both platforms. As spans of ONE Text the text engine itself sets
        them on one baseline, which is the only alignment that cannot drift.
        The order is still the language's (#71): the paragraph runs right to
        left in Arabic, so hours come first from the right, as the pieces
        did in a right-to-left row.

        The time the countdown reaches stands at the far end, over the name
        of that prayer at the rail's end, on the countdown's baseline —
        measured from both lines (see `onCountdownLine`), because no style
        can say "this baseline" across two views.
      */}
      <View style={[styles.heroCountdownRow, minimal && styles.heroCountdownRowMinimal]}>
        <Text
          style={[
            styles.heroCountdownLine,
            minimal && styles.heroCountdownLineMinimal,
            tabularNumeralStyle,
            { writingDirection: rtl ? 'rtl' : 'ltr' },
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          accessibilityLanguage={unitLang}
          onTextLayout={onCountdownLine}>
          {/* THE FIGURES CARRY THE LINE; THE UNITS ONLY CONFIRM. The unit
              letters used to be set in the digits' own size and ink, and
              "5h 49m" read as five marks of equal weight. Each unit is now
              a span of its own — under half the size, in the muted ink, on
              the same baseline — so the eye reads "5 49" and the letters
              only say which is which, as a clock's small caps do. */}
          <Text
            style={[
              styles.heroCountdown,
              { fontSize: countdownSize },
              minimal && styles.heroCountdownMinimal,
              expanded && styles.heroCountdownExpanded,
              { color: digitInk },
            ]}>
            {/* A hair of space before each unit: the figures are tracked
                tight (−1.5), which pulls the letter under the last digit's
                overhang — a "4" and an "h" touched. The hair space is the
                figures' own size, a tenth of an em, and unlike a margin it
                survives inside one line of nested text. */}
            {pieces.hours ? (
              <>
                {pieces.h}
                {UNIT_HAIR}
                <Text style={unitStyle}>{units.hour}</Text>
                {' '}
              </>
            ) : null}
            {pieces.m}
            {UNIT_HAIR}
            <Text style={unitStyle}>{units.minute}</Text>
          </Text>
          {/* The seconds come and go with the distance: on the full page
              inside the last hour, under Minimal inside the last minutes
              (`showSeconds`) — three units ticking at once never looked
              still, and a second only means something close in. */}
          {showSeconds ? (
            <Text
              style={[
                styles.heroSeconds,
                { fontSize: secondsSize },
                expanded && styles.heroSecondsExpanded,
                { color: ink.muted },
              ]}>
              {' '}
              {pieces.s}
              {UNIT_HAIR}
              <Text style={secondsUnitStyle}>{units.second}</Text>
            </Text>
          ) : null}
        </Text>
        {minimal ? null : (
          <Text
            style={[
              styles.heroAt,
              tabularNumeralStyle,
              { color: ink.muted, marginTop: atShift },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
            accessibilityLanguage="en-US"
            onTextLayout={onAtLine}>
            {targetClock}
          </Text>
        )}
      </View>
      {/* Minimal: the prayer's name and its time, one quiet line under the
          figures — what the eyebrow and the time at the far end said. */}
      {minimal ? (
        <Text
          style={[styles.heroCaption, tabularNumeralStyle, { color: ink.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
          // The way to the day's times for a screen reader, said once,
          // here: the hero round it is not an element of its own
          // (TodayCardImpl, `HeroWrap`), so the figures over this line and
          // the footer under it are read too. A finger drags up instead;
          // only the screen reader's activation opens them from here.
          accessibilityRole="button"
          accessibilityHint={t('a11y.openTodayTimes', 'Opens today’s prayer times')}
          accessibilityActions={onOpenTimes ? [{ name: 'activate' }] : undefined}
          onAccessibilityAction={
            onOpenTimes
              ? e => {
                  if (e.nativeEvent.actionName === 'activate') onOpenTimes();
                }
              : undefined
          }>
          {`${targetLabel} · ${targetClock}`}
        </Text>
      ) : null}
      {(rail || dayRail) && !railHidden ? (
        <View style={styles.railWrap}>
          <View style={[styles.railTrack, { backgroundColor: railInk.track }]}>
            {/* Minimal: the day's prayers, marked along the rail — the
                passed ones in the fill's ink, the ones to come fainter,
                the target's a step larger. Under the fill and the head. */}
            {dayRail
              ? dayRail.marks.map((mark, i) => {
                  // Fajr stands at both ends; the one ahead is the target's.
                  const isTarget = mark.key === target.name && (mark.key !== 'Fajr' || mark.at === 1);
                  const size = isTarget ? RAIL_TICK_TARGET : RAIL_TICK;
                  const passed = mark.at <= railPct;
                  return (
                    <View
                      key={`${mark.key}-${i}`}
                      style={[
                        styles.railTick,
                        {
                          width: size,
                          height: size,
                          borderRadius: size / 2,
                          top: (RAIL_LINE - size) / 2,
                          marginStart: -size / 2,
                          start: `${(mark.at * 100).toFixed(2)}%`,
                          backgroundColor: passed || isTarget ? railInk.fill : railInk.muted,
                          opacity: passed || isTarget ? 1 : 0.5,
                        },
                      ]}
                    />
                  );
                })
              : null}
            <View
              style={[
                styles.railFill,
                {
                  backgroundColor: railInk.fill,
                  // In quarter-percents — a pixel of a 400dp track — not
                  // whole ones: on a launch the rail slides from where the
                  // kept picture left it (launchWarp), and whole percents
                  // would step. Not finer either: a width that changes
                  // every second by a hundredth of a pixel is a layout of
                  // the track every second for nothing (2.33).
                  width: `${(Math.round(railPct * 400) / 4).toFixed(2)}%`,
                },
              ]}>
              <View style={[styles.railRing, { backgroundColor: railInk.ring }]} />
              {/* Minimal: the head breathes — a ring that swells and
                  fades every few seconds, the one moving thing on a
                  still page, saying the count is live. */}
              {breathing ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.railBreath,
                    {
                      backgroundColor: railInk.fill,
                      opacity: breath.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
                      transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 4.5] }) }],
                    },
                  ]}
                />
              ) : null}
              <View style={[styles.railHead, { backgroundColor: railInk.fill }]} />
            </View>
          </View>
          {/* Minimal's day rail needs no labels: its marks say the day. */}
          {dayRail ? null : (
          <View style={styles.railLabels}>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: railInk.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {railFromLabel}
            </Text>
            <Text
              style={[styles.railLabel, tabularNumeralStyle, { color: railInk.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {targetLabel}
            </Text>
          </View>
          )}
        </View>
      ) : null}
      </View>
      {/* Minimal: as much sky under the block as over it, so the figures
          stand in the middle of the page — and the footer at its foot. */}
      {minimal && fill ? <View style={[styles.heroScene, railHidden ? styles.heroSceneBelowTrack : styles.heroSceneBelow]} /> : null}
      {/* The way to the day's times, said once: a chevron over the footer,
          the shape of the drag up that opens them. */}
      {minimal && fill ? (
        <View style={styles.heroHandle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={14} height={8} viewBox="0 0 18 10">
            <Path d="M2 8.5 9 1.5l7 7" stroke={inkFooter.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </View>
      ) : null}
      {minimal && footer ? (
        <Text
          onLayout={onFooterLayout}
          style={[styles.heroFooter, tabularNumeralStyle, { color: inkFooter.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {footer}
        </Text>
      ) : null}
      </Fore>
    </View>
  );
});

/** The hero's foreground wrapper when there is none: its children, as they were. */
function Unwrapped({ children }: { children?: ReactNode; style?: unknown }) {
  return <>{children}</>;
}
