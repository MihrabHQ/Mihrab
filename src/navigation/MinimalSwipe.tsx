import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLayoutRtl } from '../i18n/useLayoutRtl';
import {
  PanGestureHandler,
  State,
  type HandlerStateChangeEvent,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useAfterFirstPaint } from '../boot/firstPaint';
import { afterRun } from '../boot/launchWarp';
import {
  PAGER_TRANSITION_MS,
  finishPagerBase,
  flushPendingTurn,
  holdPendingTurn,
  isCurrentPagerTurn,
  nextPagerTurn,
  pagerDragRaw,
  pagerFingerOnRow,
  pagerRowIndex,
  pagerSettling,
  setFingerOnRow,
  setPagerSettling,
  pagerPosition,
  setPagerEngaged,
  settlePagerBase,
  settlePagerDrag,
  springPagerDrag,
  startPagerWarmup,
  usePagerBlockers,
  usePagerEngaged,
  usePagerReachAll,
  usePagerReachNow,
  usePagerWarmth,
  wantPagerReachNow,
} from './minimalPager';

/**
 * Under Minimal (settings.minimalUi) the tabs are pages: the page moves
 * with the finger, and a drag far or fast enough turns to the next one,
 * the way the dots at the foot say it will (`MinimalTabBar`). Wrapped
 * round every tab's screen by the navigator.
 *
 * The finger drives the pages NATIVELY: the handler writes the drag
 * straight into `pagerDragRaw` on every move (`Animated.event`), and the
 * JS thread is told only when the finger lifts, to decide the turn. The
 * page follows the finger from the first few points across — early, so
 * a row under the finger lets go of its press as soon as the drag is
 * plainly sideways rather than holding it lit to the end — and a drag
 * that is plainly down a list fails first and goes on as the list's
 * scroll. The pages that used to turn sideways themselves (the Quran's
 * three lists, the Log's days) stand that down under Minimal rather than
 * fight it. At either end of the row the page gives a little and comes
 * back. Mirrored in a right-to-left language: the next page is on the
 * left.
 *
 * And only the pages a finger could reveal are in the tree: the one on
 * show and its neighbours, the rest kept mounted but out of layout and
 * drawing (`display: none`) until a hold on the dots could slide to
 * them — and a page far from the first one is not even mounted until
 * the warm-up reaches it (minimalPager.ts, `pagerWarmth`).
 */
const TURN_FRACTION = 0.3;
const TURN_VELOCITY = 600;

