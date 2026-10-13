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
  /**
   * The sun's or the moon's colour under this sky — its disc and its halo —
   * and the stars'. The real sky lights them by altitude and phase; under
   * the theme they are the hour's: a neon sunshine at dawn, white gold at
   * midday, a tangerine at sunset, an icy moon and cyan stars at night.
   */
  bodyLight: string;
  starGlow: string;
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

/**
 * The highlight behind the next prayer's row, a selected segment, a chip:
 * the page tinted toward the accent — a fifth of the way on a dark page,
 * where the accent is light and the tint can be deep; a tenth on a light
 * one, where the accent is deep and the row must stay nearly white for
 * the accent to read on it (the time is written on it in the accent).
 * Derived, not picked, so every anchor's highlight sits in its own
 * composition and clears AA for the accent and the ink on it.
 */
const HIGHLIGHT_DARK = 0.2;
const HIGHLIGHT_LIGHT = 0.08;
function withHighlight(m: Omit<SkyMood, 'accentBg'>): SkyMood {
  return { ...m, accentBg: mixHexOklab(m.bg, m.accent, m.isDark ? HIGHLIGHT_DARK : HIGHLIGHT_LIGHT) };
}

const RAW_MOODS: Record<SkyMoodName, Omit<SkyMood, 'accentBg'>> = {
  /**
 * Night & midnight: an obsidian indigo void, a soft cyan glowing on it,
 * amethyst under the cards. Every glow here was once a neon and was
 * taken down by a third of its chroma: it is a prayer app, and a colour
 * should be warm to the eye, not loud — bright without being a sign.
 */
  night: {
    name: 'night',
    isDark: true,
    heroTop: '#0A0818',
    heroMid: '#2A1B55',
    heroFoot: '#130F26',
    bodyLight: '#D7EDF8',
    starGlow: '#B2E3F4',
    bg: '#130F26',
    card: '#1B1636',
    controlBg: '#261F49',
    border: '#352C5F',
    text: '#EEEAFF',
    muted: '#B4ADDB',
    accent: '#83E6F0',
    onAccent: '#0B1020',
    accentSurface: '#171230',
    accentSurfaceStrong: '#2A1B4F',
    accentHairline: '#6A4C9E',
    danger: '#FF6B8B',
    overlay: 'rgba(8,5,20,0.7)',
  },
  /** Dawn: deep violet, electric coral for the hand, neon sunshine in the highlights. */
  dawn: {
    name: 'dawn',
    isDark: true,
    heroTop: '#140A33',
    heroMid: '#703D72',
    heroFoot: '#1E1140',
    bodyLight: '#F3D48E',
    starGlow: '#E9C8FF',
    bg: '#1E1140',
    card: '#2A1A57',
    controlBg: '#38276E',
    border: '#4B3889',
    text: '#FFF4EC',
    muted: '#D6C4EE',
    accent: '#E88C79',
    onAccent: '#2A0F08',
    accentSurface: '#24154A',
    accentSurfaceStrong: '#352162',
    accentHairline: '#8F5BC8',
    danger: '#FF8A80',
    overlay: 'rgba(14,6,36,0.7)',
  },
  /** Early morning: warm cream, fresh coffee, the coral still the hand. */
  morning: {
    name: 'morning',
    isDark: false,
    heroTop: '#ECA586',
    heroMid: '#FFD7A8',
    heroFoot: '#FFF4E8',
    bodyLight: '#FFC25C',
    starGlow: '#FFFFFF',
    bg: '#FFF4E8',
    card: '#FFFDF9',
    controlBg: '#FFE8D4',
    border: '#F2D6BE',
    text: '#2A1B3D',
    muted: '#665473',
    accent: '#BB3219',
    onAccent: '#FFFFFF',
    accentSurface: '#FFEEDD',
    accentSurfaceStrong: '#FFE6D2',
    accentHairline: '#F0B48A',
    danger: '#B91C1C',
    overlay: 'rgba(42,27,61,0.45)',
  },
  /** Midday & afternoon: ice, crisp and breathable, an electric azure. */
  midday: {
    name: 'midday',
    isDark: false,
    heroTop: '#619CDA',
    heroMid: '#A6D6FF',
    heroFoot: '#EAF6FF',
    bodyLight: '#FFF3B0',
    starGlow: '#FFFFFF',
    bg: '#EAF6FF',
    card: '#FFFFFF',
    controlBg: '#DBEDFF',
    border: '#BCDBF7',
    text: '#0B2545',
    muted: '#44607D',
    accent: '#0760AB',
    onAccent: '#FFFFFF',
    accentSurface: '#E2F1FF',
    accentSurfaceStrong: '#D8ECFF',
    accentHairline: '#7FBEF5',
    danger: '#C62828',
    overlay: 'rgba(11,37,69,0.45)',
  },
  /** Late afternoon: gold, the tangerine warming up for the evening. */
  golden: {
    name: 'golden',
    isDark: false,
    heroTop: '#DF9A68',
    heroMid: '#FFCF9A',
    heroFoot: '#FFF0E0',
    bodyLight: '#FFB03B',
    starGlow: '#FFFFFF',
    bg: '#FFF0E0',
    card: '#FFFAF3',
    controlBg: '#FFE2C8',
    border: '#F4CCAA',
    text: '#3A1A2E',
    muted: '#744E62',
    accent: '#B53020',
    onAccent: '#FFFFFF',
    accentSurface: '#FFEAD6',
    accentSurfaceStrong: '#FFE3CA',
    accentHairline: '#EFA46B',
    danger: '#B91C1C',
    overlay: 'rgba(58,26,46,0.45)',
  },
  /** Sunset & evening: electric purple, hyper magenta, the tangerine's last glow. */
  sunset: {
    name: 'sunset',
    isDark: true,
    heroTop: '#2B0A3D',
    heroMid: '#AD476F',
    heroFoot: '#24092F',
    bodyLight: '#E67F6A',
    starGlow: '#FFC2E0',
    bg: '#24092F',
    card: '#331245',
    controlBg: '#441B5A',
    border: '#5C2C75',
    text: '#FFEFF7',
    muted: '#E3B9D6',
    accent: '#E674A4',
    onAccent: '#2A0616',
    accentSurface: '#2C0E3A',
    accentSurfaceStrong: '#3F1655',
    accentHairline: '#86357F',
    danger: '#FF5E62',
    overlay: 'rgba(20,4,30,0.7)',
  },
};

