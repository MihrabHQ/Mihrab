/**
 * The Sky theme — the app painted in the hero's sky. See
 * src/theme/skyTheme.ts and `skyPalette` in src/theme/appPalette.ts.
 */
import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
    },
  };
});

// eslint-disable-next-line import/first
import { resolveAppPalette, resolveEffectiveDark, resolveThemePaletteForMode, skyPalette } from '../src/theme/appPalette';
// eslint-disable-next-line import/first
import { contrastRatio } from '../src/theme/themeMap';
// eslint-disable-next-line import/first
import { hexToOklch } from '../src/theme/oklch';
// eslint-disable-next-line import/first
import {
  _resetSkyThemeForTests,
  DEFAULT_SKY_THEME,
  getSkyTheme,
  publishSkyTheme,
  restoreSkyTheme,
} from '../src/theme/skyTheme';

/** The sky model's own keys: night, the dawn's middle, day, dusk. */
const SKIES = {
  night: { top: '#0B1230', bottom: '#1E2B5A' },
  dawn: { top: '#2F4A8F', bottom: '#B85E7C' },
  sunrise: { top: '#7FA6DC', bottom: '#FBC48A' },
  day: { top: '#6F9BD8', bottom: '#FBD7A8' },
};

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

beforeEach(_resetSkyThemeForTests);

describe('the palette', () => {
  it.each(Object.entries(SKIES))('reads on every surface under a %s sky', (_name, sky) => {
    for (const pureBlack of [false, true]) {
      const p = skyPalette(sky, pureBlack);
      expect(p.isDark).toBe(true);
      expect(p.tintedSurfaces).toBe(true);
      const bg = String(p.bg);
      const card = String(p.card);
      const controlBg = String(p.controlBg);
      // Text and muted ink clear AA on the ground, the card and a control.
      for (const ground of [bg, card, controlBg]) {
        expect(contrastRatio(p.textSolid, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.mutedSolid, ground)).toBeGreaterThanOrEqual(4.5);
      }
      // The accent is a UI colour: the accent floor on the ground.
      expect(contrastRatio(p.accentSolid, bg)).toBeGreaterThanOrEqual(3);
      // Filled controls read.
      expect(contrastRatio(p.onAccent, p.accentSolid)).toBeGreaterThanOrEqual(3);
      // OLED keeps the page black.
      if (pureBlack) expect(bg).toBe('#000000');
    }
  });

  it('takes the sky\'s hue from its more saturated end — the night\'s blue, the dawn\'s rose, the day\'s blue', () => {
    const hueOf = (hex: string) => hexToOklch(hex).h;
    const night = skyPalette(SKIES.night, false);
    const dawn = skyPalette(SKIES.dawn, false);
    const day = skyPalette(SKIES.day, false);
    expect(hueOf(String(night.card))).toBeGreaterThan(240);
    expect(hueOf(String(night.card))).toBeLessThan(300);
    // The dawn's rose horizon, not its blue top.
    const dawnHue = hueOf(dawn.accentSolid);
    expect(dawnHue > 330 || dawnHue < 30).toBe(true);
    // The day's blue top, not its cream horizon.
    expect(hueOf(String(day.card))).toBeGreaterThan(230);
    expect(hueOf(String(day.card))).toBeLessThan(290);
    // And the three are three different accents.
    expect(new Set([night.accentSolid, dawn.accentSolid, day.accentSolid]).size).toBe(3);
  });

  it('is one look: dark whatever the device, in every mode asked for', () => {
    expect(resolveEffectiveDark('sky', 'light')).toBe(true);
    const light = resolveAppPalette({
      appearance: 'sky',
      useSystemDynamicTheme: true,
      systemScheme: 'light',
      pureBlackDark: false,
      appAccentId: 'green',
      appAccentCustomHex: '#22c55e',
      tintedSurfaces: false,
      sky: SKIES.day,
    });
    expect(light.isDark).toBe(true);
    // System colours and the colour theme have nothing to say under it.
    expect(light.accentSolid).toBe(skyPalette(SKIES.day, false).accentSolid);
    // The mushaf's chrome, asked for the light page, still gets the sky.
    const forLight = resolveThemePaletteForMode(
      {
        appearance: 'sky',
        useSystemDynamicTheme: false,
        pureBlackDark: false,
        appAccentId: 'green',
        appAccentCustomHex: '#22c55e',
        sky: SKIES.night,
      },
      false,
    );
    expect(forLight.accentSolid).toBe(skyPalette(SKIES.night, false).accentSolid);
    // Without a sky yet: the default night.
    expect(resolveThemePaletteForMode({ appearance: 'sky', useSystemDynamicTheme: false, pureBlackDark: false, appAccentId: 'green', appAccentCustomHex: '#22c55e' }, true).accentSolid)
      .toBe(skyPalette(DEFAULT_SKY_THEME, false).accentSolid);
  });
});

describe('the store', () => {
  it('keeps the last sky, on disk too, and the live sky beats the remembered one', async () => {
    expect(getSkyTheme()).toEqual(DEFAULT_SKY_THEME);
    publishSkyTheme(SKIES.dawn);
    expect(getSkyTheme()).toEqual(SKIES.dawn);
    // A new process: the remembered dawn, until the hero says otherwise.
    _resetSkyThemeForTests();
    await restoreSkyTheme();
    expect(getSkyTheme()).toEqual(SKIES.dawn);
    // …and had the hero published first, the restore would not undo it.
    _resetSkyThemeForTests();
    publishSkyTheme(SKIES.day);
    await restoreSkyTheme();
    expect(getSkyTheme()).toEqual(SKIES.day);
    // Rubbish is ignored.
    publishSkyTheme({ top: 'blue', bottom: '#123456' });
    expect(getSkyTheme()).toEqual(SKIES.day);
  });
});

describe('wiring', () => {
  it('the hero publishes the live sky, the palettes read it, the card offers it', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toMatch(/publishSkyTheme\(\{ top: liveSky\.top, bottom: liveSky\.bottom \}\)/);
    expect(card).toMatch(/if \(posed\) return;\s*publishSkyTheme/);
    for (const p of ['src/hooks/useAppPalette.ts', 'src/AppNavigationRoot.tsx', 'src/quran/useScrubberChrome.ts']) {
      expect(read(p)).toMatch(/useSkyTheme\((settings\.)?appearance === 'sky'\)/);
    }
    const appearance = read('src/screens/settings/AppearanceCard.tsx');
    expect(appearance).toMatch(/\{ key: 'sky', label: t\('settings\.themeSky'\) \}/);
    expect(appearance).toMatch(/!dynamicColorsActive && !skyActive &&/);
    for (const lang of ['en', 'sv', 'ar', 'de', 'fr', 'es', 'tr', 'id', 'ur', 'hi', 'bn', 'ru', 'zh']) {
      const strings = JSON.parse(read(`src/i18n/locales/${lang}.json`));
      expect(typeof strings.settings.themeSky).toBe('string');
      expect(typeof strings.settings.themeSkyHelp).toBe('string');
    }
  });
});
