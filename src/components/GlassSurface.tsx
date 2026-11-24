import type { ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useAppPalette } from '../hooks/useAppPalette';

// The blur is the app's own native view, on iOS only (ios/PrayerApp/
// GlassBlur.m; see the Platform.OS === 'ios' gate below): a
// UIVisualEffectView with a style, a radius and a plain colour for Reduce
// Transparency. It took the place of @react-native-community/blur, which is
// no longer maintained and whose Android half pulled a library from jitpack
// that no Android build wanted. Asked for on iOS only — no other platform
// has a view of that name, and react-native-web has no
// `requireNativeComponent` to import, so it is reached for here.
const BlurView: any =
  Platform.OS === 'ios'
    ? require('react-native').requireNativeComponent('GlassBlur')
    : null;

/**
 * GlassSurface — a card surface that renders as translucent blurred material
 * ("Liquid Glass") on iOS when the system/Liquid-Glass palette is active, and
 * falls back to a solid `palette.card` view everywhere else.
 *
 * Pass shape/spacing (borderRadius, padding, margins) via `style` — do NOT pass
 * a backgroundColor; the surface supplies its own (blur in glass mode, solid
 * otherwise). The blur is clipped to the style's borderRadius via overflow.
 *
 * `intensity` maps to the iOS material thickness:
 *   thin    → systemThinMaterial   (lightest, most see-through)
 *   regular → systemMaterial       (default card)
 *   thick   → systemThickMaterial  (heaviest, most opaque — hero surfaces)
 * These materials adapt to light/dark automatically.
 */
type Props = ViewProps & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  intensity?: 'thin' | 'regular' | 'thick';
  /** Subtle hairline to lift the glass off the background (iOS glass only). */
  bordered?: boolean;
  /** Solid colour used in the non-glass fallback (defaults to palette.card).
   *  Lets callers preserve a tinted surface (e.g. the hero's accent bg). */
  fallbackColor?: ColorValue;
};

export function GlassSurface({
  style,
  children,
  intensity = 'regular',
  bordered = true,
  fallbackColor,
  ...rest
}: Props) {
  const { palette, isDark } = useAppPalette();
  const glass = palette.glass && Platform.OS === 'ios';

  if (!glass) {
    return (
      <View
        style={[{ backgroundColor: fallbackColor ?? palette.card }, style]}
        {...rest}>
        {children}
      </View>
    );
  }

  // The basic UIBlurEffect styles: the "systemMaterial*" variants rendered
  // dark regardless of appearance under the new architecture, while
  // 'xlight'/'light'/'dark' track the mode reliably — and they are the three
  // GlassBlur.m knows. Intensity nudges the light-mode strength.
  const blurType = isDark
    ? 'dark'
    : intensity === 'thin'
      ? 'xlight'
      : 'light';

  return (
    <View
      style={[
        styles.clip,
        bordered && styles.hairline,
        style,
        // Never let a caller's backgroundColor cover the blur.
        { backgroundColor: 'transparent' },
      ]}
      {...rest}>
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType={blurType}
        blurAmount={18}
        reducedTransparencyFallbackColor={palette.card as string}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // Apple's glass uses a faint top-edge separator; a 0.5pt hairline in a
  // translucent white reads correctly on both light and dark material.
  hairline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});
