// tokens-ok: the sky's own colours — a drawn scene with its own ink, not app chrome
/**
 * The sky behind the countdown — one continuous day, drawn from the clock.
 *
 * ── FIVE PASSAGES ────────────────────────────────────────────────────
 *
 * The sky is not a set of pictures chosen by the next prayer; it is one
 * scene that moves with the time of day, in five passages that meet at the
 * prayer times themselves:
 *
 *   Isha → Fajr      night. The moon crosses the top of the card, in its
 *                    real phase and turned the way the reader's own moon
 *                    is turned tonight — see moon.ts.
 *   Fajr → Sunrise   dawn. From the dark of Fajr through the saturated
 *                    rose and orange of the horizon to the peach of first
 *                    light; the sun rises into the card near the end.
 *   Sunrise → Asr    the day. The sun climbs to its height about Dhuhr and
 *                    starts down; the sky goes from morning gold through
 *                    bright noon blue to the warmth of the afternoon.
 *   Asr → Maghrib    sunset. Deepening orange and red as the sun sinks,
 *                    until it has set completely at Maghrib.
 *   Maghrib → Isha   dusk. The afterglow darkens through purple into the
 *                    night that begins at Isha; the stars come out.
 *
 * Each passage is a run of colour KEYFRAMES interpolated by how far the
 * clock has come through it, so the card changes minute by minute and is
 * never seen to jump.
 *
 * ── THE SKY IS TRUE TO THE HOUR, NOT TO THE THEME ─────────────────────
 *
 * Painted at full strength whatever the theme or Material You has done to
 * the accent: night is dark at night in a light app, noon is bright at
 * noon in a dark one. So the hero's TEXT cannot come from the theme either.
 * `skyInkAt` picks the ink for an element from the sky's own colour at
 * that element's height — pure white where the sky is dark, pure black
 * where it is light, with the switch at a luminance where BOTH inks meet
 * WCAG AA (4.5:1): pure white on L = 0.18 is 4.56, pure black on it 4.6.
 * Anything softer than pure fails at the crossing, which is exactly the
 * moment a dawn passes through. The accent stays out of it: on the hero
 * the countdown is the ink, and its size is its rank.
 *
 * Pure functions throughout; the component only draws what `skyFrame`
 * returns.
 */
import { combineLocalDateAndTime } from '../../utils/prayerTimes';
import type { TimingsMap } from '../../types/prayer';
import { moonPosition, moonView, sunAltitude, type MoonView } from './moon';
import { nominalSkyLight, skyMoodFor, type SkyLight } from '../../theme/skyMoods';
import {
  moonGlow,
  MOON_SURFACE,
  sunGlow,
  SUN_GLOW_PEAK,
  SUN_SURFACE,
  tintedBy,
} from './skyLight';

export type SkyPassage = 'night' | 'dawn' | 'day' | 'sunset' | 'dusk';

/**
 * ── THE SKY'S OWN COLOURS ARE REALISTIC'S ─────────────────────────────
 *
 * The gradient used to be a set of hand-picked keyframes per passage
 * here, painted by nobody once the Sky theme shipped (every look takes a
 * mood's three stops, `themedSkyFrame`) except the full-screen alarm
 * under the other themes. The frame's own `top`, `bottom` and `glow` are
 * now Realistic's — the sky as it is, derived from the sun and the moon
 * (theme/skyMoods.ts) — so there is one real sky, and the alarm that
 * wakes the phone wears the sky the app does (2.33).
 */
