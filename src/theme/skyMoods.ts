/**
 * THE SKY THEME'S COLOURS — one palette for each moment of the sun.
 *
 * Two tracks, picked under Appearance → Sky:
 *
 *   Vibrant — representative, not realistic: a night that is a deep indigo
 *   void with a glowing cyan on it, a dawn of violet with coral, a morning
 *   of warm cream, a midday of ice with an azure, a golden hour of gold,
 *   an evening of electric purple and magenta. Six moods, picked by hand,
 *   with stations between them.
 *
 *   Realistic — the sky as it is, DERIVED: the colour of the sky overhead
 *   and at the horizon for the sun's altitude, the twilight's depth and
 *   the moon's phase and height, and a page that is a paper lit by that
 *   sky. Nothing in it is picked for an hour; a Tromsø December and a
 *   Jakarta noon paint their own days.
 *
 * ── KEYED TO THE SUN, NOT TO THE PASSAGE ─────────────────────────────
 *
 * The colours used to be a function of how far through the prayer
 * passage the clock was (`t`): the same "midday" at a Stockholm December
 * noon (the sun 7° up) and a Makkah one (80°), and the evening switched
 * on halfway from Asr to Maghrib — at three in the afternoon in October,
 * two hours before a June sunset — with the sun drawn high and yellow
 * over a dark page (2.33). Now the moment is a point on the SUN'S day
 * (`SkyLight`): by day its altitude, and whether it is rising or
 * falling; by night its depth under the horizon, and whether the night
 * is coming or going; through the deep of the night, how far through it;
 * and the moon. Each track is a set of STATIONS on that scale, and the
 * moment is mixed between the stations it lies between — in OKLab, with
 * the chroma of the colours that carry the hour held (`mixHexVivid`),
 * and the hues of the accent and the sky's stops carried round the wheel
 * away from green, the way a sky's own mixes go.
 *
 * The page turns dark at Maghrib and light at sunrise — the two moments
 * the app's own day is cut at and the two a person expects the room to
 * change — never in between: a mix of a dark page and a light one is a
 * grey page with unreadable ink, so a change of polarity is a switch
 * (crossfaded by the screen, skyTheme.ts). Light while the sun is up,
 * dark while it is under, the golden hour light at both ends.
 *
 * Every station of both tracks clears the floors the test walks
 * (`__tests__/skyTheme.test.ts`): text and muted ink AA on the page, the
 * card and a control; the accent AA on the page, the card, a control and
 * its own highlight, since it is read as text on all of them.
 */
import type { SkyPassage } from '../screens/home/skyModel';
import { hexToOklch, lchToAb, oklabToHex, oklchToHex, type Oklch } from './oklch';

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

/**
 * ── THE SUN'S DAY ────────────────────────────────────────────────────
 *
 * Where the sun is, which is what the colours are a function of. The
 * hero computes it from the reader's coordinates (skyModel.ts, `skyFrame`
 * carries it); callers with none — the full-screen alert's per-prayer
 * moods, a widget before the hero has drawn — take `nominalSkyLight`,
 * the sun of an average day for the passage and its progress.
 */
export type SkyLight = {
  /** The sun's altitude above the horizon, degrees; negative under it. */
  sun: number;
  /**
   * Sunrise 0 → Maghrib 1 — the app's day — which says whether the sun is
   * rising or falling; past 1 or under 0 at night. Null when the day's
   * times cannot say (the passage's own progress decides then).
   */
  daylight: number | null;
  /** The moon: how much of it is lit, and how high it is (null: unknown). */
  moon?: { illumination: number; altitude: number | null };
};

/** Where the sun's altitude peaks on the average day this stands in for. */
const NOMINAL_NOON_ALTITUDE = 55;
/** The civil, nautical and astronomical twilights end this far under. */
export const TWILIGHT_CIVIL = 6;
export const TWILIGHT_NAUTICAL = 12;
export const TWILIGHT_ASTRONOMICAL = 18;

/**
 * The sun of an average day, from the passage and how far through it:
 * day and sunset by the arc's own sine, dawn and dusk sinking through
 * the three twilights, the night under all of them.
 */
