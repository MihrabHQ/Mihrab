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
import { HERO_SPAN, MUTED_INK_FLOOR, SKY_FADE_LOW_MID_AT, SKY_GLOW_FALL, SKY_SHEET_DP, sheetTurnAt, SKY_THEME_MID_AT, SKY_TURN_HALF_AT, SUN_HORIZON_Y, luminance, skyColorAt, skyFrame, skyInkAcross, skyInkAt, skyMoment, skyStops, themedSkyFrame } from '../src/screens/home/skyModel';
import { ACCENT_CROSSING, accentCrossing, contrastOf, mixHexHorizon, mixHexOklab, mixMoods, skyMoodOf, skyMoodsOf } from '../src/theme/skyMoods';
import { hexToOklch } from '../src/theme/oklch';

// A night sky and a day's, each whole — glow, block, its own foot — over a page that is not its polarity.
const NIGHT = { top: '#0e1f52', mid: '#533b77', midAt: 0.52, low: '#2b2a55', lowAt: 0.61, bottom: '#121c35', page: '#FAF7F2' };
const DAY_OVER_DARK = { top: '#1d7fe1', mid: '#95d1ff', midAt: 0.52, low: '#c4e5ff', lowAt: 0.61, bottom: '#eef6ff', page: '#141210' };

