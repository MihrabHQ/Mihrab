/**
 * The tab bar's press, shared between its buttons.
 *
 * A press was a press: hold a tab and slide to the next and nothing
 * followed, because the touch belongs to the button it started in. So the
 * press is a fact the bar keeps here: touch down names the tab, a hold
 * marks it held, a slide names whichever tab the finger is over, and lift
 * opens that one. There is no drawn feedback — the bar's own icon tint
 * says where you are, and a haptic tick marks each tab crossed.
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
  /** Held long enough to slide. */
  held: boolean;
  /** The tab a lift landed on. */
  settled: string | null;
};

const frames = new Map<string, TabFrame>();
const activations = new Map<string, () => void>();
const IDLE: TabBarPress = { hovered: null, held: false, settled: null };
let state: TabBarPress = IDLE;
const listeners = new Set<() => void>();

function set(next: Partial<TabBarPress>): void {
  const merged = { ...state, ...next };
  if (
    merged.hovered === state.hovered &&
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
  set({ hovered: name, held: false, settled: null });
}

/** The finger has stayed: from here it may slide. */
export function holdTab(): void {
  if (state.hovered) set({ held: true });
}

/**
 * A held finger moved to window x. True when that took it into another
 * tab — the moment for a tick.
 */
export function slideTo(pageX: number): boolean {
  if (!state.held) return false;
  const over = tabAt(pageX) ?? state.hovered;
  if (over === state.hovered) return false;
  set({ hovered: over });
  return true;
}

/** The finger lifted over `name` (or went away, with null). */
export function releaseTab(name: string | null): void {
  set({ hovered: null, held: false, settled: name });
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