export function nominalSkyLight(passage: SkyPassage, t: number): SkyLight {
  const k = Math.max(0, Math.min(1, t));
  switch (passage) {
    case 'day': {
      // Sunrise → Asr is about two thirds of the sun's day.
      const daylight = k * 0.68;
      return { sun: NOMINAL_NOON_ALTITUDE * Math.sin(Math.PI * daylight), daylight };
    }
    case 'sunset': {
      const daylight = 0.68 + k * 0.32;
      return { sun: NOMINAL_NOON_ALTITUDE * Math.sin(Math.PI * daylight), daylight };
    }
    case 'dusk':
      return { sun: -k * TWILIGHT_ASTRONOMICAL, daylight: 1 + k * 0.1 };
    case 'dawn':
      return { sun: -(1 - k) * TWILIGHT_ASTRONOMICAL, daylight: -0.1 + k * 0.1 };
    case 'night':
    default:
      return { sun: -(TWILIGHT_ASTRONOMICAL + 20 * Math.sin(Math.PI * k)), daylight: 1.1 + k };
  }
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
 * Derived, not picked, so every station's highlight sits in its own
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
 * ── VIBRANT'S STATIONS ───────────────────────────────────────────────
 *
 * Six moods would leave the app the same for hours, so between them are
 * more stations, each a variation on its mood (its ground a shade deeper
 * or lighter, its glow drifting). A variation keeps its mood's name, its
 * ink and its accent — it is the same hour, drifting — so the contrast
 * floors the test walks hold along the whole way.
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
    // A lilac with its colour kept (C 0.07), not the grey-lilac (#DCD6EC,
    // C 0.03) that made the mid-morning the washed hour of the day (2.33).
    heroMid: '#DECEFF',
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
    // A mauve with its colour kept, as above.
    heroMid: '#E0C4F6',
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
  /**
   * The high sun (2.33): the midday's ice deepened to the azure a sky has
   * straight overhead when the sun is high — which a Stockholm winter never
   * reaches and a Makkah noon always does. The ice is the station at a
   * middling sun; this is above it.
   */
  zenith: vary(M.midday, {
    heroTop: '#2279DC',
    heroMid: '#97C9FD',
    heroFoot: '#E0F1FF',
    bg: '#E0F1FF',
    controlBg: '#D0E7FF',
    border: '#AFD3F7',
    accent: '#0554AF',
    accentSurface: '#D9ECFF',
    accentSurfaceStrong: '#CFE6FF',
    bodyLight: '#FFF8C8',
  }),
  /** Higher still: the deep azure of a tropical noon. */
  zenithHigh: vary(M.midday, {
    heroTop: '#1A6ED4',
    heroMid: '#8BC1FC',
    heroFoot: '#DDEFFF',
    bg: '#DDEFFF',
    controlBg: '#CCE4FF',
    border: '#A9CFF6',
    accent: '#0450A8',
    accentSurface: '#D6EAFF',
    accentSurfaceStrong: '#CBE3FF',
    bodyLight: '#FFFBD6',
  }),
  /**
   * The first minutes after Maghrib (2.33): the evening's dark ground, the
   * horizon still an ember — the sun has just gone under and the afterglow
   * is at its hottest. Then the sunset's magenta, then the deep.
   */
  afterglow: vary(M.sunset, {
    heroTop: '#301C64',
    heroMid: '#D25030',
    bodyLight: '#F7A45A',
  }),
};


// ── Colour arithmetic ──────────────────────────────────────────────────

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

/**
 * The hue's way round between two hues: the short way, unless the short
 * way crosses the greens — a sky goes from its evening ember to its night
 * blue by magenta and violet, and from a morning's ochre to the midday's
 * blue by rose and lilac, never by green — in which case the long way.
 * The ends' own hue when either has none (a grey has no direction).
 */
const GREEN_FROM = 95;
const GREEN_TO = 175;
function hueWay(ha: number, hb: number): number {
  let delta = ((hb - ha + 540) % 360) - 180; // the short way, −180…180
  const crossesGreen = (from: number, d: number): boolean => {
    const steps = 12;
    for (let i = 1; i < steps; i += 1) {
      const h = (((from + (d * i) / steps) % 360) + 360) % 360;
      if (h > GREEN_FROM && h < GREEN_TO) return true;
    }
    return false;
  };
  if (Math.abs(delta) > 40 && crossesGreen(ha, delta)) delta = delta > 0 ? delta - 360 : delta + 360;
  return delta;
}

