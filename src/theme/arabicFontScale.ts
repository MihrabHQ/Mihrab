/**
 * ── ARABIC KEEPS ITS LEADING AT EVERY SYSTEM TEXT SIZE (Android) ──────
 *
 * A Play review from a Redmi Note 14 Pro (Android 16, 2.38.3): "fix the
 * Arabic — some is cut off, some runs over the shadda". Reproduced on an
 * Android 17 emulator with the system text size at 1.3×: in the du'as,
 * Ayat al-Kursi's last line lost the foot of its letters (the tails of
 * ي and م under "ٱلْعَظِيمِ" cut flat), and a kasra of one line touched
 * the shadda of the next ("وَسِعَ" over "كُرْسِيُّهُ").
 *
 * React Native sets a Text's font size and its line height each through
 * Android's `sp` conversion, one number at a time. Since Android 14 that
 * conversion is NON-LINEAR — large sizes grow less than small ones, so a
 * heading does not double with the body — and a line height, being the
 * larger number, grows less than the font it spaces. At 1.3× a 22 sp
 * Arabic line grew by about a fifth and its 44 sp leading hardly at all.
 * Latin survives the squeeze; fully vocalised Arabic, whose marks stack
 * above and below the letters, does not: the lines close up until the
 * marks of one meet the next, and the last line, which is exactly as tall
 * as its line height, loses its descenders.
 *
 * iOS scales both by the same factor, which is what the sizes here were
 * set for (`arabicTextStyle`: "call sites must pair this with a roomier
 * lineHeight … or diacritics clip"). So on Android the Arabic faces take
 * the system's scale THEMSELVES, both numbers by the same factor, with
 * font scaling then turned off for that Text so Android does not apply it
 * a second time. The ratio each call site chose survives every setting;
 * `maxFontSizeMultiplier` is honoured as the cap it already was.
 *
 * Only the app's own Arabic faces, and only where a line height is set —
 * a Text with no line height gets the font's own, which scales with it.
 * The muṣḥaf pages are drawings that turn font scaling off already, and
 * are left alone by that.
 */

/** The bundled Arabic faces (`FONTS.arabicBody`, `FONTS.arabicQuran` on Android). */
export const ARABIC_FACES: ReadonlySet<string> = new Set(['Amiri', 'AmiriQuran']);

type Scalable = {
  fontFamily?: unknown;
  fontSize?: unknown;
  lineHeight?: unknown;
};

/**
 * The size and line height to draw an Arabic Text at, scaled linearly by
 * the system's font scale — or null when nothing needs to change: not an
 * Arabic face, no line height of its own, scaling already off, or a scale
 * at or under 1 (where Android's conversion is linear anyway).
 *
 * Whole points for the size (a fractional size renders soft on Android),
 * and the line height from the ROUNDED size, so the ratio is the one the
 * call site chose.
 */
export function arabicScaledMetrics(
  style: Scalable | null | undefined,
  fontScale: number,
  opts: { allowFontScaling?: boolean; maxFontSizeMultiplier?: number | null } = {},
): { fontSize: number; lineHeight: number } | null {
  if (!style || opts.allowFontScaling === false) return null;
  const { fontFamily, fontSize, lineHeight } = style;
  if (typeof fontFamily !== 'string' || !ARABIC_FACES.has(fontFamily)) return null;
  if (typeof fontSize !== 'number' || typeof lineHeight !== 'number') return null;
  if (!(fontSize > 0) || !(lineHeight > 0)) return null;
  let scale = Number.isFinite(fontScale) ? fontScale : 1;
  const cap = opts.maxFontSizeMultiplier;
  if (typeof cap === 'number' && cap >= 1) scale = Math.min(scale, cap);
  if (scale <= 1) return null;
  const size = Math.round(fontSize * scale);
  return { fontSize: size, lineHeight: Math.round((lineHeight * size) / fontSize) };
}
