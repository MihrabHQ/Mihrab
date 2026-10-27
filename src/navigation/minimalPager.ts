/**
 * Minimal's pager (settings.minimalUi): the values the swipe, the pages
 * and the dots share, so the page under the finger, the page coming in
 * and the dots at the foot all move as one.
 *
 * ── NOTHING ON THE JS THREAD WHILE A FINGER IS DOWN ──────────────────
 *
 * `pagerDragRaw` is the finger's offset in points, written by the
 * gesture handler itself (`Animated.event`, native driver) on every
 * move — the JS thread hears nothing until the finger lifts. It used to
 * go through JS on every move, and a page that moves with the finger
 * only as fast as the JS thread answers is a page that stutters
 * whenever that thread has anything else to do, which on Today it does
 * every second. What the pages and the dots read is `pagerPosition`:
 * the settled tab, the drag as a fraction of a page and the hold, summed
 * and then given a little past either end of the row (EDGE_GIVE) — an
 * interpolation, so it is native too. The give is on the SUM, not on
 * the drag: shaped on the drag, it had to know which neighbours the
 * current tab has, and was rebuilt for the new tab the moment a turn
 * was navigated — while the drag still held the finger's full
 * translation. A turn onto an end tab (Quran to Today, Log to Settings)
 * then read the same translation as the end's give rather than a page,
 * and the pages and the dots recoiled a quarter of a width before
 * sliding on. Summed first, the position is the same number whichever
 * tab is current, and nothing is rebuilt on a turn.
 *
 * `pagerBase` is the tab the pages are settled on, as a number that
 * slides: on a turn it runs from the old tab to the new over the turn's
 * time while the drag runs back to zero, so the position never jumps.
 * `pagerHold` is a finger held on the dots and slid (MinimalTabBar), in
 * tabs from the current one.
 *
 * `pagerEngaged` is 1 while a turn is under way — a finger on the page,
 * or the slide after a tap on a dot — and 0 at rest. The dots show the
 * tabs' icons while it is 1 and go back to dots as it settles. It has
 * several owners at once — a finger on the page, a finger held on the
 * dots, the timed slide after a tap on a dot or a jump the app made —
 * and is on while ANY of them holds it, so one letting go does not take
 * the icons from under another's finger. A second boolean, `reach`, is
 * kept for the pages (`usePagerReachAll`): true only while something
 * could reveal a page beyond the neighbours — a hold on the dots, a
 * slide across the row — so that a swipe, which can only ever reveal a
 * neighbour, does not lay out four far pages on its first move.
 */
import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { Animated, Easing } from 'react-native';

export const pagerDragRaw = new Animated.Value(0);
export const pagerEngaged = new Animated.Value(0);
export const pagerBase = new Animated.Value(0);
export const pagerHold = new Animated.Value(0);
let baseTarget: number | null = null;
let baseAnim: Animated.CompositeAnimation | null = null;

/** How much of the finger the page follows past the last tab. */
export const EDGE_GIVE = 0.22;

/**
 * The drag as a fraction of a page, a page at most. A drag to the left
 * reveals the page on the right — the next tab in LTR, the one before in
 * RTL — so in LTR a drag left is a step forward and in RTL a step back.
 *
 * `rtl` is the APP's direction (useLayoutRtl), not `I18nManager.isRTL`:
 * the app mirrors itself with a Yoga direction and leaves I18nManager
 * reading the device's language, so with the app in Arabic on an English
 * phone the dots ran right to left while a swipe turned the pages the
 * left-to-right way — the wrong way under the finger.
 */
function pagerDragInTabs(width: number, rtl: boolean): Animated.AnimatedInterpolation<number> {
  const w = Math.max(1, width);
  const step = rtl ? -1 : 1;
  return pagerDragRaw.interpolate({
    inputRange: [-w, 0, w],
    outputRange: [step, 0, -step],
    extrapolate: 'clamp',
  });
}

/**
 * Where the pages are, in tabs: the settled tab, the finger's drag as a
 * fraction of the page and the hold, summed — and past either end of
 * the row of `count` tabs only a fraction of the finger (EDGE_GIVE).
 * The same number for every reader, whichever tab is current.
 */
export function pagerPosition(width: number, count: number, rtl = false): Animated.AnimatedInterpolation<number> {
  const last = Math.max(1, count - 1);
  const summed = Animated.add(Animated.add(pagerBase, pagerDragInTabs(width, rtl)), pagerHold);
  return summed.interpolate({
    inputRange: [-1, 0, last, last + 1],
    outputRange: [-EDGE_GIVE, 0, last, last + EDGE_GIVE],
    extrapolate: 'clamp',
  });
}

