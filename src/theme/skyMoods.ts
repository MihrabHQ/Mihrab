/**
 * THE SKY THEME'S COLOURS — one palette for each time of the day.
 *
 * Not the sky's own colours, read off the hero: those are a clock, drawn
 * to look like the sky. These are what the app wears at that hour, drawn
 * to feel like it — a night that is a deep indigo void with a glowing
 * cyan on it, not a grey; a dawn of violet with coral and sunshine; a
 * morning of warm cream; a midday of ice with an azure; a late afternoon
 * of gold; an evening of electric purple and magenta. Representative,
 * not realistic. Each is a complete palette, every token tuned for its
 * ground (text and muted ink clear AA on the page, the card and a
 * control; the accent clears AA on the page and the card, since it is
 * used as text; `__tests__/skyTheme.test.ts` pins it), and the day moves
 * from one to the next by mixing them in OKLab — except where the
 * ground turns from dark to light or back, which is a switch at a
 * moment of the day (sunrise; the middle of the sunset), because a mix
 * of a dark page and a light one is a grey page with unreadable ink.
 */
import type { SkyPassage } from '../screens/home/skyModel';
import { hexToOklch, lchToAb, oklabToHex } from './oklch';

export type SkyMoodName = 'night' | 'dawn' | 'morning' | 'midday' | 'golden' | 'sunset';

export type SkyMood = {
  name: SkyMoodName;
  isDark: boolean;
  /**
   * The hero's sky under this mood — three stops, top to foot. The foot is
   * the page colour, so the sky runs into the page without an edge: the
   * hero and the page are one composition, not a panel on a ground. The
   * middle stop carries the hour's glow — the horizon's coral at dawn, the
   * magenta at sunset, the amethyst of a night. The sun, the moon and the
   * stars are still drawn over it from the real sky.
   */
  heroTop: string;
  heroMid: string;
  heroFoot: string;
  bg: string;
  card: string;
  controlBg: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentBg: string;
  /** Text on the accent, filled. */
  onAccent: string;
  accentSurface: string;
  accentSurfaceStrong: string;
  accentHairline: string;
  danger: string;
  overlay: string;
};

export const SKY_MOODS: Record<SkyMoodName, SkyMood> = {
  /** Night & midnight: an obsidian indigo void, cyber cyan glowing on it, amethyst under the cards. */
  night: {
    name: 'night',
    isDark: true,
    heroTop: '#0A0818',
    heroMid: '#2A1B55',
    heroFoot: '#130F26',
    bg: '#130F26',
    card: '#1B1636',
    controlBg: '#261F49',
    border: '#352C5F',
    text: '#EEEAFF',
    muted: '#B4ADDB',
    accent: '#3DF2FF',
    accentBg: '#113A47',
    onAccent: '#0B1020',
    accentSurface: '#171230',
    accentSurfaceStrong: '#2A1B4F',
    accentHairline: '#6E45A8',
    danger: '#FF6B8B',
    overlay: 'rgba(8,5,20,0.7)',
  },
  /** Dawn: deep violet, electric coral for the hand, neon sunshine in the highlights. */
  dawn: {
    name: 'dawn',
    isDark: true,
    heroTop: '#140A33',
    heroMid: '#7A2E7E',
    heroFoot: '#1E1140',
    bg: '#1E1140',
    card: '#2A1A57',
    controlBg: '#38276E',
    border: '#4B3889',
    text: '#FFF4EC',
    muted: '#D6C4EE',
    accent: '#FF7B62',
    accentBg: '#4D2349',
    onAccent: '#2A0F08',
    accentSurface: '#24154A',
    accentSurfaceStrong: '#352162',
    accentHairline: '#9B51E0',
    danger: '#FF8A80',
    overlay: 'rgba(14,6,36,0.7)',
  },
  /** Early morning: warm cream, fresh coffee, the coral still the hand. */
  morning: {
    name: 'morning',
    isDark: false,
    heroTop: '#FF9A6E',
    heroMid: '#FFD7A8',
    heroFoot: '#FFF4E8',
    bg: '#FFF4E8',
    card: '#FFFDF9',
    controlBg: '#FFE8D4',
    border: '#F2D6BE',
    text: '#2A1B3D',
    muted: '#6E5C7E',
    accent: '#C2361F',
    accentBg: '#FFD9CF',
    onAccent: '#FFFFFF',
    accentSurface: '#FFEEDD',
    accentSurfaceStrong: '#FFE1C8',
    accentHairline: '#F0B48A',
    danger: '#B91C1C',
    overlay: 'rgba(42,27,61,0.45)',
  },
  /** Midday & afternoon: ice, crisp and breathable, an electric azure. */
  midday: {
    name: 'midday',
    isDark: false,
    heroTop: '#3F9BF5',
    heroMid: '#A6D6FF',
    heroFoot: '#EAF6FF',
    bg: '#EAF6FF',
    card: '#FFFFFF',
    controlBg: '#DBEDFF',
    border: '#BCDBF7',
    text: '#0B2545',
    muted: '#4A6A8C',
    accent: '#0968B8',
    accentBg: '#D4EBFF',
    onAccent: '#FFFFFF',
    accentSurface: '#E2F1FF',
    accentSurfaceStrong: '#D0E8FF',
    accentHairline: '#7FBEF5',
    danger: '#C62828',
    overlay: 'rgba(11,37,69,0.45)',
  },
  /** Late afternoon: gold, the tangerine warming up for the evening. */
  golden: {
    name: 'golden',
    isDark: false,
    heroTop: '#F2903F',
    heroMid: '#FFCF9A',
    heroFoot: '#FFF0E0',
    bg: '#FFF0E0',
    card: '#FFFAF3',
    controlBg: '#FFE2C8',
    border: '#F4CCAA',
    text: '#3A1A2E',
    muted: '#7B5468',
    accent: '#BD3424',
    accentBg: '#FFD5C9',
    onAccent: '#FFFFFF',
    accentSurface: '#FFEAD6',
    accentSurfaceStrong: '#FFDDBF',
    accentHairline: '#EFA46B',
    danger: '#B91C1C',
    overlay: 'rgba(58,26,46,0.45)',
  },
  /** Sunset & evening: electric purple, hyper magenta, the tangerine's last glow. */
  sunset: {
    name: 'sunset',
    isDark: true,
    heroTop: '#2B0A3D',
    heroMid: '#C2256F',
    heroFoot: '#24092F',
    bg: '#24092F',
    card: '#331245',
    controlBg: '#441B5A',
    border: '#5C2C75',
    text: '#FFEFF7',
    muted: '#E3B9D6',
    accent: '#FF57A6',
    accentBg: '#5E1C4F',
    onAccent: '#2A0616',
    accentSurface: '#2C0E3A',
    accentSurfaceStrong: '#3F1655',
    accentHairline: '#8A2387',
    danger: '#FF5E62',
    overlay: 'rgba(20,4,30,0.7)',
  },
};