/**
 * The mix for the colours that carry the hour — the sky's stops, the
 * body's light, the accent: lightness and chroma straight, the hue round
 * the wheel by `hueWay`, so a cyan night and a coral dawn meet in violet
 * and not in green, and nothing goes grey on the way.
 */
export function mixHexRound(a: string, b: string, u: number): string {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const A = hexToOklch(a);
  const B = hexToOklch(b);
  const C = A.C + (B.C - A.C) * u;
  // A near-grey end has no hue of its own: take the other's.
  const ha = A.C < 0.015 ? B.h : A.h;
  const hb = B.C < 0.015 ? A.h : B.h;
  const h = (((ha + hueWay(ha, hb) * u) % 360) + 360) % 360;
  return oklchToHex({ L: A.L + (B.L - A.L) * u, C, h });
}

const lch = (L: number, C: number, h: number): string => oklchToHex({ L, C, h });
const shift = (hex: string, d: Partial<Oklch>): string => {
  const c = hexToOklch(hex);
  return oklchToHex({ L: c.L + (d.L ?? 0), C: Math.max(0, c.C + (d.C ?? 0)), h: c.h + (d.h ?? 0) });
};

/** WCAG contrast of two hexes. */
function luminanceOf(hex: string): number {
  const c = hex.replace('#', '');
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map(i => lin(parseInt(c.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastOf(a: string, b: string): number {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── REALISTIC — the sky, derived ───────────────────────────────────────

/**
 * A station of the real sky, in OKLCH: the sky overhead and at the
 * horizon, the page's tint, the accent's hue and chroma, the light the
 * sun or the moon gives. Everything else — the page's ladder, the ink,
 * the accent's lightness, the highlight and the surfaces — is derived
 * from these by the rules below, the same at every station, so the
 * contrast floors are a property of the rules and the test still walks
 * every moment.
 */
type Lch = readonly [number, number, number];
type PhysicalSpec = {
  name: SkyMoodName;
  isDark: boolean;
  top: Lch;
  mid: Lch;
  /** The paper's tint: the horizon's hue, at a few hundredths of chroma. */
  page: Lch;
  accent: { h: number; C: number };
  body: Lch;
  star: Lch;
};

/** The floor every reading of the accent clears, with a hair to spare. */
const ACCENT_FLOOR = 4.6;

/**
 * The paper and the room, lit by the sky — a light page at L 0.97 with the
 * horizon's tint on it, white cards, the ink near-black warmed toward the
 * sky; a dark room two steps up from the sky's own top tone, the ink
 * near-white cooled toward it. The accent is the hour's light at the
 * lightness that just clears the floor on the page, the card, a control
 * and its own highlight — found, not picked.
 */
function physical(s: PhysicalSpec): SkyMood {
  const [tL, tC, th] = s.top;
  const [mL, mC, mh] = s.mid;
  const [pL, pC, ph] = s.page;
  const heroTop = lch(tL, tC, th);
  const heroMid = lch(mL, mC, mh);
  if (!s.isDark) {
    const bg = lch(pL, pC, ph);
    const card = '#FFFFFF';
    const controlBg = lch(pL - 0.045, Math.min(pC, 0.02), ph);
    const border = lch(pL - 0.11, Math.min(pC + 0.005, 0.03), ph);
    const text = lch(0.25, 0.02, th);
    const muted = lch(0.47, 0.03, th);
    let L = 0.56;
    let accent = lch(L, s.accent.C, s.accent.h);
    let accentBg = mixHexOklab(bg, accent, HIGHLIGHT_LIGHT);
    for (let i = 0; i < 40; i += 1) {
      accent = lch(L, s.accent.C, s.accent.h);
      accentBg = mixHexOklab(bg, accent, HIGHLIGHT_LIGHT);
      if ([bg, card, controlBg, accentBg].every(g => contrastOf(accent, g) >= ACCENT_FLOOR)) break;
      L -= 0.01;
    }
    return {
      name: s.name,
      isDark: false,
      heroTop,
      heroMid,
      heroFoot: bg,
      bodyLight: lch(...s.body),
      starGlow: lch(...s.star),
      bg,
      card,
      controlBg,
      border,
      text,
      muted,
      accent,
      accentBg,
      onAccent: contrastOf('#FFFFFF', accent) >= 4.5 ? '#FFFFFF' : '#1A1814',
      accentSurface: mixHexOklab(bg, accent, 0.05),
      accentSurfaceStrong: mixHexOklab(bg, accent, 0.1),
      accentHairline: mixHexOklab(bg, accent, 0.5),
      danger: '#B42318',
      overlay: 'rgba(29,36,48,0.45)',
    };
  }
  const bg = lch(0.21, Math.min(0.05, tC * 0.6 + 0.02), th);
  const card = lch(0.27, Math.min(0.055, tC * 0.6 + 0.025), th);
  const controlBg = lch(0.31, Math.min(0.06, tC * 0.6 + 0.03), th);
  const border = lch(0.38, Math.min(0.06, tC * 0.6 + 0.03), th);
  const text = lch(0.94, 0.012, th);
  const muted = lch(0.77, 0.035, th);
  let L = 0.72;
  let accent = lch(L, s.accent.C, s.accent.h);
  let accentBg = mixHexOklab(bg, accent, HIGHLIGHT_DARK);
  for (let i = 0; i < 30; i += 1) {
    accent = lch(L, s.accent.C, s.accent.h);
    accentBg = mixHexOklab(bg, accent, HIGHLIGHT_DARK);
    if ([bg, card, controlBg, accentBg].every(g => contrastOf(accent, g) >= ACCENT_FLOOR)) break;
    L += 0.01;
  }
  const onAccentDark = lch(0.2, 0.03, s.accent.h);
  return {
    name: s.name,
    isDark: true,
    heroTop,
    heroMid,
    heroFoot: bg,
    bodyLight: lch(...s.body),
    starGlow: lch(...s.star),
    bg,
    card,
    controlBg,
    border,
    text,
    muted,
    accent,
    accentBg,
    onAccent: contrastOf(onAccentDark, accent) >= 4.5 ? onAccentDark : '#FFFFFF',
    accentSurface: mixHexOklab(bg, accent, 0.06),
    accentSurfaceStrong: mixHexOklab(bg, accent, 0.12),
    accentHairline: mixHexOklab(bg, accent, 0.45),
    danger: '#F28B8B',
    overlay: 'rgba(5,8,18,0.7)',
  };
}

/** A station at a point on the sun's scale (altitude by day, depth by night, progress through the deep night). */
type StationAt = { at: number; mood: SkyMood };
/** A track: its stations on each limb of the sun's day. */
type Track = {
  light: { morning: StationAt[]; afternoon: StationAt[] };
  dark: { evening: StationAt[]; morning: StationAt[] };
  night: StationAt[];
};

const WHITE: Lch = [1, 0, 0];
const MOON_LIGHT: Lch = [0.93, 0.02, 262];
const STAR_NIGHT: Lch = [0.9, 0.03, 262];

/**
 * The real sky's stations, by the sun's altitude by day — the colour
 * overhead going from the pale blue of a low sun through a clear blue to
 * the deep azure straight up at a high one, the horizon from the golden
 * hour's amber through the warm haze of a low sun to blue-white — and by
 * its depth under the horizon at twilight: the afterglow's ember going
 * rose, then violet, then the night. The morning is clearer and cooler
 * than the afternoon at the same altitude, the dawn colder than the dusk
 * at the same depth.
 */
const physicalLight = (side: 'morning' | 'afternoon'): StationAt[] => {
  const pm = side === 'afternoon';
  const warm = pm ? 1 : 0;
  const st = (at: number, name: SkyMoodName, top: Lch, mid: Lch, page: Lch, accent: { h: number; C: number }, body: Lch): StationAt => ({
    at,
    mood: withHighlight(
      physical({
        name,
        isDark: false,
        top: [top[0], top[1], top[2] - 2 * warm],
        mid: [mid[0] + (pm ? -0.01 : 0.01), mid[1] + (pm ? 0.01 : -0.005), mid[2] - 8 * warm],
        page,
        accent,
        body,
        star: WHITE,
      }),
    ),
  });
  return [
    // The golden hour: blue over gold, amber at the horizon.
    st(0, pm ? 'golden' : 'morning', [0.62, 0.11, 245], [0.80, 0.13, 52], [0.97, 0.028, 62], { h: 42, C: 0.13 }, [0.84, 0.15, 60]),
    st(4, pm ? 'golden' : 'morning', [0.66, 0.12, 247], [0.86, 0.09, 66], [0.97, 0.026, 68], { h: 52, C: 0.12 }, [0.88, 0.13, 72]),
    // A low sun: the blue paling, a warm haze on the horizon.
    st(9, pm ? 'golden' : 'morning', [0.68, 0.12, 249], [0.89, 0.065, 78], [0.97, 0.022, 76], { h: 62, C: 0.11 }, [0.92, 0.11, 82]),
    // The haze clearing: a blue-white horizon, through which the warm
    // haze and the clear blue meet in white rather than in grey.
    st(13, pm ? 'golden' : 'morning', [0.67, 0.13, 250], [0.92, 0.03, 232], [0.97, 0.018, 160], { h: 250, C: 0.11 }, [0.94, 0.09, 86]),
    // A working day: clear blue — which a Stockholm October noon (20°) reaches and its December noon (7°) does not.
    st(20, 'midday', [0.65, 0.15, 252], [0.87, 0.07, 247], [0.97, 0.02, 250], { h: 252, C: 0.12 }, [0.95, 0.08, 90]),
    // A high sun: the azure straight up.
    st(40, 'midday', [0.60, 0.17, 255], [0.85, 0.08, 250], [0.97, 0.022, 250], { h: 255, C: 0.13 }, [0.97, 0.06, 95]),
    st(70, 'midday', [0.56, 0.18, 258], [0.83, 0.09, 251], [0.97, 0.024, 251], { h: 258, C: 0.13 }, [0.98, 0.05, 98]),
  ];
};
const physicalDark = (side: 'evening' | 'morning'): StationAt[] => {
  const dawn = side === 'morning';
  const st = (at: number, name: SkyMoodName, top: Lch, mid: Lch, accent: { h: number; C: number }, body: Lch): StationAt => ({
    at,
    mood: withHighlight(
      physical({
        name,
        isDark: true,
        top: [top[0], top[1], top[2] + (dawn ? -3 : 0)],
        // The dawn's rose has more blue in it than the dusk's; the dusk's ember more orange.
        mid: [mid[0], mid[1] - (dawn ? 0.01 : 0), mid[2] - (dawn ? 12 : 0)],
        page: [0.21, 0.04, top[2]],
        accent,
        body,
        star: STAR_NIGHT,
      }),
    ),
  });
  return [
    // The sun just under: the afterglow's ember under a deepening blue.
    st(0, dawn ? 'dawn' : 'sunset', [0.42, 0.12, 262], [0.66, 0.16, 36], { h: dawn ? 46 : 44, C: 0.12 }, [0.80, 0.14, 55]),
    st(3, dawn ? 'dawn' : 'sunset', [0.36, 0.12, 265], [0.58, 0.14, 20], { h: dawn ? 38 : 36, C: 0.12 }, [0.78, 0.13, 45]),
    // Civil twilight over: rose.
    st(6, dawn ? 'dawn' : 'sunset', [0.30, 0.11, 267], [0.49, 0.13, 356], { h: dawn ? 30 : 20, C: 0.11 }, [0.82, 0.08, 60]),
    // Nautical: violet.
    st(12, dawn ? 'dawn' : 'sunset', [0.24, 0.09, 269], [0.39, 0.11, 312], { h: 300, C: 0.09 }, MOON_LIGHT),
    // Astronomical: the night.
    st(18, 'night', [0.20, 0.07, 270], [0.36, 0.13, 272], { h: 262, C: 0.085 }, MOON_LIGHT),
  ];
};
const physicalNight: StationAt[] = [
  { at: 0, mood: withHighlight(physical({ name: 'night', isDark: true, top: [0.20, 0.07, 270], mid: [0.36, 0.13, 272], page: [0.21, 0.04, 270], accent: { h: 262, C: 0.085 }, body: MOON_LIGHT, star: STAR_NIGHT })) },
  { at: 0.5, mood: withHighlight(physical({ name: 'night', isDark: true, top: [0.16, 0.05, 270], mid: [0.29, 0.10, 269], page: [0.21, 0.04, 270], accent: { h: 262, C: 0.08 }, body: MOON_LIGHT, star: STAR_NIGHT })) },
  // Before the dawn: the sky cooling, a hint of the first light at the horizon.
  { at: 1, mood: withHighlight(physical({ name: 'night', isDark: true, top: [0.19, 0.07, 268], mid: [0.36, 0.12, 258], page: [0.21, 0.04, 269], accent: { h: 262, C: 0.085 }, body: MOON_LIGHT, star: STAR_NIGHT })) },
];

const REALISTIC_TRACK: Track = {
  light: { morning: physicalLight('morning'), afternoon: physicalLight('afternoon') },
  dark: { evening: physicalDark('evening'), morning: physicalDark('morning') },
  night: physicalNight,
};

/** Realistic's six named moods: the stations that stand for them (the strip, the mushaf's chrome). */
export const REALISTIC_SKY_MOODS: Record<SkyMoodName, SkyMood> = {
  night: REALISTIC_TRACK.night[1].mood,
  dawn: REALISTIC_TRACK.dark.morning[2].mood,
  morning: REALISTIC_TRACK.light.morning[1].mood,
  midday: REALISTIC_TRACK.light.morning[4].mood,
  golden: REALISTIC_TRACK.light.afternoon[0].mood,
  sunset: REALISTIC_TRACK.dark.evening[1].mood,
};

/** Vibrant's stations on the same scale. */
const VIBRANT_TRACK: Track = {
  light: {
    morning: [
      { at: 0, mood: ANCHORS.morning },
      { at: 7, mood: ANCHORS.morningLate },
      { at: 18, mood: ANCHORS.midday },
      { at: 40, mood: ANCHORS.zenith },
      { at: 70, mood: ANCHORS.zenithHigh },
    ],
    afternoon: [
      { at: 0, mood: ANCHORS.golden },
      { at: 7, mood: ANCHORS.afternoonLate },
      { at: 18, mood: ANCHORS.afternoon },
      { at: 40, mood: ANCHORS.zenith },
      { at: 70, mood: ANCHORS.zenithHigh },
    ],
  },
  dark: {
    evening: [
      { at: 0, mood: ANCHORS.afterglow },
      { at: 6, mood: ANCHORS.sunset },
      { at: 12, mood: ANCHORS.sunsetDeep },
      { at: 18, mood: ANCHORS.nightEarly },
    ],
    morning: [
      { at: 0, mood: ANCHORS.dawnBright },
      { at: 6, mood: ANCHORS.dawn },
      { at: 18, mood: ANCHORS.nightLate },
    ],
  },
  night: [
    { at: 0, mood: ANCHORS.nightEarly },
    { at: 0.5, mood: ANCHORS.midnight },
    { at: 1, mood: ANCHORS.nightLate },
  ],
};

const TRACKS: Record<SkyVariant, Track> = { vibrant: VIBRANT_TRACK, realistic: REALISTIC_TRACK };

/** Each variant's six moods. */
export const SKY_MOODS_BY_VARIANT: Record<SkyVariant, Record<SkyMoodName, SkyMood>> = {
  vibrant: SKY_MOODS,
  realistic: REALISTIC_SKY_MOODS,
};


// ── The moment, mixed ──────────────────────────────────────────────────

/**
 * The colours that carry the hour: hue round the wheel, chroma kept. Not
 * the horizon's stop: a warm haze and a blue-white one meet in white, as
 * a real horizon does, and carried round the wheel they met in pink.
 */
const ROUND: ReadonlySet<keyof SkyMood> = new Set(['heroTop', 'bodyLight', 'accent']);

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

/** Two moods mixed; the overlay, the name and the polarity are the nearer's. */
export function mixMoods(a: SkyMood, b: SkyMood, u: number): SkyMood {
  if (u <= 0 || a === b) return a;
  if (u >= 1) return b;
  const near = u < 0.5 ? a : b;
  const out: SkyMood = { ...near };
  for (const k of MIXED) {
    const mix = ROUND.has(k) ? mixHexRound : mixHexOklab;
    (out as unknown as Record<string, string>)[k] = mix(a[k] as string, b[k] as string, u);
  }
  return out;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};

/** Which two stations `at` lies between on a limb, and how far. */
function between(stations: StationAt[], at: number): { from: SkyMood; to: SkyMood; u: number } {
  const first = stations[0];
  const last = stations[stations.length - 1];
  if (at <= first.at) return { from: first.mood, to: first.mood, u: 0 };
  if (at >= last.at) return { from: last.mood, to: last.mood, u: 0 };
  for (let i = 1; i < stations.length; i += 1) {
    if (at <= stations[i].at) {
      const a = stations[i - 1];
      const b = stations[i];
      return { from: a.mood, to: b.mood, u: (at - a.at) / (b.at - a.at || 1) };
    }
  }
  return { from: last.mood, to: last.mood, u: 0 };
}
const along = (stations: StationAt[], at: number): SkyMood => {
  const { from, to, u } = between(stations, at);
  return mixMoods(from, to, u);
};

/**
 * ── THE MOON ON THE NIGHT ────────────────────────────────────────────
 *
 * A moonlit night is a lighter room than a moonless one: the ground, the
 * cards and the sky's own top come up a little, the accent goes toward
 * silver — by how much of the moon is lit and whether it is up (half
 * weight when nobody knows). The floors hold: the ground comes up by
 * less than a step of its own ladder. The stars go the other way; the
 * hero draws that from the same number (skyModel.ts).
 */
export const MOONLIGHT_LIFT = 0.035;
export function moonlight(moon: SkyLight['moon']): number {
  if (!moon) return 0;
  const up = moon.altitude == null ? 0.5 : moon.altitude > 0 ? 1 : 0;
  return clamp01(moon.illumination) * up;
}
function moonlit(mood: SkyMood, f: number): SkyMood {
  if (!mood.isDark || f <= 0) return mood;
  const lift = MOONLIGHT_LIFT * f;
  const a = hexToOklch(mood.accent);
  return withHighlight({
    ...mood,
    heroTop: shift(mood.heroTop, { L: lift, C: 0.01 * f }),
    heroMid: shift(mood.heroMid, { L: lift * 0.8 }),
    heroFoot: shift(mood.heroFoot, { L: lift }),
    bg: shift(mood.bg, { L: lift }),
    card: shift(mood.card, { L: lift }),
    controlBg: shift(mood.controlBg, { L: lift }),
    border: shift(mood.border, { L: lift }),
    accentSurface: shift(mood.accentSurface, { L: lift }),
    accentSurfaceStrong: shift(mood.accentSurfaceStrong, { L: lift }),
    accent: oklchToHex({ L: Math.min(0.92, a.L + 0.03 * f), C: a.C * (1 - 0.3 * f), h: a.h }),
  });
}

/**
 * ── THE MOMENT ON THE SUN'S SCALE ────────────────────────────────────
 *
 * By day (the day and sunset passages): the sun's altitude picks the
 * station on the morning limb and on the afternoon one, and the two are
 * blended by how far through the day it is, around solar noon — so a
 * noon that never gets the sun above 10° is a blend of the morning's and
 * the afternoon's low-sun stations, not a jump between them.
 *
 * By night (dusk, night, dawn): the sun's depth under the horizon picks
 * the station on the evening limb and on the morning one, blended by how
 * far through the night it is; past the astronomical twilight the deep
 * night's own arc (early, midnight, late) takes over, blended in over
 * the next few degrees so a night that reaches it does not step into it.
 * A summer night that never gets there — Stockholm in June, where the
 * sun stays within civil twilight all night — spends the night in the
 * afterglow's and the dawn's colours, which is what a white night is.
 *
 * The polarity is the PASSAGE's: light for day and sunset (sunrise to
 * Maghrib), dark for dusk, night and dawn. An altitude the wrong side of
 * zero for its passage (a method's Maghrib a minute off the geometric
 * one, refraction) is clamped, never switched.
 */
export function skyMoodOf(passage: SkyPassage, t: number, light: SkyLight, variant: SkyVariant = activeVariant): SkyMood {
  const track = TRACKS[isSkyVariant(variant) ? variant : DEFAULT_SKY_VARIANT];
  const k = clamp01(t);
  if (passage === 'day' || passage === 'sunset') {
    const alt = Math.max(0, light.sun);
    const daylight = light.daylight ?? (passage === 'day' ? k * 0.68 : 0.68 + k * 0.32);
    const side = smooth((daylight - 0.42) / 0.16);
    const am = along(track.light.morning, alt);
    const pm = along(track.light.afternoon, alt);
    return mixMoods(am, pm, side);
  }
  const depth = Math.max(0, -light.sun);
  // Evening until the night's middle, then the morning's limb.
  const nightT = passage === 'dusk' ? 0 : passage === 'dawn' ? 1 : k;
  const side = smooth((nightT - 0.4) / 0.2);
  const twilight = mixMoods(along(track.dark.evening, depth), along(track.dark.morning, depth), side);
  const deep = clamp01((depth - TWILIGHT_ASTRONOMICAL) / 4);
  const mood = deep <= 0 ? twilight : mixMoods(twilight, along(track.night, nightT), deep);
  return moonlit(mood, moonlight(light.moon));
}

/**
 * Which two stations this moment is between on its primary limb, and how
 * far — for the tests that walk the day, and for anything that wants to
 * know what the hour is heading for.
 */
export function skyMoodAt(
  passage: SkyPassage,
  t: number,
  variant: SkyVariant = activeVariant,
  light: SkyLight = nominalSkyLight(passage, t),
): { from: SkyMood; to: SkyMood; u: number } {
  const track = TRACKS[isSkyVariant(variant) ? variant : DEFAULT_SKY_VARIANT];
  const k = clamp01(t);
  if (passage === 'day' || passage === 'sunset') {
    const daylight = light.daylight ?? (passage === 'day' ? k * 0.68 : 0.68 + k * 0.32);
    return between(daylight < 0.5 ? track.light.morning : track.light.afternoon, Math.max(0, light.sun));
  }
  const depth = Math.max(0, -light.sun);
  if (depth >= TWILIGHT_ASTRONOMICAL + 4) return between(track.night, passage === 'dusk' ? 0 : passage === 'dawn' ? 1 : k);
  const evening = passage === 'dusk' || (passage === 'night' && k < 0.5);
  return between(evening ? track.dark.evening : track.dark.morning, depth);
}

/**
 * The mood of this moment, mixed. `steps`: the moment quantised, so the
 * app's palette moves in steps — a change of palette re-renders every
 * screen — while the hero's own sky, which is one view, moves every
 * minute. The hero asks for the same moment on every render — every
 * second, every frame of a run — so the answer is remembered by moment.
 */
export const PALETTE_STEPS = 16;
const MOOD_CACHE = new Map<string, SkyMood>();
const MOOD_CACHE_MAX = 512;
export function skyMoodFor(
  passage: SkyPassage,
  t: number,
  steps?: number,
  variant: SkyVariant = activeVariant,
  light: SkyLight = nominalSkyLight(passage, t),
): SkyMood {
  const v = isSkyVariant(variant) ? variant : DEFAULT_SKY_VARIANT;
  // Quantised: the sun to a degree (a quarter, for the hero), the day's
  // and the night's progress to a step, the moon to an eighth.
  const q = steps ? 1 : 4;
  const sun = Math.round(light.sun * q) / q;
  const prog = steps ? Math.round(clamp01(t) * steps) / steps : Math.round(clamp01(t) * 240) / 240;
  const daylight = light.daylight == null ? null : Math.round(light.daylight * 64) / 64;
  const moonF = Math.round(moonlight(light.moon) * 8) / 8;
  const key = `${v}|${passage}|${prog}|${sun}|${daylight}|${moonF}`;
  const hit = MOOD_CACHE.get(key);
  if (hit) return hit;
  const out = skyMoodOf(
    passage,
    prog,
    { sun, daylight, moon: moonF > 0 ? { illumination: moonF, altitude: 1 } : undefined },
    v,
  );
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
