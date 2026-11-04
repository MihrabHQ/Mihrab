/**
 * Turning the muṣḥaf's page with a finger in a browser (Mihrab Web).
 *
 * ── WHY NOT THE LIST'S OWN SCROLL ─────────────────────────────────────
 *
 * The readers page with a horizontal FlatList and `pagingEnabled`, which a
 * browser does with CSS scroll snapping. On a phone that was heavy and
 * unreliable (reported on a Pixel, in Brave, 2026-11-04): a short flick
 * snapped back to the page it started on, a long one slid past two or
 * three pages and stopped between them, and every frame of the drag ran
 * the pager's scroll handlers on the same thread as the drag.
 *
 * So on a touch screen in a browser the list does not scroll under the
 * finger at all. This hook watches the drag instead: a mostly-sideways one
 * past a short distance (or a quick flick) turns ONE page, by the pager's
 * own `turnPage`, exactly as a key press or a chevron does. While the
 * finger is down the page leans after it, so the turn still feels like
 * paper.
 *
 * The area is `touch-action: pan-y`: the browser may scroll a tall page's
 * column up and down itself, but a sideways drag is left to this hook.
 * Without it a real finger — never quite level — started the browser
 * scrolling the column a pixel or two, the browser cancelled the touch, and
 * the turn never came (a synthetic drag in a test is level and passed).
 *
 * The drag is claimed only once it is clearly sideways — the responder is
 * taken in the capture phase, which also cancels the press of the word the
 * finger started on (no āyah sheet popping up under a turn). An upward or
 * downward drag is never claimed, so a page too tall for the window still
 * scrolls in its column.
 *
 * Everywhere else — the phones' and tablets' own apps, the desktop app
 * with its trackpad — nothing changes: the hook hands back nothing.
 */
import { useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform } from 'react-native';
import { IS_WEB_APP } from '../config/webApp';

/**
 * Mihrab Web on a touch screen. Not the desktop app: a Windows laptop with
 * a touch screen also has a trackpad, whose two-finger swipe is the list's
 * own scroll — switching that off for the finger would lose it.
 */
export const WEB_TOUCH_PAGING: boolean =
  IS_WEB_APP &&
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  ((navigator as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 0;

/** How far a finger moves before the drag is taken as a page turn, dp. */
const CLAIM_DX = 12;
/** How far it has to have gone, on release, to turn the page. */
const TURN_DX = 40;
/** …or how fast, for a flick shorter than that (dp per ms). */
const TURN_VX = 0.35;
/** Sideways means at least this much more across than down. */
const AXIS = 1.2;
/** How much of the drag the page follows: a lean, not a carry. */
const LEAN = 0.35;

export function useWebSwipePaging({
  turnPage,
  enabled,
}: {
  /** +1 the next page, −1 the previous — the pager's own turn. */
  turnPage: (dir: 1 | -1) => void;
  /** Off while the reading lock is on (#75): no brush of the hand turns it. */
  enabled: boolean;
}) {
  const lean = useRef(new Animated.Value(0)).current;
  const latest = useRef({ turnPage, enabled });
  latest.current = { turnPage, enabled };

  const responder = useMemo(() => {
    if (!WEB_TOUCH_PAGING) return null;
    const settle = () =>
      Animated.timing(lean, { toValue: 0, duration: 160, useNativeDriver: false }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        latest.current.enabled &&
        Math.abs(g.dx) > CLAIM_DX &&
        Math.abs(g.dx) > AXIS * Math.abs(g.dy),
      onPanResponderMove: (_, g) => lean.setValue(g.dx * LEAN),
      onPanResponderRelease: (_, g) => {
        settle();
        if (Math.abs(g.dx) >= TURN_DX || Math.abs(g.vx) >= TURN_VX) {
          // The muṣḥaf reads right to left: drawing the finger to the right
          // brings in the page on the left, which is the next one.
          latest.current.turnPage(g.dx > 0 ? 1 : -1);
        }
      },
      onPanResponderTerminate: settle,
      onPanResponderTerminationRequest: () => false,
    });
  }, [lean]);

  return responder
    ? {
        panHandlers: responder.panHandlers,
        leanStyle: { transform: [{ translateX: lean }] },
        // A web-only style; React Native's types do not know it.
        areaStyle: { touchAction: 'pan-y' } as object,
      }
    : null;
}
