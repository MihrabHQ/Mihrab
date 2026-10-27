/**
 * The sky's gradients as native backgrounds, not SVG.
 *
 * react-native-svg backs every <Svg> view on Android with an ARGB bitmap
 * the size of the view, made on its first draw and kept until the view
 * goes: a full-screen sky on a 1280×2856 phone is 14.6 MB of it, for two
 * gradients a shader paints for nothing. React Native draws CSS
 * gradients itself (`backgroundImage`), with a shader at draw time and
 * no bitmap at all — so the sky, its halo, the fade under the status
 * bar, the sheet's veil and the dots' fade are views with a background,
 * and the only bitmaps left on Today are the moon's 22 points.
 */

/** `#rrggbb` (or `#rgb`) at `alpha`, as `rgba()`; any other colour as it is. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Number(a.toFixed(3))})`;
}

/** A top-to-bottom gradient through `stops` ([colour, 0…1]). */
export function linearDown(stops: ReadonlyArray<readonly [string, number]>): string {
  return `linear-gradient(to bottom, ${stops.map(([c, at]) => `${c} ${pct(at)}`).join(', ')})`;
}

/**
 * A circle of `color` at `opacity` in its middle, fading to nothing at
 * the view's nearest side — for a square view sized to the glow and
 * placed on the body.
 *
 * ALWAYS THIS FORM. React Native 0.87's parser misreads a radial
 * gradient given both a size and a place — `circle 140px at 312px 88px`
 * comes out a circle the size of the PLACE's numbers, at the view's
 * middle — and the moon's halo stood in the middle of the screen as a
 * pale wash while the moon sat unlit in its corner. A square view at
 * the body with `closest-side` needs neither (__tests__/skyPaint).
 */
export function radialGlow(color: string, opacity: number): string {
  return `radial-gradient(circle closest-side at 50% 50%, ${withAlpha(color, opacity)} 0%, ${withAlpha(color, 0)} 100%)`;
}

function pct(at: number): string {
  return `${Number((Math.max(0, Math.min(1, at)) * 100).toFixed(2))}%`;
}

