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
 *
 * Two variants, picked under Appearance → Sky: these, Vibrant, and
 * Realistic — the sky as it looks (the hero's own colours, skyModel.ts:
 * a navy night, a dawn of slate blue with a rose horizon, a clear blue
 * day, an orange horizon under a blue evening) over a page that is
 * nearly neutral, tinted only toward the hour, and calmer accents. Same
 * hours, same anchors, same switches between dark and light, same floors.
 */
import type { SkyPassage } from '../screens/home/skyModel';
import { hexToOklch, lchToAb, oklabToHex, oklchToHex } from './oklch';

export type SkyMoodName = 'night' | 'dawn' | 'morning' | 'midday' | 'golden' | 'sunset';

/** Which colours the Sky theme wears: the representative ones, or the sky's own. */
export type SkyVariant = 'vibrant' | 'realistic';
export const SKY_VARIANTS: readonly SkyVariant[] = ['vibrant', 'realistic'];
// Realistic by default: the calmer of the two, the sky as it looks.
export const DEFAULT_SKY_VARIANT: SkyVariant = 'realistic';
export function isSkyVariant(v: unknown): v is SkyVariant {
  return v === 'vibrant' || v === 'realistic';
}

/**
 * The variant in force, for the callers that have no settings to ask —
 * the sky store, the full-screen alert, the hero's frame. Set from the
 * settings (`setSkyVariant` in skyTheme.ts), which also re-renders the
 * palette's readers.
 */
let activeVariant: SkyVariant = DEFAULT_SKY_VARIANT;
export function activeSkyVariant(): SkyVariant {
  return activeVariant;
}
export function setActiveSkyVariant(v: SkyVariant): void {
  activeVariant = isSkyVariant(v) ? v : DEFAULT_SKY_VARIANT;
}

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
 * amethyst under the cards. The cards sit a clear step above the page
 * (about 1.16:1, where 1.08 read as flat) with a hairline a step above
 * them, so a menu has edges in the dark without being brighter. Every glow here was once a neon and was
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
    card: '#211D3D',
    controlBg: '#2B2450',
    border: '#3B3268',
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
    border: '#52408F',
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
    border: '#64347D',
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

const moodsOf = (raw: Record<SkyMoodName, Omit<SkyMood, 'accentBg'>>): Record<SkyMoodName, SkyMood> => ({
  night: withHighlight(raw.night),
  dawn: withHighlight(raw.dawn),
  morning: withHighlight(raw.morning),
  midday: withHighlight(raw.midday),
  golden: withHighlight(raw.golden),
  sunset: withHighlight(raw.sunset),
});

/** Vibrant's moods (the theme as it first shipped). */
export const SKY_MOODS: Record<SkyMoodName, SkyMood> = moodsOf(RAW_MOODS);

/**
 * REALISTIC — the sky as it looks. The hero takes the real sky's colours
 * (the default theme's, skyModel.ts) at each hour; the page under it is
 * nearly neutral — a paper warmed or cooled toward the hour by a few
 * degrees, never painted in it; the cards are white by day and a step
 * above the page by night; the accent is the hour's light, taken down to
 * what a sky shows: moonlight blue, a dawn peach, terracotta, a clear
 * blue, amber, the afterglow's orange. The same tokens, the same floors.
 */