describe('the turn into a page of the other polarity', () => {
  it('is the last of the hero: the sky above it is the sky it is under its own page, stop for stop', () => {
    const own = skyStops({ ...NIGHT, page: undefined });
    const turned = skyStops({ ...NIGHT, turnAt: 0.97 });
    expect(own).toEqual([[NIGHT.top, 0], [NIGHT.mid, 0.52], [NIGHT.low, 0.61], [NIGHT.bottom, 1]]);
    // the same four colours, the foot at the turn; then a half-way stop, and the page
    expect(turned.slice(0, 3)).toEqual(own.slice(0, 3));
    expect(turned[3]).toEqual([NIGHT.bottom, 0.97]);
    expect(turned[4][0]).toBe(mixHexOklab(NIGHT.bottom, NIGHT.page, 0.5));
    expect(turned[4][1]).toBeCloseTo(0.97 + 0.03 * SKY_TURN_HALF_AT, 6);
    expect(turned[5]).toEqual([NIGHT.page, 1]);
    // the half-way colour is between the two as the eye counts it, with the sky's tint still in it
    const half = hexToOklch(turned[4][0]);
    expect(half.L).toBeGreaterThan(hexToOklch(NIGHT.bottom).L + 0.2);
    expect(half.L).toBeLessThan(hexToOklch(NIGHT.page).L - 0.2);
    expect(half.C).toBeGreaterThan(0.01);
    // every stop in order, at every height the turn may stand; and the colour read is the colour painted
    for (const f of [NIGHT, DAY_OVER_DARK]) {
      for (let turnAt = SKY_FADE_LOW_MID_AT; turnAt <= 0.97; turnAt += 0.01) {
        const stops = skyStops({ ...f, turnAt });
        const at = stops.map(st => st[1]);
        expect([...at].sort((a, b) => a - b)).toEqual(at);
        for (const [colour, y] of stops) expect(skyColorAt({ ...f, turnAt }, y).toLowerCase()).toBe(colour.toLowerCase());
      }
    }
    // no turn asked for, none made: a page with no place for it, or no page
    expect(skyStops({ ...NIGHT, turnAt: 1 })).toHaveLength(4);
    expect(skyStops({ ...NIGHT, page: undefined, turnAt: 0.97 })).toHaveLength(4);
    expect(skyStops({ top: '#000000', bottom: '#ffffff' })).toEqual([['#000000', 0], ['#ffffff', 1]]);
  });

  it('leaves the rail and the names on the sky, in the sky’s ink, and the sky under them is the night — not the glow', () => {
    for (const [frame, white] of [[NIGHT, true], [DAY_OVER_DARK, false]] as const) {
      for (let turnAt = SKY_FADE_LOW_MID_AT; turnAt <= 0.97; turnAt += 0.01) {
        const f = { ...frame, turnAt };
        // the block's foot is a hundredth and a half above the turn (HeroToday, `lowMidAt`)
        const yFoot = turnAt - 0.015;
        const ink = skyInkAt(f, Math.min(yFoot, turnAt - HERO_SPAN.foot), HERO_SPAN.foot);
        expect(ink.text).toBe(white ? '#FFFFFF' : '#000000');
        // the names, a little above the foot: well clear of AA, because what is under them is the sky's own foot
        for (const y of [turnAt - 0.05, turnAt - 0.03, turnAt - 0.015]) expect(contrastOf(ink.text, skyColorAt(f, y))).toBeGreaterThanOrEqual(7);
      }
    }
    // Sampled across the turn, the foot's ink was the page's: black on a night sky.
    expect(skyInkAt({ ...NIGHT, turnAt: 0.97 }, 0.985, 0.012).text).toBe('#000000');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroToday.tsx'), 'utf8');
    expect(src).toMatch(/const turnAt = frame\.turnAt \?\? null;/);
    expect(src).toMatch(/const yFootInk = turnAt != null \? Math\.min\(yFoot, turnAt - HERO_SPAN\.foot\) : yFoot;/);
    expect(src).toMatch(/skyInkAt\(frame, yFootInk, HERO_SPAN\.foot\)/);
    // its own page: the sky runs into it; another's: the same sky, and the turn
    expect(src).toMatch(/if \(mood\.isDark === pageDark\) return themedSkyFrame\(f, \{ \.\.\.mood, heroFoot: pageBg \}, glowAt, blockAt\);/);
    expect(src).toMatch(/return themedSkyFrame\(f, mood, glowAt, blockAt, \{ at: lowMidAt, page: pageBg, sheet: sheeted \}\);/);
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

describe('each of the hero’s words is inked where it stands', () => {
  // Twenty minutes after Maghrib: a deep blue over an ember, on a night page.
  const DUSK = { top: '#294d97', mid: '#e26b53', midAt: 0.575, bottom: '#131e37' };
  const mutedOver = (ink: { text: string; muted: string }, sky: string) => {
    const a = Number(/,([\d.]+)\)$/.exec(ink.muted)![1]);
    const w = ink.text === '#FFFFFF';
    const n = parseInt(sky.slice(1), 16);
    return '#' + [16, 8, 0].map(sh => Math.round((w ? 255 : 0) * a + ((n >> sh) & 255) * (1 - a)).toString(16).padStart(2, '0')).join('');
  };

  it('the place’s name and the status bar at the top of the sky, not at the eyebrow’s height', () => {
    // at the eyebrow's height the ember asks for black; the top row is on the blue
    const atEyebrow = skyInkAt({ ...DUSK, midAt: SKY_THEME_MID_AT }, 0.61, HERO_SPAN.eyebrow);
    expect(atEyebrow.text).toBe('#000000');
    expect(contrastOf(atEyebrow.text, skyColorAt(DUSK, 0.21))).toBeLessThan(4.5);
    const row = skyInkAt(DUSK, 0.21, HERO_SPAN.eyebrow);
    expect(row.text).toBe('#FFFFFF');
    expect(contrastOf(row.text, skyColorAt(DUSK, 0.21))).toBeGreaterThanOrEqual(4.5);
    expect(skyInkAt(DUSK, 0.03).text).toBe('#FFFFFF');
    const hero = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroToday.tsx'), 'utf8');
    expect(hero).toMatch(/<HeroTopRow topRow=\{topRow\} ink=\{inkRow\}/);
    expect(hero).toMatch(/\{topRow\.renderHelp\(inkRow\)\}/);
    expect(hero).toMatch(/barStyle=\{inkBar\.text === '#FFFFFF' \? 'light-content' : 'dark-content'\}/);
    expect(hero).toMatch(/trackInk=\{inkBand\.text\}\s*trackLabelInk=\{inkBand\.muted\}/);
  });

  it('the glow stands above the block, so no word of the block is written across it', () => {
    const hero = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroToday.tsx'), 'utf8');
    expect(hero).toMatch(/glow: Math\.max\(SKY_GLOW_MIN_AT, Math\.min\(SKY_THEME_MID_AT, Math\.round\(\(blockTop - SKY_GLOW_ABOVE_BLOCK\) \* 200\) \/ 200\)\),/);
    // With the glow ON the eyebrow's line (0.62 of the sky, as it was) the best ink for the eyebrow is under AA…
    const on = { ...DUSK, mid: '#c25a68', midAt: 0.62 };
    const before = skyInkAt(on, 0.634, HERO_SPAN.eyebrow);
    expect(contrastOf(mutedOver(before, skyColorAt(on, 0.62)), skyColorAt(on, 0.62))).toBeLessThan(4.5);
    // …and with it above the block the same words clear it, at every height of their line.
    const above = { ...on, midAt: 0.575 };
    const after = skyInkAt(above, 0.634, HERO_SPAN.eyebrow);
    for (const y of [0.61, 0.62, 0.634, 0.65, 0.66]) {
      expect(contrastOf(mutedOver(after, skyColorAt(above, y)), skyColorAt(above, y))).toBeGreaterThanOrEqual(MUTED_INK_FLOOR);
    }
  });

  it('the ink is asked at the gradient’s stop when an element lies across it, and the muted ink may be the ink itself', () => {
    // a thin bright band between two dark halves: the three samples at 0.55, 0.62 and 0.69 would… include it; at 0.6 ± 0.03 they step over a stop at 0.62
    const band = { top: '#101830', mid: '#f0c0a0', midAt: 0.62, bottom: '#101830' };
    const ink = skyInkAt(band, 0.6, 0.03);
    // the worst place for white is the stop, and it is seen: black, whose worst (at 0.57) is the better of the two
    const worstWhite = contrastOf('#ffffff', band.mid);
    const worstBlack = contrastOf('#000000', skyColorAt(band, 0.57));
    expect(ink.text).toBe(worstWhite >= worstBlack ? '#FFFFFF' : '#000000');
    // on the ember no step short of the full ink clears AA: the ladder ends at the ink
    // through the luminances where the two inks read alike: wherever the full ink clears AA, so does the muted one
    let full = 0;
    for (let v = 0x60; v <= 0xb0; v += 2) {
      const grey = '#' + v.toString(16).padStart(2, '0').repeat(3);
      const got = skyInkAt({ top: grey, bottom: grey }, 0.5, 0.02);
      if (contrastOf(got.text, grey) >= MUTED_INK_FLOOR) expect(contrastOf(mutedOver(got, grey), grey)).toBeGreaterThanOrEqual(MUTED_INK_FLOOR - 0.02);
      if (/,1\)$/.test(got.muted)) full += 1;
    }
    expect(full).toBeGreaterThan(0);
  });

  it('Minimal’s figures and the line under them share the ink that suits both by their own floors', () => {
    // figures on the ember (large: 3:1), the prayer's name on the darker sky under it (small: 4.5:1)
    const stack = [{ y: 0.663, span: HERO_SPAN.countdown, floor: 3 }, { y: 0.728, span: 0.012, floor: MUTED_INK_FLOOR }];
    const f = { ...DUSK, midAt: 0.62 };
    const one = skyInkAt(f, 0.663, HERO_SPAN.countdown);
    const both = skyInkAcross(f, stack);
    expect(one.text).toBe('#000000');
    expect(contrastOf(mutedOver(one, skyColorAt(f, 0.728)), skyColorAt(f, 0.728))).toBeLessThan(4.5);
    expect(both.text).toBe('#FFFFFF');
    expect(contrastOf(both.text, f.mid)).toBeGreaterThanOrEqual(3);
    for (const y of [0.716, 0.728, 0.74]) expect(contrastOf(mutedOver(both, skyColorAt(f, y)), skyColorAt(f, y))).toBeGreaterThanOrEqual(4.5);
    // a day sky asks for black in both, as before
    const day = { top: '#1d7fe1', mid: '#95d1ff', midAt: 0.62, bottom: '#eef6ff' };
    expect(skyInkAcross(day, stack).text).toBe('#000000');
  });
});

describe('the polar day’s sun', () => {
  it('is drawn from the horizon while it is under it, so the horizon hides it — not from the arc’s height', () => {
    const TROMSO = { latitude: 69.65, longitude: 18.96 };
    const times = { Fajr: '07:30', Sunrise: '10:30', Dhuhr: '11:50', Asr: '12:40', Maghrib: '13:10', Isha: '15:30' };
    for (const [h, m] of [[11, 0], [11, 50], [12, 30], [13, 0]]) {
      const at = new Date(2026, 11, 20, h, m);
      const f = skyFrame(skyMoment(times, at), at, TROMSO);
      expect(f.light.sun).toBeLessThan(-1.7);
      expect(f.body.kind).toBe('sun');
      if (f.body.kind === 'sun') {
        expect(f.body.below).toBe(1);
        expect(f.body.y).toBe(SUN_HORIZON_Y);
      }
    }
    // an ordinary noon is on its arc, high over the horizon
    const noon = new Date(2026, 5, 15, 12, 30);
    const g = skyFrame(skyMoment({ Fajr: '03:30', Sunrise: '05:00', Dhuhr: '12:30', Asr: '16:00', Maghrib: '19:50', Isha: '21:20' }, noon), noon, { latitude: 30, longitude: 31 });
    if (g.body.kind === 'sun') {
      expect(g.body.below).toBe(0);
      expect(g.body.y).toBeLessThan(SUN_HORIZON_Y - 0.05);
    }
  });
});

describe('the glow is a band, and the block stands under it', () => {
  const mood = { heroTop: '#294d97', heroMid: '#e26b53', heroFoot: '#131e37', bodyLight: '#fea268', starGlow: '#ffffff' };
  const at = new Date(2026, 3, 28, 19, 40);
  const base = skyFrame(skyMoment({ Fajr: '04:49', Sunrise: '06:15', Dhuhr: '12:54', Asr: '16:29', Maghrib: '19:30', Isha: '20:52' }, at), at);

  it('falls most of its way to the page by the top of the block, and the rest under the words', () => {
    const f = themedSkyFrame(base, mood, 0.52, 0.61);
    // under this ember the straight line does not read, and the stop is there — no deeper than its limit
    expect(f.low).toBeDefined();
    expect(f.lowAt).toBe(0.61);
    expect(hexToOklch(f.low!).L).toBeGreaterThanOrEqual(hexToOklch(mixHexOklab(mood.heroMid, mood.heroFoot, SKY_GLOW_FALL)).L - 1e-6);
    expect(hexToOklch(f.low!).L).toBeLessThan(hexToOklch(skyColorAt(themedSkyFrame(base, mood, 0.52), 0.61)).L);
    expect(skyStops(f)).toEqual([[mood.heroTop, 0], [mood.heroMid, 0.52], [f.low, 0.61], [mood.heroFoot, 1]]);
    // the sky is one line through its four stops: no step at any of them, darker all the way down from the glow
    let prev = luminance(skyColorAt(f, 0.52));
    for (let y = 0.53; y <= 1.0001; y += 0.01) {
      const l = luminance(skyColorAt(f, y));
      expect(l).toBeLessThanOrEqual(prev + 1e-6);
      expect(prev - l).toBeLessThan(0.05);
      prev = l;
    }
    expect(skyColorAt(f, 0.61).toLowerCase()).toBe(f.low!.toLowerCase());
    // the block's first line: white reads on it at AA, where straight from the glow to the foot it did not
    const straight = themedSkyFrame(base, mood, 0.52);
    expect(contrastOf('#ffffff', skyColorAt(straight, 0.615))).toBeLessThan(4.5);
    for (const y of [0.61, 0.62, 0.634, 0.65, 0.7, 0.8, 0.9]) expect(contrastOf('#ffffff', skyColorAt(f, y))).toBeGreaterThanOrEqual(4.5);
  });

  it('and is not there at all where the sky reads without it: no tint behind the countdown under a rose, a night or a day', () => {
    for (const heroMid of ['#a8506a', '#533b77', '#2e2a5c']) {
      const f = themedSkyFrame(base, { ...mood, heroMid }, 0.52, 0.61);
      expect(f.low).toBeUndefined();
      expect(skyStops(f)).toHaveLength(3);
    }
    const day = themedSkyFrame(base, { ...mood, heroTop: '#1d7fe1', heroMid: '#95d1ff', heroFoot: '#eef6ff' }, 0.52, 0.61);
    expect(day.low).toBeUndefined();
    // and where it is there, it is the least that reads: a milder ember gets a shallower stop than a bright one
    const mild = themedSkyFrame(base, { ...mood, heroMid: '#c8605a' }, 0.52, 0.61);
    const bright = themedSkyFrame(base, mood, 0.52, 0.61);
    if (mild.low) expect(hexToOklch(mild.low).L).toBeGreaterThan(hexToOklch(bright.low!).L - 0.2);
  });

  it('only where there is a block under a glow: not before the hero has measured, and not in a turn', () => {
    expect(themedSkyFrame(base, mood).low).toBeUndefined();
    expect(themedSkyFrame(base, mood, 0.62, 0.62).low).toBeUndefined();
    expect(skyStops(themedSkyFrame(base, mood, 0.52, 0.61, { at: 0.97, page: '#FAF7F2' }))).toHaveLength(6); // …and the turn's two
    expect(skyStops(themedSkyFrame(base, mood))).toHaveLength(3);
  });
});

describe('the launch run rides the sky the hero then stands in', () => {
  const hero = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroToday.tsx'), 'utf8');

  it('the heights the sky is painted by start from the last launch’s layout, not from their unmeasured defaults', () => {
    // one rule for the three heights, used for the first frame and for every measured one
    expect(hero).toMatch(/function skyHeights\(blockTop: number, blockFoot: number\): \{ turn: number; glow: number; block: number \}/);
    expect(hero).toMatch(/const was = fill && layoutKey \? rememberedTodayLayout\(layoutKey\) : null;/);
    expect(hero).toMatch(/const at = skyHeights\(\(top \+ was\.block\.y\) \/ sky, \(top \+ was\.block\.y \+ was\.block\.h\) \/ sky\);\s*return minimal \? at : \{ \.\.\.at, turn: sheetTurnAt\(sky\) \};/);
    expect(hero).toMatch(/useState\(startAts\?\.turn \?\? SKY_FADE_LOW_MID_AT\)/);
    expect(hero).toMatch(/useState\(startAts\?\.glow \?\? SKY_THEME_MID_AT\)/);
    expect(hero).toMatch(/useState<number \| undefined>\(startAts\?\.block\)/);
    expect(hero).toMatch(/const at = sheeted && skyH > 0 \? sheetTurnAt\(skyH\) : measured \? skyHeights\(heroY\.eyebrow, footY\)\.turn : SKY_FADE_LOW_MID_AT;/);
    // the states are declared before the painter that the run's keyframes are painted with
    expect(hero.indexOf('const startAts = useMemo')).toBeLessThan(hero.indexOf('const paint = useCallback'));
    expect(hero.indexOf('const startAts = useMemo')).toBeGreaterThan(-1);
  });
});

describe('on the phone the turn is an edge: the page’s sheet over the sky’s foot', () => {
  const sheet = { ...NIGHT, turnAt: sheetTurnAt(700), sheet: true };

  it('the sky is painted whole to its foot — the page is not a stop in it', () => {
    expect(SKY_SHEET_DP).toBe(18);
    expect(sheet.turnAt).toBeCloseTo(1 - 18 / 700, 3);
    expect(skyStops(sheet)).toEqual(skyStops({ ...NIGHT, page: undefined }));
    // a card on a dashboard keeps the fade
    expect(skyStops({ ...NIGHT, turnAt: 0.97 })).toHaveLength(6);
  });

  it('the colour under a word is the sky’s above the edge and the page’s on the sheet', () => {
    expect(skyColorAt(sheet, sheet.turnAt - 0.001)).toBe(skyColorAt({ ...NIGHT, page: undefined }, sheet.turnAt - 0.001));
    expect(skyColorAt(sheet, sheet.turnAt + 0.001)).toBe(NIGHT.page);
    expect(skyColorAt(sheet, 1)).toBe(NIGHT.page);
    // a word wholly above the edge is in the sky's ink; one across it is weighed against both
    expect(skyInkAt(sheet, sheet.turnAt - 0.03, 0.012).text).toBe('#FFFFFF');
    const day = { ...DAY_OVER_DARK, turnAt: sheetTurnAt(700), sheet: true };
    expect(skyInkAt(day, day.turnAt - 0.03, 0.012).text).toBe('#000000');
    expect(skyInkAt(sheet, 0.995, 0.004).text).toBe('#000000');
  });

  it('one view draws it, over the launch run and the still sky alike', () => {
    const sky = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroSky.tsx'), 'utf8');
    expect(sky).toMatch(/frame\.sheet && frame\.page && frame\.turnAt != null/);
    expect(sky.match(/backgroundColor: frame\.page,/g)).toHaveLength(1);
    expect(sky).toMatch(/borderTopStartRadius: Math\.min\(sheetH, SKY_SHEET_RADIUS\)/);
    // after the run's layers, the still sky and the Track: the last child of the root
    expect(sky.indexOf('{sheetH > 0 ? (')).toBeGreaterThan(sky.indexOf('<HeroTrack'));
    expect(sky).toMatch(/sheet: f\.sheet,/);
    // the phone's hero with a list under it — not Minimal, whose hero is the page — and room for it under the block at every hour
    const hero = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'HeroToday.tsx'), 'utf8');
    expect(hero).toMatch(/const sheeted = !!fill && !minimal;/);
    const card = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'home', 'TodayCard.tsx'), 'utf8');
    expect(card).toMatch(/const sheetPad = fullBleed && !minimal && settings\.appearance !== 'sky' \? SKY_SHEET_DP : 0;/);
    expect(card).toMatch(/\+ \(minimal \? footInset : 0\) \+ sheetPad;/);
  });
});

