import { bootMark } from '../boot/bootTimeline';
import { afterFirstPaint } from '../boot/firstPaint';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { requestAndroidLocationPermission } from '../utils/locationPermission';
import {
  getOrFetchPrayerDay,
  getCacheStatus,
  refreshPrayerDataCache,
  maybeFullSyncOnWifi,
  refetchFallbackDays,
  purgeCachesNear,
  type PrayerDay,
} from '../prayer/prayerStorage';
import { getPositionStaged } from '../utils/getPosition';
import { onLiveMove, onLiveRecheck } from '../location/liveMove';
import {
  SLOW_AFTER_MS,
  isFreshFix,
  recordFreshFix,
  seemsToHaveTravelled,
  setLocationFreshness,
  staleFixSettlesJourney,
} from '../prayer/locationFreshness';
import { recordLocationFix } from '../prayer/cityRegistry';
import { reverseLocality, type ReverseLocality } from '../geocoding/nominatim';
import i18n from '../i18n';
import { computeLocalAdhanTimes } from '../providers/localAdhan';
import { computeNamazvaktiMethodTimes } from '../providers/namazvakti';
import {
  settleTimezoneShift,
  pendingTimezoneShift,
  timezoneShiftAwaitingFix,
  type TimezoneShift,
} from '../prayer/timezoneShift';
import {
  dayTzFingerprint,
  markResynced,
  shouldResync,
} from '../utils/resyncGate';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { setCalculationPreferences } from '../prayer/calculationPreferences';
import type { PrayerAppSettings, PrayerDataProviderId } from '../settings/types';
import type { TimingsMap } from '../types/prayer';
import {
  addDays,
  DEVICE_CLOCK,
  onClock,
  readZone,
  startOfLocalDay,
} from '../utils/prayerTimes';
import {
  PAST_DAYS,
  WIDGET_WINDOW_DAYS,
  cachedPrayerDaysBefore,
  cachedPrayerDaysFrom,
} from '../prayer/widgetDayWindow';

/** How many consecutive days (today + N-1 more) to fetch and expose. */
const WEEK_DAYS = 7;

/**
 * The settle window that collapses a rapid burst of location switches.
 * A switch that arrives with nothing fired inside this window fires at
 * once (so a single deliberate switch is never delayed); the follow-ups of
 * a burst are held and collapse into one trailing load once the switching
 * stops. See the reload effect.
 */
const LOCATION_SETTLE_MS = 300;

/**
 * How long a new position waits for its town's NAME before the place moves
 * without it. The name comes from the network, and abroad the network is
 * the part that is missing: roaming with no data, an airport's Wi-Fi before
 * its sign-in page. The lookup then takes its four tries of seven seconds —
 * most of a minute in which the position was known, the screen said
 * "found", and the times were still the city left behind. The times need
 * only the position: they move now, under the nearest name the app knows,
 * and the name follows when the lookup answers.
 */
export const NAME_WAIT_MS = 4_000;

/** An answer this much older than a position already taken is an old one. */
const STALE_ANSWER_MS = 120_000;

/**
 * "Not updated", and the app still open: look again by itself — after two
 * minutes, then five, then ten, and then leave it to the reader (Retry, a
 * pull to refresh, the next return to the app). A phone just off a flight
 * finds itself a few minutes after it finds a network, and the reader who
 * opened the app at the gate should not have to know to pull the page
 * down. Only while the app is on screen; three searches at most.
 */
let locationRetryMs: readonly number[] = [120_000, 300_000, 600_000];
/** Tests only. */
export function _setLocationRetryDelaysForTests(ms: readonly number[]): void {
  locationRetryMs = ms;
}


export type PrayerDayState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'permission_denied' }
  | { phase: 'location_error'; message: string }
  /**
   * GPS failed AND we have no previously-saved location to fall back to —
   * surface a manual-entry CTA so the user can type a city or coordinates.
   * Added 2026-05-04 (#125): we used to silently fall through to on-device
   * adhan calculation here, but with no coords there is nothing to calculate
   * from. The user must provide a location.
   */
  | { phase: 'manual_required'; message: string }
  | { phase: 'api_error'; message: string }
  | {
      phase: 'ready';
      latitude: number;
      longitude: number;
      /** Reverse-geocoded city name for the active location (automatic mode).
       *  Undefined in manual mode or before geocoding resolves. Surfaced on
       *  the location chip so automatic mode names the city. */
      cityName?: string;
      /**
       * Start of the LOCAL calendar day `week[0]` was fetched for (v2.7.38).
       * Consumers that place the HH:MM timings on absolute dates (the
       * notification scheduler above all) MUST anchor to this — not to
       * "now" — or a sync that runs after midnight with stale state pins
       * yesterday's clock times onto today's date (the 1–2 min-early
       * adhan + duplicate-alert bug).
       */
      baseDate: Date;
      /**
       * The clock every day below is written on — an IANA zone, or absent
       * for the phone's (`DEVICE_CLOCK`). A saved place in another zone
       * whose source writes it on its own clock (its authority's table,
       * AlAdhan) is on that zone's; everything that turns these times into
       * instants reads them on it (`combineLocalDateAndTime`), and what
       * cannot be told — the widget, the Live Activity, the alert schedule —
       * is handed them rewritten on the phone's (`daysOnDeviceClock`).
       */
      clock?: string;
      /** Convenience alias for week[0]. */
      today: TimingsMap;
      /** Convenience alias for week[1] (may be undefined). */
      tomorrow?: TimingsMap;
      /**
       * Consecutive days starting from today (index 0 = today, 1 = tomorrow …).
       * Always has at least one entry. Stops at the first day that could not be
       * fetched so callers can rely on the array being gapless.
       */
      week: TimingsMap[];
      /**
       * The same schedule, reaching `WIDGET_WINDOW_DAYS` ahead instead of
       * `WEEK_DAYS`, for the widget alone.
       *
       * Separate from `week` because the two are answering different
       * questions. `week` is what the day carousel can swipe through, and
       * seven is a deliberate size there. The widget's copy has to outlast
       * the gaps between app launches, which on a desktop can be weeks, so it
       * takes everything the cache can give it. Never shorter than `week`.
       */
      widgetWeek: TimingsMap[];
      /**
       * The days BEFORE today, nearest first — `past[0]` is yesterday — as
       * far back as the cache reaches, at most `PAST_DAYS`. Gapless, like
       * `week`. The Today card turns back through these; nothing else
       * reads them. Absent on a state written before this field existed.
       */
      past?: TimingsMap[];
      /** True when showing on-device fallback times because the network/provider failed. */
      usingLocalFallback?: boolean;
      /**
       * True while a silent background operation is in flight:
       *  - fetching data for a newly detected location, OR
       *  - filling gaps in the local cache after showing today's times.
       * The displayed times are always valid; this flag just drives a subtle
       * loading indicator so the user knows a refresh is happening.
       */
      backgroundRefreshing?: boolean;
      /**
       * True while the times on screen were computed on the device to fill
       * the moment between a location change and the provider's answer.
       * They are a valid display but NOT a settled answer: nothing that
       * writes them out — the alarm schedule, the widget, the Live Activity,
       * the reminder gates — may run on them, or the provider's times a
       * beat later would be gated out as "already done". Cleared by the
       * state the provider (or the offline fallback) publishes.
       */
      provisional?: boolean;
      /**
       * True when this load is a GPS-resolved (automatic-mode) location, as
       * opposed to a manual one. The one thing that reads it — HomeScreen's
       * persist-last-fix effect — must trust the LOAD's own source, not the
       * live `locationMode`: on a manual→automatic switch the mode flips a
       * render before this state catches up, and keying off the mode wrote
       * the manual city into the last-GPS-fix slot for that one frame.
       */
      fromAuto?: boolean;
      /**
       * The clocks changed under this reader, and these times are the
       * answer under the new rule — issue #56.
       *
       * Set on the load that noticed a UTC-offset change and refreshed
       * because of it, so the Today card can say why every time on screen
       * has just moved by an hour. A prayer app that shifts Fajr silently
       * is asking to be distrusted at exactly the moment it has become
       * right.
       *
       * Carried on the state rather than read from the module that
       * detected it, because this has to re-render the card, and because
       * it belongs to THIS answer: a load that did not come from a shift
       * clears it.
       */
      timezoneShift?: TimezoneShift | null;
    };