const REALISTIC_RAW: Record<SkyMoodName, Omit<SkyMood, 'accentBg'>> = {
  /** Night: navy, a moonlit blue on it. */
  night: {
    name: 'night',
    isDark: true,
    heroTop: '#060B24',
    heroMid: '#17245C',
    heroFoot: '#0D1428',
    bodyLight: '#E4EAF4',
    starGlow: '#D6E0F2',
    bg: '#0D1428',
    card: '#182036',
    controlBg: '#1F2942',
    border: '#2E3A57',
    text: '#E8ECF4',
    muted: '#A3AEC4',
    accent: '#9DB8E8',
    onAccent: '#0B1224',
    accentSurface: '#111930',
    accentSurfaceStrong: '#1B2440',
    accentHairline: '#3E5180',
    danger: '#F28B8B',
    overlay: 'rgba(5,8,18,0.7)',
  },
  /** Dawn: slate blue, the horizon going rose, a peach for the hand. */
  dawn: {
    name: 'dawn',
    isDark: true,
    heroTop: '#0E1750',
    heroMid: '#634481',
    heroFoot: '#131A33',
    bodyLight: '#F4C99A',
    starGlow: '#DCDDF0',
    bg: '#131A33',
    card: '#1E2643',
    controlBg: '#262F50',
    border: '#384266',
    text: '#F1EEF2',
    muted: '#B4B4CA',
    accent: '#E9A88A',
    onAccent: '#24130B',
    accentSurface: '#172040',
    accentSurfaceStrong: '#222B4C',
    accentHairline: '#6A5878',
    danger: '#F28B8B',
    overlay: 'rgba(8,10,26,0.7)',
  },
  /** Early morning: a pale blue over the warm haze, a paper page, terracotta. */
  morning: {
    name: 'morning',
    isDark: false,
    heroTop: '#77A6E7',
    heroMid: '#FED29C',
    heroFoot: '#F7F4EF',
    bodyLight: '#FFD98F',
    starGlow: '#FFFFFF',
    bg: '#F7F4EF',
    card: '#FFFFFF',
    controlBg: '#ECE8E1',
    border: '#DCD5CA',
    text: '#1D2430',
    muted: '#555E6C',
    accent: '#9B4A24',
    onAccent: '#FFFFFF',
    accentSurface: '#F2EEE8',
    accentSurfaceStrong: '#EDE7DF',
    accentHairline: '#D8B399',
    danger: '#B42318',
    overlay: 'rgba(29,36,48,0.45)',
  },
  /** Midday: a clear blue sky, a cool page, a blue for the hand. */
  midday: {
    name: 'midday',
    isDark: false,
    heroTop: '#378BE5',
    heroMid: '#9DCEFC',
    heroFoot: '#F1F5F9',
    bodyLight: '#FFF4D2',
    starGlow: '#FFFFFF',
    bg: '#F1F5F9',
    card: '#FFFFFF',
    controlBg: '#E2E9F1',
    border: '#CBD7E3',
    text: '#13202F',
    muted: '#4C5B6C',
    accent: '#285C91',
    onAccent: '#FFFFFF',
    accentSurface: '#E9EFF5',
    accentSurfaceStrong: '#E0E8F1',
    accentHairline: '#98B5D3',
    danger: '#B42318',
    overlay: 'rgba(19,32,47,0.45)',
  },
  /** Late afternoon: the blue fading over a warm horizon, amber. */
  golden: {
    name: 'golden',
    isDark: false,
    heroTop: '#688AD7',
    heroMid: '#FFB769',
    heroFoot: '#F9F2E8',
    bodyLight: '#FFBE6A',
    starGlow: '#FFFFFF',
    bg: '#F9F2E8',
    card: '#FFFDF9',
    controlBg: '#F0E5D6',
    border: '#E3D2BC',
    text: '#2A2018',
    muted: '#66574A',
    accent: '#9A4F14',
    onAccent: '#FFFFFF',
    accentSurface: '#F5EBDF',
    accentSurfaceStrong: '#F0E4D5',
    accentHairline: '#DDB084',
    danger: '#B42318',
    overlay: 'rgba(42,32,24,0.45)',
  },
  /** Sunset & evening: a blue evening over the red horizon, the afterglow's orange. */
  sunset: {
    name: 'sunset',
    isDark: true,
    heroTop: '#2D2E7D',
    heroMid: '#CD4E54',
    heroFoot: '#171A30',
    bodyLight: '#F29A66',
    starGlow: '#EEDCD6',
    bg: '#171A30',
    card: '#222540',
    controlBg: '#2A2E4C',
    border: '#3C3F62',
    text: '#F3EEEC',
    muted: '#BCB6C0',
    accent: '#EE9F72',
    onAccent: '#26120A',
    accentSurface: '#1C1F38',
    accentSurfaceStrong: '#272A46',
    accentHairline: '#74566A',
    danger: '#F4847E',
    overlay: 'rgba(10,10,22,0.7)',
  },
};