/** Slide the settled tab to `index` — at once when nothing is drawn yet. */
export function settlePagerBase(index: number, animated = true): void {
  if (baseTarget === index && baseAnim) return;
  baseAnim?.stop();
  baseTarget = index;
  if (!animated) {
    baseAnim = null;
    pagerBase.setValue(index);
    return;
  }
  baseAnim = Animated.timing(pagerBase, {
    toValue: index,
    duration: PAGER_TRANSITION_MS,
    easing: pagerEasing,
    useNativeDriver: true,
  });
  const anim = baseAnim;
  anim.start(() => {
    if (baseAnim === anim) baseAnim = null;
  });
}

/** The navigator's slide, and the drag's run back to zero with it. */
export const PAGER_TRANSITION_MS = 280;
export const pagerEasing = Easing.out(Easing.cubic);

/*
 * ── A SWIPE'S TURN IS TOLD TO THE NAVIGATOR WHEN IT HAS LANDED ─────────
 *
 * This has regressed three times, so it is spelled out. A tab change
 * renders the navigator, runs the focus effects of the page coming in
 * (and their state updates), and moves the reach — React commits that
 * Fabric lays out on the UI thread, in the very frames the slide is drawn
 * in. The slide is native and does not wait for JS, but it does wait for
 * the UI thread: the page slowed in the middle of its run and caught up
 * ("resistance mid-swipe"). So a swipe's release holds the turn
 * (`holdPendingTurn`) and the navigator hears of it when the slide has
 * landed (`flushPendingTurn`) — or when another finger comes down first,
 * which takes the row over from wherever the turn was going.
 *
 * Telling it late has one consequence, and it is why the immediate
 * navigate kept coming back: the navigator gives the page not on show
 * `pointerEvents: 'none'`, so a second swipe straight after the first
 * landed on a page that could not be touched, and was lost. Minimal's
 * screens therefore take touches whatever the navigator says
 * (MinimalScreens.tsx) — the pages never overlap and stand a width
 * aside, so only the ones in view can be touched at all — and the turn,
 * the settle and the finger are kept HERE, for every page, not in one
 * page's refs: the finger may come down on the page coming in.
 *
 * __tests__/minimalPagerTurn.test.ts holds all of this. Do not "simplify"
 * it back to `navigation.navigate` at the release.
 */
type HeldTurn = { index: number; go: () => void };
let heldTurn: HeldTurn | null = null;
/** Where the last flushed turn went, until the navigator's state says so. */
let landedIndex: number | null = null;
/** The tab change a flushed turn made — not "a jump nobody's finger made". */
let expectedIndex: number | null = null;
let turnId = 0;
let settlingNow = false;
let fingerOnRow = false;

/** A swipe's turn, held until its slide lands. */
export function holdPendingTurn(index: number, go: () => void): void {
  heldTurn = { index, go };
}

/** Tell the navigator of the held turn, if there is one. */
export function flushPendingTurn(): void {
  const t = heldTurn;
  if (!t) return;
  heldTurn = null;
  landedIndex = t.index;
  expectedIndex = t.index;
  t.go();
}

/** The tab the row is on: a held or just-flushed turn counts as made. */
export function pagerRowIndex(navigatorIndex: number): number {
  if (heldTurn) return heldTurn.index;
  if (landedIndex != null) return landedIndex;
  return navigatorIndex;
}

/** The bar's tab-change effect: the navigator has caught up. */
export function notePagerIndex(index: number): boolean {
  landedIndex = null;
  const swiped = expectedIndex === index;
  expectedIndex = null;
  return swiped;
}

/** A new turn; its callbacks check they are still the current one. */
export function nextPagerTurn(): number {
  turnId += 1;
  return turnId;
}

export function isCurrentPagerTurn(id: number): boolean {
  return id === turnId;
}

export function setPagerSettling(on: boolean): void {
  settlingNow = on;
}

export function pagerSettling(): boolean {
  return settlingNow;
}

export function setFingerOnRow(on: boolean): void {
  fingerOnRow = on;
}

export function pagerFingerOnRow(): boolean {
  return fingerOnRow;
}

/** Test seam. */
export function _resetPagerTurnForTests(): void {
  heldTurn = null;
  landedIndex = null;
  expectedIndex = null;
  turnId = 0;
  settlingNow = false;
  fingerOnRow = false;
}

/**
 * The pages' reach follows the tab a slide behind (MinimalSwipe), so a
 * turn lays nothing out under its own slide. A finger coming down before
 * it has caught up asks for it now: the page beside the new tab has to be
 * there for that finger's swipe.
 */