export const SKY_MOODS: Record<SkyMoodName, SkyMood> = {
  night: withHighlight(RAW_MOODS.night),
  dawn: withHighlight(RAW_MOODS.dawn),
  morning: withHighlight(RAW_MOODS.morning),
  midday: withHighlight(RAW_MOODS.midday),
  golden: withHighlight(RAW_MOODS.golden),
  sunset: withHighlight(RAW_MOODS.sunset),
};

/**
 * ── THE DAY, ANCHOR BY ANCHOR ────────────────────────────────────────
 *
 * Six moods would leave the app the same for hours — the whole night one
 * indigo, three quarters of the day one ice. So between the moods are
 * more anchors, each a variation on its mood (its ground a shade deeper
 * or lighter, its glow drifting), and every passage of the day is a
 * sequence of them mixed continuously: the night goes from a blue early
 * night after Isha through its deepest at midnight to a violet before
 * Fajr; the day from the morning's cream through the midday's ice to a
 * warmer, higher afternoon; the evening deepens after the sun has gone.
 * The colours move a little every minute, and no two minutes of the day
 * are quite the same sky. A variation keeps its mood's name, its ink and
 * its accent — it is the same hour, drifting — so the contrast floors
 * the test walks hold along the whole way.
 */
const vary = (base: SkyMood, over: Partial<SkyMood>): SkyMood => withHighlight({ ...base, ...over });
const M = SKY_MOODS;
const ANCHORS = {
  /** After Isha: the night still blue from the day it came out of. */
  nightEarly: vary(M.night, {
    heroTop: '#0E0A26',
    heroMid: '#2E2066',
    heroFoot: '#15102C',
    bg: '#15102C',
    card: '#1E183B',
    controlBg: '#29214F',
    border: '#382F65',
    accentSurface: '#191335',
    bodyLight: '#D9CCFF',
  }),
  /** The deepest of the night. */
  midnight: M.night,
  /** Before Fajr: a violet creeping into the indigo. */
  nightLate: vary(M.night, {
    heroTop: '#0D0A28',
    heroMid: '#3B1D63',
    heroFoot: '#150F2B',
    bg: '#150F2B',
    card: '#1E1739',
    accentSurface: '#1A1333',
    bodyLight: '#E2D6FF',
  }),
  dawn: M.dawn,
  /** The last of the dawn: the horizon's glow gone coral. */
  dawnBright: vary(M.dawn, {
    heroTop: '#1A0E42',
    heroMid: '#A4516C',
    bodyLight: '#FFE08A',
  }),
  morning: M.morning,
  midday: M.midday,
  /** The afternoon: the same ice, a touch warmer and higher. */
  afternoon: vary(M.midday, {
    heroTop: '#6FA6DA',
    heroMid: '#C2E1FF',
    heroFoot: '#EDF5FC',
    bg: '#EDF5FC',
    bodyLight: '#FFE08A',
  }),
  golden: M.golden,
  sunset: M.sunset,
  /** The evening after the sun has gone: deeper, the magenta cooling. */
  sunsetDeep: vary(M.sunset, {
    heroTop: '#1E0734',
    heroMid: '#8C3A69',
    heroFoot: '#1E0729',
    bg: '#1E0729',
    card: '#2C0F3C',
    accentSurface: '#250B33',
    bodyLight: '#E990A3',
  }),
};