/** Realistic's moods. */
export const REALISTIC_SKY_MOODS: Record<SkyMoodName, SkyMood> = moodsOf(REALISTIC_RAW);

/** Each variant's six moods. */
export const SKY_MOODS_BY_VARIANT: Record<SkyVariant, Record<SkyMoodName, SkyMood>> = {
  vibrant: SKY_MOODS,
  realistic: REALISTIC_SKY_MOODS,
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
    card: '#241E45',
    controlBg: '#2E2656',
    border: '#3E3570',
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
    card: '#231C43',
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
  /**
   * Mid-morning: the haze between the coral and the blue. A peach and an
   * azure mixed straight meet in grey, so the morning goes to the midday
   * by way of rose and lilac — the sky's own way, the warm horizon fading
   * under a blue coming down from above — and the accent by way of plum.
   */
  morningLate: vary(M.morning, {
    heroTop: '#B49BD6',
    heroMid: '#DCD6EC',
    heroFoot: '#F5F2F9',
    bg: '#F5F2F9',
    card: '#FDFCFF',
    controlBg: '#EAE4F4',
    border: '#D4CBE6',
    text: '#1E1E44',
    muted: '#5A5878',
    accent: '#8C2F78',
    accentSurface: '#F1EAF8',
    accentSurfaceStrong: '#EAE0F4',
    accentHairline: '#B88ED0',
    bodyLight: '#FFDD8A',
    overlay: 'rgba(30,30,68,0.45)',
  }),
  midday: M.midday,
  /** The afternoon: the same ice, a touch warmer and higher. */
  afternoon: vary(M.midday, {
    heroTop: '#6FA6DA',
    heroMid: '#C2E1FF',
    heroFoot: '#EDF5FC',
    bg: '#EDF5FC',
    bodyLight: '#FFE08A',
  }),
  /** Towards Asr's end: the blue going mauve before the gold comes in. */
  afternoonLate: vary(M.midday, {
    heroTop: '#B394C6',
    heroMid: '#E4D8EA',
    heroFoot: '#F7F2F4',
    bg: '#F7F2F4',
    card: '#FFFCFD',
    controlBg: '#EFE3EC',
    border: '#DCCADB',
    text: '#281C3E',
    muted: '#655572',
    accent: '#7D3390',
    accentSurface: '#F4EAF4',
    accentSurfaceStrong: '#EEE0EE',
    accentHairline: '#C494CC',
    bodyLight: '#FFCF72',
    overlay: 'rgba(40,28,62,0.45)',
  }),
  golden: M.golden,
  sunset: M.sunset,
  /** The evening after the sun has gone: deeper, the magenta cooling. */
  sunsetDeep: vary(M.sunset, {
    heroTop: '#1E0734',
    heroMid: '#8C3A69',
    heroFoot: '#1E0729',
    bg: '#1E0729',
    card: '#300F42',
    accentSurface: '#250B33',
    bodyLight: '#E990A3',
  }),
};

/**
 * Realistic's anchors: the same hours, drifting the way the real sky does —
 * the night bluest after Isha and before Fajr, the dawn's horizon going
 * from rose to salmon, the morning's haze clearing into the blue, the
 * afternoon's blue paling over a warm horizon before the gold, the
 * evening deepening to indigo. Between the morning's terracotta and the
 * midday's blue, and the afternoon's blue and the gold, the hand passes
 * through a muted plum, the way the sky's own mixes do.
 */
