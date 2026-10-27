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
 * every second. What the pages and the dots read is `pagerShapedDrag`,
 * the raw drag given a little at either end of the row (EDGE_GIVE) and
 * clamped to a page — an interpolation, so it is native too; it is
 * built for the tab the pages are on (which neighbours exist), and every
 * reader rebuilds it when the tab changes, so they never disagree.
 *
 * `pagerBase` is the tab the pages are settled on, as a number that
 * slides: on a turn it runs from the old tab to the new over the turn's
 * time while the drag runs back to zero, so the position never jumps.
 * `pagerHold` is a finger held on the dots and slid (MinimalTabBar), in
 * tabs from the current one.
 *
 * `pagerEngaged` is 1 while a turn is under way — a finger on the page,
 * or the slide after a tap on a dot — and 0 at rest. The dots show the
 * tabs' icons while it is 1 and go back to dots as it settles. The same
 * fact is kept as a plain boolean for the pages (`usePagerEngaged`),
 * which keep every page in the row drawable while a finger could reveal
 * it, and only the neighbours otherwise.
 */
import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { Animated, Easing, I18nManager } from 'react-native';

export const pagerDragRaw = new Animated.Value(0);
export const pagerEngaged = new Animated.Value(0);
export const pagerBase = new Animated.Value(0);
export const pagerHold = new Animated.Value(0);
let baseTarget: number | null = null;
let baseAnim: Animated.CompositeAnimation | null = null;

/** How much of the finger the page follows past the last tab. */
export const EDGE_GIVE = 0.22;

/** Which neighbours the current tab has: what a drag each way can reveal. */
export type PagerEdges = { prev: boolean; next: boolean };

/**
 * The drag as the pages take it: a page at most, and past the end of the
 * row only a fraction of the finger. A drag to the left reveals the page
 * on the right — the next tab in LTR, the one before in RTL.
 */
export function pagerShapedDrag(width: number, edges: PagerEdges): Animated.AnimatedInterpolation<number> {
  const w = Math.max(1, width);
  const onLeft = I18nManager.isRTL ? edges.prev : edges.next;
  const onRight = I18nManager.isRTL ? edges.next : edges.prev;
  return pagerDragRaw.interpolate({
    inputRange: [-w, 0, w],
    outputRange: [onLeft ? -w : -w * EDGE_GIVE, 0, onRight ? w : w * EDGE_GIVE],
    extrapolate: 'clamp',
  });
}

/** Where the pages are, in tabs: the settled tab, the finger's drag as a fraction of the page, the hold. */
export function pagerPosition(width: number, edges: PagerEdges): Animated.AnimatedAddition {
  const w = Math.max(1, width);
  return Animated.add(
    Animated.add(pagerBase, Animated.divide(pagerShapedDrag(w, edges), I18nManager.isRTL ? w : -w)),
    pagerHold,
  );
}

/** The neighbours of tab `index` in a row of `count`. */
export function pagerEdges(index: number, count: number): PagerEdges {
  return { prev: index > 0, next: index < count - 1 };
}

/**
 * Slide the settled tab to `index` — at once when nothing is drawn yet.
 *
 * `onDone` runs once it is there. A turn tells the navigator then, not as
 * it starts: the tab changing rebuilds every page's offset and the dots'
 * position as new native nodes, and the navigator renders, which mid-slide
 * was a step in the page's run — it slowed, then went on.
 */
export function settlePagerBase(index: number, animated = true, onDone?: () => void): void {
  if (baseTarget === index && baseAnim) return;
  baseAnim?.stop();
  baseTarget = index;
  if (!animated) {
    baseAnim = null;
    pagerBase.setValue(index);
    onDone?.();
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
    onDone?.();
  });
}

/** The navigator's slide, and the drag's run back to zero with it. */
export const PAGER_TRANSITION_MS = 280;
export const pagerEasing = Easing.out(Easing.cubic);

/** How long the dots' icons stay up after a turn settles. */
export const ICONS_LINGER_MS = 1000;

let engagedAnim: Animated.CompositeAnimation | null = null;
let engagedNow = false;
let reachAllNow = false;
const engagedListeners = new Set<() => void>();

/**
 * Icons for dots while a turn is under way; dots again as it settles.
 *
 * `reachAll`: every page is brought into reach for the turn, not only the
 * neighbours — for the dots, whose hold can slide to any tab and whose tap
 * slides across the ones between. A swipe turns one page, so it brings in
 * none: its neighbours are in reach already, and laying out every page at
 * the moment the finger starts to move was a stall in the middle of the
 * swipe.
 */
export function setPagerEngaged(on: boolean, reachAll = false): void {
  const all = on && reachAll;
  if (engagedNow !== on || reachAllNow !== all) {
    engagedNow = on;
    reachAllNow = all;
    engagedListeners.forEach(l => l());
  }
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

/** Whether a turn from the dots is under way: every page could be revealed. */
export function usePagerReachAll(): boolean {
  return useSyncExternalStore(
    listener => {
      engagedListeners.add(listener);
      return () => engagedListeners.delete(listener);
    },
    () => reachAllNow,
  );
}

/** Whether a turn is under way, for the pages: true while a finger could reveal any of them. */
export function usePagerEngaged(): boolean {
  return useSyncExternalStore(
    listener => {
      engagedListeners.add(listener);
      return () => engagedListeners.delete(listener);
    },
    () => engagedNow,
  );
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
