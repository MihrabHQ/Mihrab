/**
 * Where the hero's sky meets a page that is not its own polarity (a night
 * sky over the Light theme's page, a day's over the Dark's), and the
 * horizon's stop on its way from the golden hour's haze to the day's
 * blue-white. Found on an emulator walked through a Casablanca day in
 * every look (2.38): a black rail and black names on the night sky under
 * Light, a hard grey band where the sky ended, and a mint horizon for a
 * quarter of an hour at a sun of twelve degrees.
 */
import fs from 'fs';
import path from 'path';
import { HERO_SPAN, SKY_FADE_LOW_MID_AT, SKY_THEME_MID_AT, SKY_TURN_HALF_AT, luminance, skyInkAt, skyStops } from '../src/screens/home/skyModel';
import { contrastOf, mixHexHorizon, mixHexOklab, skyMoodOf } from '../src/theme/skyMoods';
import { hexToOklch } from '../src/theme/oklch';

const NIGHT = { top: '#0e1f52', mid: '#533b77', bottom: '#FAF7F2' };
const DAY_OVER_DARK = { top: '#1d7fe1', mid: '#95d1ff', bottom: '#141210' };

describe('the turn into a page of the other polarity', () => {
  it('has a stop in its middle, half-way as the eye counts it, and only there', () => {
    const turn = skyStops({ ...NIGHT, midAt: 0.97 });
    expect(turn).toHaveLength(4);
    expect(turn[1]).toEqual([NIGHT.mid, 0.97]);
    expect(turn[2][0]).toBe(mixHexOklab(NIGHT.mid, NIGHT.bottom, 0.5));
    expect(turn[2][1]).toBeCloseTo(0.97 + 0.03 * SKY_TURN_HALF_AT, 6);
    // …which is lighter than the straight sRGB half-way grey was, and still has the sky's tint in it
    const half = hexToOklch(turn[2][0]);
    expect(half.L).toBeGreaterThan(hexToOklch(NIGHT.mid).L);
    expect(half.L).toBeLessThan(hexToOklch(NIGHT.bottom).L);
    expect(half.C).toBeGreaterThan(0.03);
    // A sky over its own page, and a sky with no middle stop, are painted as they were.
    expect(skyStops({ ...NIGHT, midAt: SKY_THEME_MID_AT })).toEqual([[NIGHT.top, 0], [NIGHT.mid, SKY_THEME_MID_AT], [NIGHT.bottom, 1]]);
    expect(skyStops({ top: '#000000', bottom: '#ffffff' })).toEqual([['#000000', 0], ['#ffffff', 1]]);
    // every stop in order
    for (const f of [{ ...NIGHT, midAt: SKY_FADE_LOW_MID_AT }, { ...DAY_OVER_DARK, midAt: 0.985 }]) {
      const at = skyStops(f).map(s => s[1]);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
  });

  it('leaves the rail on the sky: its ink is the sky’s just above the turn, at every height the turn may stand', () => {
    // Sampled across the turn at its lowest, the foot's ink was the page's: black on a night sky.
    expect(skyInkAt({ ...NIGHT, midAt: 0.97 }, 0.97, HERO_SPAN.foot).text).toBe('#000000');
    for (const [frame, white] of [[NIGHT, true], [DAY_OVER_DARK, false]] as const) {
      for (let turnAt = SKY_FADE_LOW_MID_AT; turnAt <= 0.97; turnAt += 0.01) {
        const f = { ...frame, midAt: turnAt };
        // the block's foot is a hundredth and a half above the turn (HeroToday, `lowMidAt`)
        const yFoot = turnAt - 0.015;
        const above = skyInkAt(f, Math.min(yFoot, turnAt - HERO_SPAN.foot), HERO_SPAN.foot);
        expect(above.text).toBe(white ? '#FFFFFF' : '#000000');
        // and it reads there: on the sky at the rail's own height
        const sky = white ? NIGHT.mid : DAY_OVER_DARK.mid;
        expect(contrastOf(above.text, sky)).toBeGreaterThanOrEqual(4.5);
      }
    }
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroToday.tsx'), 'utf8');
    expect(src).toMatch(/const yFootInk = turnAt != null \? Math\.min\(yFoot, turnAt - HERO_SPAN\.foot\) : yFoot;/);
    expect(src).toMatch(/skyInkAt\(frame, yFootInk, HERO_SPAN\.foot\)/);
    const sky = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroSky.tsx'), 'utf8');
    // both painters — the still sky and the launch run's layers — take their stops from the one place
    expect(sky.match(/linearDown\(skyStops\(/g)).toHaveLength(2);
  });
});

describe('the horizon between the haze and the blue-white', () => {
  const AMBER = '#f0d5b3';
  const BLUE_WHITE = '#c1e6f7';
  const green = (hex: string) => {
    const c = hexToOklch(hex);
    // the mints: from yellow-green to sea-green (a pale cyan beside the blue-white end is the sky's own)
    return c.h > 100 && c.h < 185 ? c.C : 0;
  };

  it('meets in white, not in mint', () => {
    let worst = 0;
    for (let u = 0; u <= 1.0001; u += 0.02) worst = Math.max(worst, green(mixHexHorizon(AMBER, BLUE_WHITE, u)));
    // the straight mix carried four times this much green at its middle
    let straight = 0;
    for (let u = 0; u <= 1.0001; u += 0.02) straight = Math.max(straight, green(mixHexOklab(AMBER, BLUE_WHITE, u)));
    expect(straight).toBeGreaterThan(0.012);
    expect(worst).toBeLessThan(0.009);
    expect(mixHexHorizon(AMBER, BLUE_WHITE, 0)).toBe(mixHexOklab(AMBER, BLUE_WHITE, 0));
    expect(mixHexHorizon(AMBER, BLUE_WHITE, 1)).toBe(mixHexOklab(AMBER, BLUE_WHITE, 1));
  });

  it('without a step, and as light as it was', () => {
    let prev = mixHexHorizon(AMBER, BLUE_WHITE, 0);
    for (let u = 0.01; u <= 1.0001; u += 0.01) {
      const next = mixHexHorizon(AMBER, BLUE_WHITE, u);
      const a = hexToOklch(prev), b = hexToOklch(next);
      expect(Math.abs(a.L - b.L)).toBeLessThan(0.01);
      expect(Math.abs(a.C - b.C)).toBeLessThan(0.016);
      expect(Math.abs(luminance(next) - luminance(mixHexOklab(AMBER, BLUE_WHITE, u)))).toBeLessThan(0.02);
      prev = next;
    }
  });

  it('a horizon that IS green at an end — none is, but the rule is the rule — is left alone, and the real sky at eleven degrees is neutral', () => {
    expect(mixHexHorizon('#7fd6a0', '#c1e6f7', 0.5)).toBe(mixHexOklab('#7fd6a0', '#c1e6f7', 0.5));
    for (const daylight of [0.08, 0.92]) {
      for (let sun = 9; sun <= 13; sun += 0.25) {
        const mid = skyMoodOf('day', 0.5, { sun, daylight }, 'realistic').heroMid;
        expect(green(mid)).toBeLessThan(0.009);
      }
    }
  });
});