type Segment = { from: number; to: number; a: SkyMood; b: SkyMood };
/** Each passage as segments of its progress, each a mix of two anchors. */
const TIMELINE: Record<SkyPassage, Segment[]> = {
  night: [
    { from: 0, to: 0.5, a: ANCHORS.nightEarly, b: ANCHORS.midnight },
    { from: 0.5, to: 1, a: ANCHORS.midnight, b: ANCHORS.nightLate },
  ],
  dawn: [
    { from: 0, to: 0.35, a: ANCHORS.nightLate, b: ANCHORS.dawn },
    { from: 0.35, to: 1, a: ANCHORS.dawn, b: ANCHORS.dawnBright },
  ],
  // Sunrise is the switch to light.
  day: [
    { from: 0, to: 0.3, a: ANCHORS.morning, b: ANCHORS.midday },
    { from: 0.3, to: 1, a: ANCHORS.midday, b: ANCHORS.afternoon },
  ],
  // Halfway to Maghrib the evening switches on.
  sunset: [
    { from: 0, to: 0.5, a: ANCHORS.afternoon, b: ANCHORS.golden },
    { from: 0.5, to: 1, a: ANCHORS.sunset, b: ANCHORS.sunsetDeep },
  ],
  dusk: [{ from: 0, to: 1, a: ANCHORS.sunsetDeep, b: ANCHORS.nightEarly }],
};

/** Which two anchors this moment of the sky is between, and how far. */
export function skyMoodAt(passage: SkyPassage, t: number): { from: SkyMood; to: SkyMood; u: number } {
  const k = Math.max(0, Math.min(1, t));
  const segments = TIMELINE[passage];
  const seg = segments.find(s => k < s.to) ?? segments[segments.length - 1];
  const span = seg.to - seg.from || 1;
  return { from: seg.a, to: seg.b, u: Math.max(0, Math.min(1, (k - seg.from) / span)) };
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
  'bodyLight',
  'starGlow',
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

/**
 * The mood of this moment, mixed; the overlay and the polarity are the
 * nearer anchor's. `steps`: the mix in that many steps rather than
 * continuous — the app's palette moves in steps (PALETTE_STEPS), since a
 * change of palette re-renders every screen, while the hero's own sky,
 * which is one view, moves every minute.
 */
export const PALETTE_STEPS = 16;
export function skyMoodFor(passage: SkyPassage, t: number, steps?: number): SkyMood {
  const at = skyMoodAt(passage, t);
  const { from, to } = at;
  const u = steps ? Math.round(at.u * steps) / steps : at.u;
  if (u <= 0 || from === to) return from;
  if (u >= 1) return to;
  const near = u < 0.5 ? from : to;
  const out: SkyMood = { ...near };
  for (const key of MIXED) {
    (out as unknown as Record<string, string>)[key] = mixHexOklab(from[key] as string, to[key] as string, u);
  }
  return out;
}