export function MinimalSwipe({
  enabled,
  routeKey,
  children,
}: {
  enabled: boolean;
  /** The tab this wraps — its place on the strip is its place in the row. */
  routeKey: string;
  children: ReactNode;
}) {
  const navigation = useNavigation();
  const routes = useNavigationState(s => s.routes);
  const index = useNavigationState(s => s.index);
  const myIndex = routes.findIndex(r => r.key === routeKey);
  const { width } = useWindowDimensions();
  // Read in the gesture's callbacks without rebuilding the handler on
  // every tab change: a handler rebuilt mid-drag is a drag cut short.
  // The app's direction, not the device's (minimalPager.ts).
  const rtl = useLayoutRtl();
  const live = useRef({ routes, index, width, rtl });
  live.current = { routes, index, width, rtl };
  // The graphs that scroll sideways themselves: the swipe waits for them.
  const blockers = usePagerBlockers();

  // The finger, into the drag, with no JS in between.
  const onGestureEvent = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: pagerDragRaw } }], { useNativeDriver: true }),
    [],
  );
  const onHandlerStateChange = useMemo(
    () => (e: HandlerStateChangeEvent<PanGestureHandlerEventPayload>) => {
      const { state, oldState, translationX, velocityX } = e.nativeEvent;
      if (state === State.ACTIVE) {
        setFingerOnRow(true);
        // A swipe straight after a turn: the new tab's neighbours, now.
        wantPagerReachNow();
        // A finger down on a row still settling after the last turn
        // takes the row from there: the settle is finished where it was
        // going and this finger's drag is read from there. The turn it
        // interrupts stays held — the navigator hears of the two at once,
        // where this one lands — so the page on show, whose handler has
        // this finger, stays the page on show until then
        // (minimalPager.ts, "A SWIPE'S TURN").
        if (pagerSettling()) {
          nextPagerTurn();
          setPagerSettling(false);
          pagerDragRaw.stopAnimation();
          finishPagerBase();
        }
        setPagerEngaged(true);
        return;
      }
      if (oldState !== State.ACTIVE) return;
      setFingerOnRow(false);
      const mine = nextPagerTurn();
      setPagerSettling(true);
      const done = () => {
        if (isCurrentPagerTurn(mine)) {
          // Landed: now the navigator hears of the turn — on a still
          // page, where its render and the new page's focus cost nothing
          // anyone can see.
          flushPendingTurn();
          // Belt and braces: a move the handler delivered after the lift
          // would leave the drag where that move put it, under a page
          // that had already settled. Zero is where a lifted finger
          // leaves it.
          if (!pagerFingerOnRow()) pagerDragRaw.setValue(0);
          setPagerSettling(false);
        }
        setPagerEngaged(false);
      };
      if (state !== State.END) {
        // Cancelled or failed under the finger: back where it was.
        springPagerDrag(done);
        return;
      }
      const { routes: rs, width: w } = live.current;
      // From the tab the row is on — a turn not yet told counts as made.
      const i = pagerRowIndex(live.current.index);
      const far = Math.abs(translationX) >= w * TURN_FRACTION || Math.abs(velocityX) >= TURN_VELOCITY;
      // A flick back the way the page came is not a turn.
      const sameWay = velocityX === 0 || Math.sign(velocityX) === Math.sign(translationX);
      let step = translationX < 0 ? 1 : -1;
      if (live.current.rtl) step = -step;
      const next = far && sameWay ? rs[i + step] : undefined;
      if (!next) {
        springPagerDrag(done);
        return;
      }
      // No haptic: a page turning is not a count, and a tick on every
      // turn was one more thing than the page itself.
      // The settled tab slides to the next while the drag runs back to
      // zero: the position, and so every page, carries on from where the
      // finger left it (minimalPager.ts). The navigator is NOT told here
      // but when the slide lands (`done`): see "A SWIPE'S TURN" there.
      settlePagerBase(i + step);
      holdPendingTurn(i + step, () => navigation.navigate(next.name as never));
      settlePagerDrag(done);
    },
    [navigation],
  );

  // This page's place on the strip: as many page-widths aside as it is
  // tabs from the position — the one number the dots read too, so the
  // pages and the dots can never disagree, and a page two tabs away is
  // two pages away, under a finger and through a turn alike. Not
  // rebuilt on a turn: the position is the same node whichever tab is
  // current (minimalPager.ts).
  const count = routes.length;
  const offset = useMemo(
    () =>
      Animated.multiply(
        Animated.subtract(myIndex, pagerPosition(width, count, rtl)),
        rtl ? -width : width,
      ),
    [myIndex, count, width, rtl],
  );

  // In reach: the page on show, its neighbours, and every page while a
  // hold on the dots or a slide across the row could reveal any of them
  // (`usePagerReachAll`) — not on a swipe, which reveals a neighbour at
  // most, and used to lay out four far pages on its first move.
  // Not the neighbours before the first paint: the launch's first frame
  // is Today's alone, and its run — the countdown counting to now — must
  // not share the JS thread with the Quran page mounting beside it
  // (measured: the run drew five frames where it draws eighty).
  const engaged = usePagerEngaged();
  const reachAll = usePagerReachAll();
  const painted = useAfterFirstPaint();
  const [settled, setSettled] = useState(false);
  // The tab the reach is measured from: the tab on show, a slide behind.
  // The navigator hears of a swipe's turn as the finger lifts — it has to,
  // so the next swipe lands on the page that is coming in — but laying
  // out the page two along at that moment (`display: 'none'` to drawn)
  // is UI-thread work in the frames the slide is drawn in, and the page
  // slowed mid-run and caught up. So the reach moves once the slide has
  // landed. A finger down before then brings in the new tab's neighbours
  // at once (`wantPagerReachNow`): a second swipe never reveals a blank
  // page — that one lays out as the finger starts, not under a slide.
  const [reachIndex, setReachIndex] = useState(index);
  const reachNow = usePagerReachNow();
  useEffect(() => {
    if (reachIndex === index) return undefined;
    const t = setTimeout(() => setReachIndex(index), PAGER_TRANSITION_MS + 80);
    return () => clearTimeout(t);
  }, [index, reachIndex]);
  useEffect(() => {
    if (reachNow > 0) setReachIndex(live.current.index);
  }, [reachNow]);
  const distance = Math.abs(myIndex - reachIndex);
  const inReach = reachAll || myIndex === index || distance <= (settled || engaged ? 1 : 0);
  // Mounted once in reach, or once the warm-up has come this far — and
  // then kept, so a page keeps its scroll and its state across turns.
  const warmth = usePagerWarmth();
  const [mounted, setMounted] = useState(enabled && (inReach || distance <= warmth));
  useEffect(() => {
    if (enabled && !mounted && (inReach || distance <= warmth)) setMounted(true);
  }, [enabled, mounted, inReach, distance, warmth]);
  // The warm-up waits for the launch run as the app's other foreground
  // work does (launchWarp.ts, `afterRun`), then counts from there.
  useEffect(() => {
    if (!enabled || !painted) return undefined;
    let cancelled = false;
    void afterRun().then(() => {
      if (cancelled) return;
      setSettled(true);
      startPagerWarmup();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, painted]);

  // The full page: no strip, no offset — the navigator places the one
  // page on show, and a page stood a width aside here would be a blank
  // tab. (The dots, which settle the position, are not even mounted.)
  if (!enabled) return <View style={styles.fill}>{children}</View>;
  return (
    <PanGestureHandler
      enabled={enabled}
      // The page starts moving after 8dp sideways — 10 felt like the page
      // resisting the finger before it gave, and 6 took the Tasbih's taps
      // (a thumb tapping quickly rolls a little; a pan that starts cancels
      // the press). 12dp up or down first and it is the page's own scroll.
      activeOffsetX={[-8, 8]}
      failOffsetY={[-12, 12]}
      waitFor={blockers as never}
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}>
      {/* One native view for the handler — the whole screen, NOT moved
          with the page — and inside it the page on its offset. Not moved,
          so a finger anywhere on the screen during a turn is this page's
          while it is the one on show: the turn is told to the navigator
          only when it lands (minimalPager.ts, "A SWIPE'S TURN"), and a
          second swipe straight after the first comes down over the page
          coming in, which the navigator still keeps from touches. On the
          moved view, that finger reached nothing and the swipe was lost.
          It stays mounted whatever the reach: under Fabric a view out of
          the tree (display: none) is taken down natively, and on iOS the
          handler is bound to the view it was attached to, so a page
          brought back into reach came up on a recycled view with another
          page's swipe on it — the swipe on Today turned the Settings
          page, or nothing, and a flick across Today opened its times.
          What leaves the tree out of reach is the page inside. */}
      {/* An Animated.View, though nothing on it moves: the handler hands
          its child `onGestureEvent`, and the drag's is a native
          Animated.event — a plain View is given the event object as a
          listener, and the first swipe crashed the app. */}
      <Animated.View style={styles.fill} collapsable={false}>
        <Animated.View style={[styles.fill, { transform: [{ translateX: offset }] }]} collapsable={false}>
          <View style={[styles.fill, inReach ? null : styles.away]} collapsable={false}>
            {mounted ? children : null}
          </View>
        </Animated.View>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Out of reach: mounted, but neither laid out nor drawn.
  away: { display: 'none' },
});