// `coordsChangedSignificantly` extracted to `src/utils/coords.ts` (task #17)
// so it can be unit-tested without dragging in the NetInfo / Geolocation
// native modules.
import { coordsChangedSignificantly } from '../utils/coords';
import { applyOffsets, type PrayerOffsetMinutes } from '../settings/prayerOffsets';
import { injectNightTimes } from '../utils/nightTimes';
import { afterRun } from '../boot/launchWarp';

/**
 * Apply per-prayer offsets uniformly across a week of timings — task #22 +
 * follow-up #59. Applied at READ time (here, in the hook) rather than at
 * cache-write time so the cache stays raw: when the user changes an offset,
 * cached data is re-derived without a re-fetch, and a buggy offset only
 * affects the VIEW, never poisoning the stored data. No-op when there are
 * no offsets, so the original references pass through and downstream
 * memoisation stays cheap.
 */
function applyOffsetsToWeek(
  week: TimingsMap[],
  offsets: PrayerOffsetMinutes | undefined,
): TimingsMap[] {
  if (!offsets || Object.keys(offsets).length === 0) return week;
  return week.map(t => applyOffsets(t, offsets));
}

/**
 * The clock a load's days are put on: today's — a saved place's own, where
 * its source writes it there, else the phone's. One clock for every day on
 * screen, so that the night times, the offsets and the carousel compare like
 * with like; a day on another clock is rewritten onto it (`onClock`).
 * Today's rather than the first one on a place's clock: a slot stored before
 * clocks were kept reads as the phone's, and its days stay exactly as they
 * were while days written since are added to it.
 */
export function clockOfDays(days: readonly PrayerDay[]): string {
  const today = days[0]?.clock;
  return readZone(today) ? (today as string) : DEVICE_CLOCK;
}

/** Consecutive days from `start`, each rewritten onto `clock`. */
export function daysOnClock(
  days: readonly PrayerDay[],
  start: Date,
  clock: string,
  step: 1 | -1 = 1,
): TimingsMap[] {
  return days.map((d, i) =>
    onClock(d.timings, addDays(start, i * step), d.clock, clock),
  );
}

/**
 * The week, computed on the device, for the moment between a location
 * change and the provider's answer.
 *
 * Switching to a saved place used to blank the screen until all seven
 * days had come back from the cache or the network — visibly laggy, and
 * for a city not yet cached, a spinner for as long as the round trip took.
 * But the app has always been able to compute the times itself
 * (`computeLocalAdhanTimes`, the offline fallback); it just never used that
 * until the network had FAILED. Now a switch paints these at once and the
 * provider's times replace them a moment later. Same offsets and night
 * times as the real pipeline, so the swap is at most a minute here or
 * there. Returns null if the coordinates cannot be computed against, in
 * which case the caller falls back to the loading state.
 */
export function buildProvisionalWeek(params: {
  latitude: number;
  longitude: number;
  calculationMethod: PrayerAppSettings['calculationMethod'];
  school: PrayerAppSettings['school'];
  prayerOffsets: PrayerOffsetMinutes | undefined;
  now: Date;
  /**
   * The source the week will come from. Türkiye Takvimi's calendar is not
   * the settings' method (its Fajr at 19°, Isha at 17° and the temkin move
   * every time by ten minutes or more), so painting the settings' method
   * first and swapping to the calendar a moment later — or a minute later,
   * on a slow network — showed a week that was never going to be right.
   */
  provider?: PrayerDataProviderId;
}): TimingsMap[] | null {
  const week: TimingsMap[] = [];
  for (let i = 0; i < WEEK_DAYS; i++) {
    try {
      const date = addDays(params.now, i);
      week.push(
        params.provider === 'namazvakti'
          ? computeNamazvaktiMethodTimes({
              latitude: params.latitude,
              longitude: params.longitude,
              date,
              school: params.school,
            }).timings
          : computeLocalAdhanTimes({
              latitude: params.latitude,
              longitude: params.longitude,
              date,
              calculationMethod: params.calculationMethod,
              school: params.school,
            }).timings,
      );
    } catch {
      break;
    }
  }
  if (week.length === 0) return null;
  return injectNightTimes(
    applyOffsetsToWeek(week, params.prayerOffsets),
    params.now,
  );
}

/** Gate key for the foreground refresh. */
const RESYNC_KEY = 'prayerDay.foreground';

