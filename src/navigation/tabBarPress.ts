/**
 * The tab bar's press, shared between its buttons and its icons.
 *
 * ── WHY A STORE ───────────────────────────────────────────────────────
 *
 * Two things the default bar could not do. Its press feedback on Android
 * was a borderless ripple: a circle the size of the whole button, centred
 * on the button's box rather than the glyph, which on a six-tab pill
 * drew a grey disc off to one side of the icon it meant. And a press was
 * a press: hold a tab and slide to the next and nothing followed the
 * finger, because the touch belongs to the button it started in.
 *
 * So the press is a fact the bar keeps here — WHICH tab is under the
 * finger, pressed or dragged to — and anyone can read it. The buttons
 * write it (`TabBarButton`): touch down writes the tab, a hold then a
 * slide writes whichever tab the finger is over, lift clears it. The
 * icons read it (`tabIcons`): each draws a halo behind its own glyph,
 * sized by the glyph, when its tab is the one written. The halo is
 * therefore centred on the icon by construction, and it follows a slide
 * because the slide is written here.
 *
 * The frames let a button know what is under a finger that has left it:
 * every button registers where it sits in the window, and `tabAt` says
 * which one a point falls in.
 */
import { useSyncExternalStore } from 'react';

type Frame = { x: number; width: number };

const frames = new Map<string, Frame>();
const activations = new Map<string, () => void>();
let hovered: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Where a tab's button sits, in window coordinates. Null to forget it. */
export function registerTabFrame(name: string, frame: Frame | null): void {
  if (frame) frames.set(name, frame);
  else frames.delete(name);
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

/** The tab under the finger, or null. */
export function setHoveredTab(name: string | null): void {
  if (hovered === name) return;
  hovered = name;
  emit();
}

export function hoveredTab(): string | null {
  return hovered;
}

/** Is this tab the one under the finger? Re-renders only its icon. */
export function useTabHovered(name: string): boolean {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => hovered === name,
    () => false,
  );
}

/** Test seam. */
export function _resetTabBarPress(): void {
  frames.clear();
  activations.clear();
  hovered = null;
  listeners.clear();
}
