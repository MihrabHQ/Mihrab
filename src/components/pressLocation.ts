/**
 * Where in the pressed box a press landed, on every platform.
 *
 * iOS and Android put the point on the event as `nativeEvent.locationX`,
 * measured from the pressable's own box. On the web — the browser and the
 * desktop app — a Pressable's `onPress` is fired by the browser's `click`,
 * whose event is a plain MouseEvent: no `locationX` at all. Arithmetic on it
 * gave NaN, and the muṣḥaf's word lookup, finding no word at NaN, fell back
 * to the line's last word — so every press on a line opened the ayah that
 * ENDS the line, and an ayah that begins and ends inside one (Al-Baqarah 1,
 * Al-A'raf 1 — the short ones) could not be opened at all.
 *
 * So: `locationX` where the platform gives it; else the click's `clientX`
 * against the pressed element's box, scaled back to layout units when the
 * page is drawn scaled (a CSS transform makes the box on screen a different
 * width from the box laid out).
 */
import type { GestureResponderEvent } from 'react-native';

type WebBox = { getBoundingClientRect?: () => { left: number; width: number }; offsetWidth?: number };

export function pressLocationX(e: GestureResponderEvent): number {
  const ne = e.nativeEvent as unknown as { locationX?: number; clientX?: number };
  if (typeof ne.locationX === 'number' && Number.isFinite(ne.locationX)) return ne.locationX;
  const box = (e as unknown as { currentTarget?: WebBox | null }).currentTarget;
  if (box && typeof box.getBoundingClientRect === 'function' && typeof ne.clientX === 'number') {
    const r = box.getBoundingClientRect();
    const laidOut = typeof box.offsetWidth === 'number' && box.offsetWidth > 0 ? box.offsetWidth : r.width;
    const scale = r.width > 0 ? laidOut / r.width : 1;
    return (ne.clientX - r.left) * scale;
  }
  return NaN;
}
