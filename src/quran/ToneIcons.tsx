/**
 * The page tone's icons: one drawing per stop of the cycle.
 *
 * ── WHY DRAWINGS, NOT TEXT GLYPHS ─────────────────────────────────────
 *
 * The control carried `☀︎ ◐︎ ☾︎ A` as text: a sun, a half-lit disc for
 * sepia that said nothing about warmth, a moon, and a letter for auto —
 * four characters from four parts of a font, drawn at different weights,
 * which Android would render as emoji unless told not to. These are four
 * icons of one stroke, like the controls either side of them:
 *
 *   paper   a sun — the light page
 *   sepia   a sun low on the horizon — the warm page
 *   night   a crescent with a star — the dark page
 *   auto    a disc half lit — light or dark, as the app is
 *
 * They name the tone a tap goes TO, as the control always has.
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import type { MushafToneChoice } from './mushafTone';

export type ToneIconName = 'sun' | 'sunset' | 'moon' | 'auto';

/** Which drawing a tone choice gets — so the four can be asserted distinct. */
export function toneIconName(tone: MushafToneChoice): ToneIconName {
  return tone === 'sepia' ? 'sunset' : tone === 'night' ? 'moon' : tone === 'auto' ? 'auto' : 'sun';
}

export function ToneIcon({
  tone,
  color,
  size = 18,
}: {
  tone: MushafToneChoice;
  color: string;
  size?: number;
}) {
  const stroke = { stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const };
  switch (toneIconName(tone)) {
    case 'sun':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={4} {...stroke} />
          <Path
            d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
            {...stroke}
          />
        </Svg>
      );
    case 'sunset':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Half a sun on the horizon, its rays low. */}
          <Path d="M7.5 15.5a4.5 4.5 0 0 1 9 0" {...stroke} />
          <Path d="M12 6v2.5M4 15.5h1.5M18.5 15.5H20M6.3 9.8l1.1 1.1M17.7 9.8l-1.1 1.1" {...stroke} />
          <Path d="M3 19.5h18" {...stroke} />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"
            {...stroke}
            strokeLinejoin="round"
          />
          {/* A small star, so a crescent alone is not mistaken for sepia's arc. */}
          <Path d="M17.5 4.5v3M16 6h3" {...stroke} strokeWidth={1.6} />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={8} {...stroke} />
          {/* The lit half: light or dark as the app decides. */}
          <Path d="M12 4a8 8 0 0 1 0 16Z" fill={color} />
        </Svg>
      );
  }
}
