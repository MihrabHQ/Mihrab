import {
  useFocusEffect,
  useNavigation,
  useScrollToTop,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useWindowSize } from '../responsive/windowSize';
import notifee, {
  AndroidNotificationSetting,
  AuthorizationStatus,
} from '@notifee/react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useIsActive } from '../hooks/useIsActive';
import {
  dayTzFingerprint,
  markResynced,
  shouldResync,
  weekTimesKey,
} from '../utils/resyncGate';
import { onClockJump } from '../utils/clockJumps';
import { usePrayerDay } from '../hooks/usePrayerDay';
import { clearTimezoneShiftNotice } from '../prayer/timezoneShift';
import { zoneDataNotice, zoneDataNoticeKey } from '../prayer/zoneDataNotice';
import { refreshStoredPrayerData } from '../prayer/refreshStoredData';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { cityOf } from '../settings/cityName';
import { getMethodLabel } from '../settings/methods';
import { getProviderLabel } from '../settings/providersCatalog';
import { providerHidesCalculationMethod } from '../settings/providerUi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMethodCurrency } from '../hooks/useMethodCurrency';
import { methodCurrencyNote } from '../prayer/methodCurrencyNote';
import {
  PullToRefreshFrame,
  usePullToRefresh,
} from './home/PullToRefresh';
import { markFirstPaint, useAfterFirstPaint } from '../boot/firstPaint';
import { bootMark } from '../boot/bootTimeline';
import { hideLaunchSnapshot, setLaunchSnapshotEligible } from '../native/LaunchSnapshot';
import { usePrefetchSavedLocations } from '../hooks/usePrefetchSavedLocations';
import { syncPrayerNotifications } from '../notifications/prayerNotifications';
import { useNextAlertOverride } from '../notifications/adhanMute';
import { syncPrayerWidget } from '../widget/syncPrayerWidget';
import { collectWidgetExtras } from '../widget/collectWidgetExtras';
import { useWidgetDataRevision } from '../widget/useWidgetDataRevision';
import { syncLiveActivity } from '../liveActivity/syncLiveActivity';
import {
  addDays,
  daysOnDeviceClock,
  getNextPrayerDisplay,
  onDeviceClock,
  readZone,
} from '../utils/prayerTimes';
import { filterOptionalTimes } from '../utils/nightTimes';
import { DISPLAY_ORDER, type TimingsMap } from '../types/prayer';
import { currentFontScale, pickHomeTier, type HomeTier } from './home/homeBudget';
import { injectDaruriTimes } from '../prayer/daruriTimes';
import { useClockFormatter } from '../hooks/useClockFormatter';
import { qiblaBearingFrom } from '../utils/qibla';
import type { RootStackParamList } from '../navigation/types';
import { computeSeasonalTreatment } from '../seasonal/treatments';
import { TodayCard } from './home/TodayCard';
import { LocationChip } from './home/LocationChip';
import { useHijriCalendarVersion } from '../hijri/useHijriCalendarVersion';
import { formatHijriLabel } from '../hijri/formatHijriLabel';
import { QuranCard } from './home/QuranCard';
import { PermissionBanners, permissionBannersShown } from './home/PermissionBanners';
import { PracticeCard } from './home/PracticeCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TodaySummary } from './home/TodaySummary';
import { CenteredColumn } from '../responsive/CenteredColumn';
import {
  isMacCatalyst,
  BREAKPOINT_REGULAR,
  MAX_CONTENT_WIDTH,
  HOME_DASHBOARD_MIN_WIDTH,
  HOME_ROOMY_MIN_HEIGHT,
} from '../responsive/breakpoints';
import { HeaderPlaybackBar } from '../quran/audio/HeaderPlaybackBar';
import { HomeHeaderControls } from '../navigation/HomeHeaderControls';
import { MihrabHeaderTitle } from '../navigation/MihrabHeaderTitle';
import { RamadanCountdownCard } from './home/RamadanCountdownCard';
import { useNonReadyPhaseElement } from './home/usePhaseRouting';
import { HOME_SCREEN_PADDING } from './home/tokens';
import { useMinimalUi, useTabBarInset } from '../navigation/tabBarInset';
import { useTabBarScroll } from '../navigation/tabBarVisibility';
import { HomeStatusBand } from './home/HomeStatusBand';
import { setVerticalBarActions, useVerticalBar, useVerticalBarInsets } from '../native/VerticalBar';
import { QiblaChip } from './home/QiblaChip';
import { rescheduleEndOfDayLogReminders } from '../notifications/endOfDayLog';
import { windowEdges } from '../notifications/snoozeWindow';
import {
  rememberLogTiming,
  windowsFromEdges,
  withPreferredEnds,
} from '../journal/logTiming';
import { firstWindowEnd } from '../journal/quickLog';
import { syncPrayerSilence } from '../notifications/prayerSilence';
import { rescheduleDuaReminders } from '../notifications/duaReminders';
import { HomeFeaturesOffer } from '../home/HomeFeaturesOffer';
import { SkyThemeOffer } from '../home/SkyThemeOffer';
import {
  ChangelogSheet,
  pendingChangelog,
} from '../polish/ChangelogSheet';
import { SPACING } from '../theme/tokens';
import { useFoldPosture } from '../native/FoldPosture';
import type { HostInstance } from 'react-native';


/** The calculation note last dismissed on Today (`state:to`). */
const METHOD_NOTE_DISMISSED_KEY = 'home.methodNote.dismissed.v1';
/** The stale-zone-data note dismissed on Today (#82) — the zone and its lag. */
const ZONE_NOTE_DISMISSED_KEY = 'home.zoneNote.dismissed.v1';
/**
 * HomeScreen orchestrator — task #8 split.
 *
 * Owns hooks, effects, and orchestration; delegates rendering to children
 * under `src/screens/home/`. Two big perf wins land here:
 *
 *  1. The 30-second clock tick lives inside `TodayCard`'s hero (the only
 *     component that displays the countdown). Previously the tick triggered
 *     `setNow(...)` in this file, forcing an 800-line tree to re-render every
 *     30 seconds. Now only the countdown re-renders — not even the day strip
 *     or the eight prayer rows beside it.
 *
 *  2. `nextInfo` (the next prayer's name + Date) is recomputed only when a
 *     prayer actually passes — not every tick. The local "watchdog" effect
 *     polls every 30s but only calls `setNextInfo(...)` when the result has
 *     genuinely changed, so the day table re-renders only when the
 *     highlighted row should move.
 *
 * Anything else this file does (notification sync, widget sync, last-fetched
 * coord persistence, locale-aware day labels) is unchanged behavior — same
 * effects, same call shapes, just lifted out of the rendering hot path.
 */
