/**
 * A tab's button — see `tabBarPress` for what it is for.
 *
 * A plain Pressable with NO ripple: the feedback is the halo the icon
 * draws for itself. On top of the tap, a hold-and-slide: keep a finger
 * on a tab for a moment, and the tab under the finger lights up as it
 * moves along the bar; lift, and that is the tab opened. The touch stays
 * with the button it began in — that is how touches work — so the button
 * reads the finger's window x from the touch events it keeps receiving
 * and asks the store which tab is there.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, type GestureResponderEvent, type HostInstance } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { hapticScrubStart } from '../polish/haptics';
import {
  activateTab,
  hoveredTab,
  registerTabActivation,
  registerTabFrame,
  setHoveredTab,
  tabAt,
} from './tabBarPress';

/** A finger that stays this long is holding, and may slide. */
const HOLD_MS = 180;

type Props = BottomTabBarButtonProps & { name: string };

export function TabBarButton({ name, onPress, children, style, ...rest }: Props) {
  const ref = useRef<HostInstance>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const press = useCallback(
    (e?: GestureResponderEvent) => onPress?.(e as GestureResponderEvent),
    [onPress],
  );
  useEffect(() => {
    registerTabActivation(name, () => press());
    return () => registerTabActivation(name, null);
  }, [name, press]);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, _y, width) => {
      registerTabFrame(name, { x, width });
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
      // The tap. Not after a hold: a hold that ended on this tab is
      // handled below, and a hold that slid away must not also tap here.
      onPress={e => {
        if (held.current) return;
        press(e);
      }}
      onTouchStart={e => {
        held.current = false;
        setHoveredTab(name);
        clearHold();
        holdTimer.current = setTimeout(() => {
          held.current = true;
          hapticScrubStart();
        }, HOLD_MS);
        // Where the bar is NOW, not where it was laid out: it slides
        // away while reading and back, and the keyboard can lift it.
        measure();
        void e;
      }}
      onTouchMove={e => {
        if (!held.current) return;
        const over = tabAt(e.nativeEvent.pageX);
        if (over) setHoveredTab(over);
      }}
      onTouchEnd={() => {
        clearHold();
        if (held.current) {
          const target = hoveredTab();
          if (target) activateTab(target);
        }
        setHoveredTab(null);
      }}
      onTouchCancel={() => {
        clearHold();
        held.current = false;
        setHoveredTab(null);
      }}>
      {children}
    </Pressable>
  );
}