const R = REALISTIC_SKY_MOODS;
const REALISTIC_ANCHORS: typeof ANCHORS = {
  nightEarly: vary(R.night, {
    heroTop: '#0A1335',
    heroMid: '#253486',
    heroFoot: '#0F172E',
    bg: '#0F172E',
    card: '#1A2339',
    controlBg: '#212C46',
    accentSurface: '#131B33',
    bodyLight: '#D8E2F8',
  }),
  midnight: R.night,
  nightLate: vary(R.night, {
    heroTop: '#0A123E',
    heroMid: '#2D358D',
    heroFoot: '#0F162D',
    bg: '#0F162D',
    card: '#1A2239',
    accentSurface: '#131A33',
    bodyLight: '#ECE8F6',
  }),
  dawn: R.dawn,
  dawnBright: vary(R.dawn, {
    heroTop: '#244091',
    heroMid: '#BE5D78',
    bodyLight: '#FAD39C',
  }),
  morning: R.morning,
  morningLate: vary(R.morning, {
    heroTop: '#619DE6',
    heroMid: '#DAE4EF',
    heroFoot: '#F4F6F8',
    bg: '#F4F6F8',
    card: '#FFFFFF',
    controlBg: '#E7EBF0',
    border: '#D3DAE2',
    text: '#1A2531',
    muted: '#52606E',
    accent: '#5B5C86',
    accentSurface: '#EDF0F3',
    accentSurfaceStrong: '#E6EAEF',
    accentHairline: '#B3BDD0',
    bodyLight: '#FFE6A8',
    overlay: 'rgba(26,37,49,0.45)',
  }),
  midday: R.midday,
  afternoon: vary(R.midday, {
    heroTop: '#4A9AE8',
    heroMid: '#B4D7F7',
    heroFoot: '#F2F5F8',
    bg: '#F2F5F8',
    bodyLight: '#FFEFC2',
  }),
  afternoonLate: vary(R.midday, {
    heroTop: '#5D8FDB',
    heroMid: '#E9DCC0',
    heroFoot: '#F6F4F0',
    bg: '#F6F4F0',
    card: '#FFFEFC',
    controlBg: '#ECE8E2',
    border: '#DCD6CD',
    text: '#1F2430',
    muted: '#575C68',
    accent: '#6A5070',
    accentSurface: '#F1EEEA',
    accentSurfaceStrong: '#ECE8E3',
    accentHairline: '#C2B4AE',
    bodyLight: '#FFDC94',
    overlay: 'rgba(31,36,48,0.45)',
  }),
  golden: R.golden,
  sunset: R.sunset,
  sunsetDeep: vary(R.sunset, {
    heroTop: '#1D1F6C',
    heroMid: '#8E4777',
    heroFoot: '#141830',
    bg: '#141830',
    card: '#1F2340',
    accentSurface: '#191C36',
    bodyLight: '#E48E78',
  }),
};

type Segment = { from: number; to: number; a: SkyMood; b: SkyMood };
/** Each passage as segments of its progress, each a mix of two anchors. */
const timelineOf = (A: typeof ANCHORS): Record<SkyPassage, Segment[]> => ({
  night: [
    { from: 0, to: 0.5, a: A.nightEarly, b: A.midnight },
    { from: 0.5, to: 1, a: A.midnight, b: A.nightLate },
  ],
  dawn: [
    { from: 0, to: 0.35, a: A.nightLate, b: A.dawn },
    { from: 0.35, to: 1, a: A.dawn, b: A.dawnBright },
  ],
  // Sunrise is the switch to light.
  day: [
    { from: 0, to: 0.15, a: A.morning, b: A.morningLate },
    { from: 0.15, to: 0.3, a: A.morningLate, b: A.midday },
    { from: 0.3, to: 1, a: A.midday, b: A.afternoon },
  ],
  // Halfway to Maghrib the evening switches on.
  sunset: [
    { from: 0, to: 0.25, a: A.afternoon, b: A.afternoonLate },
    { from: 0.25, to: 0.5, a: A.afternoonLate, b: A.golden },
    { from: 0.5, to: 1, a: A.sunset, b: A.sunsetDeep },
  ],
  dusk: [{ from: 0, to: 1, a: A.sunsetDeep, b: A.nightEarly }],
});
const TIMELINES: Record<SkyVariant, Record<SkyPassage, Segment[]>> = {
  vibrant: timelineOf(ANCHORS),
  realistic: timelineOf(REALISTIC_ANCHORS),
};

