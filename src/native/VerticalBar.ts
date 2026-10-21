/**
 * The vertical bar — iPhone Duo, iOS 27.1.
 *
 * On a phone with one, the system moves the status bar off the top edge into
 * a column down one side: the camera, the clock and the status icons at its
 * top, and below them room the system means for the app's own bars (a native
 * tab bar moves there by itself). The column is a safe-area inset on that
 * side, and the page ran under it — chips and text behind the clock.
 *
 * So, on such a phone: every page keeps clear of the column (`useVerticalBarInsets`),
 * Today's sky alone runs under it (the hero is the one surface the status bar is
 * meant to sit on), and the tab bar is drawn IN the column (`VerticalTabBar`)
 * rather than along the bottom.
 *
 * What the column is comes from UIKit (ios/PrayerApp/MihrabVerticalBar.m):
 * the edge (`UITraitCollection.verticalBarEdge`), the band's width (the
 * safe-area inset on that edge) and how far down its occluded top reaches
 * (`reservedRegionsOfKind: occlusionRegionKind`). Everywhere else — Android,
 * older iOS, an SDK without the API — there is no bar and nothing changes.
 */
import { useEffect, useState } from 'react';
import { AppState, Dimensions, NativeModules, Platform } from 'react-native';

export type VerticalBar = {
  /** The physical edge the column is on. */
  side: 'left' | 'right';
  /** The column's width, in points (the safe-area inset on that edge). */
  width: number;
  /** Where the occluded top (camera, clock, status icons) ends, in points from the window's top. */
  occludedTo: number;
};

type Reading = {
  edge: 'left' | 'right' | null;
  safe?: { top: number; left: number; bottom: number; right: number };
  regions?: { x: number; y: number; width: number; height: number }[];
};

const Native: { read?: () => Promise<Reading> } | undefined =
  Platform.OS === 'ios' ? NativeModules.MihrabVerticalBar : undefined;

/** From the native reading: a bar, or null when there is none (or it is not on a side). */
export function verticalBarFrom(r: Reading | null | undefined, windowWidth: number): VerticalBar | null {
  if (!r || (r.edge !== 'left' && r.edge !== 'right') || !r.safe) return null;
  const width = r.edge === 'left' ? r.safe.left : r.safe.right;
  if (!(width > 0)) return null;
  // The occluded regions in the column: the ones that touch its edge.
  const inColumn = (r.regions ?? []).filter(g =>
    r.edge === 'right' ? g.x + g.width >= windowWidth - width : g.x <= width,
  );
  const occludedTo = inColumn.reduce((m, g) => Math.max(m, g.y + g.height), r.safe.top);
  return { side: r.edge, width, occludedTo };
}

let current: VerticalBar | null = null;
const listeners = new Set<(b: VerticalBar | null) => void>();

function same(a: VerticalBar | null, b: VerticalBar | null) {
  return a === b || (!!a && !!b && a.side === b.side && a.width === b.width && a.occludedTo === b.occludedTo);
}

async function refresh() {
  if (!Native?.read) return;
  try {
    const next = verticalBarFrom(await Native.read(), Dimensions.get('window').width);
    if (same(next, current)) return;
    current = next;
    listeners.forEach(l => l(next));
  } catch {
    // No reading: keep what we had.
  }
}

if (Native?.read) {
  refresh();
  // A rotation or a fold changes the column; so can returning to the app.
  // The safe area settles a frame after the window does, so read twice.
  Dimensions.addEventListener('change', () => {
    refresh();
    setTimeout(() => refresh(), 250);
  });
  AppState.addEventListener('change', s => {
    if (s === 'active') refresh();
  });
}

/** The vertical bar, or null on every device without one. */
export function useVerticalBar(): VerticalBar | null {
  const [bar, setBar] = useState(current);
  useEffect(() => {
    listeners.add(setBar);
    setBar(current);
    return () => {
      listeners.delete(setBar);
    };
  }, []);
  return bar;
}

/** Padding that keeps a page clear of the column: `{ paddingRight: w }`, `{ paddingLeft: w }`, or nothing. */
export function useVerticalBarInsets(): { paddingLeft?: number; paddingRight?: number } | null {
  const bar = useVerticalBar();
  if (!bar) return null;
  return bar.side === 'right' ? { paddingRight: bar.width } : { paddingLeft: bar.width };
}
