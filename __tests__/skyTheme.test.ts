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
import { resolveAppPalette, resolveThemePaletteForMode, skyPalette } from '../src/theme/appPalette';
// eslint-disable-next-line import/first
import { contrastRatio } from '../src/theme/themeMap';
// eslint-disable-next-line import/first
import { PALETTE_STEPS, SKY_MOODS, skyMoodAt, skyMoodFor, type SkyMood } from '../src/theme/skyMoods';
// eslint-disable-next-line import/first
import { SKY_THEME_MID_AT, skyColorAt, themedSkyFrame, type SkyPassage } from '../src/screens/home/skyModel';
// eslint-disable-next-line import/first
import {
  _resetSkyThemeForTests,
  DEFAULT_SKY_THEME,
  getSkyTheme,
  publishSkyTheme,
  restoreSkyTheme,
} from '../src/theme/skyTheme';

/** Moments of the day, as the hero would publish them. */
const SKIES = {
  night: { top: '#0B1230', bottom: '#1E2B5A', passage: 'night', t: 0.5 },
  dawn: { top: '#2F4A8F', bottom: '#B85E7C', passage: 'dawn', t: 0.6 },
  day: { top: '#6F9BD8', bottom: '#FBD7A8', passage: 'day', t: 0.6 },
  golden: { top: '#6F9BD8', bottom: '#FBD7A8', passage: 'sunset', t: 0.45 },
  sunset: { top: '#5A2C6E', bottom: '#F27A4B', passage: 'sunset', t: 0.8 },
} as const;

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

beforeEach(_resetSkyThemeForTests);

/** Every token reads on every ground it is drawn on. */
function expectLegible(mood: SkyMood) {
  for (const ground of [mood.bg, mood.card, mood.controlBg]) {
    expect(contrastRatio(mood.text, ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mood.muted, ground)).toBeGreaterThanOrEqual(4.5);
  }
  // The accent is drawn as text on the page and the card.
  for (const ground of [mood.bg, mood.card]) {
    expect(contrastRatio(mood.accent, ground)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrastRatio(mood.onAccent, mood.accent)).toBeGreaterThanOrEqual(4.5);
  // The highlight (the next prayer's row, a selected segment): the time is
  // written on it in the accent, the name in the ink.
  expect(contrastRatio(mood.accent, mood.accentBg)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(mood.text, mood.accentBg)).toBeGreaterThanOrEqual(4.5);
  // The chrome bands (a header strip, the tab bar) carry the ink and the accent.
  for (const band of [mood.accentSurface, mood.accentSurfaceStrong]) {
    expect(contrastRatio(mood.text, band)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mood.muted, band)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mood.accent, band)).toBeGreaterThanOrEqual(4.5);
  }
  // Dark moods have light ink and the other way round.
  expect(contrastRatio(mood.text, '#000000') > contrastRatio(mood.text, '#FFFFFF')).toBe(mood.isDark);
}

describe('the moods', () => {
  it.each(Object.values(SKY_MOODS))('$name reads on every surface', mood => {
    expectLegible(mood);
  });

  it('read all the way through every mix, and the ground never turns mid-mix', () => {
    const passages: SkyPassage[] = ['night', 'dawn', 'day', 'sunset', 'dusk'];
    for (const passage of passages) {
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const mood = skyMoodFor(passage, t);
        expectLegible(mood);
        const { from, to } = skyMoodAt(passage, t);
        expect(from.isDark).toBe(to.isDark);
      }
    }
  });

  it('moves a little every step of every passage — no two moments the same sky', () => {
    const passages: SkyPassage[] = ['night', 'dawn', 'day', 'sunset', 'dusk'];
    for (const passage of passages) {
      let prev = skyMoodFor(passage, 0);
      for (let t = 0.02; t <= 1.0001; t += 0.02) {
        const mood = skyMoodFor(passage, t);
        const moved = (['heroTop', 'heroMid', 'bg', 'bodyLight'] as const).some(k => mood[k] !== prev[k]);
        expect(moved).toBe(true);
        prev = mood;
      }
    }
    // The sun and the moon and the stars take the hour's light.
    const real = { passage: 'day', t: 0.5, top: '#000000', bottom: '#000000', glow: '#ffffff', stars: 0, body: { kind: 'sun', x: 0.5, y: 0.1, alpha: 1, light: '#FFFFFF', halo: 0.2 } } as const;
    const themed = themedSkyFrame(real, SKY_MOODS.midday);
    expect(themed.body.kind === 'sun' && themed.body.light).toBe(SKY_MOODS.midday.bodyLight);
    expect(themed.body.kind === 'sun' && themed.body.halo).toBeGreaterThan(0.2);
    expect(themed.glow).toBe(SKY_MOODS.midday.starGlow);
  });

  it('is the night at night, the dawn before sunrise, the midday after, gold and then the evening before Maghrib, the night again after Isha', () => {
    expect(skyMoodFor('night', 0.3).name).toBe('night');
    expect(skyMoodFor('dawn', 0.9).name).toBe('dawn');
    expect(skyMoodFor('day', 0.5).name).toBe('midday');
    expect(skyMoodFor('sunset', 0.49).isDark).toBe(false);
    expect(skyMoodFor('sunset', 0.5).name).toBe('sunset');
    expect(skyMoodFor('dusk', 1).name).toBe('night');
    // Sunrise is the switch: the dawn's dark into the morning's light.
    expect(skyMoodFor('dawn', 1).isDark).toBe(true);
    expect(skyMoodFor('day', 0).isDark).toBe(false);
  });
});

