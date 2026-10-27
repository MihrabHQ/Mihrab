import Svg, { Path } from 'react-native-svg';

/** The way into Minimal: one dot in an empty frame — a page with one thing on it. */
export function MinimalGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M5.5 3.5h9A2 2 0 0 1 16.5 5.5v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M10 10m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0" fill={color} />
    </Svg>
  );
}