export function usePrayerDay(settings: PrayerAppSettings, hydrated: boolean) {
  const [state, setState] = useState<PrayerDayState>({ phase: 'idle' });
  const loadGenerationRef = useRef(0);
  // City-registry wiring (automatic mode). Track the last coords we
  // reverse-geocoded so we only hit the network when the device has actually
  // moved a meaningful distance, and the city we last loaded times for so a
  // second fix in the same city is a no-op.
  const lastGeocodeRef = useRef<{
    lat: number;
    lng: number;
    locality: ReverseLocality | null;
    /** The app language the name was asked for in. */
    lang?: string;
  } | null>(null);
  const loadedCityIdRef = useRef<string | null>(null);
  /**
   * The coordinates the times on screen were loaded AGAINST — set by every
   * `loadTimes`, including the instant one from the cached coordinates
   * at launch, which `loadedCityIdRef` never learns about.
   *
   * That gap was a whole second pipeline on every cold start. The launch
   * shows last night's times from the saved coordinates, the fix arrives
   * a second later, the registry resolves it to the very same city and
   * anchor — and `cityChanged` was `null !== cityId`, true, so the week
   * was read again, the card rendered again, and the notifications, the
   * widget and the Live Activity were all synced a second time, for
   * nothing. The saved coordinates ARE the anchor from the previous
   * session (this hook persists `state.latitude` back into settings), so
   * "the anchor equals what is loaded" is the exact test for "same city".
   */
  const loadedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  /**
   * Burst collapse for the reload effect at the bottom. A switch fires at
   * once when nothing has fired inside `LOCATION_SETTLE_MS`; the rest of a
   * rapid burst is held and collapses into one trailing load.
   */
  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitialLoadRef = useRef(false);
  /** When a load last fired, for the leading edge of the burst collapse. */
  const lastFireRef = useRef(0);
  // Latest auto-mode load OUTPUTS (last-fetched coords + resolved city name).
  // Read through a ref — NOT the requestAndLoad dependency array — so that a
  // completed load persisting these back into settings does NOT re-trigger the
  // whole GPS cycle. That feedback loop used to race an in-flight fetch for a
  // newly-entered city against a stale re-run, leaving the screen on the old
  // city's times while the label had already switched (Sweden→abroad bug).
  const autoRef = useRef<{
    lat: number | null | undefined;
    lng: number | null | undefined;
    label: string | undefined;
  }>({ lat: undefined, lng: undefined, label: undefined });
  // The mode as it is NOW, for a fix that lands after the reader has gone
  // to a place of their own: the precise request may answer a minute after
  // it was made, and a fix for "My location" must not replace that place.
  const liveModeRef = useRef(settings.locationMode);
  liveModeRef.current = settings.locationMode;
  // Which request for "My location" is the current one: an earlier one's
  // late timers and answers must not speak for it (`locationFreshness.ts`).
  const freshnessCycleRef = useRef(0);
  // When the newest position taken so far was measured. Requests overlap —
  // a launch's precise one is still listening when a pull to refresh starts
  // another — and an earlier request's answer may be the OLDER position:
  // its wait ran out and it answers with the phone's last. That must not
  // put the place back.
  const newestFixAtRef = useRef(0);
  // The app's own later tries after "Not updated" (`locationRetryMs`).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const requestAndLoadRef = useRef<(background?: boolean) => void>(() => {});
  autoRef.current = {
    lat: settings.lastFetchedLatitude,
    lng: settings.lastFetchedLongitude,
    label: settings.autoLocationLabel,
  };

  const loadTimes = useCallback(
    async (
      latitude: number,
      longitude: number,
      isBackgroundRefresh: boolean = false,
      label?: string,
      fromAuto: boolean = false,
      // The last fix, painted while a new one is found: the clocks check
      // only looks (see settleTimezoneShift).
      provisionalFix: boolean = false,
    ) => {
      const gen = ++loadGenerationRef.current;
      bootMark('load');
      // The high-latitude rule and the custom angles are read from a module
      // (the calculation and the cache key both ask it), and the settings
      // save that publishes them there is queued behind every earlier save.
      // This load is for THESE settings: publish them before anything reads.
      setCalculationPreferences({
        highLatitudeRule: settings.highLatitudeRule,
        customFajrAngle: settings.customFajrAngle,
        customIshaAngle: settings.customIshaAngle,
      });
      loadedCoordsRef.current = { lat: latitude, lng: longitude };
      const coords = { latitude, longitude };
      const provider = getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        coords,
        settings.calculationMethod,
      );

      /**
       * HAVE THE CLOCKS CHANGED UNDER US? — issue #56, and the ordering is
       * the fix.
       *
       * Every stored prayer time is a wall-clock string written under a
       * rule, and a country can change the rule: Morocco abolished GMT+1
       * on 2026-09-20 and every row the app held for a Moroccan city
       * became an hour wrong without becoming a minute older. Nothing
       * expires, nothing looks stale, and the dataset's own six-hourly
       * poll was the only thing that ever noticed — which is the three
       * hours the reporter waited.
       *
       * In FRONT of the fetch, awaited, because a load that starts first
       * reads exactly the rows this exists to throw away. It costs one
       * number comparison after the first call of a launch.
       */
      const shift = await settleTimezoneShift({
        provider,
        latitude,
        longitude,
        calculationMethod: settings.calculationMethod,
        school: settings.school,
        provisionalFix,
      }).catch(() => null);
      bootMark('tz');
      if (gen !== loadGenerationRef.current) return;

      if (!isBackgroundRefresh) {
        // Paint the on-device week at once rather than blanking. The
        // provider's answer replaces it below; `backgroundRefreshing` keeps
        // the footer's subtle indicator on until it does. Deliberately NOT
        // `usingLocalFallback` — that flag raises the offline banner, and
        // nothing has failed here. Only if the device cannot compute these
        // coordinates does the screen fall back to the loading state.
        const provisionalNow = new Date();
        const provisional = buildProvisionalWeek({
          latitude,
          longitude,
          calculationMethod: settings.calculationMethod,
          school: settings.school,
          prayerOffsets: settings.prayerOffsets,
          now: provisionalNow,
          provider,
        });
        if (provisional) {
          setState(prev => ({
            phase: 'ready',
            latitude,
            longitude,
            cityName:
              label ?? (prev.phase === 'ready' ? prev.cityName : undefined),
            baseDate: startOfLocalDay(provisionalNow),
            today: provisional[0],
            tomorrow: provisional[1],
            week: provisional,
            widgetWeek: provisional,
            past: [],
            backgroundRefreshing: true,
            provisional: true,
            fromAuto,
          }));
        } else {
          setState({ phase: 'loading' });
        }
      } else {
        // Mark current ready state as actively refreshing so the UI can show
        // a subtle indicator without blanking the displayed times.
        setState(prev =>
          prev.phase === 'ready' ? { ...prev, backgroundRefreshing: true } : prev,
        );
      }

      try {
        // Fetch WEEK_DAYS consecutive days concurrently so the swipeable day
        // carousel loads atomically — no staggered re-renders as later days arrive.
        const now = new Date();
        // Started HERE, alongside the week, and collected after it. The
        // status check is independent of the week's results, and it used
        // to wait for them — 19 ms of a cold start, measured, spent
        // re-reading the same cache blob the week had just read. Now it
        // shares that read (`prayerStorage` dedupes the round trip while
        // it is in flight) and finishes in the week's shadow, and its
        // answer still lands in the same state update as the times, which
        // is what keeps the refresh indicator from flashing in a frame late.
        const cacheParams = {
          provider,
          latitude,
          longitude,
          calculationMethod: settings.calculationMethod,
          school: settings.school,
        };
        // After the first paint: the status reads and parses the whole
        // stored-times cache, and for a reader whose week is computed on
        // the phone (Sweden, Morocco) that was the one read of it, landing
        // under the first frame — 13 ms of the JS thread on a Pixel 10
        // Pro, sampled. A reader whose week comes from the cache has read
        // it by then, and the status read is deduped against that one.
        const statusPromise = afterFirstPaint()
          .then(() => getCacheStatus(cacheParams))
          .then(
            status => status.monthsStored < 2 || status.isExpired,
            // Cache status check failing is non-critical; we just won't fill.
            () => false,
          );
        const weekResults = await Promise.allSettled(
          Array.from({ length: WEEK_DAYS }, (_, i) =>
            getOrFetchPrayerDay({
              provider,
              latitude,
              longitude,
              date: addDays(now, i),
              calculationMethod: settings.calculationMethod,
              school: settings.school,
            }),
          ),
        );

        bootMark('week');
        if (gen !== loadGenerationRef.current) return;

        // Build a gapless week: stop at the first failure so callers can rely
        // on week[i] corresponding to today + i days without holes.
        const weekDays: PrayerDay[] = [];
        for (const result of weekResults) {
          if (result.status === 'fulfilled') {
            weekDays.push(result.value);
          } else {
            break;
          }
        }

        if (weekDays.length === 0) {
          throw new Error('No prayer times available');
        }
        // Every day on one clock: the place's where a source wrote it there
        // (a saved place in another zone), else the phone's — which for the
        // reader's own place is the same thing and changes nothing.
        const clock = clockOfDays(weekDays);
        const weekTimings = daysOnClock(weekDays, now, clock);

        // Apply per-prayer offsets at READ time so the cache stays raw —
        // a setting change immediately re-derives without a re-fetch.
        // Apply offsets first, then derive the night times (Islamic Midnight +
        // Last Third) from the adjusted Maghrib/Fajr so they track any nudge.
        const offsettedWeek = injectNightTimes(
          applyOffsetsToWeek(weekTimings, settings.prayerOffsets),
          now,
          clock,
        );

        if (gen !== loadGenerationRef.current) return;

        // ── WHAT THE SCREEN IS WAITING FOR, AND WHAT IT IS NOT ──────────
        //
        // Everything needed to draw the Today card and the prayer rows is
        // in hand right here. Two more cache reads used to run before the
        // state was published — the widget's longer window and the days
        // behind — and neither is on this screen: `widgetWeek` is built
        // for the home-screen widget's payload, and `past` is only
        // reached by swiping the day carousel backwards.
        //
        // A third was still there in 2.33: `getCacheStatus`, asked in
        // parallel with the week and AWAITED before the state, for one
        // boolean — whether to start a background fill. For a place whose
        // times are calculated on the phone the week never touches the
        // cache blob, so that status was the first thing to, and it waits
        // for the correction lists' read before it reads anything: on a
        // Pixel 10 Pro the week was in hand at 180 ms and the screen was
        // published at 350–600 ms, the whole of the difference spent on
        // a bar nobody sees until later. It is awaited AFTER the state now
        // (`fillLater`), and the launch run with it begins that much sooner.
        //
        // Measured on an emulator, cold start, warm cache: 915 ms from
        // launch to the first real content, of which 209 ms — 23% of the
        // whole start, and 35% of everything after JS begins — was spent
        // inside `cachedDaysFrom` with a skeleton on screen. The prayer
        // times were ready at 705 ms and the reader was shown grey bars
        // for another fifth of a second so the widget could have its
        // fortnight.
        //
        // ONLY the widget window moves. `past` stays here, and that is not
        // a compromise — it is where the measurement pointed. Of the
        // 209 ms, `cachedDaysBefore` was 1 ms; every bit of the rest was
        // `cachedDaysFrom`. Deferring `past` as well bought nothing and
        // cost correctness: the day carousel is INDEXED off `past.length`
        // (see HomeScreen, where the daruri span is sliced at
        // `table.past.length` and the pager anchors at
        // `addDays(baseDate, -past.length)`), so letting it grow from 0 to
        // 7 after the first paint slid every one of those indices out from
        // under the pager and left the card showing an empty page under
        // today's date. Caught on a device, not in a test.
        //
        // `widgetWeek` has no such reader: HomeScreen takes
        // `state.widgetWeek ?? week` purely to build the widget payload,
        // and seeding it with the week keeps its "never shorter than
        // `week`" promise true at every instant rather than only at the end.
        const widgetWindowLater = async () => {
          // The widget's longer window, taken from whatever the cache
          // already holds past the fetched week. Built from the RAW days
          // and put through the same offset + night-time pipeline as
          // `week`, because deriving it from the already-offset week
          // would apply the user's adjustment twice.
          const widgetExtra = daysOnClock(
            await cachedPrayerDaysFrom(
              weekTimings.length,
              {
                provider,
                latitude,
                longitude,
                calculationMethod: settings.calculationMethod,
                school: settings.school,
              },
              now,
            ),
            addDays(now, weekTimings.length),
            clock,
          );
          const offsettedWidgetWeek =
            widgetExtra.length > 0
              ? injectNightTimes(
                  applyOffsetsToWeek(
                    weekTimings.concat(widgetExtra),
                    settings.prayerOffsets,
                  ),
                  now,
                  clock,
                )
              : offsettedWeek;

          // A newer load has taken over, or the screen has left `ready`:
          // this window belongs to a location or a day that is no longer
          // on screen, and merging it in would pair one place's fortnight
          // with another's today.
          if (gen !== loadGenerationRef.current) return;
          setState(prev =>
            prev.phase === 'ready' ? { ...prev, widgetWeek: offsettedWidgetWeek } : prev,
          );
        };

        // The week behind, from the cache alone, through the same offset
        // and night-time pipeline. Nearest first is how it is stored;
        // the pipeline wants chronological order (the night times of one
        // day read the next day's Fajr), so it runs on the reversed list
        // and the result is turned back. On the critical path because the
        // carousel's indices are derived from its length — one millisecond,
        // measured, and the card is wrong without it.
        const pastRaw = await cachedPrayerDaysBefore(
          {
            provider,
            latitude,
            longitude,
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          },
          now,
        ).then(days => daysOnClock(days, addDays(now, -1), clock, -1));
        const offsettedPast =
          pastRaw.length > 0
            ? injectNightTimes(
                applyOffsetsToWeek(
                  pastRaw.slice().reverse().concat(weekTimings[0]),
                  settings.prayerOffsets,
                ),
                addDays(now, -pastRaw.length),
                clock,
              )
                .slice(0, pastRaw.length)
                .reverse()
            : [];

        bootMark('past');
        if (gen !== loadGenerationRef.current) return;

        setState(prev => ({
          phase: 'ready',
          latitude,
          longitude,
          // Preserve a previously-resolved city name if this refresh didn't
          // carry one (e.g. the instant cached re-render before geocoding).
          cityName: label ?? (prev.phase === 'ready' ? prev.cityName : undefined),
          baseDate: startOfLocalDay(now),
          ...(clock === DEVICE_CLOCK ? {} : { clock }),
          today: offsettedWeek[0],
          tomorrow: offsettedWeek[1],
          week: offsettedWeek,
          // Seeded, not left out: `widgetWeek` promises never to be shorter
          // than `week`, and the longer one replaces this a moment later.
          widgetWeek: offsettedWeek,
          past: offsettedPast,
          // Not known yet — see `fillLater`, which turns this on when the
          // cache status says a fill is wanted and off again when it is done.
          backgroundRefreshing: false,
          fromAuto,
          // Only where this load is the one that noticed. A later refresh
          // of the same times is not news, and `pendingTimezoneShift`
          // keeps the notice alive across those until it is dismissed.
          timezoneShift: shift ?? pendingTimezoneShift(),
        }));

        // Off the critical path, deliberately. Not awaited: nothing below
        // depends on it, and the point is that the screen does not either.
        // After the first paint, too: it is a cache read, a build and a
        // second render of the whole screen, and run at once it landed in
        // the frames between the first commit and the first paint.
        void afterFirstPaint().then(widgetWindowLater);

        // Whether the local cache needs a background fill — asked above, in
        // parallel with the week, collected here, after the screen has
        // what it needs. Fill up to 12 months ahead in the background;
        // clear the indicator when done regardless of success or failure.
        const fillLater = async () => {
          const needsCacheFill = await statusPromise;
          bootMark('status');
          if (!needsCacheFill || gen !== loadGenerationRef.current) return;
          setState(prev =>
            prev.phase === 'ready' ? { ...prev, backgroundRefreshing: true } : prev,
          );
          await refreshPrayerDataCache(
            {
              provider,
              latitude,
              longitude,
              calculationMethod: settings.calculationMethod,
              school: settings.school,
            },
            12,
          )
            .catch(e => console.error('Background prayer cache refresh failed', e))
            .finally(() => {
              if (gen !== loadGenerationRef.current) return;
              setState(prev =>
                prev.phase === 'ready'
                  ? { ...prev, backgroundRefreshing: false }
                  : prev,
              );
            });
        };
        void fillLater();
      } catch (e) {
        if (gen !== loadGenerationRef.current) return;

        // Network / provider failed — fall back to on-device calculation so
        // the app remains usable offline.  Generate the full week from local
        // adhan so the day carousel still works without connectivity.
        try {
          const now = new Date();
          const localWeek: TimingsMap[] = [];
          // Offline, the widget's longer window costs even less than it does
          // online: on-device calculation needs neither the network nor the
          // cache, so compute the whole window and hand the app its first
          // `WEEK_DAYS` out of it.
          for (let i = 0; i < WIDGET_WINDOW_DAYS; i++) {
            try {
              const local = computeLocalAdhanTimes({
                latitude,
                longitude,
                date: addDays(now, i),
                calculationMethod: settings.calculationMethod,
                school: settings.school,
              });
              localWeek.push(local.timings);
            } catch {
              break;
            }
          }

          if (localWeek.length === 0) {
            throw new Error('Local adhan calculation failed');
          }

          // And the week behind, oldest first, so one pipeline run below
          // covers the whole span in chronological order.
          const localPast: TimingsMap[] = [];
          for (let i = PAST_DAYS; i >= 1; i--) {
            try {
              localPast.push(
                computeLocalAdhanTimes({
                  latitude,
                  longitude,
                  date: addDays(now, -i),
                  calculationMethod: settings.calculationMethod,
                  school: settings.school,
                }).timings,
              );
            } catch {
              localPast.length = 0;
              break;
            }
          }

          if (gen !== loadGenerationRef.current) return;

          // Apply per-prayer offsets to the local-adhan fallback too —
          // the user's adjustment must be honored even when offline.
          const offsettedLocalSpan = injectNightTimes(
            applyOffsetsToWeek(
              localPast.concat(localWeek),
              settings.prayerOffsets,
            ),
            addDays(now, -localPast.length),
          );
          const offsettedLocalPast = offsettedLocalSpan
            .slice(0, localPast.length)
            .reverse();
          const offsettedLocalWindow = offsettedLocalSpan.slice(localPast.length);
          const offsettedLocalWeek = offsettedLocalWindow.slice(0, WEEK_DAYS);

          setState(prev => ({
            phase: 'ready',
            latitude,
            longitude,
            cityName:
              label ?? (prev.phase === 'ready' ? prev.cityName : undefined),
            baseDate: startOfLocalDay(now),
            today: offsettedLocalWeek[0],
            tomorrow: offsettedLocalWeek[1],
            week: offsettedLocalWeek,
            widgetWeek: offsettedLocalWindow,
            past: offsettedLocalPast,
            usingLocalFallback: true,
            backgroundRefreshing: false,
            fromAuto,
            // Offline when the clocks changed: the times on screen are the
            // device's own arithmetic, which is running under the new rule
            // — so this is exactly the case worth explaining.
            timezoneShift: shift ?? pendingTimezoneShift(),
          }));
        } catch {
          // Local calculation also failed (invalid coordinates?)
          if (gen !== loadGenerationRef.current) return;
          const message =
            e instanceof Error ? e.message : 'Failed to load prayer times';
          setState({ phase: 'api_error', message });
        }
      }
    },
    [
      settings.dataProvider,
      settings.dataProviderAuto,
      settings.calculationMethod,
      settings.school,
      // The offsets are applied to every row this builds, so a changed
      // offset has to rebuild it — the same reason the method and the
      // school are here. Stable between settings writes, so listing it
      // costs nothing on a normal render.
      settings.prayerOffsets,
      // These change the answer as much as the method does — a different
      // AlAdhan query, a different on-device calculation, a different cache
      // key — so a change to one of them is a new load, not a stale screen
      // until the next launch.
      settings.highLatitudeRule,
      settings.customFajrAngle,
      settings.customIshaAngle,
    ],
  );

  // A move found while the app was in the background (Android, optional:
  // `location/backgroundLocation.ts`) comes through the same loader as a
  // position found on screen, so what Today holds is the new place.
  useEffect(
    () =>
      onLiveMove(move => {
        if (liveModeRef.current === 'manual') return;
        freshnessCycleRef.current++;
        newestFixAtRef.current = Math.max(
          newestFixAtRef.current,
          move.measuredAt ?? Date.now(),
        );
        setLocationFreshness({
          status: move.fresh === false ? 'notUpdated' : 'ok',
          moved: false,
        });
        loadedCityIdRef.current = move.cityId;
        loadTimes(move.latitude, move.longitude, true, move.label, true).catch(
          () => {},
        );
      }),
    [loadTimes],
  );

  const requestAndLoad = useCallback((isBackgroundRefresh: boolean = false) => {
    const run = async () => {
      // ── Manual mode: simple, no GPS needed ──────────────────────────────────
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (settings.locationMode === 'manual') {
        // A place the reader chose needs no position: nothing to be stale.
        retriesRef.current = 0;
        freshnessCycleRef.current++;
        setLocationFreshness({ status: 'ok', moved: false });
        // (0, 0) is the explicit "no location set" sentinel from
        // DEFAULT_SETTINGS — fetching prayer times for that point
        // hits the middle of the Atlantic and confuses every
        // provider (especially the islamiska_forbundet reverse
        // geocoder). Prompt the user to set a location instead of
        // burning network requests on a sentinel value (#137).
        if (
          (settings.manualLatitude === 0 && settings.manualLongitude === 0) ||
          !Number.isFinite(settings.manualLatitude) ||
          !Number.isFinite(settings.manualLongitude)
        ) {
          if (!isBackgroundRefresh) {
            setState({
              phase: 'manual_required',
              message: 'No location set yet',
            });
          }
          return;
        }
        // No blank here: `loadTimes` paints the on-device week for these
        // coordinates at once, so a switch to a saved place shows its times
        // immediately and the provider's answer replaces them.
        loadTimes(
          settings.manualLatitude,
          settings.manualLongitude,
          isBackgroundRefresh,
          undefined,
          false, // manual: never the last-known GPS fix
        ).catch(() => {});
        return;
      }

      // ── Automatic mode ───────────────────────────────────────────────────────
      // Strategy:
      //  1. Immediately show last-known data (if any) — zero wait for the user.
      //  2. Silently resolve the current GPS position in the background.
      //  3. If position changed significantly (~1 km), fetch new times without
      //     blanking the screen; swap atomically when both today+week ready.
      //  4. Whether or not position changed, always check cache staleness and
      //     fill gaps in the background, signalling via backgroundRefreshing.

      // Read the last-known coords/label from the ref (see autoRef above) so
      // this callback is stable across loads and doesn't re-fire the GPS cycle.
      const cachedLat = autoRef.current.lat;
      const cachedLng = autoRef.current.lng;
      const cachedLabel = autoRef.current.label;
      const hasCached = cachedLat != null && cachedLng != null;

      // A clocks change seen on the last fix's load and still owed: no new
      // place is coming (no permission, no fix, or the fix is the same
      // city), so the place on screen is where the phone is — check it.
      const settleOwedShift = () => {
        timezoneShiftAwaitingFix()
          .then(owed => {
            const loaded = loadedCoordsRef.current;
            if (!owed || !loaded) return;
            return loadTimes(loaded.lat, loaded.lng, true, undefined, true);
          })
          .catch(() => {});
      };

      // IS THE PLACE ON SCREEN WHERE THE PHONE IS? Until a fresh position
      // says so it is only the last one known, and the screen says which
      // (`locationFreshness.ts`): "slow" once the quick request's wait has
      // passed, "not updated" when the search ends with nothing fresh —
      // and, from the first moment, whether the phone seems to have
      // travelled (its network's country, its time zone), which Today's
      // notice says while the search goes on.
      const cycle = ++freshnessCycleRef.current;
      const mine = () =>
        cycle === freshnessCycleRef.current &&
        liveModeRef.current !== 'manual';
      let gotFresh = false;
      setLocationFreshness({ status: 'searching' });
      seemsToHaveTravelled()
        .then(moved => {
          if (mine() && !gotFresh) setLocationFreshness({ moved });
        })
        .catch(() => {});
      const quiet = (timer: ReturnType<typeof setTimeout>) => {
        // Node (the tests) would wait for it; the phone has no `unref`.
        (timer as unknown as { unref?: () => void }).unref?.();
        return timer;
      };
      const slowTimer = quiet(
        setTimeout(() => {
          if (mine() && !gotFresh) setLocationFreshness({ status: 'slow' });
        }, SLOW_AFTER_MS),
      );
      let ended = false;
      // `again: false` where looking again cannot help and would cost the
      // reader something: without the permission, a later try is Android's
      // question put to them a second time, unasked.
      const endSearch = (again: boolean = true) => {
        clearTimeout(slowTimer);
        if (!mine() || gotFresh) return;
        setLocationFreshness({ status: 'notUpdated' });
        if (ended || !again) return;
        ended = true;
        const wait = locationRetryMs[retriesRef.current];
        if (wait == null) return;
        retriesRef.current++;
        retryTimerRef.current = quiet(
          setTimeout(() => {
            retryTimerRef.current = null;
            if (!mine() || AppState.currentState !== 'active') return;
            requestAndLoadRef.current(true);
          }, wait),
        );
      };
      // The precise request answers within its minute, one way or another;
      // this is for the request that never answers at all.
      quiet(setTimeout(() => endSearch(), 65_000));
      const placeConfirmed = () => {
        if (mine()) setLocationFreshness({ moved: false });
        recordFreshFix().catch(() => {});
      };

      if (hasCached) {
        // Instantly render last-known times while GPS resolves in background.
        // isBackgroundRefresh=true prevents the 'loading' flash. Seed the chip
        // with the previously-resolved city name so it doesn't flash coords.
        loadTimes(cachedLat, cachedLng, true, cachedLabel, true, true).catch(
          () => {},
        );
      } else if (!isBackgroundRefresh) {
        setState({ phase: 'loading' });
        // Nothing is on screen now, so nothing is "already loaded": the
        // coordinates of the place just left must not answer for the fix
        // to come. Going to "My location" for the first time from a place
        // of one's own at the very spot the phone is — its anchor the same
        // pair, to the last digit — the fix read as "the same city, nothing
        // to load" and the screen stayed on "Loading prayer times…" until
        // the app was started again (a Pixel 2, Nov 2026).
        loadedCoordsRef.current = null;
        loadedCityIdRef.current = null;
      }

      // Request Android location permission. Because we already have data on
      // screen (if hasCached), the permission dialog doesn't block a blank UI.
      // Accepts an "Approximate" (COARSE-only) grant — that's enough for
      // prayer times and is the Wi-Fi positioning the user wants when GPS is
      // unavailable, so a coarse grant must NOT be treated as a refusal.
      if (Platform.OS === 'android') {
        const perm = await requestAndroidLocationPermission();
        if (perm !== 'granted') {
          if (!hasCached) {
            // No previous location AND no permission → ask the user to set
            // a manual location instead of stranding them on a dead-end
            // "permission denied" wall (#125).
            setState({ phase: 'permission_denied' });
          }
          endSearch(false);
          settleOwedShift();
          return;
        }
      }

      // Resolve fresh position in the background using the staged locator
      // (fast Wi-Fi/cell coarse fix first, precise GPS refine after). A 25 s
      // watchdog fires only if NOTHING lands (seen on certain Android ROMs and
      // iOS edge cases).
      let gotAnyFix = false;
      let watchdogFired = false;
      const watchdog = setTimeout(() => {
        watchdogFired = true;
        if (!gotAnyFix && !hasCached && !isBackgroundRefresh) {
          // No previous coords + no fix at all → prompt for manual entry
          // rather than computing prayer times against bogus defaults (#125).
          setState({
            phase: 'manual_required',
            message: 'Location request timed out',
          });
        }
      }, 25_000);

      // Turn a raw fix into the right city + anchor, then (if the city
      // changed) fetch its times against the STABLE anchor coordinate so
      // moving within a city never re-downloads. Serialised so a fast coarse
      // fix and a slightly-later fine fix don't interleave their registry
      // writes.
      let onFixChain: Promise<void> = Promise.resolve();
      const handleFix = async (
        fixLat: number,
        fixLng: number,
        fresh: boolean,
        // The town's name, when it arrived after the place had moved
        // without it (NAME_WAIT_MS): the same steps again, named.
        named?: ReverseLocality,
      ) => {
        // Throttle reverse-geocoding: only re-geocode when we've moved
        // meaningfully (~1 km) from the last geocoded point; otherwise reuse
        // the cached locality (or null offline).
        let locality: ReverseLocality | null = null;
        const prev = lastGeocodeRef.current;
        if (named) {
          locality = named;
        } else if (
          prev &&
          prev.locality &&
          !coordsChangedSignificantly(fixLat, fixLng, prev.lat, prev.lng)
        ) {
          // Reuse only a SUCCESSFUL nearby result. We never cache a failure,
          // so a transient geocoder outage self-heals on the next fix instead
          // of sticking to coords until the device moves >1 km.
          locality = prev.locality;
        } else {
          // offline / geocoder down → null, and the registry falls back
          const lookup = reverseLocality(fixLat, fixLng).then(
            l => l,
            () => null,
          );
          let waited: ReturnType<typeof setTimeout> | undefined;
          const answer = await Promise.race([
            lookup,
            new Promise<'late'>(resolve => {
              waited = quiet(setTimeout(() => resolve('late'), NAME_WAIT_MS));
            }),
          ]);
          clearTimeout(waited);
          if (answer === 'late') {
            // The place moves now, unnamed; the name follows.
            lookup
              .then(late => {
                if (!late || liveModeRef.current === 'manual') return;
                lastGeocodeRef.current = { lat: fixLat, lng: fixLng, locality: late, lang: i18n.language };
                onFixChain = onFixChain.then(() =>
                  handleFix(fixLat, fixLng, fresh, late).catch(() => {}),
                );
              })
              .catch(() => {});
          } else {
            locality = answer;
            if (locality) {
              lastGeocodeRef.current = { lat: fixLat, lng: fixLng, locality, lang: i18n.language };
            }
          }
        }

        const summary = await recordLocationFix(
          fixLat,
          fixLng,
          locality,
          new Date(),
        );

        // Purge the prayer cache of any city whose retention window lapsed
        // — but never the one the reader is in: a place first taken without
        // its name and then named is two entries on one anchor, and the
        // unnamed one lapsing must not empty the named one's times.
        for (const a of summary.evictedAnchors) {
          if (a.latitude === summary.anchorLat && a.longitude === summary.anchorLng) continue;
          purgeCachesNear(a.latitude, a.longitude).catch(() => {});
        }

        // Only (re)fetch when the ACTIVE city changed since the last load —
        // this is what makes intra-city movement free.
        //
        // "Changed" is judged against what is actually on screen. The
        // first fix after launch has no city id to compare with — the
        // launch load came from saved coordinates, not from the registry —
        // but it does have coordinates, and if the registry's anchor is
        // the pair the times were loaded against, this is the same city
        // and nothing needs reading again. See `loadedCoordsRef`.
        const loaded = loadedCoordsRef.current;
        const sameAnchorAsLoaded =
          loaded != null &&
          loaded.lat === summary.anchorLat &&
          loaded.lng === summary.anchorLng;
        const cityChanged =
          loadedCityIdRef.current !== summary.cityId && !sameAnchorAsLoaded;
        if (!cityChanged) loadedCityIdRef.current = summary.cityId;
        if (cityChanged) {
          // The place on screen follows this position. A fresh one is where
          // the phone is. The phone's last, after a wait ran out, is newer
          // than the app's own but may be a stop on the way: it ends the
          // notice only where it can be checked against the country the
          // phone is in now (`staleFixAnswersJourney`).
          if (fresh) {
            placeConfirmed();
          } else {
            staleFixSettlesJourney(locality?.countryCode)
              .then(settled => {
                if (settled) placeConfirmed();
              })
              .catch(() => {});
          }
          loadedCityIdRef.current = summary.cityId;
          // NOT a background refresh: the new place goes on screen NOW, on
          // the phone's own times, and its source's week replaces them
          // (`loadTimes` paints the on-device week first, and nothing is
          // written from it — `provisional`). As a background refresh it
          // waited for the source with the town left behind still up, name
          // and times — and abroad the network is the part that is slow or
          // missing: every retry of a source answering 429, or of a hotel's
          // sign-in page, was sat through under the wrong city's times.
          // Seen on an iPhone 13 (Nov 2026): São Paulo for over a minute,
          // in London. A place chosen by hand has always moved this way.
          loadTimes(
            summary.anchorLat,
            summary.anchorLng,
            false,
            summary.displayName,
            true, // GPS-resolved fix
          ).catch(() => {});
        } else {
          if (summary.displayName) {
            // Same city, but we may now have a nicer name than the seed —
            // patch it onto the ready state without a re-fetch.
            setState(cur =>
              cur.phase === 'ready'
                ? { ...cur, cityName: summary.displayName }
                : cur,
            );
          }
          settleOwedShift();
        }
      };

      getPositionStaged(
        fix => {
          // The watchdog only ends the wait of a reader with nothing on
          // screen (it sends them to manual entry). With a place already
          // shown, a late fix is still the news this was waiting for.
          if (watchdogFired && !hasCached) return;
          if (liveModeRef.current === 'manual') return;
          // Measured well before a position already taken: not news.
          // (Never later than now: a phone whose satellite clock runs
          // ahead must not shut out every position after it. And "well
          // before": the precise fix that refines a quick one may carry a
          // time a moment earlier, and is still the better position.)
          const measuredAt = Math.min(fix.timestamp ?? Date.now(), Date.now());
          if (measuredAt < newestFixAtRef.current - STALE_ANSWER_MS) {
            if (fix.stage === 'fine') endSearch();
            gotAnyFix = true;
            clearTimeout(watchdog);
            return;
          }
          newestFixAtRef.current = measuredAt;
          const fresh = isFreshFix(fix.timestamp);
          if (fresh) {
            gotFresh = true;
            retriesRef.current = 0;
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
            clearTimeout(slowTimer);
            if (mine()) setLocationFreshness({ status: 'ok', moved: false });
            recordFreshFix().catch(() => {});
          } else if (fix.stage === 'fine') {
            // The precise request's wait ran out: this is the phone's last
            // position, not a new one.
            endSearch();
          }
          // A fix landed → the watchdog no longer needs to fire.
          gotAnyFix = true;
          clearTimeout(watchdog);
          onFixChain = onFixChain.then(() =>
            handleFix(fix.latitude, fix.longitude, fresh).catch(() => {}),
          );
        },
        err => {
          clearTimeout(watchdog);
          endSearch();
          if (watchdogFired || gotAnyFix) return;
          settleOwedShift();
          if (!hasCached && !isBackgroundRefresh) {
            // No fix at all AND no previously-saved location → send the user
            // to manual entry rather than stranding them (#125).
            setState({
              phase: 'manual_required',
              message: err.message || 'Could not get location',
            });
          }
          // Fix failed but cached data is already on screen — stay on it. We
          // explicitly do NOT compute on-device times against GPS-less
          // coordinates (#125).
        },
        // A PLACE ALREADY ON SCREEN CAN WAIT FOR THE SATELLITES. After a
        // flight, or indoors, a first fix takes longer than twenty seconds,
        // and the wait used to end just short of it at every launch and
        // every pull to refresh: a reader who had travelled from Sweden to
        // Germany kept Stockholm until the location was switched to a place
        // and back (Nov 2026, reproduced on an Android 17 emulator with a
        // fix thirty seconds in). Nothing is blocked meanwhile — the times
        // of the last place are up — so the precise request gets a minute.
        // With nothing on screen the wait stays short, for the watchdog's
        // offer of manual entry.
        hasCached ? { fineTimeoutMs: 60_000 } : undefined,
      );
    };
    run().catch(() => {});
  }, [
    loadTimes,
    settings.locationMode,
    settings.manualLatitude,
    settings.manualLongitude,
    // NOTE: lastFetchedLatitude/Longitude/autoLocationLabel are intentionally
    // read via autoRef (not deps) so a completed load doesn't re-fire the GPS
    // cycle and race itself. Manual coords + mode stay as deps because a real
    // user change there SHOULD re-resolve.
  ]);

  requestAndLoadRef.current = requestAndLoad;
  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  // A move noticed in the background while the app is on screen
  // (`liveMove.ts`): find the position again, as a pull to refresh does.
  useEffect(
    () =>
      onLiveRecheck(() => {
        if (liveModeRef.current === 'manual') return;
        requestAndLoad(true);
      }),
    [requestAndLoad],
  );

  // The place's name is asked for in the app's language (`localityLanguages`)
  // and then kept while the phone stays within a kilometre — so after a
  // change of language the chip went on naming the town in the old one:
  // "स्टॉकहोम" over an Arabic page, until the phone moved or the app was
  // opened again (Pixel 10 Pro, 2026-11-26). The kept answer is in the
  // wrong language now: drop it and ask again, as a pull to refresh does.
  // A place chosen by hand keeps the name it was chosen under.
  //
  // Only a name this run actually holds, asked for in another language. i18next
  // announces the language at start-up too, and on a fresh install that call
  // asked for the location permission over the welcome screen, before anyone
  // had chosen "Use my location" (emulators, 2026-11-26). With no name held
  // there is nothing to put right: the next fix names the place in the
  // language of the moment.
  useEffect(() => {
    const onLanguage = (lng: string) => {
      const held = lastGeocodeRef.current;
      if (!held?.locality || held.lang === lng) return;
      if (liveModeRef.current === 'manual') return;
      lastGeocodeRef.current = null;
      requestAndLoad(true);
    };
    i18n.on('languageChanged', onLanguage);
    return () => {
      i18n.off('languageChanged', onLanguage);
    };
  }, [requestAndLoad]);

  // WiFi-triggered background sync: silently top up the 12-month cache
  // whenever the device connects to WiFi.  No backgroundRefreshing indicator
  // here — this is a maintenance task that may run for a long time and the
  // user already has correct times on screen.
  useEffect(() => {
    if (!hydrated || !settings.locationOnboardingComplete) {
      return;
    }
    const onConnected = (wifi: boolean) => {
      const lat =
        settings.locationMode === 'automatic'
          ? settings.lastFetchedLatitude
          : settings.manualLatitude;
      const lng =
        settings.locationMode === 'automatic'
          ? settings.lastFetchedLongitude
          : settings.manualLongitude;
      if (lat == null || lng == null) {
        return;
      }
      const provider = getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        { latitude: lat, longitude: lng },
        settings.calculationMethod,
      );
      const params = {
        provider,
        latitude: lat,
        longitude: lng,
        calculationMethod: settings.calculationMethod,
        school: settings.school,
      };
      // Online on any network: the days stored from the phone's own
      // calculation while the provider could not be reached are asked
      // again, a few at a time, and replaced by the provider's answer.
      refetchFallbackDays(params).catch(e =>
        console.warn('Re-fetching stand-in days failed:', e),
      );
      if (!wifi) {
        return;
      }
      maybeFullSyncOnWifi(params).catch(e =>
        console.warn('WiFi-triggered sync check failed:', e),
      );
    };
    // NetInfo calls the listener at once with the network as it is, so
    // on a cold start this ran as the settings arrived: the stand-in days'
    // re-fetch read and parsed the whole stored-times cache under the
    // first frame (a Pixel 10 Pro, sampled). Maintenance, so after the
    // first paint and the launch run (boot/firstPaint.ts).
    const unsubscribeNetInfo = NetInfo.addEventListener(netState => {
      if (!netState.isConnected) {
        return;
      }
      const wifi = netState.type === 'wifi';
      void afterFirstPaint().then(() => onConnected(wifi));
    });
    return () => {
      unsubscribeNetInfo();
    };
  }, [
    hydrated,
    settings.locationOnboardingComplete,
    settings.locationMode,
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
    settings.manualLatitude,
    settings.manualLongitude,
    settings.dataProvider,
    settings.dataProviderAuto,
    settings.calculationMethod,
    settings.school,
  ]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!settings.locationOnboardingComplete) {
      setState(prev => (prev.phase === 'idle' ? prev : { phase: 'idle' }));
      return;
    }

    // Collapse a burst of location switches into ONE load. Every switch
    // changes `requestAndLoad`'s identity and re-runs this effect. The
    // generation guard inside `loadTimes` keeps the STATE correct — only the
    // last result is shown — but each superseded load still ran its whole
    // seven-day fetch and its cache reads, so three fast switches queued the
    // place you landed on behind a pile of I/O it did not need, and the
    // provider or the storage bridge choked on the herd. Reported as:
    // switching locations back to back more than twice drops onto a blank
    // loading screen for a long time, until it crashes or finally lands.
    //
    // Leading edge, then collapse. A deliberate single switch must not
    // wait: if nothing has fired inside the settle window, fire NOW — that
    // is what makes switching feel instant. Only the follow-ups of a rapid
    // burst are held, and they collapse into one trailing fire once the
    // switching stops, so a burst costs at most two loads (the first and
    // the last) instead of one per tap. The cleanup clears the pending
    // trailing timer, so re-runs never stack them.
    // What a return to the app is compared with (the gate below).
    const foregroundPrint = () =>
      dayTzFingerprint(
        new Date(),
        settings.locationMode,
        settings.calculationMethod,
        settings.school,
        settings.dataProvider,
      );
    const now = Date.now();
    const quietFor = now - lastFireRef.current;
    if (!didInitialLoadRef.current || quietFor >= LOCATION_SETTLE_MS) {
      didInitialLoadRef.current = true;
      lastFireRef.current = now;
      if (loadDebounceRef.current) {
        clearTimeout(loadDebounceRef.current);
        loadDebounceRef.current = null;
      }
      // THE LAUNCH'S OWN LOOK COUNTS AS ONE. The iPhone reports 'active' a
      // moment after the app has started, and with nothing recorded that
      // read as a return: every cold start found the position, loaded the
      // week and published the screen a second time, a second after the
      // first (iPhone 13, Nov 2026). The gate is told this look happened.
      markResynced(RESYNC_KEY, foregroundPrint());
      requestAndLoad();
    } else {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
      loadDebounceRef.current = setTimeout(() => {
        loadDebounceRef.current = null;
        lastFireRef.current = Date.now();
        requestAndLoad();
      }, LOCATION_SETTLE_MS);
    }

    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      // Not on every 'active'. That event fires when a share sheet closes,
      // when a permission dialog dismisses, when the screen unlocks — several
      // times a minute in ordinary use — and each one cost a GPS fix, a
      // possible network fetch, and (through `state`) a rewrite of every
      // prayer alarm and a full journal decrypt downstream.
      //
      // A CHANGE always wins: a new day, a new timezone, or a change to the
      // settings that decide the times refreshes immediately, because those
      // are the cases where the displayed answer is actually wrong. The gap
      // only suppresses repeats whose inputs are identical, and anyone who
      // has been away long enough to have moved has been away longer than it
      // (docs/design/background-power.md).
      const fingerprint = foregroundPrint();
      if (!shouldResync(RESYNC_KEY, fingerprint)) return;
      markResynced(RESYNC_KEY, fingerprint);
      // After the hero's return run, which draws on the same frames this
      // would take (src/boot/launchWarp.ts, `afterRun`).
      void afterRun().then(() => requestAndLoad(true));
    });

    return () => {
      if (loadDebounceRef.current) {
        clearTimeout(loadDebounceRef.current);
        loadDebounceRef.current = null;
      }
      sub.remove();
    };
  }, [
    hydrated,
    settings.locationOnboardingComplete,
    settings.locationMode,
    settings.calculationMethod,
    settings.school,
    settings.dataProvider,
    requestAndLoad,
  ]);

  return { state, retry: requestAndLoad };
}
