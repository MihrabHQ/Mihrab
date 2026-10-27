import { isMacCatalyst } from '../responsive/breakpoints';

/**
 * Where Minimal is offered: the phone and the iPad, not the Mac. A Mac
 * window is a desktop's, with a pointer and a keyboard, any size the
 * reader drags it to — the dots, the swipe between pages and the sheet
 * pulled up from the foot are a phone's hand. On the Mac the switch is not
 * shown, and a `minimalUi` carried over (a backup, an old build) is read
 * as off — by the app and by the colour rules below alike.
 */
export const MINIMAL_OFFERED = !isMacCatalyst;

/** Whether Minimal is on here: asked for, and offered on this device. */
export function minimalOn(settings: { minimalUi: boolean }): boolean {
  return MINIMAL_OFFERED && settings.minimalUi;
}

/**
 * Minimal wears the Sky theme's colours or the classic ones.
 *
 * Minimal is drawn for the Sky theme's hour (what it comes on in, see
 * `enteringMinimal`) or the app's own paper and ink: a colour theme (`tintedSurfaces`) or the system's colours
 * (`useSystemDynamicTheme`, Material You / Liquid Glass) repaints the
 * surfaces it stands on, and neither is offered while it is on. Turning
 * Minimal on sets both back to Classic, and any settings that hold both at
 * once — read from disk, or patched together — come out Classic: the
 * widget, the notifications and the reader read the same answer as the
 * app, with nothing to reconcile at each.
 *
 * Turning Minimal off leaves Classic; a theme is one tap away again.
 */
export function minimalLook<T extends { minimalUi: boolean; tintedSurfaces: boolean; useSystemDynamicTheme: boolean }>(
  settings: T,
): T {
  if (!minimalOn(settings) || (!settings.tintedSurfaces && !settings.useSystemDynamicTheme)) return settings;
  return { ...settings, tintedSurfaces: false, useSystemDynamicTheme: false };
}

/**
 * Turning Minimal on puts the app in the Sky theme's Vibrant colours —
 * the sky Minimal's pages were drawn for. Only the turn: Classic stays a
 * choice under Minimal (Settings → Appearance → Theme), and a reader who
 * picks it afterwards keeps it.
 */
export function enteringMinimal<T extends { minimalUi: boolean; appearance: string; skyVariant: string }>(
  prev: { minimalUi: boolean },
  next: T,
): T {
  if (!MINIMAL_OFFERED || prev.minimalUi || !next.minimalUi) return next;
  return { ...next, appearance: 'sky', skyVariant: 'vibrant' };
}
