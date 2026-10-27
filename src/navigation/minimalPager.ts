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
import { Animated, Easing } from 'react-native';

export const pagerDrag = new Animated.Value(0);
export const pagerEngaged = new Animated.Value(0);
/**
 * A finger held on the dots and slid along them (MinimalTabBar): how
 * many tabs from the current one it is, as a fraction. The dots follow
 * it exactly; the page leans the way the finger is going — this much
 * of its width a tab away, twice that at the far end of the row — rather
 * than being carried off the screen (MinimalSwipe).
 */
export const pagerHold = new Animated.Value(0);
export const HOLD_PAGE_LEAN = 0.3;

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