/** Which two anchors this moment of the sky is between, and how far. */
export function skyMoodAt(
  passage: SkyPassage,
  t: number,
  variant: SkyVariant = activeVariant,
): { from: SkyMood; to: SkyMood; u: number } {
  const k = Math.max(0, Math.min(1, t));
  const segments = TIMELINES[isSkyVariant(variant) ? variant : DEFAULT_SKY_VARIANT][passage];
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

/**
 * The same mix, its chroma kept: a straight line through OKLab between two
 * hues cuts inside the wheel, so halfway it is greyer than either end. For
 * the sky's own stops, the sun's light and the accent — the colours that
 * carry the hour — the chroma is set back to the ends' own, mixed, and
 * only the hue and the lightness travel straight.
 */
export function mixHexVivid(a: string, b: string, u: number): string {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const mixed = hexToOklch(mixHexOklab(a, b, u));
  const Ca = hexToOklch(a).C;
  const Cb = hexToOklch(b).C;
  return oklchToHex({ ...mixed, C: Ca + (Cb - Ca) * u });
}

const VIVID: ReadonlySet<keyof SkyMood> = new Set(['heroTop', 'heroMid', 'bodyLight', 'accent']);

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
/**
 * Remembered by moment: a mood is twenty colours mixed in OKLab, and the
 * hero asks for the same one on every render — every second, and every
 * frame of a launch run — while the palette, the widgets and the reader
 * ask for the same quantised one. The sky moves in minutes, so a few
 * hundred moments cover a day.
 */
const MOOD_CACHE = new Map<string, SkyMood>();
const MOOD_CACHE_MAX = 512;
export function skyMoodFor(passage: SkyPassage, t: number, steps?: number, variant: SkyVariant = activeVariant): SkyMood {
  const at = skyMoodAt(passage, t, variant);
  const { from, to } = at;
  const u = steps ? Math.round(at.u * steps) / steps : at.u;
  if (u <= 0 || from === to) return from;
  if (u >= 1) return to;
  const key = `${variant}|${from.name}|${from.heroTop}|${to.heroTop}|${u.toFixed(4)}`;
  const hit = MOOD_CACHE.get(key);
  if (hit) return hit;
  const near = u < 0.5 ? from : to;
  const out: SkyMood = { ...near };
  for (const k of MIXED) {
    const mix = VIVID.has(k) ? mixHexVivid : mixHexOklab;
    (out as unknown as Record<string, string>)[k] = mix(from[k] as string, to[k] as string, u);
  }
  if (MOOD_CACHE.size >= MOOD_CACHE_MAX) MOOD_CACHE.clear();
  MOOD_CACHE.set(key, out);
  return out;
}

/**
 * The home-screen widgets under the Sky theme. A widget draws light text
 * on a dark card whatever the app's page is, so by day it takes a dark
 * card in the hour's hue — the midday's blue, the afternoon's, the
 * golden hour's amber — with the accent lifted to read on it; by night,
 * the mood's own page and accent.
 */
export function widgetSkyColors(mood: SkyMood): { bg: string; accent: string } {
  if (mood.isDark) return { bg: mood.bg, accent: mood.accent };
  const hue = hexToOklch(mood.heroTop).h;
  return {
    bg: oklchToHex({ L: 0.24, C: 0.06, h: hue }),
    accent: oklchToHex({ L: 0.8, C: 0.11, h: hue }),
  };
}
