/**
 * The tab bar's press, shared between its buttons and its bubble.
 *
 * ── WHY A STORE ───────────────────────────────────────────────────────
 *
 * Two things the default bar could not do. Its press feedback on Android
 * was a borderless ripple: a circle the size of the whole button, centred
 * on the button's box rather than the glyph, spilling over the top of
 * the pill. And a press was a press: hold a tab and slide to the next and
 * nothing followed the finger, because the touch belongs to the button
 * it started in.
 *
 * So the press is a fact the bar keeps here, and anyone can read it. The
 * buttons write it (`TabBarButton`): touch down names the tab, a hold
 * marks it held, a slide moves the finger and names whichever tab it is
 * over, lift says which tab the press SETTLED on and clears the rest.
 * One bubble reads it (`TabBarBubble`): it is drawn in the bar's own
 * background, so it can never leave the bar, under the tab that is
 * pressed — and while held, under the finger, gliding.
 *
 * The frames let a button know what is under a finger that has left it:
 * every button registers where it sits in the window, and `tabAt` says
 * which one a point falls in.
 */
import { useSyncExternalStore } from 'react';

/** A button's box in the window; y and height are optional for callers that only need x. */
export type TabFrame = { x: number; width: number; y?: number; height?: number };

export type TabBarPress = {
  /** The tab under the finger, or null with no finger down. */
  hovered: string | null;
  /** The finger's window x while HELD; null before the hold and after. */
  fingerX: number | null;
  /** Held long enough to slide. */
  held: boolean;
  /** The tab a lift landed on, for the bubble to glide to as it fades. */
  settled: string | null;
};

const frames = new Map<string, TabFrame>();
const activations = new Map<string, () => void>();
const IDLE: TabBarPress = { hovered: null, fingerX: null, held: false, settled: null };
let state: TabBarPress = IDLE;
const listeners = new Set<() => void>();

function set(next: Partial<TabBarPress>): void {
  const merged = { ...state, ...next };
  if (
    merged.hovered === state.hovered &&
    merged.fingerX === state.fingerX &&
    merged.held === state.held &&
    merged.settled === state.settled
  ) {
    return;
  }
  state = merged;
  for (const l of listeners) l();
}

/** Where a tab's button sits, in window coordinates. Null to forget it. */
export function registerTabFrame(name: string, frame: TabFrame | null): void {
  if (frame) frames.set(name, frame);
  else frames.delete(name);
}

export function tabFrame(name: string): TabFrame | undefined {
  return frames.get(name);
}

/** What pressing a tab does — the navigator's own `onPress` for it. */
export function registerTabActivation(name: string, activate: (() => void) | null): void {
  if (activate) activations.set(name, activate);
  else activations.delete(name);
}

/** The tab whose button a window x falls in, if any. */
export function tabAt(pageX: number): string | null {
  for (const [name, f] of frames) {
    if (pageX >= f.x && pageX < f.x + f.width) return name;
  }
  return null;
}

/** Press the named tab as its button would. */
export function activateTab(name: string): void {
  activations.get(name)?.();
}

/** A finger came down on a tab. */
export function pressTab(name: string): void {
  set({ hovered: name, fingerX: null, held: false, settled: null });
}

/** The finger has stayed: from here it may slide. */
export function holdTab(): void {
  if (state.hovered) set({ held: true });
}

/** A held finger moved to window x. */
export function slideTo(pageX: number): void {
  if (!state.held) return;
  set({ fingerX: pageX, hovered: tabAt(pageX) ?? state.hovered });
}

/** The finger lifted over `name` (or went away, with null). */
export function releaseTab(name: string | null): void {
  set({ hovered: null, fingerX: null, held: false, settled: name });
}

export function tabBarPress(): TabBarPress {
  return state;
}

export function hoveredTab(): string | null {
  return state.hovered;
}

export function useTabBarPress(): TabBarPress {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => IDLE,
  );
}

/** Test seam. */
export function _resetTabBarPress(): void {
  frames.clear();
  activations.clear();
  state = IDLE;
  listeners.clear();
}