describe('the accent between two hours far apart on the wheel', () => {
  const R = skyMoodsOf('realistic');

  it('holds each end and crosses in the middle of the span — not four accents in half an hour', () => {
    // the afternoon's blue and the golden hour's terracotta
    const blue = R.midday.accent;
    const warm = R.golden.accent;
    expect(Math.abs(hexToOklch(blue).h - hexToOklch(warm).h)).toBeGreaterThan(150);
    const lo = (1 - ACCENT_CROSSING) / 2;
    for (const u of [0.05, 0.15, 0.25, lo]) expect(accentCrossing(blue, warm, u)).toBe(0);
    for (const u of [1 - lo, 0.75, 0.9]) expect(accentCrossing(blue, warm, u)).toBe(1);
    expect(accentCrossing(blue, warm, 0.5)).toBeCloseTo(0.5, 6);
    // eased, and never backwards
    let was = 0;
    for (let u = 0; u <= 1.0001; u += 0.02) {
      const k = accentCrossing(blue, warm, u);
      expect(k).toBeGreaterThanOrEqual(was);
      was = k;
    }
    // the mood: the accent and all that is drawn in or under it wait; the page and the sky do not
    const early = mixMoods(R.midday, R.golden, 0.25);
    for (const k of ['accent', 'accentBg', 'onAccent', 'accentSurface', 'accentSurfaceStrong', 'accentHairline'] as const) expect(early[k]).toBe(R.midday[k]);
    expect(early.heroTop).not.toBe(R.midday.heroTop);
    expect(early.bg).toBe(mixHexOklab(R.midday.bg, R.golden.bg, 0.25));
    const late = mixMoods(R.midday, R.golden, 0.75);
    expect(late.accent).toBe(R.golden.accent);
    // on the way it still reads on the page it is over
    for (let u = 0.3; u <= 0.7; u += 0.05) {
      const m = mixMoods(R.midday, R.golden, u);
      for (const g of [m.bg, m.card, m.controlBg, m.accentBg]) expect(contrastOf(m.accent, g)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('near accents — the same family, an hour apart — mix across the whole span as they did', () => {
    expect(accentCrossing('#0760AB', '#0450A8', 0.2)).toBe(0.2);
    expect(accentCrossing(R.sunset.accent, R.dawn.accent, 0.3)).toBe(0.3);
  });
});

describe('Vibrant’s sun by day', () => {
  it('is lighter than the sky it is drawn on at every light hour — the golden hour’s and the first of the morning’s too', () => {
    const V = skyMoodsOf('vibrant');
    for (const name of ['morning', 'midday', 'golden'] as const) {
      const m = V[name];
      // the disc stands in the upper sky, between the top and the hour's glow
      const sky = mixHexOklab(m.heroTop, m.heroMid, 0.5);
      expect(contrastOf(m.bodyLight, sky)).toBeGreaterThanOrEqual(1.4);
      expect(luminance(m.bodyLight)).toBeGreaterThan(luminance(m.heroMid));
    }
  });
});
