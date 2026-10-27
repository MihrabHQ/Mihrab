/**
 * Minimal's pager (settings.minimalUi): the values the swipe, the pages
 * and the dots share, so the page under the finger, the page coming in
 * and the dots at the foot all move as one.
 *
 * `pagerDrag` is the finger's offset in points, applied to every tab's
 * page (MinimalSwipe) — only the page on show is drawn, so it is the one
 * that moves — and read by the dots as a fraction of the page's width.
 * On a release that turns the page the navigator slides the old page
 * out and the new one in from a page away, and this value runs from
 * where the finger left it back to zero over the same time, so neither
 * page jumps: each starts exactly where the finger had it.
 *
 * `pagerEngaged` is 1 while a turn is under way — a finger on the page,
 * or the slide after a tap on a dot — and 0 at rest. The dots show the
 * tabs' icons while it is 1 and go back to dots as it settles.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Animated, Easing, I18nManager } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

export const pagerDrag = new Animated.Value(0);
export const pagerEngaged = new Animated.Value(0);
/**
 * The tab the pages are settled on, as a number that slides: on a turn
 * it runs from the old tab to the new over the turn's time while the
 * drag runs back to zero, so the position below never jumps.
 */
export const pagerBase = new Animated.Value(0);
let baseTarget: number | null = null;
let baseAnim: Animated.CompositeAnimation | null = null;

/** Where the pages are, in tabs: the settled tab, the finger's drag as a fraction of the page, the hold. */
export function pagerPosition(width: number): Animated.AnimatedAddition {
  const w = Math.max(1, width);
  // A drag to the left reveals the page on the right — in LTR the next
  // tab; in RTL the one before.
  return Animated.add(Animated.add(pagerBase, Animated.divide(pagerDrag, I18nManager.isRTL ? w : -w)), pagerHold);
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
  baseAnim.start(() => {
    baseAnim = null;
  });
}
/**
 * A finger held on the dots and slid along them (MinimalTabBar): how
 * many tabs from the current one it is, as a fraction. The dots follow
 * it exactly, and so do the pages: a page's width for every tab, the
 * strip of them sliding under the finger (MinimalSwipe).
 */
export const pagerHold = new Animated.Value(0);


/** The navigator's slide, and the drag's run back to zero with it. */
export const PAGER_TRANSITION_MS = 280;
export const pagerEasing = Easing.out(Easing.cubic);

let engagedAnim: Animated.CompositeAnimation | null = null;

/** Icons for dots while a turn is under way; dots again as it settles. */
export function setPagerEngaged(on: boolean): void {
  engagedAnim?.stop();
  engagedAnim = Animated.timing(pagerEngaged, {
    toValue: on ? 1 : 0,
    duration: on ? 140 : 260,
    easing: pagerEasing,
    useNativeDriver: true,
  });
  engagedAnim.start();
}

/** The drag's run back to zero, as the navigator slides the pages. */
export function settlePagerDrag(onDone?: () => void): void {
  Animated.timing(pagerDrag, {
    toValue: 0,
    duration: PAGER_TRANSITION_MS,
    easing: pagerEasing,
    useNativeDriver: true,
  }).start(() => onDone?.());
}

/** A release that does not turn: the page springs back under the finger. */
export function springPagerDrag(onDone?: () => void): void {
  Animated.spring(pagerDrag, {
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
 * themselves (`usePagerBlocker`), read by the swipe (`usePagerBlockers`).
 */

let blockers: GestureType[] = [];
const blockerListeners = new Set<() => void>();
const noteBlockers = () => blockerListeners.forEach(l => l());

export function usePagerBlocker(gesture: GestureType): void {
  useEffect(() => {
    blockers = [...blockers, gesture];
    noteBlockers();
    return () => {
      blockers = blockers.filter(g => g !== gesture);
      noteBlockers();
    };
  }, [gesture]);
}

export function usePagerBlockers(): GestureType[] {
  return useSyncExternalStore(
    listener => {
      blockerListeners.add(listener);
      return () => blockerListeners.delete(listener);
    },
    () => blockers,
  );
}