/**
 * Which mood, or which two and how far between them, this moment of the
 * sky is — see the top of the file for the switches.
 */
export function skyMoodAt(passage: SkyPassage, t: number): { from: SkyMood; to: SkyMood; u: number } {
  const k = Math.max(0, Math.min(1, t));
  const M = SKY_MOODS;
  switch (passage) {
    case 'night':
      return { from: M.night, to: M.night, u: 0 };
    case 'dawn':
      // Out of the night into the dawn over its first third, then the dawn.
      return k < 0.35 ? { from: M.night, to: M.dawn, u: k / 0.35 } : { from: M.dawn, to: M.dawn, u: 0 };
    case 'day':
      // Sunrise is the switch to light: the morning, warming into the midday.
      return k < 0.25 ? { from: M.morning, to: M.midday, u: k / 0.25 } : { from: M.midday, to: M.midday, u: 0 };
    case 'sunset':
      // The afternoon turns gold; halfway to Maghrib the evening switches on.
      return k < 0.5 ? { from: M.midday, to: M.golden, u: k / 0.5 } : { from: M.sunset, to: M.sunset, u: 0 };
    case 'dusk':
      return { from: M.sunset, to: M.night, u: k };
  }
}

/** Two hexes mixed in OKLab — hue and lightness both travel straight. */
export function mixHexOklab(a: string, b: string, u: number): string {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const A = hexToOklch(a);
  const B = hexToOklch(b);
  const aa = lchToAb(A);
  const bb = lchToAb(B);
  return oklabToHex(A.L + (B.L - A.L) * u, aa.a + (bb.a - aa.a) * u, aa.b + (bb.b - aa.b) * u);
}

const MIXED: (keyof SkyMood)[] = [
  'heroTop',
  'heroMid',
  'heroFoot',
  'bg',
  'card',
  'controlBg',
  'border',
  'text',
  'muted',
  'accent',
  'accentBg',
  'onAccent',
  'accentSurface',
  'accentSurfaceStrong',
  'accentHairline',
  'danger',
];

/** The mood of this moment, mixed; the overlay and the polarity are the nearer mood's. */
export function skyMoodFor(passage: SkyPassage, t: number): SkyMood {
  const { from, to, u } = skyMoodAt(passage, t);
  if (u <= 0 || from === to) return from;
  if (u >= 1) return to;
  const near = u < 0.5 ? from : to;
  const out: SkyMood = { ...near };
  for (const key of MIXED) {
    (out as unknown as Record<string, string>)[key] = mixHexOklab(from[key] as string, to[key] as string, u);
  }
  return out;
}
