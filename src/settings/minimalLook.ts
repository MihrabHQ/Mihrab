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
  if (!settings.minimalUi || (!settings.tintedSurfaces && !settings.useSystemDynamicTheme)) return settings;
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
  if (prev.minimalUi || !next.minimalUi) return next;
  return { ...next, appearance: 'sky', skyVariant: 'vibrant' };
}
