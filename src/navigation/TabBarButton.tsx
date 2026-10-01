/**
 * A tab's button — see `tabBarPress` for what it is for.
 *
 * A plain Pressable with NO ripple or drawn effect: the icon's own tint is
 * the feedback. On top of the tap, a hold-and-slide: keep a finger on a
 * tab for a moment, slide along the bar (a tick for each tab crossed), and
 * lift over a tab to open it. The touch stays with the button it began in
 * — that is how touches work — so the button reads the finger's window x
 * from the touch events it keeps receiving and hands it to the store.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, type GestureResponderEvent, type HostInstance } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { hapticScrubStart, hapticScrubTick } from '../polish/haptics';
import {
  activateTab,
  holdTab,
  hoveredTab,
  pressTab,
  registerTabActivation,
  registerTabFrame,
  releaseTab,
  slideTo,
  tabBarPress,
} from './tabBarPress';

/** A finger that stays this long is holding, and may slide. */
const HOLD_MS = 180;

type Props = BottomTabBarButtonProps & { name: string };

export function TabBarButton({
  name,
  onPress,
  // Dropped: every slide is a hold, so the navigator's long press
  // (`tabLongPress`) would fire half a second into each one. Nothing
  // listens for it, and a slide is not a long press.
  onLongPress: _longPress,
  children,
  style,
  ...rest
}: Props) {
  const ref = useRef<HostInstance>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * This touch was a hold, settled on lift. Kept past the lift so the tap
   * below stands down whichever arrives first, the responder's release
   * (`onPress`) or the bubbled `onTouchEnd`: a held finger opens exactly
   * one tab, the one under it, in either order.
   */
  const wasHeld = useRef(false);

  const press = useCallback(
    (e?: GestureResponderEvent) => onPress?.(e as GestureResponderEvent),
    [onPress],
  );
  useEffect(() => {
    registerTabActivation(name, () => press());
    return () => registerTabActivation(name, null);
  }, [name, press]);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      registerTabFrame(name, { x, width, y, height });
    });
  }, [name]);
  useEffect(() => () => registerTabFrame(name, null), [name]);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <Pressable
      {...rest}
      ref={ref}
      onLayout={measure}
      android_ripple={undefined}
      style={style}
      // The tap. Not after a hold: a hold is settled on lift, below, and a
      // hold that slid away must not also tap here.
      onPress={e => {
        if (tabBarPress().held || wasHeld.current) return;
        press(e);
      }}
      onTouchStart={() => {
        // Where the bar is NOW, not where it was laid out: it slides
        // away while reading and back, and the keyboard can lift it.
        measure();
        wasHeld.current = false;
        pressTab(name);
        clearHold();
        holdTimer.current = setTimeout(() => {
          holdTab();
          hapticScrubStart();
        }, HOLD_MS);
      }}
      onTouchMove={e => {
        if (slideTo(e.nativeEvent.pageX)) hapticScrubTick(false);
      }}
      onTouchEnd={() => {
        clearHold();
        const { held } = tabBarPress();
        if (held) wasHeld.current = true;
        const target = held ? hoveredTab() : name;
        releaseTab(target);
        if (held && target) activateTab(target);
      }}
      onTouchCancel={() => {
        clearHold();
        releaseTab(null);
      }}>
      {children}
    </Pressable>
  );
}
