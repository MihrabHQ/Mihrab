/**
 * A foldable's hinge, as the layout needs it — Android only.
 *
 * `FoldPostureModule.kt` reports the fold in the app's window (dp, window
 * coordinates) and whether it is half open. Two postures matter:
 *
 *   book      half open, the hinge running down the screen. Content
 *             centred on the screen sits on the crease — Today's prayer
 *             rows, a list, a sheet were split down the middle.
 *   tabletop  half open, the hinge across the screen: the top half stands
 *             up, the bottom lies on the table.
 *
 * Flat, or folded onto the cover screen, there is no posture and every
 * layout is what it always was. iOS has no module and never has one.
 */
import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isRtlLanguage } from '../i18n/layoutDirection';
import { useVerticalBar } from './VerticalBar';

export type Hinge = { left: number; top: number; right: number; bottom: number };

export type FoldPosture =
  | { kind: 'book'; hinge: Hinge }
  | { kind: 'tabletop'; hinge: Hinge }
  | null;

type Reading = {
  state?: 'none' | 'flat' | 'half';
  orientation?: 'vertical' | 'horizontal';
  separating?: boolean;
} & Partial<Hinge>;

const Native: { read?: () => Promise<Reading> } | undefined =
  Platform.OS === 'android' ? NativeModules.MihrabFoldPosture : undefined;

export function postureFrom(r: Reading | null | undefined): FoldPosture {
  if (!r || r.state !== 'half') return null;
  const { left, top, right, bottom } = r;
  if ([left, top, right, bottom].some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    return null;
  }
  const hinge = { left, top, right, bottom } as Hinge;
  return r.orientation === 'vertical' ? { kind: 'book', hinge } : { kind: 'tabletop', hinge };
}

let current: FoldPosture = null;
const listeners = new Set<(p: FoldPosture) => void>();

function set(next: FoldPosture) {
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach(l => l(next));
}

if (Native?.read) {
  Native.read()
    .then(r => set(postureFrom(r)))
    .catch(() => undefined);
  new NativeEventEmitter(Native as never).addListener('FoldPosture', (r: Reading) =>
    set(postureFrom(r)),
  );
}

export function useFoldPosture(): FoldPosture {
  const [p, setP] = useState<FoldPosture>(current);
  useEffect(() => {
    listeners.add(setP);
    setP(current);
    return () => {
      listeners.delete(setP);
    };
  }, []);
  return p;
}

/**
 * Book posture: the pane content keeps to, as padding on the window — the
 * pane on the side the language reads from (the left in English, the right
 * in Arabic), so a single column of content sits on one page of the book
 * instead of across the crease. Null in every other posture.
 */
export function bookPanePadding(
  posture: FoldPosture,
  windowWidth: number,
  rtl: boolean,
): { paddingLeft?: number; paddingRight?: number } | null { // rtl-safe: the hinge is on a physical side
  if (posture?.kind !== 'book' || !(windowWidth > 0)) return null;
  return rtl
    ? { paddingLeft: Math.max(0, posture.hinge.right) } // rtl-safe: the hinge is on a physical side
    : { paddingRight: Math.max(0, windowWidth - posture.hinge.left) }; // rtl-safe: the hinge is on a physical side
}

export function useBookPanePadding(
  windowWidth: number,
): { paddingLeft?: number; paddingRight?: number } | null { // rtl-safe: the hinge is on a physical side
  const posture = useFoldPosture();
  const rtl = useAppRtl();
  return bookPanePadding(posture, windowWidth, rtl);
}

/**
 * Book posture: a centred dialog's padding, moved onto one page. `base` is
 * the padding the dialog already keeps from the window's edges; the side
 * toward the crease adds the other page to it. Null in every other
 * posture, so callers keep their own padding untouched.
 *
 * Beside an iPhone's vertical bar (iPhone Duo) the bar's side adds the bar
 * instead: the dialog centres in the screen the app has, and its card no
 * longer runs in under the system's clock and column.
 */
export function useBookPaneInset(
  base: number,
): { paddingLeft: number; paddingRight: number } | null { // rtl-safe: the hinge is on a physical side
  const { width } = useWindowDimensions();
  const pad = useBookPanePadding(width);
  const bar = useVerticalBar();
  if (bar) {
    return {
      paddingLeft: base + (bar.side === 'left' ? bar.width : 0), // rtl-safe: the vertical bar is on a physical side
      paddingRight: base + (bar.side === 'right' ? bar.width : 0), // rtl-safe: the vertical bar is on a physical side
    };
  }
  if (!pad) return null;
  return {
    paddingLeft: base + (pad.paddingLeft ?? 0), // rtl-safe: the hinge is on a physical side
    paddingRight: base + (pad.paddingRight ?? 0), // rtl-safe: the hinge is on a physical side
  };
}

/**
 * The app language's direction, read defensively: a screen rendered with a
 * translation stub (tests) has no `i18n`, and must still lay out.
 */
export function useAppRtl(): boolean {
  const { i18n } = useTranslation();
  return isRtlLanguage(i18n?.language ?? '');
}
