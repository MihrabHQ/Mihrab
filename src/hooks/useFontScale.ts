/**
 * The system's text size, as a value React sees change.
 *
 * In place of `PixelRatio.getFontScale()` read while rendering: that is a
 * read of something outside React, which a compiled component asks once
 * and keeps (tools/compiler-impure.js). The window's dimensions are a
 * subscription, and carry the same number.
 */
import { useWindowDimensions } from 'react-native';

export function useFontScale(): number {
  const { fontScale } = useWindowDimensions();
  return Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
}