let reachNowTick = 0;
const reachNowListeners = new Set<() => void>();

export function wantPagerReachNow(): void {
  reachNowTick += 1;
  reachNowListeners.forEach(l => l());
}

export function usePagerReachNow(): number {
  return useSyncExternalStore(
    listener => {
      reachNowListeners.add(listener);
      return () => reachNowListeners.delete(listener);
    },
    () => reachNowTick,
  );
}

/** How long the dots' icons stay up after a turn settles. */
export const ICONS_LINGER_MS = 1000;

let engagedAnim: Animated.CompositeAnimation | null = null;
let engagedNow = false;
const engagedListeners = new Set<() => void>();
let reachNow = false;
const reachListeners = new Set<() => void>();
/** The owners of the engagement: fingers (counted) and a timed slide. */
let fingersHolding = 0;
let slideUntil = 0;
let slideTimer: ReturnType<typeof setTimeout> | null = null;
/** Of the fingers, those that could reveal a far page (a hold on the dots). */
let fingersReaching = 0;

function animateEngaged(on: boolean): void {
  engagedAnim?.stop();
  engagedAnim = Animated.timing(pagerEngaged, {
    toValue: on ? 1 : 0,
    duration: on ? 140 : 260,
    // The icons stay a moment after the page settles, long enough to read
    // which tab it landed on, before they go back to dots. Only the look
    // waits: the pages are told at once (`engagedNow` above).
    delay: on ? 0 : ICONS_LINGER_MS,
    easing: pagerEasing,
    useNativeDriver: true,
  });
  engagedAnim.start();
}

function settleEngagement(): void {
  const sliding = Date.now() < slideUntil;
  const on = fingersHolding > 0 || sliding;
  const reach = fingersReaching > 0 || sliding;
  if (reachNow !== reach) {
    reachNow = reach;
    reachListeners.forEach(l => l());
  }
  if (engagedNow !== on) {
    engagedNow = on;
    engagedListeners.forEach(l => l());
    animateEngaged(on);
  }
}

/**
 * A finger's hold on the turn: icons for dots while it is down, dots
 * again once every finger has gone and no slide is running. `reach` for
 * a finger that can slide to any tab (the dots' hold), so every page is
 * laid out while it is down; a swipe reveals a neighbour at most and
 * asks for none. Paired: each `true` is released by one `false`.
 */
export function setPagerEngaged(on: boolean, reach = false): void {
  if (on) {
    fingersHolding += 1;
    if (reach) fingersReaching += 1;
  } else {
    fingersHolding = Math.max(0, fingersHolding - 1);
    if (reach) fingersReaching = Math.max(0, fingersReaching - 1);
  }
  settleEngagement();
}

/** Whether a finger holds the turn now — a swipe, or a hold on the dots. */
export function pagerHeldByFinger(): boolean {
  return fingersHolding > 0;
}

/**
 * A slide with no finger on it — after a tap on a dot, or a tab change
 * the app made (a door on Today into the Log, a notification, the back
 * button): the icons show and every page is in reach for `ms`, so the
 * page that was left and the ones between stay drawn as the row slides
 * by. Without it the page just left went out of reach the frame the
 * tab changed, and the new one slid in across a blank scene.
 */
export function engagePagerFor(ms: number): void {
  slideUntil = Math.max(slideUntil, Date.now() + ms);
  if (slideTimer) clearTimeout(slideTimer);
  slideTimer = setTimeout(() => {
    slideTimer = null;
    settleEngagement();
  }, slideUntil - Date.now());
  settleEngagement();
}

/** Whether a turn is under way — a finger on it, or a slide running. */
export function usePagerEngaged(): boolean {
  return useSyncExternalStore(
    listener => {
      engagedListeners.add(listener);
      return () => engagedListeners.delete(listener);
    },
    () => engagedNow,
  );
}

/** Whether every page should be in reach: a hold on the dots, or a slide across the row. */
export function usePagerReachAll(): boolean {
  return useSyncExternalStore(
    listener => {
      reachListeners.add(listener);
      return () => reachListeners.delete(listener);
    },
    () => reachNow,
  );
}

/**
 * Stop the settled tab's slide where it was going: for a finger that
 * comes down on a page still sliding after the last turn, which takes
 * the row from there rather than being ignored until it has landed.
 */
export function finishPagerBase(): void {
  if (!baseAnim) return;
  baseAnim.stop();
  baseAnim = null;
  if (baseTarget != null) pagerBase.setValue(baseTarget);
}

