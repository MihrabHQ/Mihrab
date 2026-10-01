/**
 * A tab's button — see `tabBarPress` for what it is for.
 *
 * A plain Pressable with NO ripple: the feedback is the bubble drawn in
 * the bar's background (`TabBarBubble`). On top of the tap, a
 * hold-and-slide: keep a finger on a tab for a moment and the bubble
 * lifts and follows the finger along the bar; lift over a tab, and that
 * is the tab opened. The touch stays with the button it began in — that
 * is how touches work — so the button reads the finger's window x from
 * the touch events it keeps receiving and hands it to the store.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, type GestureResponderEvent, type HostInstance } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { hapticScrubStart } from '../polish/haptics';
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

export function TabBarButton({ name, onPress, children, style, ...rest }: Props) {
  const ref = useRef<HostInstance>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (tabBarPress().held) return;
        press(e);
      }}
      onTouchStart={() => {
        // Where the bar is NOW, not where it was laid out: it slides
        // away while reading and back, and the keyboard can lift it.
        measure();
        pressTab(name);
        clearHold();
        holdTimer.current = setTimeout(() => {
          holdTab();
          hapticScrubStart();
        }, HOLD_MS);
      }}
      onTouchMove={e => slideTo(e.nativeEvent.pageX)}
      onTouchEnd={() => {
        clearHold();
        const { held } = tabBarPress();
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