/** How long after a prayer's instant the hero moves on to the next (the watchdog's flip). */
const FLIP_AFTER_MS = 300;
/** Gate keys — see src/utils/resyncGate.ts. */
const NOTIF_RESYNC_KEY = 'home.prayerNotifications';
const EOD_RESYNC_KEY = 'home.endOfDayReminders';
const DUA_RESYNC_KEY = 'home.duaReminders';
const SILENCE_RESYNC_KEY = 'home.prayerSilence';

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const { settings, hydrated, updateSettings } = usePrayerSettings();
  // The Hijri calendar picked in Settings: the heading's Hijri date, the
  // widget's and the Live Activity's all have to follow it.
  const hijriVersion = useHijriCalendarVersion();
  const { state, retry } = usePrayerDay(settings, hydrated);
  /**
   * The first frame with real times on it is the moment the app's boot-time
   * bookkeeping may begin — see src/boot/firstPaint.ts for what waits and
   * why. Committed is not painted: the commit hands the tree to the UI
   * thread, and the frame after that is when it is on the glass, so the
   * mark waits one animation frame and one tick beyond the commit.
   */
  const firstPaintMarked = useRef(false);
  bootMark('home');
  if (state.phase === 'ready') bootMark(state.provisional ? 'ready' : 'ready-cache');
  // The first committed frame with times on it is the live screen the
  // kept launch picture (Android) fades into. Committed is enough: the UI
  // thread mounts it whatever JS does next, and the native side waits a
  // frame or two before the fade begins.
  //
  // Not only `ready`: a launch that lands on a location error, a refused
  // permission or no location at all is a different screen from the
  // picture, and the person should see it now rather than the picture for
  // the four seconds the fallback would take. `idle` is the state before
  // the first load has begun, not an answer.
  useLayoutEffect(() => {
    if (state.phase === 'idle' || state.phase === 'loading') return;
    if (state.phase === 'ready') bootMark('commit');
    hideLaunchSnapshot();
  });
  useEffect(() => {
    if (state.phase !== 'ready' || firstPaintMarked.current) return undefined;
    firstPaintMarked.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const frame = requestAnimationFrame(() => {
      bootMark('raf');
      timer = setTimeout(() => markFirstPaint(), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      // Unmounted before the frame — the fallback timer covers it.
    };
  }, [state.phase]);
  const afterFirstPaint = useAfterFirstPaint();
  // Moves when a prayer is logged, a page is turned or a bead is counted —
  // none of which changes a prayer time, all of which change the widget.
  const widgetRevision = useWidgetDataRevision();
  // Background prefetch of 12 months for every saved location preset, so
  // switching presets is instant and doesn't wipe the previously-cached
  // months — task #145. Runs serially in the background, never blocks the
  // home render.
  usePrefetchSavedLocations();
  const { palette } = useAppPalette();
  /**
   * Tapping the tab you are already on returns this screen to the top —
   * the standard idiom on both platforms, and the only way back up a
   * long page without a lot of swiping. `useScrollToTop` listens for
   * `tabPress` and acts only while this screen is focused, so pressing a
   * DIFFERENT tab still just navigates.
   */
  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(scrollRef);
  // The RESOLVED clock, not the stored preference. On 'auto' the answer
  // moves when the device's 12/24 switch does, and that has to re-sync
  // the widget, the Live Activity and the alert copy exactly as an
  // explicit change would — the screens already follow it through the
  // store, and a widget still saying "17:31" beside a Today card saying
  // "5:31 PM" is the split this dependency exists to prevent.
  const clockHour12 = useClockFormatter().hour12;
  /**
   * The Live Activity's one-occurrence override.
   *
   * Read here only so the notification resync can see it move. It is not
   * a setting and it is not written in this process — the card's action
   * button writes it from a broadcast, and the row that shows it writes
   * the clearing — so nothing else in this screen's dependency graph
   * changes when it does. Without this, pressing reset would put the row
   * right and leave the alarm exactly as the card had set it.
   */
  const alertOverride = useNextAlertOverride();
  const alertOverridePrint = alertOverride
    ? `${alertOverride.epoch}-${alertOverride.name}-${alertOverride.mode}`
    : '';
  const { width: screenWidth, height: screenHeight } = useWindowSize();
  // Cap the day-card width to the centered content column so the carousel
  // doesn't overflow the capped column on iPad/Mac windows.
  // Must equal the width the SIBLING cards actually render at — i.e. the
  // CenteredColumn inner width. The old `contentColumnWidth(w) - padding`
  // subtracted the screen padding AFTER the 720pt cap, so in the regular
  // band (window ≥ ~750pt) the day table came out 32pt narrower than the
  // hero/shortcut cards above and below it ("weird margins", Mac
  // 2026-07-16). The screen padding only eats into the column while the
  // window is narrower than cap + padding.
  // Expanded (wide iPad landscape / Mac window): lay Home out as a two-column
  // dashboard — a fixed "today" main column beside a flexible tools sidebar —
  // so the cards fill the window and fit without scrolling. The day carousel
  // is sized to the fixed main column so its pages stay crisp and aligned.
  // 1180 (not the 1100 'expanded' edge): below that the sidebar drops
  // under ~440pt and the tools grid crams — the centered single column
  // reads far better in that band (Mac audit 2026-07-16, plan v2 §B4).
  const isDashboard = screenWidth >= HOME_DASHBOARD_MIN_WIDTH;
  /**
   * A FOLDABLE HALF OPEN.
   *
   * As a book (the hinge down the screen), the single column sat on the
   * crease — prayer names on one page, their times on the other. Today
   * becomes two pages instead: the day on one, the Quran shortcut and the
   * day's summary on the other, the gutter on the hinge.
   *
   * In tabletop (the hinge across), the hero fills the upright half down
   * to the hinge and the day's rows lie on the flat half, where a thumb
   * reaches them.
   *
   * Android only, and only half open; flat or folded, nothing changes.
   */
  const posture = useFoldPosture();
  const book = posture?.kind === 'book' ? posture.hinge : null;
  const tabletop = posture?.kind === 'tabletop' ? posture.hinge : null;
  const [tableTop, setTableTop] = useState<number | null>(null);
  const tableWrapRef = useRef<HostInstance>(null);
  const measureTable = useCallback(() => {
    tableWrapRef.current?.measureInWindow((_x: number, y: number) => {
      if (Number.isFinite(y)) setTableTop(prev => (prev === y ? prev : y));
    });
  }, []);
  const tabletopHeroHeight =
    tabletop && tableTop != null
      ? Math.max(260, tabletop.top - tableTop - SPACING.md)
      : undefined;
  /**
   * A tablet held upright: wide enough to be one, tall enough that the
   * day does not fill the page. The hero stops growing and the column
   * centres itself — see `HOME_ROOMY_MIN_HEIGHT`.
   */
  const isRoomy =
    !isDashboard &&
    !isMacCatalyst &&
    screenWidth >= BREAKPOINT_REGULAR &&
    screenHeight >= HOME_ROOMY_MIN_HEIGHT;
  /**
   * A foldable open (Android, both sides 600dp or more, not tall enough
   * to be roomy): the page's column stops at the phone's measure, and the
   * hero — the page's own top, edge to edge on a phone — was cut off at
   * it, a sky with a strip of page down either side. The column runs the
   * full width now; the sky goes to the edges, and the hero's content,
   * the table and the cards under it keep to the measure in the middle.
   * Held as a book the page is laid out by its two halves instead.
   */
  const wideInset =
    Platform.OS === 'android' &&
    !isDashboard &&
    !isRoomy &&
    !book &&
    Math.min(screenWidth, screenHeight) >= 600 &&
    screenWidth > MAX_CONTENT_WIDTH
      ? Math.round((screenWidth - MAX_CONTENT_WIDTH) / 2)
      : 0;
  // Adapt to the window instead of a fixed cap: up to 1360pt of content
  // on big Mac windows, with the main column taking a proportional share
  // (clamped so the day table keeps a comfortable measure).
  const dashCap = Math.min(1360, screenWidth - 48);
  const HOME_MAIN_COL = isDashboard
    ? Math.max(620, Math.min(740, Math.round(dashCap * 0.54)))
    : 620;
  // Desktop zoom (Mac feedback 2026-07-16, "still a lot of empty
  // space"): past the width cap, ADAPT BY SCALING — the whole dashboard
  // zooms uniformly to the window, bounded by both axes and capped at
  // 1.45× so type never turns cartoonish. A pure width cap left the
  // dashboard floating tiny in a 2560×1440 fullscreen window.
  const DASH_BASE_HEIGHT = 940; // hero + day table + shortcut + padding
  const dashScale = isDashboard
    ? Math.min(
        1.45,
        Math.max(
          1,
          Math.min((screenWidth - 64) / dashCap, screenHeight / DASH_BASE_HEIGHT),
        ),
      )
    : 1;
  /**
   * How far the Mac top bar has to start below the window's own top.
   *
   * The Catalyst scene extends UNDER the window's title bar — the band the
   * red/yellow/green buttons live in. The navigation bar knew that and laid
   * its contents out below it; a plain view of ours does not, so the first
   * attempt drew the wordmark behind the traffic lights, with the window's
   * "Mihrab" title showing through it (reported 2026-08-24).
   *
   * The safe-area inset is the honest measure of that band, with a floor
   * under it: a scene that reports no top inset would put us straight back
   * behind the buttons, and a title bar is never shorter than this. 28
   * AppKit points over Catalyst's 0.77 canvas scale ≈ 36.
   */
  const insets = useSafeAreaInsets();
  const macTopBarInset = isMacCatalyst ? Math.max(insets.top, 36) + 6 : 0;
  /**
   * The scaled dashboard's real height, so the row above it survives.
   *
   * `transform: scale` does not change layout: the box still occupies its
   * UNSCALED height and the extra paints outside it, half above and half
   * below, over whatever is there. At 1.16× a ~700pt dashboard reaches
   * 55pt past its own top — straight over the Mac top bar, which is why
   * the wordmark and location chip vanished on wide windows and stayed
   * put on narrow ones (reported 2026-08-24).
   *
   * Measuring the row and spending the overflow as margin puts the box
   * back around what is actually painted: nothing overlaps, the vertical
   * centring is centring the real thing, and the bottom edge stops
   * running under the tab bar for the same reason.
   */
  const [dashRowH, setDashRowH] = useState(0);
  const dashOverflow =
    dashScale > 1 && dashRowH > 0 ? ((dashScale - 1) * dashRowH) / 2 : 0;
  const onDashRowLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    // Sub-pixel jitter would re-render forever; a whole point is finer
    // than anything this margin needs to be right about.
    setDashRowH(prev => (Math.abs(prev - h) > 1 ? h : prev));
  }, []);
  const [exactAlarmDenied, setExactAlarmDenied] = useState(false);
  const [notifPermDenied, setNotifPermDenied] = useState(false);
  /**
   * Whether anything is drawn above the hero — the three banner
   * conditions `PermissionBanners` knows (a provider that fell back,
   * exact alarms revoked, notifications denied).
   *
   * It decides who is under the status bar: the sky, or a notice. Both
   * cannot be, and the notice wins because it is on top.
   */
  /**
   * The clocks changed where this reader is, and the times below moved
   * with them (issue #56). Dismissal is keyed by WHEN it was noticed, so
   * reading one notice does not silence the next change — a reader who
   * dismisses Morocco's September shift still hears about the next one.
   */
  const [tzNoticeDismissedAt, setTzNoticeDismissedAt] = useState<number | null>(
    null,
  );

  /**
   * PULL THE PAGE DOWN TO REFRESH THE TIMES.
   *
   * The same action as the month table's button and the row in Settings
   * (`refreshStoredPrayerData`): re-download the published table, drop
   * this month's stored rows and fetch them again. Not a re-render — a
   * repair, for the case where what is stored is wrong rather than
   * missing, which is what issue #56 turned out to be.
   *
   * Then `retry()`, because the cache being right is not the same as the
   * screen showing it: the page is holding times it read before the
   * refresh, and nothing else would go back for them.
   *
   * Never on Catalyst — a pull is a thumb (`PullToRefresh`).
   */
  const pullEnabled = !isMacCatalyst && state.phase === 'ready';
  const refreshParams =
    state.phase === 'ready'
      ? {
          provider: getEffectiveDataProvider(
            settings.dataProviderAuto,
            settings.dataProvider,
            { latitude: state.latitude, longitude: state.longitude },
            settings.calculationMethod,
          ),
          latitude: state.latitude,
          longitude: state.longitude,
          calculationMethod: settings.calculationMethod,
          school: settings.school,
        }
      : null;
  const refreshParamsRef = useRef(refreshParams);
  refreshParamsRef.current = refreshParams;
  const onPullRefresh = useCallback(
    async (report: (current: number, total: number) => void) => {
      const params = refreshParamsRef.current;
      if (!params) return;
      await refreshStoredPrayerData(params, { onProgress: report });
      retry(true);
    },
    [retry],
  );
  // A store, not state: it is the same object on every render, and nothing
  // a pull does to it re-renders this screen (`PullToRefresh`).
  const pull = usePullToRefresh(onPullRefresh);
  const timezoneShift =
    state.phase === 'ready' &&
    state.timezoneShift &&
    state.timezoneShift.at !== tzNoticeDismissedAt
      ? state.timezoneShift
      : null;
  // A computed authority's calculation that is not current (`methodCurrency.ts`):
  // said once on Today, until dismissed; a change of state says it again.
  const currency = useMethodCurrency(
    refreshParams?.provider ?? 'aladhan',
    refreshParams ? { latitude: refreshParams.latitude, longitude: refreshParams.longitude } : null,
    settings.calculationMethod,
  );
  const currencyKey =
    currency && currency.state !== 'current'
      ? `${currency.state}:${currency.state === 'beyond' ? currency.to : ''}`
      : null;
  const [currencyDismissed, setCurrencyDismissed] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    AsyncStorage.getItem(METHOD_NOTE_DISMISSED_KEY)
      .then(v => setCurrencyDismissed(v))
      .catch(() => setCurrencyDismissed(null));
  }, []);
  const methodNote =
    currency && currencyKey && currencyDismissed !== undefined && currencyKey !== currencyDismissed
      ? methodCurrencyNote(t, currency, i18n.language)
      : null;
  const dismissMethodNote = useCallback(() => {
    if (!currencyKey) return;
    setCurrencyDismissed(currencyKey);
    AsyncStorage.setItem(METHOD_NOTE_DISMISSED_KEY, currencyKey).catch(() => undefined);
  }, [currencyKey]);
  /**
   * A phone in Morocco whose zone data still runs it at GMT+1, on network
   * time (#82) — or in a zone that keeps one offset all year now, on data
   * that still moves the clock (#117): its clock, and the times here written on it, read an hour
   * ahead of the ministry's. The settings card says so too, but that is
   * not where a reader who sees 06:09 for the mosque's 05:09 looks. Said
   * once, with the one thing that puts it right on a phone that will get
   * no zone-data update — the reporter's own finding.
   */
  const zoneKey = zoneDataNoticeKey();
  const [zoneDismissed, setZoneDismissed] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    AsyncStorage.getItem(ZONE_NOTE_DISMISSED_KEY)
      .then(v => setZoneDismissed(v))
      .catch(() => setZoneDismissed(null));
  }, []);
  const zoneNote =
    zoneKey && zoneDismissed !== undefined && zoneKey !== zoneDismissed
      ? zoneDataNotice(t, 'home')
      : null;
  const dismissZoneNote = useCallback(() => {
    if (!zoneKey) return;
    setZoneDismissed(zoneKey);
    AsyncStorage.setItem(ZONE_NOTE_DISMISSED_KEY, zoneKey).catch(() => undefined);
  }, [zoneKey]);
  const hasBanner =
    (state.phase === 'ready' && state.usingLocalFallback === true) ||
    exactAlarmDenied ||
    notifPermDenied ||
    timezoneShift != null ||
    methodNote != null ||
    zoneNote != null;
  const [nextInfo, setNextInfo] = useState<{ name: string; at: Date } | null>(
    null,
  );

  // First-run feature walkthrough: shown once after onboarding completes.
  // Focus-scoped (not mount-scoped) so the Settings "Show the app tour"
  // replay — which clears the flag and pops back here — re-triggers it.
  const tabBarInset = useTabBarInset();
  // Minimal, as the navigator reads it (one answer: tabBarInset.ts).
  const minimalUi = useMinimalUi();
  const vbarPad = useVerticalBarInsets();
  // The bar gets out of the way while reading — see tabBarVisibility.ts.
  const tabBarScroll = useTabBarScroll();
  /**
   * The page's scroll offset, for the band behind the status bar — see
   * `HomeStatusBand`. An Animated.Value rather than state: the band's
   * colour and its fade are the only things that follow the scroll, and
   * re-rendering the whole page sixty times a second to move them would
   * be a poor trade. Not the native driver, because a colour is what is
   * being animated.
   */
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
        // The tab bar hides itself from the same gesture; it was here
        // first and keeps its handler.
        listener: tabBarScroll.onScroll,
      }),
    [scrollY, tabBarScroll.onScroll],
  );
  // Focus + foreground; see the watchdog effect below and useIsActive.
  const homeActive = useIsActive();
  /**
   * Whether this screen, as it is now, is what the next cold start should
   * open on (Android: native/LaunchSnapshot.ts). Only the settled screen,
   * at the top: a picture scrolled halfway down would fade into a page
   * that starts at the top. Kept current all the time, because the copy is
   * taken the moment the app is left and JS has no say in that moment.
   */
  const [atTop, setAtTop] = useState(true);
  const atTopRef = useRef(true);
  const noteScrollTop = useCallback((y: number) => {
    const top = y < 8;
    if (top === atTopRef.current) return;
    atTopRef.current = top;
    setAtTop(top);
  }, []);
  const snapshotWorthy =
    homeActive &&
    afterFirstPaint &&
    atTop &&
    state.phase === 'ready' &&
    !state.provisional;
  useEffect(() => {
    setLaunchSnapshotEligible(snapshotWorthy);
    return () => setLaunchSnapshotEligible(false);
  }, [snapshotWorthy]);
  /**
   * What changed since this user last opened the app.
   *
   * This used to be the four-slide feature tour, shown once per install
   * on the first focus after onboarding — a second welcome immediately
   * after the first. The remake's last screen does that job with the
   * user's own times, so what is left here is the surface the app never
   * had: release notes, on the first launch after an update, to people
   * who already use it.
   *
   * A fresh install returns null and gets its version stamped, so the
   * NEXT update is an upgrade rather than a first sighting.
   *
   * What is held here is the version this phone last RAN, not a list of
   * notes: the sheet shows the whole changelog either way and uses this
   * to decide how much of it to mark new.
   */
  const [changelogSince, setChangelogSince] = useState<string | null>(null);
  // The what's-new sheet and the features offer never share a launch.
  const changelogShown = useRef(false);
  if (changelogSince !== null) changelogShown.current = true;
  useFocusEffect(
    useCallback(() => {
      if (!settings.onboardingComplete) return;
      let cancelled = false;
      void pendingChangelog().then(since => {
        if (!cancelled && since) setChangelogSince(since);
      });
      return () => {
        cancelled = true;
      };
    }, [settings.onboardingComplete]),
  );

  // Reactive gating of the optional non-prayer entries, so flipping a toggle
  // updates the surfaces immediately without a re-fetch. usePrayerDay always
  // derives Sunrise + the three night times into the raw `week`; here we strip
  // by the user's toggles, the same four for every surface — table,
  // notifications, Live Activity and widget alike.
  //
  // The widget used to keep Sunrise whatever the toggle said, and to carry the
  // night times as rows its headline was not allowed to name. Both are gone: a
  // toggle that means "remind me about the Last Third" means the widget counts
  // down to it too, and one turned off means the row is not there to explain
  // away. The only surface-level difference left is the window — the widget
  // gets the long one, because it has to stay true while the app is closed.
  const view = useMemo(() => {
    if (state.phase !== 'ready') return null;
    const { today, tomorrow, week } = state;
    const past = state.past ?? [];
    const mk = (tg: {
      Sunrise: boolean;
      Midnight: boolean;
      Lastthird: boolean;
      Firstthird: boolean;
    }) => ({
      today: filterOptionalTimes(today, tg),
      tomorrow: tomorrow ? filterOptionalTimes(tomorrow, tg) : undefined,
      week: week.map(d => filterOptionalTimes(d, tg)),
      past: past.map(d => filterOptionalTimes(d, tg)),
    });
    const table = mk({
      Sunrise: settings.sunriseEnabled,
      Midnight: settings.islamicMidnightEnabled,
      Lastthird: settings.lastThirdEnabled,
      Firstthird: settings.firstThirdEnabled,
    });
    // Mālikī second times (issue #19), derived HERE rather than in
    // `usePrayerDay` for the same reason the toggles above are: flipping
    // the setting must change the card at once, and making the fetch
    // depend on it would cost a round trip to learn something the device
    // can work out from coordinates and a date. The table only — the
    // widget and the alert schedule do not carry these yet, and a payload
    // grown by fields nothing reads is size for nothing.
    // Computed whenever the FEATURE is on, not whenever the rows are.
    // The alert schedule reads the boundaries out of this same week, so
    // gating the injection on the rows meant the only way to be told
    // about a boundary was to also draw it — which is what #19's reporter
    // asked not to have. `malikiSecondTimeRows` decides the drawing; the
    // week below always carries them so the schedule can find them.
    // Injected over the whole span the table can turn to — the past
    // days first, in date order, then the week — since each day's Ishāʾ
    // boundary reads the next day's Fajr; then split back apart.
    const span = settings.malikiSecondTimesEnabled
      ? injectDaruriTimes(
          table.past.slice().reverse().concat(table.week),
          addDays(state.baseDate, -table.past.length),
          state.latitude,
          state.longitude,
          // `school` is 1 for Ḥanafī ʿAṣr (the 2:1 shadow), 0 otherwise.
          settings.school === 1 ? 2 : 1,
          // on the days' own clock, as their rows are written
          state.clock,
        )
      : null;
    const tableWithDaruri = span ? span.slice(table.past.length) : null;
    const pastWithDaruri = span
      ? span.slice(0, table.past.length).reverse()
      : null;
    const drawDaruri =
      tableWithDaruri != null && settings.malikiSecondTimeRows;
    return {
      table: drawDaruri
        ? {
            today: tableWithDaruri[0],
            tomorrow: tableWithDaruri[1],
            week: tableWithDaruri,
            past: pastWithDaruri ?? table.past,
          }
        : table,
      /**
       * The week the ALERT schedule reads, which is not always the one
       * the card draws: with the rows off these two differ by exactly the
       * five boundaries, and that difference is the whole feature.
       */
      alertWeek: tableWithDaruri ?? table.week,
      /** The day before `alertWeek`, for an ʿIshāʾ of last night still ahead. */
      alertYesterday: (pastWithDaruri ?? table.past)[0] as
        | TimingsMap
        | undefined,
      la: mk({
        Sunrise: settings.sunriseEnabled,
        Midnight: settings.islamicMidnightEnabled,
        Lastthird: settings.lastThirdEnabled,
        Firstthird: settings.firstThirdEnabled,
      }),
      // The widget gets the LONG window, not the carousel's week — its copy
      // has to stay true across however long the app goes unopened.
      widget: {
        ...mk({
          Sunrise: settings.sunriseEnabled,
          Midnight: settings.islamicMidnightEnabled,
          Lastthird: settings.lastThirdEnabled,
          Firstthird: settings.firstThirdEnabled,
        }),
        week: (state.widgetWeek ?? week).map(d =>
          filterOptionalTimes(d, {
            Sunrise: settings.sunriseEnabled,
            Midnight: settings.islamicMidnightEnabled,
            Lastthird: settings.lastThirdEnabled,
            Firstthird: settings.firstThirdEnabled,
          }),
        ),
      },
    };
  }, [
    state,
    settings.sunriseEnabled,
    settings.islamicMidnightEnabled,
    settings.lastThirdEnabled,
    settings.firstThirdEnabled,
    settings.malikiSecondTimesEnabled,
    settings.malikiSecondTimeRows,
    settings.school,
  ]);

  /**
   * The same days on the PHONE's clock, for everything that writes them out
   * of the app or reads them as instants without being told a clock — the
   * alert schedule and its reminders, the quiet windows, the widget, the
   * Live Activity, the late-log windows, the Ramadan countdown. A saved
   * place in another zone is drawn on its own clock (`state.clock`); its
   * alarms and the widgets' countdowns must still land on the right
   * instants, and native code reads every time on the phone's clock. The
   * very same objects when the days are on the phone's clock already.
   */
  const phoneView = useMemo(() => {
    if (state.phase !== 'ready' || !view) return null;
    const clock = state.clock;
    const base = state.baseDate;
    if (!readZone(clock)) {
      const withYesterday = <T extends { past: TimingsMap[] }>(v: T) => ({
        ...v,
        yesterday: v.past[0] as TimingsMap | undefined,
      });
      return {
        ...view,
        table: withYesterday(view.table),
        la: withYesterday(view.la),
        widget: withYesterday(view.widget),
        windowWeek: state.week,
        today: state.today,
        tomorrow: state.tomorrow,
      };
    }
    const tomorrowBase = addDays(base, 1);
    /**
     * A week regrouped on the phone's days (`phoneDaysOf`), with the day
     * before it where there is one — its times that fall on the phone's
     * today come from it rather than from an estimate, and its own ʿIshāʾ
     * past midnight is still ahead in the small hours.
     */
    const regroup = (week: TimingsMap[], before?: TimingsMap) => {
      if (!before) {
        return {
          yesterday: undefined,
          week: daysOnDeviceClock(week, base, clock),
        };
      }
      const all = daysOnDeviceClock(
        [before, ...week],
        addDays(base, -1),
        clock,
      );
      return { yesterday: all[0], week: all.slice(1) };
    };
    // Today and tomorrow are the regrouped week's first two phone days:
    // a time of the place's that falls on the phone's evening before is
    // the phone's, not the place's date's.
    const set = (v: {
      today: TimingsMap;
      tomorrow?: TimingsMap;
      week: TimingsMap[];
      past: TimingsMap[];
    }) => {
      const { yesterday, week } = regroup(v.week, v.past[0]);
      return {
        ...v,
        yesterday,
        today: week[0] ?? onDeviceClock(v.today, base, clock),
        tomorrow: v.tomorrow
          ? week[1] ?? onDeviceClock(v.tomorrow, tomorrowBase, clock)
          : undefined,
        week,
      };
    };
    const windowWeek = regroup(state.week, state.past?.[0]).week;
    const alerts = regroup(view.alertWeek, view.alertYesterday);
    return {
      table: set(view.table),
      alertWeek: alerts.week,
      alertYesterday: alerts.yesterday,
      la: set(view.la),
      widget: set(view.widget),
      windowWeek,
      today: windowWeek[0] ?? onDeviceClock(state.today, base, clock),
      tomorrow: state.tomorrow
        ? windowWeek[1] ?? onDeviceClock(state.tomorrow, tomorrowBase, clock)
        : undefined,
    };
  }, [state, view]);

  const loadedDateKeyRef = useRef<string | null>(null);
  const loadedTzOffsetRef = useRef<number | null>(null);

  // Track the loaded date+tz so the watchdog interval can detect a day or
  // time-zone shift since the last successful fetch and trigger a retry().
  useEffect(() => {
    if (state.phase === 'ready') {
      loadedDateKeyRef.current = new Date().toDateString();
      loadedTzOffsetRef.current = new Date().getTimezoneOffset();
    }
  }, [state]);

  // Watchdog interval: detects day/tz change and recomputes nextInfo only when
  // the next prayer has actually changed. Crucially, this effect does NOT
  // schedule any per-tick state update — `now` lives inside TodayCard's hero.
  useEffect(() => {
    // The prayer's own instant, as well as the half-minute: the watchdog
    // alone left the countdown at "0m 00s" for up to thirty seconds after
    // the adhan before the hero moved on to the next prayer. Armed from
    // each tick for the prayer it found, a breath after it.
    let flip: ReturnType<typeof setTimeout> | null = null;
    function armFlip(next: { at: Date } | null) {
      if (flip) clearTimeout(flip);
      flip = null;
      if (!next || !homeActive) return;
      const delay = next.at.getTime() - Date.now() + FLIP_AFTER_MS;
      if (delay > 0 && delay < 0x7fffffff) flip = setTimeout(tick, delay);
    }
    function tick() {
      if (state.phase !== 'ready') return;
      const current = new Date();
      const dateChanged =
        loadedDateKeyRef.current !== null &&
        current.toDateString() !== loadedDateKeyRef.current;
      const tzChanged =
        loadedTzOffsetRef.current !== null &&
        current.getTimezoneOffset() !== loadedTzOffsetRef.current;
      if (dateChanged || tzChanged) {
        retry();
        return;
      }
      const next = view
        ? getNextPrayerDisplay(
            view.table.today,
            view.table.tomorrow,
            current,
            state.clock,
            view.table.past[0],
          )
        : null;
      setNextInfo(prev => {
        if (
          prev?.name === next?.name &&
          prev?.at.getTime() === next?.at.getTime()
        ) {
          return prev;
        }
        return next;
      });
      armFlip(next);
    }
    // Immediately, so nextInfo is ready on the first render after a fetch —
    // and so that returning from the background catches up in one step
    // whatever the clock did while the timer was stopped. A day that rolled
    // over, or a flight that crossed a timezone, is noticed here rather than
    // up to thirty seconds later.
    tick();
    // Only while someone is looking. This used to run every thirty seconds
    // for the life of the process, backgrounded included — and `tick()` can
    // call `retry()`, which is a GPS fix and a network fetch, so a day
    // rollover at midnight woke the phone up to do real work nobody asked
    // for (docs/design/background-power.md).
    if (!homeActive) return undefined;
    const id = setInterval(tick, 30_000);
    // And at once when the clock jumps (utils/clockJumps): a day set back
    // by hand showed a countdown of thirty-odd hours until the next look.
    const off = onClockJump(tick);
    return () => {
      clearInterval(id);
      off();
      if (flip) clearTimeout(flip);
    };
  }, [state, retry, view, homeActive]);

  useEffect(() => {
    // Not on the on-device times that fill the moment after a location
    // change (`provisional`): writing those out would gate the provider's
    // times a beat later as "already done". Only a settled answer syncs.
    if (
      !hydrated ||
      state.phase !== 'ready' ||
      !view ||
      !phoneView ||
      state.provisional
    )
      return;
    // After the card is on screen, not in the same breath as drawing it.
    if (!afterFirstPaint) return;
    syncPrayerNotifications({
      enabled: settings.notificationsEnabled,
      prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
      notificationSound: settings.notificationSound,
      adhanUsesAlarmStream: settings.adhanUsesAlarmStream,
      prayerAlertFullScreen: settings.prayerAlertFullScreen,
      // On the phone's clock: the schedule reads every time on it.
      today: phoneView.table.today,
      tomorrow: phoneView.table.tomorrow,
      // Last night's ʿIshāʾ past midnight is still ahead in the small hours.
      yesterday: phoneView.alertYesterday,
      // Anchor the schedule to the day the maps were FETCHED for — if this
      // sync fires with stale state just after midnight, yesterday's map
      // must not be pinned onto today's date (early-adhan bug, v2.7.38).
      baseDate: state.baseDate,
      // Extra cached days extend coverage past tomorrow so alerts keep
      // firing when the app isn't opened for a couple of days (v2.7.40).
      week: phoneView.alertWeek,
      // Unfiltered, so Fajr ends at sunrise even with the Sunrise row hidden.
      windowWeek: phoneView.windowWeek,
      // Only when the times themselves are on: an alert about a boundary
      // the card is not showing would be the app announcing something the
      // reader cannot go and look at.
      daruriAlerts: settings.malikiSecondTimesEnabled
        ? settings.malikiSecondTimeAlerts
        : [],
      daruriAlertMinutes: settings.malikiSecondTimeAlertMinutes,
      daruriEndAlerts: settings.malikiSecondTimeEndAlerts,
      alertModes: settings.prayerAlertModes,
      journalLogActionEnabled: settings.journalNotificationActionsEnabled,
      hour12: clockHour12,
      // The shade's tint follows the app's accent, Material You included.
      accentColor: palette.accentSolid,
      // Tinted surfaces: colourise the whole notification with the accent.
      tinted: settings.tintedSurfaces,
    }).catch(e => console.warn('syncPrayerNotifications (effect):', e));
    // The end-of-day prompt is scheduled from the same data and the same
    // moment as the prayer alerts: it needs Isha for every day it covers,
    // and this is the one place in the app that holds a week of times
    // anchored to the day they were fetched for.
    // This one DECRYPTS THE WHOLE JOURNAL on every run — its own comment in
    // endOfDayLog.ts says "this runs on every foreground resync", and it did.
    // It depends on the week's Isha times and one setting; when those are the
    // same, the seven reminders it would write are the seven already there.
    const eodPrint = dayTzFingerprint(
      new Date(),
      String(settings.endOfDayLogReminderEnabled),
      state.baseDate.getTime(),
      // The times themselves: a saved place switched to within the gap is
      // the same day, zone and setting, and must still rewrite.
      weekTimesKey(phoneView.table.week),
    );
    if (shouldResync(EOD_RESYNC_KEY, eodPrint)) {
      rescheduleEndOfDayLogReminders({
        enabled: settings.endOfDayLogReminderEnabled,
        week: phoneView.table.week,
        baseDate: state.baseDate,
      })
        .then(() => markResynced(EOD_RESYNC_KEY, eodPrint))
        .catch(e => console.warn('rescheduleEndOfDayLogReminders:', e));
    }

    // The adhkār reminders, from the same week and the same anchor.
    //
    // They belong here rather than on the Duas tab for the reason the
    // end-of-day prompt does: this is the one place in the app holding
    // real prayer times for future days, tied to the day they were
    // fetched for. A reminder whose whole definition is "after Fajr,
    // before sunrise" cannot be scheduled anywhere that does not know
    // when Fajr is.
    const duaPrint = dayTzFingerprint(
      new Date(),
      `${settings.morningDuaReminderEnabled}:${settings.eveningDuaReminderEnabled}`,
      state.baseDate.getTime(),
      weekTimesKey(phoneView.table.week),
    );
    if (shouldResync(DUA_RESYNC_KEY, duaPrint)) {
      rescheduleDuaReminders({
        morning: settings.morningDuaReminderEnabled,
        evening: settings.eveningDuaReminderEnabled,
        week: phoneView.table.week,
        baseDate: state.baseDate,
      })
        .then(() => markResynced(DUA_RESYNC_KEY, duaPrint))
        .catch(e => console.warn('rescheduleDuaReminders:', e));
    }

    // The quiet windows (issue #60), from the same week and anchor: the
    // native side keeps the next few days of them and works the clock
    // itself, so this is the one place they are ever computed. The alert
    // week rather than the drawn one, for the reason the alerts use it.
    const silencePrint = dayTzFingerprint(
      new Date(),
      JSON.stringify(settings.prayerSilence),
      String(clockHour12),
      state.baseDate.getTime(),
      weekTimesKey(phoneView.alertWeek),
    );
    if (Platform.OS === 'android' && shouldResync(SILENCE_RESYNC_KEY, silencePrint)) {
      syncPrayerSilence({
        settings: settings.prayerSilence,
        today: phoneView.table.today,
        tomorrow: phoneView.table.tomorrow,
        baseDate: state.baseDate,
        week: phoneView.alertWeek,
        hour12: clockHour12,
      })
        .then(() => markResynced(SILENCE_RESYNC_KEY, silencePrint))
        .catch(e => console.warn('syncPrayerSilence:', e));
    }
  }, [
    afterFirstPaint,
    hydrated,
    settings.notificationsEnabled,
    settings.prePrayerReminderMinutes,
    settings.notificationSound,
    settings.adhanUsesAlarmStream,
    settings.prayerAlertFullScreen,
    clockHour12,
    palette.accentSolid,
    // Tinted surfaces recolours the shade, so re-schedule when it flips.
    settings.tintedSurfaces,
    settings.malikiSecondTimesEnabled,
    settings.malikiSecondTimeAlerts,
    settings.malikiSecondTimeAlertMinutes,
    settings.malikiSecondTimeEndAlerts,
    settings.prayerAlertModes,
    // Both directions: the card setting one while the app is open, and
    // the row clearing it.
    alertOverridePrint,
    settings.journalNotificationActionsEnabled,
    settings.endOfDayLogReminderEnabled,
    settings.morningDuaReminderEnabled,
    settings.eveningDuaReminderEnabled,
    settings.prayerSilence,
    state,
    view,
    phoneView,
  ]);

  // Mark late logs as late (issue #74): the notification and widget writers
  // read the switch and the week's prayer windows from one small key, since
  // they run without settings or prayer times loaded (journal/logTiming).
  useEffect(() => {
    if (!hydrated || state.phase !== 'ready' || state.provisional) return;
    if (!afterFirstPaint) return;
    if (!phoneView) return;
    // On the phone's clock, which the writers read the windows on.
    const halves = windowsFromEdges(
      windowEdges(phoneView.windowWeek, state.baseDate),
    );
    // With the Mālikī second times on, the line is where the preferred time
    // ends; `alertWeek` is the week that carries those boundaries.
    const windows = settings.malikiSecondTimesEnabled
      ? withPreferredEnds(
          halves,
          phoneView.alertWeek,
          state.baseDate,
          firstWindowEnd,
        )
      : halves;
    rememberLogTiming(settings.logLateByClock, windows).catch(e =>
      console.warn('rememberLogTiming:', e),
    );
  }, [
    hydrated,
    state,
    phoneView,
    afterFirstPaint,
    settings.logLateByClock,
    settings.malikiSecondTimesEnabled,
  ]);

  /**
   * What the widget and Live Activity call this place.
   *
   * The reverse-geocoded city comes FIRST. It used to be absent entirely, so
   * every user on automatic location had `59.3293°, 18.0686°` sitting on
   * their home screen — coordinates to four decimal places, which is about
   * eleven metres, readable by anyone who glances at the phone. The app's own
   * header has said "Stockholm" the whole time; it just never told the widget.
   *
   * Coordinates remain the last resort rather than being dropped: before
   * geocoding resolves, a widget that says where it thinks you are is more
   * useful than one that says nothing, and a wrong city is worse than a
   * blunt number.
   */
  const locationLabel = useMemo(() => {
    if (settings.locationMode === 'manual' && settings.manualLocationLabel) {
      return settings.manualLocationLabel;
    }
    if (state.phase === 'ready') {
      if (state.cityName) return state.cityName;
      return `${state.latitude.toFixed(4)}°, ${state.longitude.toFixed(4)}°`;
    }
    return '';
  }, [settings.locationMode, settings.manualLocationLabel, state]);

  useFocusEffect(
    useCallback(() => {
      // Not on the on-device times that fill the moment after a location
      // change (`provisional`): writing those out would gate the provider's
      // times a beat later as "already done". Only a settled answer syncs.
      if (
        !hydrated ||
        state.phase !== 'ready' ||
        !view ||
        !phoneView ||
        state.provisional
      )
        return;
      if (!afterFirstPaint) return;
      // Every focus of the Today tab used to tear down and rewrite the whole
      // ~48-alarm set, plus a `getDisplayedNotifications` round-trip and a
      // cancel-diff. The schedule is a function of the times, the sound and
      // the reminder offset — so when none of those changed, neither did the
      // answer (docs/design/background-power.md).
      const notifPrint = dayTzFingerprint(
        new Date(),
        String(settings.notificationsEnabled),
        settings.prePrayerReminderMinutes,
        settings.notificationSound,
        // In the fingerprint because it changes which CHANNEL every prayer
        // is scheduled against. Left out, flipping the setting would look
        // like "nothing changed" and the alarms would keep pointing at the
        // old channel until something else forced a rewrite.
        String(settings.adhanUsesAlarmStream),
        // The full-screen intent is part of each alert, so flipping it has
        // to rewrite them like the stream above.
        String(settings.prayerAlertFullScreen),
        // Sunrise and the night marks print a clock time in their copy,
        // so a 12/24 change has to rewrite them — same reason as above.
        // The resolved answer rather than the setting, so 'auto' following
        // the device counts as a change too.
        String(clockHour12),
        // The tint is written into every card, so a new accent rewrites.
        palette.accentSolid,
        // The second-time alerts are part of the same schedule, so a
        // change to which of them fire has to rewrite it.
        settings.malikiSecondTimesEnabled
          ? settings.malikiSecondTimeAlerts.join(',')
          : '',
        String(settings.malikiSecondTimeAlertMinutes),
        // The end-of-window alert doubles the set this schedule writes,
        // so turning it on has to rewrite rather than read as no change.
        String(settings.malikiSecondTimeEndAlerts),
        // Which prayers speak, and how. A row cycled from adhan to silent
        // has to take its alarm away, so the schedule is rewritten.
        JSON.stringify(settings.prayerAlertModes),
        // The Live Activity's one-occurrence override, which is not a
        // setting and does not come from this process: the card's button
        // writes it, and the row that shows it writes the clearing. In the
        // fingerprint because it changes which channel ONE prayer is
        // scheduled against — or whether it is scheduled at all. Left out,
        // pressing reset would look like "nothing changed" and the prayer
        // would keep the alert the card gave it until something else
        // forced a rewrite.
        alertOverridePrint,
        state.baseDate.getTime(),
      );
      if (shouldResync(NOTIF_RESYNC_KEY, notifPrint)) {
        syncPrayerNotifications({
          enabled: settings.notificationsEnabled,
          prePrayerReminderMinutes: settings.prePrayerReminderMinutes,
          notificationSound: settings.notificationSound,
          adhanUsesAlarmStream: settings.adhanUsesAlarmStream,
          prayerAlertFullScreen: settings.prayerAlertFullScreen,
          // On the phone's clock: the schedule reads every time on it.
          today: phoneView.table.today,
          tomorrow: phoneView.table.tomorrow,
          // Last night's ʿIshāʾ past midnight is still ahead in the small hours.
          yesterday: phoneView.alertYesterday,
          baseDate: state.baseDate,
          // The alert week, not the drawn one — with the rows off they
          // differ by exactly the boundaries this schedule is for.
          week: phoneView.alertWeek,
          windowWeek: phoneView.windowWeek,
          hour12: clockHour12,
          accentColor: palette.accentSolid,
          // Tinted surfaces: colourise the whole notification with the accent.
          tinted: settings.tintedSurfaces,
          daruriAlerts: settings.malikiSecondTimesEnabled
            ? settings.malikiSecondTimeAlerts
            : [],
          daruriAlertMinutes: settings.malikiSecondTimeAlertMinutes,
          daruriEndAlerts: settings.malikiSecondTimeEndAlerts,
          alertModes: settings.prayerAlertModes,
        })
          // Marked on success only: a rewrite that threw must not suppress
          // the next attempt, or one bad round leaves the alarms as they are
          // for a whole minute of retries that never run.
          .then(() => markResynced(NOTIF_RESYNC_KEY, notifPrint))
          .catch(e => console.warn('syncPrayerNotifications (focus):', e));
      }
      {
        // The widget and the Live Activity read every time on the phone's
        // clock (WallClock.kt / WallClock.swift): they are handed the days
        // on it.
        const t = computeSeasonalTreatment(
          phoneView.table.today,
          phoneView.table.tomorrow,
          new Date(),
        );
        collectWidgetExtras({ timings: phoneView.widget.today, now: new Date() })
          .then(extras =>
            syncPrayerWidget(
              phoneView.widget.today,
              phoneView.widget.tomorrow,
              new Date(),
              locationLabel,
              { lat: state.latitude, lng: state.longitude },
              { jumuah: t.jumuah, ramadan: t.ramadan, eid: t.eid },
              phoneView.widget.week,
              extras,
              phoneView.widget.yesterday,
            ),
          )
          .catch(e => console.warn('syncPrayerWidget (focus):', e));
        // Live activity — task #128. Same cadence as the widget so the
        // notification stays in sync with what's on the home screen.
        syncLiveActivity({
          options: { enabled: settings.liveActivityEnabled },
          today: phoneView.la.today,
          tomorrow: phoneView.la.tomorrow,
          week: phoneView.la.week,
          yesterday: phoneView.la.yesterday,
          now: new Date(),
          locationName: locationLabel,
          coords: { lat: state.latitude, lng: state.longitude },
          seasonal: { jumuah: t.jumuah, ramadan: t.ramadan, eid: t.eid },
          // Use the app's actual current accent so the notification matches the
          // app exactly (standard theme → the brand emerald; system colours →
          // the live Material You colour). When systemAccent is set, the native
          // side re-resolves the live system colour on each repost.
          accentHex: palette.accentSolid,
          // Android: follow the live Material You system colour (re-resolved
          // natively on each repost) only when system colours are enabled.
          systemAccent:
            Platform.OS === 'android' &&
            settings.appearance === 'system' &&
            settings.useSystemDynamicTheme,
          // iOS Liquid Glass: let the Live Activity use the dynamic system
          // tint instead of the brand accent so it matches the system theme.
          systemTinted:
            Platform.OS === 'ios' &&
            settings.appearance === 'system' &&
            settings.useSystemDynamicTheme,
          design: settings.liveActivityDesign,
          // Tinted surfaces: colourise the Live Activity card with the accent.
          tinted: settings.tintedSurfaces,
        }).catch(e => console.warn('syncLiveActivity (focus):', e));
      }

      if (settings.notificationsEnabled) {
        notifee
          .getNotificationSettings()
          .then(s => {
            if (Platform.OS === 'android') {
              setExactAlarmDenied(
                s.android.alarm !== AndroidNotificationSetting.ENABLED,
              );
            } else if (Platform.OS === 'ios') {
              setNotifPermDenied(
                s.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
                  s.authorizationStatus !== AuthorizationStatus.PROVISIONAL,
              );
            }
          })
          .catch(e => console.warn('getNotificationSettings:', e));
      } else {
        setExactAlarmDenied(false);
        setNotifPermDenied(false);
      }
    }, [
      afterFirstPaint,
      hydrated,
      settings.notificationsEnabled,
      settings.prePrayerReminderMinutes,
      settings.notificationSound,
      settings.adhanUsesAlarmStream,
      settings.prayerAlertFullScreen,
      clockHour12,
      settings.malikiSecondTimesEnabled,
      settings.malikiSecondTimeAlerts,
      settings.malikiSecondTimeAlertMinutes,
      settings.malikiSecondTimeEndAlerts,
      settings.prayerAlertModes,
      // Pressing reset on a row changes nothing this screen owns, so
      // without this the effect keeps its identity, the focus pass never
      // re-runs, and the alarm keeps whatever the card gave it.
      alertOverridePrint,
      state,
      view,
      phoneView,
      locationLabel,
      settings.liveActivityEnabled,
      // `palette.accentSolid` is derived from the accent id and its custom
      // hex, so it moves whenever either of them does — listing all three
      // said the same thing three times, and hid the linter's real
      // complaints about this hook behind an "unnecessary dependency" one.
      palette.accentSolid,
      // Tinted surfaces recolours both the shade and the Live Activity.
      settings.tintedSurfaces,
      settings.appearance,
      settings.useSystemDynamicTheme,
      settings.liveActivityDesign,
    ]),
  );

  // Push the widget payload whenever displayable data changes. We don't
  // include `now` in the deps any more — the widget doesn't need a tick-by-tick
  // refresh; it updates when the underlying data does.
  useEffect(() => {
    // Not on the on-device times that fill the moment after a location
    // change (`provisional`): writing those out would gate the provider's
    // times a beat later as "already done". Only a settled answer syncs.
    if (!hydrated || state.phase !== 'ready' || !view || state.provisional)
      return;
    if (!afterFirstPaint) return;
    if (!phoneView) return;
    // On the phone's clock, which the widgets read every time on.
    const seasonal = computeSeasonalTreatment(
      phoneView.table.today,
      phoneView.table.tomorrow,
      new Date(),
    );
    collectWidgetExtras({ timings: phoneView.widget.today, now: new Date() })
      .then(extras =>
        syncPrayerWidget(
          phoneView.widget.today,
          phoneView.widget.tomorrow,
          new Date(),
          locationLabel,
          { lat: state.latitude, lng: state.longitude },
          {
            jumuah: seasonal.jumuah,
            ramadan: seasonal.ramadan,
            eid: seasonal.eid,
          },
          phoneView.widget.week,
          extras,
          phoneView.widget.yesterday,
        ),
      )
      .catch(e => console.warn('syncPrayerWidget (effect):', e));
  }, [
    afterFirstPaint,
    hydrated,
    state,
    view,
    phoneView,
    locationLabel,
    // A prayer logged, a page turned or a bead counted changes what the
    // widget should say without changing any prayer time — so the payload
    // has to be rebuilt on those too, not only on `view`.
    widgetRevision,
    // Every name in the payload is localized — the prayers, the surah, the
    // dhikr. The Live Activity effect has always listed this and the widget
    // effect did not, so a language change left the widget in the old one
    // until something unrelated moved.
    i18n.language,
    // Every time in the payload is drawn in the user's clock format, and
    // the payload is built outside React from a mirror of the answer —
    // so the effect has to know when the answer changed.
    clockHour12,
    // The Hijri date in the payload follows the chosen calendar.
    hijriVersion,
  ]);

  // Live Activity sync — runs whenever prayer data changes OR whenever the
  // "next prayer" pointer advances (nextInfo change is detected by the 30-second
  // watchdog above). Including nextInfo here is the key fix for the countdown
  // reaching zero without advancing: when Fajr passes and nextInfo flips to
  // Dhuhr, this effect re-fires with `now: new Date()`, so syncLiveActivity
  // recomputes the correct next prayer and pushes updated content.
  useEffect(() => {
    // Not on the on-device times that fill the moment after a location
    // change (`provisional`): writing those out would gate the provider's
    // times a beat later as "already done". Only a settled answer syncs.
    if (!hydrated || state.phase !== 'ready' || !view || state.provisional)
      return;
    if (!afterFirstPaint) return;
    if (!phoneView) return;
    // On the phone's clock, which the Live Activity reads every time on.
    const seasonal = computeSeasonalTreatment(
      phoneView.table.today,
      phoneView.table.tomorrow,
      new Date(),
    );
    syncLiveActivity({
      options: { enabled: settings.liveActivityEnabled },
      today: phoneView.la.today,
      tomorrow: phoneView.la.tomorrow,
      week: phoneView.la.week,
      yesterday: phoneView.la.yesterday,
      now: new Date(),
      locationName: locationLabel,
      coords: { lat: state.latitude, lng: state.longitude },
      seasonal: {
        jumuah: seasonal.jumuah,
        ramadan: seasonal.ramadan,
        eid: seasonal.eid,
      },
      // App's actual current accent (see focus-effect note above).
      accentHex: palette.accentSolid,
      // Android: follow the live Material You system colour only when system
      // colours are enabled (re-resolved natively on each repost).
      systemAccent:
        Platform.OS === 'android' &&
        settings.appearance === 'system' &&
        settings.useSystemDynamicTheme,
      // iOS Liquid Glass: dynamic system tint instead of the brand accent.
      systemTinted:
        Platform.OS === 'ios' &&
        settings.appearance === 'system' &&
        settings.useSystemDynamicTheme,
      design: settings.liveActivityDesign,
      // Tinted surfaces: colourise the Live Activity card with the accent.
      tinted: settings.tintedSurfaces,
    }).catch(e => console.warn('syncLiveActivity (effect):', e));
  }, [
    afterFirstPaint,
    hydrated,
    state,
    view,
    phoneView,
    // nextInfo is the computed "which prayer is next right now" value.
    // The 30-second watchdog updates it whenever a prayer passes, triggering
    // this effect to re-sync the Live Activity with the new next prayer.
    nextInfo,
    locationLabel,
    settings.liveActivityEnabled,
    palette.accentSolid,
    settings.appAccentId,
    settings.appAccentCustomHex,
    settings.appearance,
    settings.useSystemDynamicTheme,
    settings.liveActivityDesign,
    // Re-push the moment Tinted surfaces is toggled so the card recolours.
    settings.tintedSurfaces,
    // Re-push the Live Activity the instant the user changes its options
    // (HomeScreen stays mounted, so this fires even from the Settings screen).
    settings.liveActivityLockButton,
    // Re-push when the app language changes so the notification's localised
    // labels (In/At, mute toggle, Hijri month) update. Using i18n.language
    // (not settings.language) guarantees i18n has already switched before we
    // rebuild the payload via i18n.t.
    i18n.language,
    // Same reason as the widget effect: the card's times follow the clock
    // format, and the format can change without any setting changing.
    clockHour12,
    // The Hijri date in the payload follows the chosen calendar.
    hijriVersion,
  ]);

  // Persist last-fetched coords so MonthScreen and offline use can fall back to
  // them, plus the reverse-geocoded city name so the location chip can name the
  // automatic location (and keep naming it across restarts).
  const readyLat = state.phase === 'ready' ? state.latitude : undefined;
  const readyLng = state.phase === 'ready' ? state.longitude : undefined;
  const readyCity = state.phase === 'ready' ? state.cityName : undefined;
  // The load's OWN source, not the live mode. On a manual->automatic switch
  // the mode flips a render before this state catches up; trusting the mode
  // there wrote the manual city into the last-GPS-fix slot for one frame.
  const readyFromAuto = state.phase === 'ready' ? state.fromAuto === true : false;
  useEffect(() => {
    // Only a GPS-resolved load. `lastFetched*` is the last place the phone
    // was, kept across a stint on a saved location so that coming back to
    // "My location" can show it at once while a fresh fix lands. Gated on
    // the LOAD's source (`readyFromAuto`), not the live mode: the mode
    // flips a render before the ready state catches up, and gating on it
    // wrote the manual city into this slot for that one frame. Writing the
    // MANUAL coordinates here — as this used to — is what forced the mode
    // switch to wipe them, and that wipe is what left "My location" on a
    // blank screen until GPS, geocoding and a fetch had all finished.
    if (!readyFromAuto) return;
    if (readyLat == null || readyLng == null) return;
    const coordsSame =
      settings.lastFetchedLatitude === readyLat &&
      settings.lastFetchedLongitude === readyLng;
    const citySame = settings.autoLocationLabel === readyCity;
    if (coordsSame && citySame) return;
    const patch: {
      lastFetchedLatitude: number;
      lastFetchedLongitude: number;
      autoLocationLabel?: string;
    } = {
      lastFetchedLatitude: readyLat,
      lastFetchedLongitude: readyLng,
    };
    if (!citySame) patch.autoLocationLabel = readyCity;
    updateSettings(patch);
  }, [
    readyLat,
    readyLng,
    readyCity,
    readyFromAuto,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    settings.autoLocationLabel,
    updateSettings,
  ]);


  const getDayLabel = useCallback(
    (dayOffset: number): string => {
      if (dayOffset === 0) return t('home.today');
      if (dayOffset === 1) return t('home.tomorrow');
      if (dayOffset === -1) return t('home.yesterday');
      return addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        weekday: 'long',
      });
    },
    [t, i18n.language],
  );
  /** The weekday's name for any day, today included — the table's day line. */
  const getWeekday = useCallback(
    (dayOffset: number): string =>
      addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        weekday: 'long',
      }),
    [i18n.language],
  );
  const getDayDate = useCallback(
    (dayOffset: number): string =>
      addDays(new Date(), dayOffset).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
      }),
    [i18n.language],
  );
  const getHijriDate = useCallback(
    /**
     * THE CARD'S DAY, NOT THE ISLAMIC DAY — and deliberately.
     *
     * The Islamic day begins at maghrib (`hijri/islamicDay`), so between
     * maghrib and the end of the card this label is one behind what a
     * reader would answer if asked the date. It stays anyway, because this
     * line is the TABLE's heading: the table turns to tomorrow after the
     * last time of the day (`dayRollover`, Isha or the First Third), and
     * the same `dayOffset` drives all three parts of the heading. Shifting
     * this one at maghrib made it disagree with the weekday beside it for
     * the evening, and then double-count once the table turned — the
     * heading read two days ahead of the times underneath it.
     *
     * The Islamic day governs what is COUNTED in a day (the khatmah's
     * portion) and which day an event falls on. What the table is showing
     * is a different question, and this label answers that one.
     */
    (dayOffset: number): string =>
      formatHijriLabel(addDays(new Date(), dayOffset)),
    // i18n.language drives the localised Hijri month name inside the
    // formatter; the calendar version, which calendar it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language, hijriVersion],
  );


  const handleOpenMonth = useCallback(
    () => navigation.navigate('MonthTimes'),
    [navigation],
  );
  /**
   * Undefined on a Mac, where the compass screen is not registered at all
   * — see `RootNavigator`. The chip still renders; it just stops being a
   * button rather than pushing a route that does not exist.
   */
  const handleOpenQibla = useMemo(
    () =>
      isMacCatalyst
        ? undefined
        : () => {
            navigation.navigate('Compass');
          },
    [navigation],
  );
  // The heart above the countdown: Settings → About → Help Mihrab.
  const handleOpenHelpMihrab = useCallback(
    () => navigation.navigate('SettingsHelpMihrab'),
    [navigation],
  );

  /**
   * The Qibla bearing for wherever we are, for the hero chip.
   *
   * Null until there is a fix, so the chip shows nothing rather than a
   * confident bearing computed from a placeholder coordinate — 0,0 is in
   * the Atlantic and its Qibla is a real number that would be wrong
   * everywhere.
   */
  const qiblaBearing = useMemo(() => {
    const lat =
      settings.locationMode === 'automatic'
        ? settings.lastFetchedLatitude
        : settings.manualLatitude;
    const lng =
      settings.locationMode === 'automatic'
        ? settings.lastFetchedLongitude
        : settings.manualLongitude;
    if (lat == null || lng == null) return null;
    return qiblaBearingFrom(lat, lng);
  }, [
    settings.locationMode,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    settings.manualLatitude,
    settings.manualLongitude,
  ]);

  /**
   * iPhone Duo: the location and the Qibla stand in the vertical bar's
   * column, under the clock, while Today is the page on show — handed to
   * the tab bar, which owns the column (VerticalTabBar). The hero shows no
   * top row then (TodayCard).
   */
  const vbar = useVerticalBar();
  const columnInk = useMemo(
    () => ({ text: String(palette.mutedSolid), muted: String(palette.mutedSolid) }),
    [palette.mutedSolid],
  );
  useFocusEffect(
    useCallback(() => {
      if (!vbar) return undefined;
      setVerticalBarActions(
        <>
          <LocationChip
            compactHeader
            column
            ink={columnInk}
            onAddLocation={() =>
              navigation.navigate('SettingsLocation', {
                highlight: 'savedLocations',
                activateOnAdd: true,
              })
            }
          />
          <QiblaChip bearing={qiblaBearing} onPress={handleOpenQibla} ink={columnInk} column />
        </>,
      );
      return () => setVerticalBarActions(null);
    }, [vbar, columnInk, navigation, qiblaBearing, handleOpenQibla]),
  );
  const handleOpenQuran = useCallback(
    // The Quran is a TAB now, not a pushed page — jump to it rather than
    // stacking a second copy on top of Today (design review 2e).
    () => navigation.navigate('QuranTab' as never),
    [navigation],
  );
  /** Continue reading exactly where the card says — surah, page, ayah. */
  const handleOpenQuranAt = useCallback(
    (
      surahNumber: number,
      page?: number,
      ayah?: number,
      khatmah?: boolean,
      bookmarkId?: string,
    ) =>
      navigation.navigate('QuranSurah', {
        surahNumber,
        initialPage: page,
        scrollToAyah: ayah,
        sessionKhatmah: khatmah,
        // The starred bookmark's door: the visit is the bookmark's, as it
        // is when it is opened from the bookmark list.
        sessionBookmarkId: bookmarkId,
      }),
    [navigation],
  );
  const handleOpenLog = useCallback(
    () => navigation.navigate('LogTab' as never),
    [navigation],
  );


  // The page's own height — the root view, which ends where the tab bar
  // begins — for the budget that picks the page's size (homeBudget.ts).
  const [viewport, setViewport] = useState(0);
  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setViewport(prev => (prev === h ? prev : h));
  }, []);

  // ── Phase routing: any non-ready phase short-circuits here. ───────────────
  const nonReadyEl = useNonReadyPhaseElement({
    hydrated,
    locationOnboardingComplete: settings.locationOnboardingComplete,
    state,
    retry,
  });
  if (nonReadyEl) return nonReadyEl;
  if (state.phase !== 'ready' || !view) return null; // narrowing for TS

  // ── Ready layout ──────────────────────────────────────────────────────────
  const carouselResetKey = `${state.latitude}-${state.longitude}`;
  /**
   * The page's size: roomy, comfortable or compact, for every segment at
   * once — docs/home-layout-plan.md §4. Only the phone's full-bleed page
   * is budgeted; the dashboard, the book and a roomy tablet have room by
   * definition. Until the root has been measured the page is comfortable,
   * which is what it was before there was a budget.
   */
  const todayMap: TimingsMap = view.table.week[0] ?? ({} as TimingsMap);
  /**
   * MINIMAL — ONE THING ON THE PAGE (settings.minimalUi).
   *
   * The phone's page is the hero alone: the sky, the countdown, the next
   * prayer's name and time, the rail, and one line at the foot saying
   * where, which day and whose times. The day bar, the rows, the Quran
   * door and the chips stand down; a drag up on the page opens the
   * day's times as a sheet. Only the phone's full-bleed page: the
   * dashboard, the book and a roomy tablet have room, and keep it — and
   * only where the navigator is Minimal too (`useMinimalUi`: not on the
   * Mac, not beside an iPhone's vertical bar), so the page and its tabs
   * never wear different faces.
   */
  const minimal = minimalUi && !isDashboard && !isRoomy && !book;
  // Short strings a render; not memoised, this far past the page's early
  // returns. The footer is where and which day — two facts, not three:
  // whose times is a fact about the times, and goes with them in the
  // sheet, where "Sweden" beside a city read as an address.
  let minimalFooter: string | undefined;
  let minimalSource: string | undefined;
  if (minimal) {
    const provider = refreshParams?.provider;
    // Whose times: the method when the reader chose one, else the source.
    minimalSource = provider
      ? providerHidesCalculationMethod(provider) || settings.calculationMethod === 'auto'
        ? getProviderLabel(provider)
        : getMethodLabel(settings.calculationMethod)
      : undefined;
    // The city alone: a saved place carries its region and country too.
    minimalFooter = [cityOf(locationLabel), getHijriDate(0)].filter(Boolean).join(' · ');
  }
  const budgeted = !isDashboard && !isMacCatalyst && !isRoomy && !book && !tabletop && viewport > 0;
  const tier: HomeTier = budgeted
    ? pickHomeTier({
        viewport,
        topInset: hasBanner ? 0 : insets.top,
        fontScale: currentFontScale(),
        rows: DISPLAY_ORDER.filter(key => todayMap[key]).length,
        sublineRows: DISPLAY_ORDER.filter(key => todayMap[`${key}Daruri` as keyof TimingsMap]).length,
        // A banner's height is its own; this is a notice's usual size.
        extra: hasBanner ? 72 : 0,
      })
    : 'comfortable';

  return (
    <View style={styles.homeRoot} onLayout={onRootLayout}>
      {/* Mac Catalyst: the app's top bar — wordmark leading, location chip
          trailing — ABOVE the scroll view, not inside it.

          Not the navigation bar, which is what a Mac would normally use: on
          Catalyst it is transparent and sits inside the window's title-bar
          DRAG REGION, where clicks were intermittently swallowed as window
          drags. That is why the chip left the header in the first place.

          Not a row of content either, which is where it went instead. Two
          things went wrong there, both only at some window sizes, which is
          what made them look like ghosts. The dashboard zooms itself with a
          centred `transform: scale`, and a transform does not change layout
          — so past ~1.1x the cards painted straight over the row above them
          and the bar disappeared. And the dashboard's content is CENTRED
          vertically to fill the window, which carried the bar down with it:
          a title bar sitting two thirds of the way down the window
          (reported 2026-08-24, both).

          Above the ScrollView it is chrome: pinned to the top, spanning the
          window rather than the card column, and unaffected by any zoom —
          held clear of the window's own title bar by `macTopBarInset`. */}
      {isMacCatalyst ? (
        <>
          <View style={[styles.macTopBar, { paddingTop: macTopBarInset }]}>
            <MihrabHeaderTitle />
            <HomeHeaderControls />
          </View>
          {/* The playback bar every other screen gets from the navigator's
              layout. Here it has to come AFTER the top bar above, which
              is why the layout copy stands down for this tab on Catalyst
              — see `HeaderPlaybackBar`. */}
          <HeaderPlaybackBar surface={palette.bg} inline />
        </>
      ) : null}
    <PullToRefreshFrame
      store={pull}
      enabled={pullEnabled}
      top={!isDashboard && !isMacCatalyst ? insets.top : 0}>
    <ScrollView
      ref={scrollRef}
      // The phone tracks the offset for the status band; everywhere else
      // the tab bar's own handler is all there is to run. The pull needs
      // to know one thing from the same event — whether the page is at
      // the top — because a drag down anywhere else is an ordinary
      // scroll and must be left alone.
      onScroll={e => {
        noteScrollTop(e.nativeEvent.contentOffset.y);
        pull.onScroll(e);
        if (!isDashboard && !isMacCatalyst) onScroll(e);
        else tabBarScroll.onScroll?.(e);
      }}
      scrollEventThrottle={16}
      // Minimal: the page fits, and a drag up on it opens the day's times
      // (TodayCard's pan) — a scroll view that still took the drag would
      // have it. The pull to refresh is its own handler, and keeps working.
      scrollEnabled={!minimal}
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={[
        styles.scrollContent,
        // The phone's hero runs edge to edge; the rows pad themselves.
        !isDashboard && !isMacCatalyst && styles.scrollContentBleed,
        // Roomy: the content is a block in the middle of the page rather
        // than a page-height column.
        isRoomy && styles.scrollContentRoomy,
        // Tabletop: from the top, so the hero's foot can be placed on the hinge.
        tabletop && styles.scrollContentTop,
        // Breathing room under the last card — and NOTHING for the tab
        // bar or the safe area. The bar is in flow, so the scroll view
        // already ends above it, and the bar's own bottom margin already
        // spends `insets.bottom`. Adding it here as well cost ~54pt of
        // dead air at the foot of the page, which on iPad was most of
        // the reason the dashboard overflowed and had to scroll at all.
        // Minimal: nothing under the hero — its sky runs on under the dots.
        { paddingBottom: minimal ? 0 : SPACING.xl + tabBarInset },
        // Beside a vertical bar: only clear of the home indicator (no bar
        // along the bottom then). The column is kept clear inside:
        // TodayCard pads the hero's content and the table, and the sky
        // runs under it. Anything more was a band of nothing under the
        // last card — the hero grows into that room instead.
        vbarPad && { paddingBottom: Math.max(insets.bottom, SPACING.md) },
        // Fill the viewport on the dashboard: when the two columns are
        // shorter than the window, center them vertically instead of
        // leaving the bottom half of a Mac/iPad window empty (§B1).
        isDashboard && styles.scrollContentDash,
      ]}
      // On the phone the hero clears the status bar itself; letting iOS add
      // the inset too would push the sky down by a status bar.
      contentInsetAdjustmentBehavior={!isDashboard && !isMacCatalyst ? 'never' : 'automatic'}>
      {/* gap must live INSIDE CenteredColumn: the wrapper collapses all
          cards into one child of the scroll container, so the container's
          own gap: SPACING.md stopped separating them (2.7.36 regression — the
          carousel dots overlapped the day table and the Quran button). */}
      <CenteredColumn
        maxWidth={isDashboard ? dashCap : book || wideInset > 0 ? screenWidth : undefined}
        style={[
          styles.homeColumn,
          !isDashboard && !isMacCatalyst && !isRoomy && styles.fillColumn,
        ]}
        // Both wrappers: on a wide-but-not-dashboard window (a tablet held
        // upright) the column is capped and gets an inner View, and the
        // hero can only grow to the page's foot if that one grows too —
        // which is exactly what a roomy page must NOT do.
        innerStyle={[
          styles.homeColumn,
          !isDashboard && !isMacCatalyst && !isRoomy && styles.fillColumn,
        ]}>
      {/* A banner is the FIRST thing on the page, and on a phone the page
          runs to the top edge — so without this the notice was drawn
          through the clock and behind the camera. It takes the status
          bar's height as padding and the bar's glyphs go back to the
          page's own ink, because with a banner up there the sky is no
          longer what the clock sits on (see `bannerAbove` below). */}
      {/* Held as a book, the notices keep to the day's page too. Mounted
          only when a notice is drawn: the column has a gap, and an empty
          wrapper above the hero still took it — a strip of page colour
          across the top of the screen, above the sky. Beside the Duo's
          vertical bar they keep clear of it, as the rest of the page does:
          a notice running under the bar lost its Dismiss to it. */}
      {permissionBannersShown({
        usingLocalFallback: state.usingLocalFallback ?? false,
        exactAlarmDenied,
        notifPermDenied,
        timezoneShift,
        methodNote,
        zoneNote,
      }) ? (
        <View
          style={
            book
              ? { width: Math.max(0, book.left - HOME_SCREEN_PADDING * 2) }
              : [wideInset > 0 ? { paddingHorizontal: wideInset } : undefined, vbarPad]
          }>
          <PermissionBanners
            usingLocalFallback={state.usingLocalFallback ?? false}
            exactAlarmDenied={exactAlarmDenied}
            notifPermDenied={notifPermDenied}
            onRetryFetch={retry}
            timezoneShift={timezoneShift}
            methodNote={methodNote}
            onDismissMethodNote={dismissMethodNote}
            zoneNote={zoneNote}
            onDismissZoneNote={dismissZoneNote}
            onDismissTimezoneShift={() => {
              // Both halves: the module stops offering it to the next load,
              // and this screen stops drawing it now.
              clearTimezoneShiftNotice();
              setTzNoticeDismissedAt(timezoneShift?.at ?? Date.now());
            }}
            topInset={
              !isDashboard && !isMacCatalyst && !isRoomy && hasBanner ? insets.top : 0
            }
          />
        </View>
      ) : null}


      {(() => {
        // One card: countdown → day strip → times → month link (2a). The
        // hero and the table were the same data at two sizes, and the day
        // switcher was six invisible dots between them.
        // Phones: the hero runs to the top of the screen under the status
        // bar and carries the location chip; the tab's header is hidden.
        // The dashboard (iPad/Mac) keeps its card and its header.
        const fullBleed = !isDashboard && !isMacCatalyst;
        const dayTable = (
          <TodayCard
            week={view.table.week}
            past={view.table.past}
            // The raw day, Sunrise included whatever the rows say: the sky
            // needs it to know where dawn ends.
            skyTimings={state.phase === 'ready' ? state.today : undefined}
            dayClock={state.phase === 'ready' ? state.clock : undefined}
            latitude={readyLat}
            longitude={readyLng}
            nextInfo={nextInfo}
            resetKey={carouselResetKey}
            getDayLabel={getDayLabel}
            getDayDate={getDayDate}
            getHijriDate={getHijriDate}
            getWeekday={getWeekday}
            onOpenMonth={handleOpenMonth}
            qiblaBearing={qiblaBearing}
            onOpenQibla={handleOpenQibla}
            onHelpMihrab={settings.showHelpMihrabOnHome ? handleOpenHelpMihrab : undefined}
            minimal={minimal}
            footer={minimalFooter}
            footInset={tabBarInset}
            placeLabel={minimal && locationLabel ? cityOf(locationLabel) : undefined}
            timesSource={minimalSource}
            onOpenPlace={() => navigation.navigate('SettingsLocation', { highlight: 'savedLocations' })}
            expanded={isDashboard}
            fullBleed={fullBleed}
            roomy={isRoomy}
            tier={tier}
            heroHeight={tabletopHeroHeight}
            sideInset={wideInset}
            // The hero is under the status bar only when nothing is above
            // it. A permission banner takes that place, and takes the
            // inset and the bar's ink with it.
            bannerAbove={hasBanner}
            renderLocation={
              fullBleed
                ? (ink, column) => (
                    <LocationChip
                      compactHeader
                      column={column}
                      ink={ink}
                      onAddLocation={() =>
                        navigation.navigate('SettingsLocation', {
                          highlight: 'savedLocations',
                          activateOnAdd: true,
                        })
                      }
                    />
                  )
                : undefined
            }
          />
        );
        const ramadanCard = (
          // Its countdown and its time are read on the phone's clock.
          <RamadanCountdownCard
            today={phoneView?.today ?? state.today}
            tomorrow={phoneView ? phoneView.tomorrow : state.tomorrow}
          />
        );
        const quranShortcut = (
          <QuranCard
            onOpenAt={handleOpenQuranAt}
            onOpenQuran={handleOpenQuran}
            // The phone's door sits on the page under the table, in the
            // rows' own grammar; the dashboard and the book keep the card.
            bare={fullBleed}
            dense={tier === 'compact'}
          />
        );
        const toolsGrid = <TodaySummary onOpenLog={handleOpenLog} />;
        const practiceCard = settings.showPracticeOnHome ? (
          <ErrorBoundary label="PracticeCard">
            <PracticeCard />
          </ErrorBoundary>
        ) : null;

        if (isDashboard) {
          return (
            // transform-scale zoom: layout stays at the capped size (so
            // the carousel paging math is untouched); the rendered
            // result grows around the centered box to fill the window.
            <View
              onLayout={onDashRowLayout}
              style={[
                styles.dashRow,
                dashScale > 1 && {
                  transform: [{ scale: dashScale }],
                  // What the scale paints outside the box — see dashOverflow.
                  marginVertical: dashOverflow,
                },
              ]}>
              {/* The main column carries the day table AND NOTHING ELSE.
                  It is the tallest thing on the screen by a wide margin —
                  hero, day strip, six rows and the month link — and on an
                  11" iPad in landscape it uses essentially the whole
                  window on its own. Anything stacked under it therefore
                  falls off the bottom, which is exactly what happened to
                  the Quran card: the one card on Home you are meant to
                  ACT on was the one card you had to scroll to find
                  (reported 2026-08-02).

                  So the Quran card moves across to the side column, and
                  goes FIRST in it — the side column was half empty, and
                  a shortcut outranks a read-only summary. Home now fits
                  the window on iPad with nothing to scroll to. */}
              <View style={{ width: HOME_MAIN_COL, gap: SPACING.md }}>{dayTable}</View>
              <View style={styles.dashSide}>
                {quranShortcut}
                {toolsGrid}
                {practiceCard}
                {ramadanCard}
              </View>
            </View>
          );
        }
        /**
         * THE PHONE SHOWS WHAT IT NEEDS AND NO MORE.
         *
         * The hero, the strip and the day's times fit the screen without
         * scrolling — that is the whole design of the page (the way
         * Pillars does it). What used to follow them below the fold has
         * gone where it is looked for: the times source and the data
         * statistics to Settings → Prayer times, the day's practice
         * summary and the graph to the Log tab (which is theirs). The
         * Quran shortcut — continue reading, or start, or the khatmah's
         * next page — stays, because it fits under the table and is the
         * one thing on this page that is not about the times. The
         * Ramadan countdown stays in its season. The dashboard has the
         * room and keeps its side column.
         */
        if (book) {
          // Two pages of a book: the gutter is the hinge, plus the screen's
          // own gutter either side of it. `row` mirrors in right-to-left
          // languages, and the hinge is in the middle, so the day lands on
          // the first page either way.
          const pad = HOME_SCREEN_PADDING;
          return (
            <View style={[styles.bookRow, { gap: book.right - book.left + pad * 2 }]}>
              <View style={{ width: Math.max(0, book.left - pad * 2), gap: SPACING.md }}>
                {dayTable}
              </View>
              <View style={styles.dashSide}>
                {quranShortcut}
                {toolsGrid}
                {practiceCard}
                {ramadanCard}
              </View>
            </View>
          );
        }
        return (
          <>
            <View
              ref={tableWrapRef}
              onLayout={tabletop ? measureTable : undefined}
              style={isRoomy ? undefined : styles.fillColumn}>
              {dayTable}
            </View>
            <View
              style={[
                styles.belowHero,
                tier === 'compact' && styles.belowHeroCompact,
                vbarPad,
                wideInset > 0 && { marginHorizontal: wideInset },
              ]}>
              {/* Minimal: the page is the hero; the Quran door is on its
                  own tab, and Ramadan's countdown waits for the full page. */}
              {minimal ? null : quranShortcut}
              {minimal ? null : ramadanCard}
            </View>
          </>
        );
      })()}
      </CenteredColumn>


      <HomeFeaturesOffer
        ready={
          hydrated &&
          settings.onboardingComplete &&
          changelogSince === null &&
          !changelogShown.current
        }
      />
      <SkyThemeOffer
        ready={
          hydrated &&
          settings.onboardingComplete &&
          changelogSince === null &&
          !changelogShown.current
        }
      />
      <ChangelogSheet
        visible={changelogSince !== null}
        since={changelogSince}
        onClose={() => setChangelogSince(null)}
      />
    </ScrollView>
    </PullToRefreshFrame>
    {/* Over the page, and only on the phone's full-bleed hero: the
        dashboard's card does not run under the status bar. */}
    {!isDashboard && !isMacCatalyst && !hasBanner ? (
      <HomeStatusBand
        scrollY={scrollY}
        insetTop={insets.top}
        pageColor={String(palette.bg)}
      />
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Expanded-width dashboard: fixed "today" main column + flexible tools
  // sidebar, so Home fills a wide window and fits without scrolling.
  dashRow: {
    flexDirection: 'row',
    // Stretch (not flex-start): the sidebar's last card can breathe to
    // the main column's height, so the two columns read as one piece.
    alignItems: 'stretch',
    gap: SPACING.xl,
  },
  // A foldable held as a book — see `book` above.
  bookRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  scrollContentTop: { justifyContent: 'flex-start' },
  dashSide: {
    flex: 1,
    gap: SPACING.md,
  },
  homeRoot: { flex: 1 },
  // Mac Catalyst top bar (see the render site). `row` + `space-between`
  // rather than fixed corners, so Arabic and the other right-to-left
  // languages get the mirror of this and not the same arrangement: the
  // wordmark takes the leading edge either way.
  //
  // It spans the WINDOW, not the card column: this is the navigation bar's
  // job, and a bar that stops where the cards stop is a row, not chrome.
  // Padded to the screen's own gutter so the wordmark lines up with the
  // left edge of the cards underneath it at the widths where they meet it.
  macTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: HOME_SCREEN_PADDING,
    // paddingTop is `macTopBarInset`, applied at the render site: it depends
    // on the window's title-bar band, which is not a constant.
    paddingBottom: SPACING.sm,
    minHeight: 34,
  },
  scroll: { flex: 1 },
  // Inter-card rhythm for BOTH CenteredColumn variants (compact uses the
  // outer `style`, wide uses the capped inner column).
  homeColumn: { gap: SPACING.md },
  scrollContent: {
    padding: HOME_SCREEN_PADDING,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  // The phone: the page is the viewport. The column grows to fill it and
  // the hero takes whatever the table and the shortcut leave, so the sky
  // ends where the tab bar begins rather than above a band of nothing.
  scrollContentBleed: { paddingTop: 0, paddingHorizontal: 0, flexGrow: 1 },
  // Grow, never shrink under the content — see TodayCard's `cardBleed`.
  fillColumn: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  belowHero: { paddingHorizontal: HOME_SCREEN_PADDING, gap: SPACING.md },
  belowHeroCompact: { marginTop: -SPACING.xs, gap: SPACING.sm },
  // Dashboard: let the content grow to the viewport and center it
  // vertically when shorter (§B1 — kills the dead bottom half).
  scrollContentDash: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // Same idea as the dashboard's, for a tablet held upright: the day is a
  // block centred in the page, with air above and below it.
  scrollContentRoomy: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
});