// ── Colour arithmetic ───────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}
/** Linear blend of two hex colours, `t` from a to b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex([ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k]);
}
/** WCAG relative luminance of a hex colour. */
export function luminance(hex: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hexToRgb(hex).map(v => lin(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}


// ── Where in the day ────────────────────────────────────────────────────

export type SkyMoment = {
  passage: SkyPassage;
  /** How far through the passage, 0–1. The colours and the fades ride on this. */
  t: number;
  /**
   * How far through the DAY, sunrise 0 to Maghrib 1 — the sun's whole
   * journey, in one number that does not restart at a passage boundary.
   *
   * Negative before sunrise and greater than 1 after Maghrib, deliberately:
   * the dawn holds the sun at the point it will rise from, and nothing
   * draws it once it has set. Null when the day's timings cannot say.
   */
  daylight: number | null;
};

/**
 * Which passage the clock is in and how far through it, from the day's
 * timings. `tomorrowFajr` closes the night after Isha; without it the
 * night is assumed to end at today's Fajr plus a day. Before today's Fajr
 * the night is assumed to have begun at today's Isha minus a day.
 */
export function skyMoment(timings: TimingsMap, now: Date, tomorrowFajr?: string): SkyMoment {
  const at = (key: string, dayShift = 0): number | null => {
    const raw = timings[key];
    if (!raw) return null;
    const d = combineLocalDateAndTime(now, raw);
    if (dayShift) d.setDate(d.getDate() + dayShift);
    return d.getTime();
  };
  const n = now.getTime();
  const fajr = at('Fajr');
  const asr = at('Asr');
  const maghrib = at('Maghrib');
  const ishaRaw = at('Isha');
  const frac = (a: number, b: number) => (b > a ? Math.max(0, Math.min(1, (n - a) / (b - a))) : 0);

  if (fajr == null || asr == null || maghrib == null || ishaRaw == null) {
    return { passage: 'day', t: 0.5, daylight: 0.5 };
  }
  // At a high latitude in summer Isha falls after midnight and is stored
  // as the clock it shows ("00:47"), which as a time on the SAME day is
  // before Maghrib. It belongs to the night that Maghrib began, so it is
  // read as the next day's — otherwise the dusk was skipped and the night
  // began at Maghrib, an hour early, with the moon already at its end.
  const wrapped = ishaRaw < maghrib;
  const isha = wrapped ? ishaRaw + 24 * 3600_000 : ishaRaw;
  // Sunrise is an OPTIONAL row, and a map with the row turned off has no
  // key for it — which once turned the whole night into noon. Without it
  // the dawn is taken to last as long as it does at the middle latitudes
  // this app is used at, an hour and a half; the sky is a drawing, not a
  // timetable, and a dawn ten minutes long or short is not visible.
  const sunrise = at('Sunrise') ?? fajr + 90 * 60_000;
  /**
   * THE SUN'S OWN CLOCK, and the reason it no longer starts over three
   * times a day. Sunrise to Maghrib is the whole of the arc; every
   * passage that draws the sun reads its position from this, so the
   * position cannot disagree with itself at a boundary. Solar noon is the
   * midpoint of that span — which is where Dhuhr is — so a sine over it
   * peaks where the sun is highest, without anyone having to say so.
   */
  const daylight =
    maghrib > sunrise ? (n - sunrise) / (maghrib - sunrise) : null;
  if (n < fajr) {
    // Before Fajr. With a wrapped Isha, the small hours up to it are still
    // last evening's dusk — Maghrib was yesterday's clock, Isha is today's
    // — and the night that follows began at that Isha, this morning.
    if (wrapped && n < ishaRaw) {
      return { passage: 'dusk', t: frac(maghrib - 24 * 3600_000, ishaRaw), daylight };
    }
    const from = wrapped ? ishaRaw : isha - 24 * 3600_000;
    return { passage: 'night', t: frac(from, fajr), daylight };
  }
  if (n < sunrise) return { passage: 'dawn', t: frac(fajr, sunrise), daylight };
  if (n < asr) return { passage: 'day', t: frac(sunrise, asr), daylight };
  if (n < maghrib) return { passage: 'sunset', t: frac(asr, maghrib), daylight };
  if (n < isha) return { passage: 'dusk', t: frac(maghrib, isha), daylight };
  let end: number;
  if (tomorrowFajr) {
    const d = combineLocalDateAndTime(now, tomorrowFajr);
    d.setDate(d.getDate() + 1);
    end = d.getTime();
  } else {
    end = fajr + 24 * 3600_000;
  }
  return { passage: 'night', t: frac(isha, end), daylight };
}

// ── The frame the component draws ───────────────────────────────────────

export type SkyBody =
  | { kind: 'none' }
  | {
      kind: 'sun';
      x: number;
      y: number;
      alpha: number;
      /**
       * How much of the disc is under the horizon, 0–1: 0 the whole disc
       * above it (the day), 0.5 cut in half (sunrise, Maghrib), 1 gone
       * under (twilight). The disc is drawn that far below the horizon
       * line and clipped at it — see HeroSky — so the sun RISES and SETS
       * rather than standing whole on the line through the whole of dawn
       * and the whole of the sunset (2.33).
       */
      below: number;
      /** Its colour where the reader is standing, after the air. */
      light: string;
      /** How hard it glows, 0–1 — see skyLight's SUN_GLOW_PEAK. */
      halo: number;
    }
  | ({
      kind: 'moon';
      x: number;
      y: number;
      /**
       * 1 through the night; fading out with the stars through the dawn
       * and in with them through the dusk, so no instant has a moon that
       * simply appears or vanishes (2.33). Its place in those is the
       * night's own end: the setting point at dawn, the rising point at dusk.
       */
      alpha: number;
      light: string;
      halo: number;
    } & MoonView);

export type SkyFrame = {
  passage: SkyPassage;
  t: number;
  /**
   * Where the sun and the moon are, which the Sky theme's colours are a
   * function of (theme/skyMoods.ts): the sun's altitude, the day's
   * progress, the moon's phase and height. From the reader's coordinates
   * when there are any; the average day's otherwise.
   */
  light: SkyLight;
  top: string;
  bottom: string;
  /** A third colour, at `midAt` of the height, when the sky has one (the Sky theme's hero). */
  mid?: string;
  midAt?: number;
  glow: string;
  /** 0–1: how visible the stars are. */
  stars: number;
  body: SkyBody;
};

/**
 * Where a body rises and where it sets, across the card's width.
 *
 * A whole day's arc, so it is worth the width: 0.3–0.66 was the span when
 * each passage swept its own, and three short sweeps in the middle of the
 * card read as a body that shuffles rather than travels. The margins keep
 * a 22dp moon clear of both edges on the narrowest phone.
 */
const X_RISE = 0.12;
const X_SET = 0.88;
/**
 * The strip's floor — a body "at the horizon" sits here. The countdown's
 * cap line is at about 0.3 of the hero, so nothing drawn goes below 0.28.
 */
const Y_LOW = 0.26;
const Y_HIGH = 0.08;
/** The horizon the sun rises over: where its centre is drawn at sunrise and Maghrib. */
export const SUN_HORIZON_Y = Y_LOW;
/**
 * How much of the day the sun takes to clear the horizon after sunrise,
 * and to reach it before Maghrib: 2 % of a 12-hour day is a quarter of an
 * hour — a few minutes longer than the real four, so the rise is seen.
 */
export const SUN_RISE_SPAN = 0.02;
/** Where the moon waits before it rises and after it has set: the night's ends. */
const MOON_REST_Y = 0.22;

/** Between 0 and 1. */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Where the sun is, from how far through the day it is — ONE arc, from
 * the point it rises at to the point it sets at.
 *
 * It used to be derived from the progress of the current passage, so it
 * ran left to right three times over: once through the dawn, again from
 * sunrise to Asr, and a third time from Asr to Maghrib — jumping back to
 * the left, and at Asr upward as well, at each boundary. What the passage
 * is good at is the colour and the fading in and out; where the sun IS
 * belongs to the day.
 *
 * The height is a sine over the same span, so it peaks at the midpoint of
 * sunrise and Maghrib — solar noon, which is Dhuhr — and returns to the
 * horizon exactly as Maghrib arrives. Before sunrise the arc is held at
 * its start: the sun waits at the point it will rise from and comes up
 * there, which is what the dawn draws.
 */
function sunAt(daylight: number | null): { x: number; y: number } {
  const f = clamp01(daylight ?? 0);
  return {
    x: X_RISE + f * (X_SET - X_RISE),
    y: Y_LOW - Math.sin(f * Math.PI) * (Y_LOW - Y_HIGH),
  };
}

/**
 * `where` is the reader's own coordinates, and only the moon uses them:
 * which way up its crescent sits is the one thing in this scene that is
 * different in Jakarta from in Stockholm. Omitted — no location set yet —
 * the moon falls back to the northern hemisphere's, which is what the
 * whole app drew before it asked.
 */
/**
 * Without coordinates there is no real altitude to light the sun by, and
 * the average day's stands in (theme/skyMoods.ts, `nominalSkyLight`):
 * wrong for a polar winter and roughly right for everywhere most people
 * are, which is the best a sky can do before it has been told where it is.
 */

export function skyFrame(
  moment: SkyMoment,
  now: Date,
  where?: { latitude?: number | null; longitude?: number | null },
): SkyFrame {
  const { passage, t } = moment;
  // The moon crosses the night, which is one passage, so its own progress
  // is the whole of its journey.
  const x = X_RISE + t * (X_SET - X_RISE);
  const sun = sunAt(moment.daylight);
  /**
   * How high the sun really is, which decides both its colour and how
   * hard it glows — the arc it is DRAWN on peaks at solar noon wherever
   * you are, and only the real altitude knows that a Stockholm December
   * noon is seven degrees and never goes white.
   */
  const altitude =
    typeof where?.latitude === 'number' && typeof where?.longitude === 'number'
      ? sunAltitude(now, where.latitude, where.longitude)
      : nominalSkyLight(passage, t).sun;
  const sunLight = { light: tintedBy(SUN_SURFACE, altitude), halo: sunGlow(altitude) };
  let stars = 0;
  let body: SkyBody = { kind: 'none' };
  const placed = typeof where?.latitude === 'number' && typeof where?.longitude === 'number';
  const moon = moonView(now, where?.latitude, where?.longitude);
  /**
   * ── THE MOON WHERE IT IS ─────────────────────────────────────────────
   * With coordinates the moon is drawn where it stands: its height from
   * its altitude (the horizon at the band's floor, 60° and above at the
   * top), its place across the card from its azimuth — east at the left
   * and west at the right for a reader facing south, the other way round
   * south of the equator — and only while it is up. A crescent that in
   * fact sets two hours after the sun then sets two hours after the sun,
   * and a full moon rises at dusk and crosses the whole night, which is
   * what the reader's own moon does (2.33). Without coordinates the moon
   * takes the night's own track, as it always did.
   */
  const position = placed ? moonPosition(now, where.latitude as number, where.longitude as number) : null;
  const light: SkyLight = {
    sun: altitude,
    daylight: moment.daylight,
    moon: { illumination: moon.illuminated, altitude: position ? position.altitude : null },
  };
  // Moonlight is sunlight off a grey rock, and the rock is the same colour
  // all night; what changes is how much of it is lit.
  const moonAt = (mx: number, my: number, alpha: number): SkyBody => ({
    kind: 'moon',
    x: mx,
    y: my,
    alpha,
    ...moon,
    light: MOON_SURFACE,
    halo: moonGlow(moon.illuminated),
  });
  /** The real moon, if it is up and the sky is dark enough to show it; else what the track says. */
  const realMoon = (fallback: () => SkyBody, visibility: number): SkyBody => {
    if (!position) return fallback();
    if (position.altitude <= 0 || visibility <= 0) return { kind: 'none' };
    const south = (where?.latitude ?? 0) >= 0;
    const across = clamp01((position.azimuth - 90) / 180);
    const mx = X_RISE + (south ? across : 1 - across) * (X_SET - X_RISE);
    const my = Y_LOW - clamp01(position.altitude / 60) * (Y_LOW - Y_HIGH);
    // Coming up over the horizon: in through its first degrees.
    return moonAt(mx, my, Math.min(visibility, clamp01(position.altitude / 4)));
  };
  const depth = Math.max(0, -altitude);
  // How dark the sky is for the moon to show: through the civil twilight.
  const dusky = placed ? clamp01(depth / 6) : 0;
  const daylight = clamp01(moment.daylight ?? 0);
  switch (passage) {
    case 'night': {
      stars = 1;
      body = realMoon(() => moonAt(x, MOON_REST_Y - Math.sin(t * Math.PI) * 0.1, 1), 1);
      break;
    }
    case 'dawn': {
      // Stars fade as the sky lightens, and the moon — at its setting
      // point — with them. The sun comes up under the horizon at t ≈ 0.6
      // and is cut in half by it at sunrise, at the point the day's arc
      // then carries it on from. Only the coming-up is the dawn's.
      stars = Math.max(0, 1 - t / 0.5);
      const rise = Math.max(0, (t - 0.6) / 0.4);
      body =
        rise > 0
          ? { kind: 'sun', x: sun.x, y: sun.y, alpha: 1, below: 1 - rise / 2, ...sunLight }
          : realMoon(() => (stars > 0 ? moonAt(X_SET, MOON_REST_Y, stars) : { kind: 'none' }), Math.max(stars, dusky));
      break;
    }
    case 'day':
      // Clearing the horizon through the first minutes after sunrise.
      body = { kind: 'sun', x: sun.x, y: sun.y, alpha: 1, below: Math.max(0, 0.5 - daylight / (2 * SUN_RISE_SPAN)), ...sunLight };
      break;
    case 'sunset': {
      // The same arc, still coming down — and into the horizon through the
      // last minutes before Maghrib, half under it as Maghrib arrives.
      body = {
        kind: 'sun',
        x: sun.x,
        y: sun.y,
        alpha: 1,
        below: Math.max(0, 0.5 - (1 - daylight) / (2 * SUN_RISE_SPAN)),
        ...sunLight,
      };
      break;
    }
    case 'dusk': {
      // The sun goes the rest of the way under through the first part of
      // the dusk; then the stars come out, and the moon with them, at its
      // rising point.
      stars = Math.max(0, (t - 0.4) / 0.6);
      body =
        t < 0.3
          ? { kind: 'sun', x: sun.x, y: sun.y, alpha: 1, below: 0.5 + t / 0.6, ...sunLight }
          : realMoon(() => (stars > 0 ? moonAt(X_RISE, MOON_REST_Y, stars) : { kind: 'none' }), Math.max(stars, dusky));
      break;
    }
  }
  // Under a bright moon the stars go: fewer and fainter, as they do.
  const moonUp = position ? (position.altitude > 0 ? 1 : 0) : 0.5;
  stars *= 1 - 0.45 * moon.illuminated * moonUp;
  const real = skyMoodFor(passage, t, undefined, 'realistic', light);
  return { passage, t, light, top: real.heroTop, bottom: real.heroFoot, glow: real.starGlow, stars, body };
}

// ── The ink ─────────────────────────────────────────────────────────────

export type SkyInkColors = {
  text: string;
  muted: string;
  track: string;
  fill: string;
  /** The soft ring round the rail's head: the fill, mostly sky. */
  ring: string;
};

/** The sky's colour at a fraction of the card's height. */
export function skyColorAt(frame: Pick<SkyFrame, 'top' | 'bottom' | 'mid' | 'midAt'>, y: number): string {
  const k = Math.max(0, Math.min(1, y));
  if (frame.mid && frame.midAt != null && frame.midAt > 0 && frame.midAt < 1) {
    return k <= frame.midAt
      ? mixHex(frame.top, frame.mid, k / frame.midAt)
      : mixHex(frame.mid, frame.bottom, (k - frame.midAt) / (1 - frame.midAt));
  }
  return mixHex(frame.top, frame.bottom, k);
}

/** Where the Sky theme's middle stop sits: the glow is low, near the horizon. */
export const SKY_THEME_MID_AT = 0.62;
/**
 * Where it sits when the sky runs into a page of the other polarity — a
 * night sky over Light's paper, a day sky over Dark's: below the
 * countdown's foot (HERO_Y.foot), so the countdown, the rail and its
 * labels are all on the sky, in one ink, and only the band under them
 * fades into the page.
 */
export const SKY_FADE_LOW_MID_AT = 0.88;

/** How much harder a body glows under the theme: a neon, not a lamp. */
const SKY_THEME_HALO = 1.35;

/**
 * The frame, repainted for the Sky theme (theme/skyMoods.ts): the hour's
 * gradient, three stops, the foot on the page; the sun or the moon and
 * the stars in the hour's own light, the halo a little stronger. Where
 * the bodies are, their phase and their size are the real sky's.
 */
export function themedSkyFrame(
  frame: SkyFrame,
  hero: { heroTop: string; heroMid: string; heroFoot: string; bodyLight: string; starGlow: string },
  midAt: number = SKY_THEME_MID_AT,
): SkyFrame {
  const body: SkyBody =
    frame.body.kind === 'none'
      ? frame.body
      : { ...frame.body, light: hero.bodyLight, halo: Math.min(SUN_GLOW_PEAK, frame.body.halo * SKY_THEME_HALO) };
  return {
    ...frame,
    top: hero.heroTop,
    mid: hero.heroMid,
    midAt,
    bottom: hero.heroFoot,
    glow: hero.starGlow,
    body,
  };
}

/**
 * The luminance at which the ink switches — where pure white (4.56:1)
 * and pure black (4.6:1) both clear AA against the sky.
 */
export const INK_SWITCH_LUMINANCE = 0.18;

/** The ink for an element drawn at height `y` of the card. */
export function skyInkAt(frame: Pick<SkyFrame, 'top' | 'bottom' | 'mid' | 'midAt'>, y: number): SkyInkColors {
  const light = luminance(skyColorAt(frame, y)) < INK_SWITCH_LUMINANCE;
  return light
    ? {
        text: '#FFFFFF',
        muted: 'rgba(255,255,255,0.78)',
        track: 'rgba(255,255,255,0.24)',
        fill: '#FFFFFF',
        ring: 'rgba(255,255,255,0.22)',
      }
    : {
        text: '#000000',
        muted: 'rgba(0,0,0,0.66)',
        track: 'rgba(0,0,0,0.16)',
        fill: '#000000',
        ring: 'rgba(0,0,0,0.14)',
      };
}

/** Where the hero's elements sit, as fractions of its height. */
export const HERO_Y = { eyebrow: 0.12, countdown: 0.4, foot: 0.82 } as const;
