/**
 * Device class — phone or large, from the PHYSICAL SCREEN's shorter side
 * (<600dp = phone, the classic Android phone/tablet line).
 *
 * It used to be a constant, answered once at import, on the reasoning that
 * a phone cannot become an iPad mid-session and only the window changes.
 * A foldable does exactly that: the cover screen is a phone and the inner
 * screen is a tablet, and the same process moves between them. Answered
 * once, a book opened on the cover screen stayed in the phone reader after
 * unfolding — zoomed to 850dp, five lines a screen — and one opened
 * unfolded stayed in the spread reader on the cover screen.
 *
 * So it follows the SCREEN, not the window. On a phone, an iPad and a Mac
 * the screen never changes, so the answer never does either: an iPad in
 * Split View or Stage Manager keeps the large class however narrow its
 * window, as before. Only a device whose screen itself changes — a
 * foldable folding or unfolding — gets a new answer.
 *
 * Components read it with `useDeviceClass()`, which re-renders on the
 * change; code outside React reads `currentDeviceClass()` at the moment it
 * needs it, never a value kept from earlier.
 */
import { useEffect, useState } from 'react';
import { Dimensions, type ScaledSize } from 'react-native';

export type DeviceClass = 'phone' | 'large';

export function deviceClassOf(screen: { width: number; height: number }): DeviceClass {
  return Math.min(screen.width, screen.height) < 600 ? 'phone' : 'large';
}

/** The class of the screen the app is on now. */
export function currentDeviceClass(): DeviceClass {
  return deviceClassOf(Dimensions.get('screen'));
}

/** The class of the screen the app is on, updated when the screen changes. */
export function useDeviceClass(): DeviceClass {
  const [cls, setCls] = useState<DeviceClass>(currentDeviceClass);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }: { screen: ScaledSize }) => {
      setCls(deviceClassOf(screen));
    });
    // A change between the first render and this effect.
    setCls(currentDeviceClass());
    return () => sub.remove();
  }, []);
  return cls;
}
