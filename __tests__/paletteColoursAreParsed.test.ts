/**
 * A palette colour that is going to be PARSED is asked for as a string.
 *
 * Under Liquid Glass (iOS, system colours) the palette's surfaces, its
 * text and its red are `PlatformColor`s: objects a native view resolves
 * and nothing else can read. `String()` of one is "[object Object]".
 * Today's sky is a gradient that runs into the page's colour; under Liquid
 * Glass it ran into "[object Object]", no sky was painted, the hero's
 * words stood white on a white page, and the posed hero kept under the sky
 * showed through as a second countdown (found 2026-11-24, fixed the day
 * after). Thirty-seven files did the same with one colour or another.
 *
 * The rule: `solidColor(palette, key)` for the surfaces and `danger`;
 * `textSolid`, `mutedSolid`, `accentSolid` for those three. Never
 * `String(palette.x)`.
 */
import fs from 'fs';
import path from 'path';

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.Platform.OS = 'ios';
  return rn;
});

const ROOT = path.join(__dirname, '..', 'src');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('no palette colour is turned into a string by String()', () => {
  it('anywhere in src/', () => {
    const offenders: string[] = [];
    const bad = /String\(\s*(?:\w+\.)*\w*[pP]alette\.(bg|card|border|accentBg|controlBg|danger|accent|text|muted|overlay|accentSurface|accentSurfaceStrong|accentHairline)\s*\)/;
    for (const file of sources(ROOT)) {
      if (file.endsWith(path.join('theme', 'appPalette.ts'))) continue;
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (bad.test(line) && !/^\s*(\*|\/\/)/.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("Today's sky runs into the page's colour as solidColor gives it", () => {
    const hero = fs.readFileSync(path.join(ROOT, 'screens', 'home', 'HeroToday.tsx'), 'utf8');
    expect(hero).toMatch(/const pageBg = solidColor\(pagePalette, 'bg'\);/);
  });
});

describe('solidColor', () => {
  const { buildAppPalette, buildDynamicSystemPaletteForTests, solidColor } = require('../src/theme/appPalette');
  const KEYS = ['bg', 'card', 'accentBg', 'controlBg', 'danger', 'accentSurface', 'accentSurfaceStrong'] as const;

  it.each([
    ['light', false],
    ['dark', true],
  ])('Liquid Glass, %s: every surface and the red come back as a hex', (_n, isDark) => {
    const glass = buildDynamicSystemPaletteForTests(isDark, false, false);
    expect(glass.glass).toBe(true);
    // The palette's own values are not strings — that is the whole point.
    expect(typeof glass.bg).not.toBe('string');
    for (const key of KEYS) expect(solidColor(glass, key)).toMatch(HEX);
    for (const solid of [glass.textSolid, glass.mutedSolid, glass.accentSolid]) expect(solid).toMatch(HEX);
  });

  it('the page under Liquid Glass is the system grouped background', () => {
    expect(solidColor(buildDynamicSystemPaletteForTests(false, false, false), 'bg')).toBe('#F2F2F7');
    expect(solidColor(buildDynamicSystemPaletteForTests(true, false, false), 'bg')).toBe('#000000');
  });

  it('pure black keeps the strings it states', () => {
    const oled = buildDynamicSystemPaletteForTests(true, true, false);
    expect(solidColor(oled, 'bg')).toBe('#000000');
    expect(solidColor(oled, 'card')).toBe('#0d0d0d');
  });

  it('every other palette: the colour it states, unchanged', () => {
    for (const isDark of [false, true]) {
      const p = buildAppPalette(isDark, false, 'green', '#22c55e', false);
      for (const key of [...KEYS, 'border', 'accentHairline'] as const) expect(solidColor(p, key)).toBe(String(p[key]));
    }
  });
});