describe('the palette', () => {
  it.each(Object.entries(SKIES))('is the mood of the hour under a %s sky', (_name, sky) => {
    for (const pureBlack of [false, true]) {
      const p = skyPalette(sky, pureBlack);
      const mood = skyMoodFor(sky.passage, sky.t, PALETTE_STEPS);
      expect(p.isDark).toBe(mood.isDark);
      expect(p.accentSolid).toBe(mood.accent);
      expect(p.textSolid).toBe(mood.text);
      expect(String(p.bg)).toBe(pureBlack && mood.isDark ? '#000000' : mood.bg);
      expect(p.tintedSurfaces).toBe(true);
    }
  });

  it('is light by day and dark by night — the hour decides, not the device', () => {
    const at = (sky: typeof SKIES[keyof typeof SKIES], scheme: 'light' | 'dark') =>
      resolveAppPalette({
        appearance: 'sky',
        useSystemDynamicTheme: true,
        systemScheme: scheme,
        pureBlackDark: false,
        appAccentId: 'green',
        appAccentCustomHex: '#22c55e',
        tintedSurfaces: false,
        sky,
      });
    expect(at(SKIES.day, 'dark').isDark).toBe(false);
    expect(at(SKIES.night, 'light').isDark).toBe(true);
    // System colours and the colour theme have nothing to say under it.
    expect(at(SKIES.day, 'light').accentSolid.toLowerCase()).toBe(SKY_MOODS.midday.accent.toLowerCase());
    // The mushaf's chrome asks for a polarity: a light mood asked for dark
    // gives the night; a dark one asked for light gives the midday.
    const forDark = resolveThemePaletteForMode(
      { appearance: 'sky', useSystemDynamicTheme: false, pureBlackDark: false, appAccentId: 'green', appAccentCustomHex: '#22c55e', sky: SKIES.day },
      true,
    );
    expect(forDark.accentSolid).toBe(SKY_MOODS.night.accent);
    const forLight = resolveThemePaletteForMode(
      { appearance: 'sky', useSystemDynamicTheme: false, pureBlackDark: false, appAccentId: 'green', appAccentCustomHex: '#22c55e', sky: SKIES.night },
      false,
    );
    expect(forLight.accentSolid).toBe(SKY_MOODS.midday.accent);
    // Without a sky yet: the default night.
    expect(
      resolveThemePaletteForMode({ appearance: 'sky', useSystemDynamicTheme: false, pureBlackDark: false, appAccentId: 'green', appAccentCustomHex: '#22c55e' }, true).accentSolid,
    ).toBe(skyPalette(DEFAULT_SKY_THEME, false).accentSolid);
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
    publishSkyTheme({ top: 'blue', bottom: '#123456', passage: 'day', t: 0.5 });
    expect(getSkyTheme()).toEqual(SKIES.day);
    // A minute on in the same mood is not a change the app is told about.
    const before = getSkyTheme();
    publishSkyTheme({ ...SKIES.night, t: 0.51 });
    publishSkyTheme({ ...SKIES.night, t: 0.52 });
    expect(getSkyTheme()).not.toBe(before);
    const night = getSkyTheme();
    publishSkyTheme({ ...SKIES.night, t: 0.53 });
    expect(getSkyTheme()).toBe(night);
  });
});

describe('the hero under the theme', () => {
  it('wears the hour\'s gradient, three stops, the foot on the page', () => {
    const real = { passage: 'night', t: 0.5, top: '#0B1230', bottom: '#1E2B5A', glow: '#fff', stars: 1, body: { kind: 'none' } } as const;
    const themed = themedSkyFrame(real, SKY_MOODS.night);
    expect(themed.top).toBe(SKY_MOODS.night.heroTop);
    expect(themed.mid).toBe(SKY_MOODS.night.heroMid);
    expect(themed.bottom).toBe(SKY_MOODS.night.bg);
    expect(themed.body).toBe(real.body);
    // The colour at the middle stop is the middle stop's; the foot is the page.
    expect(skyColorAt(themed, SKY_THEME_MID_AT).toLowerCase()).toBe(SKY_MOODS.night.heroMid.toLowerCase());
    expect(skyColorAt(themed, 1).toLowerCase()).toBe(SKY_MOODS.night.bg.toLowerCase());
    for (const mood of Object.values(SKY_MOODS)) expect(mood.heroFoot).toBe(mood.bg);
  });

  it('is painted in the hero and in the launch run\'s keyframes alike, glows by night, and has the fuller stars', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toMatch(/skyTheme \? themedSkyFrame\(f, skyMoodFor\(f\.passage, f\.t\)\) : f/);
    expect(card).toMatch(/return paint\(skyFrame\(skyMoment\(day, at, tomorrowFajr\)/);
    expect(card).toMatch(/textShadowColor: `\$\{mood\.accent\}99`/);
    expect(card).toMatch(/if \(!mood\.isDark\) return null;/);
    expect(card).toMatch(/denseStars=\{skyTheme\}/);
    const sky = read('src/screens/home/HeroSky.tsx');
    expect(sky).toMatch(/const field = dense \? STAR_FIELD_DENSE : STAR_FIELD;/);
    expect(sky).toMatch(/<Stop key="m" offset=\{frame\.midAt\} stopColor=\{frame\.mid\} \/>/);
    expect(sky).toMatch(/<Stop key="m" offset=\{g\.midAt\} stopColor=\{g\.mid\} \/>/);
  });
});

describe('wiring', () => {
  it('the hero publishes the live sky, the palettes read it, the card offers it', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toMatch(/publishSkyTheme\(\{ top: liveSky\.top, bottom: liveSky\.bottom, passage: liveSky\.passage, t: liveSky\.t \}\)/);
    // The hour decides light or dark: the hooks take it off the palette.
    expect(read('src/hooks/useAppPalette.ts')).toMatch(/isDark: palette\.isDark/);
    expect(read('src/AppNavigationRoot.tsx')).toMatch(/const isDark = palette\.isDark;/);
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