/** Test seam. */
export function _resetPagerEngagementForTests(): void {
  fingersHolding = 0;
  fingersReaching = 0;
  slideUntil = 0;
  if (slideTimer) clearTimeout(slideTimer);
  slideTimer = null;
  engagedNow = false;
  reachNow = false;
}

/** The drag's run back to zero, as the navigator slides the pages. */
export function settlePagerDrag(onDone?: () => void): void {
  Animated.timing(pagerDragRaw, {
    toValue: 0,
    duration: PAGER_TRANSITION_MS,
    easing: pagerEasing,
    useNativeDriver: true,
  }).start(() => onDone?.());
}

/** A release that does not turn: the page springs back under the finger. */
export function springPagerDrag(onDone?: () => void): void {
  Animated.spring(pagerDragRaw, {
    toValue: 0,
    stiffness: 260,
    damping: 28,
    mass: 1,
    useNativeDriver: true,
  }).start(() => onDone?.());
}

/** The hold's run back to zero, as the navigator slides the pages. */
export function settlePagerHold(onDone?: () => void): void {
  Animated.timing(pagerHold, {
    toValue: 0,
    duration: PAGER_TRANSITION_MS,
    easing: pagerEasing,
    useNativeDriver: true,
  }).start(() => onDone?.());
}

/**
 * Things on a page that scroll SIDEWAYS themselves and keep the right to —
 * the Log's graphs, which run back through the months. The page's own
 * swipe (MinimalSwipe) waits for each of these to decline a touch before
 * it takes one, so a drag across the graph scrolls the graph and a drag
 * across the rest of the page turns it. Registered by the graphs
 * themselves (`usePagerBlocker`) as refs to their native handlers, read
 * by the swipe (`usePagerBlockers`) for its `waitFor`.
 */
type BlockerRef = RefObject<unknown>;
let blockers: BlockerRef[] = [];
const blockerListeners = new Set<() => void>();
const noteBlockers = () => blockerListeners.forEach(l => l());

export function usePagerBlocker(ref: BlockerRef): void {
  useEffect(() => {
    blockers = [...blockers, ref];
    noteBlockers();
    return () => {
      blockers = blockers.filter(g => g !== ref);
      noteBlockers();
    };
  }, [ref]);
}

export function usePagerBlockers(): BlockerRef[] {
  return useSyncExternalStore(
    listener => {
      blockerListeners.add(listener);
      return () => blockerListeners.delete(listener);
    },
    () => blockers,
  );
}

/**
 * ── THE PAGES COME UP IN TURN ────────────────────────────────────────
 *
 * Six pages stood in one view tree from the first frame: every tab's
 * screen mounted at boot, laid out and drawn whether a finger could
 * reach it or not — the Quran's lists, the Log's graphs, the whole of
 * Settings behind Today — which was most of what the boot had to do and
 * most of what every frame had to walk. Now a page mounts when it comes
 * within reach: the neighbours of the tab on show at once (a swipe shows
 * them), and the rest one at a time in the seconds after the first page
 * is up, so a hold on the dots finds them ready. `pagerWarmth` is how
 * many tabs from the current one a page may mount: 1 once the first page
 * has painted and its launch run is over (the page on show alone before
 * that), up a step every WARM_STEP_MS after WARM_AFTER_MS from then.
 */
const WARM_AFTER_MS = 2500;
const WARM_STEP_MS = 600;
const WARM_MAX = 5;
let warmth = 0;
let warming: ReturnType<typeof setTimeout> | null = null;
const warmthListeners = new Set<() => void>();

function warmStep(): void {
  warming = null;
  if (warmth >= WARM_MAX) return;
  // Never under a finger: a step mounts a whole page (the Log's graph,
  // Settings) on the JS thread the swipe needs. While a turn is under
  // way the step waits and looks again.
  if (engagedNow) {
    warming = setTimeout(warmStep, WARM_STEP_MS);
    return;
  }
  warmth += 1;
  warmthListeners.forEach(l => l());
  warming = setTimeout(warmStep, WARM_STEP_MS);
}

/** Start the warm-up, once; harmless to call again. */
export function startPagerWarmup(): void {
  if (warming || warmth >= WARM_MAX) return;
  warming = setTimeout(warmStep, WARM_AFTER_MS);
}

export function usePagerWarmth(): number {
  return useSyncExternalStore(
    listener => {
      warmthListeners.add(listener);
      return () => warmthListeners.delete(listener);
    },
    () => warmth,
  );
}

/** Test seam. */
export function _resetPagerWarmthForTests(): void {
  if (warming) clearTimeout(warming);
  warming = null;
  warmth = 0;
}
