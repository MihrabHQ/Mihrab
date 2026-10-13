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

jest.mock('../src/native/LaunchSnapshot', () => ({ crossfadeScreen: jest.fn() }));

// eslint-disable-next-line import/first
import { crossfadeScreen } from '../src/native/LaunchSnapshot';
// eslint-disable-next-line import/first
import { resolveAppPalette, resolveThemePaletteForMode, skyPalette } from '../src/theme/appPalette';
// eslint-disable-next-line import/first
import { contrastRatio } from '../src/theme/themeMap';
import { hexToOklch } from '../src/theme/oklch';
// eslint-disable-next-line import/first
import { PALETTE_STEPS, SKY_MOODS, skyMoodAt, skyMoodFor, widgetSkyColors, type SkyMood } from '../src/theme/skyMoods';
// eslint-disable-next-line import/first
import { SKY_THEME_MID_AT, skyColorAt, themedSkyFrame, type SkyPassage } from '../src/screens/home/skyModel';
// eslint-disable-next-line import/first
import { SUN_HORIZON_GROWTH, sunScaleAt } from '../src/screens/home/HeroSky';
// eslint-disable-next-line import/first
import {
  _resetSkyThemeForTests,
  _subscribeSkyThemeForTests as useSkyThemeSubscribe,
  DEFAULT_SKY_THEME,
  getSkyTheme,
  publishSkyTheme,
  restoreSkyTheme,
  skyDayKey,
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

  it('never goes grey between a warm hour and a cool one — the sky keeps its colour through every mix', () => {
    // Peach into azure, straight through OKLab, met in a grey; the late
    // morning and the late afternoon carry the sky round by rose and
    // lilac, and the hour's own colours keep their chroma on the way.
    const passages: SkyPassage[] = ['day', 'sunset'];
    for (const passage of passages) {
      for (let t = 0; t <= 0.5001; t += 1 / 32) {
        const mood = skyMoodFor(passage, t, PALETTE_STEPS);
        expect(hexToOklch(mood.heroTop).C).toBeGreaterThanOrEqual(0.075);
        expect(hexToOklch(mood.accent).C).toBeGreaterThanOrEqual(0.13);
        expect(hexToOklch(mood.bodyLight).C).toBeGreaterThanOrEqual(0.08);
      }
    }
    // Morning to midday goes by way of lilac, not green.
    const lilac = hexToOklch(skyMoodFor('day', 0.15).heroTop).h;
    expect(lilac).toBeGreaterThan(280);
    expect(lilac).toBeLessThan(330);
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
  it('asks for a crossfade of the screen when the page turns from dark to light or back, and only then, and only while someone is looking', () => {
    const fade = crossfadeScreen as jest.Mock;
    fade.mockClear();
    const off = useSkyThemeSubscribe();
    // The first word from the hero is not a change.
    publishSkyTheme({ ...SKIES.dawn, t: 0.9 });
    expect(fade).not.toHaveBeenCalled();
    // Sunrise: dark to light.
    publishSkyTheme({ ...SKIES.day, t: 0.0 });
    expect(fade).toHaveBeenCalledTimes(1);
    // Through the day: no fade.
    publishSkyTheme({ ...SKIES.day, t: 0.5 });
    publishSkyTheme({ ...SKIES.golden });
    expect(fade).toHaveBeenCalledTimes(1);
    // Halfway to Maghrib: light to dark.
    publishSkyTheme({ ...SKIES.sunset, t: 0.5 });
    expect(fade).toHaveBeenCalledTimes(2);
    // Nobody looking (the theme is off): no fade for a flip.
    off();
    publishSkyTheme({ ...SKIES.day, t: 0.5 });
    expect(fade).toHaveBeenCalledTimes(2);
  });

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

  it('works the sky out for the launch\'s own clock from the day\'s times kept beside it', async () => {
    // Left at 06:50 (dawn), reopened at 10:50: the first screen is the
    // day's, not the dawn's and then the day's.
    const times = { Fajr: '05:04', Sunrise: '07:13', Dhuhr: '12:39', Asr: '15:09', Maghrib: '17:55', Isha: '19:48' };
    publishSkyTheme({ ...SKIES.dawn, t: 0.8 }, { day: skyDayKey(new Date(2026, 9, 13)), times, tomorrowFajr: '05:06' });
    _resetSkyThemeForTests();
    await restoreSkyTheme(() => new Date(2026, 9, 13, 10, 50));
    expect(getSkyTheme().passage).toBe('day');
    expect(getSkyTheme().t).toBeGreaterThan(0.4);
    expect(getSkyTheme().t).toBeLessThan(0.5);
    // Another day: the times are not this day's; the remembered sky stands.
    _resetSkyThemeForTests();
    await restoreSkyTheme(() => new Date(2026, 9, 14, 10, 50));
    expect(getSkyTheme().passage).toBe('dawn');
    // The hero's own publish of the same hour then changes nothing.
    const off = useSkyThemeSubscribe();
    _resetSkyThemeForTests();
    await restoreSkyTheme(() => new Date(2026, 9, 13, 10, 50));
    const before = getSkyTheme();
    publishSkyTheme({ top: '#000000', bottom: '#ffffff', passage: 'day', t: before.t });
    expect(getSkyTheme()).toBe(before);
    off();
    // Awaited with the settings, so the first render wears it.
    expect(read('src/context/PrayerSettingsContext.tsx')).toMatch(/Promise\.all\(\[loadSettings\(\), restoreSkyTheme\(\)\]\)/);
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
    expect(card).toMatch(/textShadowColor: `\$\{mood\.accent\}73`/);
    expect(card).toMatch(/if \(!mood\.isDark\) return null;/);
    expect(card).toMatch(/denseStars=\{skyTheme\}/);
    const sky = read('src/screens/home/HeroSky.tsx');
    expect(sky).toMatch(/const field = dense \? STAR_FIELD_DENSE : STAR_FIELD;/);
    expect(sky).toMatch(/<Stop key="m" offset=\{frame\.midAt\} stopColor=\{frame\.mid\} \/>/);
    expect(sky).toMatch(/<Stop key="m" offset=\{g\.midAt\} stopColor=\{g\.mid\} \/>/);
  });
});

describe('the widgets', () => {
  it('take a dark card in the hour\'s hue with an accent that reads on it, at every hour', () => {
    const passages: SkyPassage[] = ['night', 'dawn', 'day', 'sunset', 'dusk'];
    for (const passage of passages) {
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const { bg, accent } = widgetSkyColors(skyMoodFor(passage, t));
        // Light text on the card: the card is dark whatever the app's page.
        expect(contrastRatio('#FFFFFF', bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(widgetSkyColors(SKY_MOODS.night)).toEqual({ bg: SKY_MOODS.night.bg, accent: SKY_MOODS.night.accent });
    const hook = read('src/widget/syncWidgetUiHints.ts');
    expect(hook).toMatch(/setAndroidWidgetSky\?\.\(skyBg, skyAccent\)/);
    expect(hook).toMatch(/const skyColors = skyOn \? widgetSkyColors\(/);
  });
});

describe('the sky\'s small life', () => {
  it('the sun grows toward the horizon, in the still sky and in the run alike; three stars breathe, not under Reduce Motion', () => {
    expect(sunScaleAt(0.08)).toBe(1);
    expect(sunScaleAt(0.26)).toBeCloseTo(1 + SUN_HORIZON_GROWTH, 5);
    expect(sunScaleAt(0.17)).toBeCloseTo(1 + SUN_HORIZON_GROWTH / 2, 5);
    const sky = read('src/screens/home/HeroSky.tsx');
    expect(sky).toMatch(/r=\{SUN_R \* sunScaleAt\(body\.y\)\}/);
    expect(sky).toMatch(/sunScale: through\(body\.map\(b => \(b && b\.kind === 'sun' \? sunScaleAt\(b\.y\) : 1\)\)\)/);
    expect(sky).toMatch(/\{ scale: built\.sunScale \}/);
    expect(sky).toMatch(/\{!running && drawStars && denseStars \? \(\s*<Twinkle/);
    expect(sky).toMatch(/if \(reduceMotion\) return undefined;/);
    expect(sky).toMatch(/easing: Easing\.inOut\(Easing\.sin\), useNativeDriver: true/);
  });
});

describe('the reader', () => {
  it('paints a night page in the hour\'s dark ground under the theme, and nothing else', () => {
    const chrome = read('src/quran/useScrubberChrome.ts');
    expect(chrome).toMatch(/if \(slice\.appearance === 'sky' && isThemedDarkPage\(tone, pagePalette\)\) return String\(pagePalette\.bg\);/);
    expect(chrome).toMatch(/return TONE_PAGE_BG\[tone\];/);
    const core = read('src/quran/mushafReaderCore.tsx');
    expect(core).toMatch(/const ground = usePageGround\(tone\);/);
    expect(core).not.toMatch(/TONE_PAGE_BG\[tone\]/);
    const surah = read('src/screens/quran/MushafSurahScreen.tsx');
    expect(surah).toMatch(/const ground = usePageGround\(tone\);/);
    expect(surah).not.toMatch(/TONE_PAGE_BG/);
  });
});

describe('access and polish', () => {
  it('is offered in onboarding, keyed into the launch picture\'s look by mood, and the glow yields to increased contrast', () => {
    const personalise = read('src/onboarding/screens/PersonaliseScreen.tsx');
    expect(personalise).toMatch(/\{ key: 'sky', label: t\('settings\.themeSky'\) \}/);
    // Offered as a picture of its moods, the picture the control; the
    // colour theme steps aside once the sky paints the palette.
    expect(personalise).toMatch(/<SkyMoodStrip[\s\S]*?onPress=\{\(\) => updateSettings\(\{ appearance: 'sky' \}\)\}/);
    expect(personalise).toMatch(/skyActive\s+\? t\('settings\.themeSkyHelp'\)\s+: t\(\s*'onboarding\.personalise\.skyOffer'/);
    expect(personalise).toMatch(/\{dynamicColours \|\| skyActive \? null : \(/);
    const strip = read('src/components/SkyMoodStrip.tsx');
    for (const name of ['night', 'dawn', 'morning', 'midday', 'golden', 'sunset']) expect(strip).toContain(`'${name}'`);
    expect(strip).toMatch(/accessibilityState=\{\{ selected \}\}/);
    const locales = fs.readdirSync(path.join(__dirname, '..', 'src/i18n/locales')).filter(f => f.endsWith('.json'));
    for (const file of locales) {
      const json = JSON.parse(read(`src/i18n/locales/${file}`));
      expect(typeof json.onboarding?.personalise?.skyOffer).toBe('string');
    }
    const root = read('src/AppNavigationRoot.tsx');
    // The look is the settings', not the hour's: a picture from another
    // hour fades into this one rather than leaving the launch on the
    // skeleton (the hero runs from the prayer's start under it anyway).
    expect(root).toMatch(/setLaunchSnapshotLook\(lookKeyOf\(settings\), settings\.appearance === 'system'\);/);
    expect(root).not.toMatch(/lookMoodKey/);
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toMatch(/const moreContrast = useIncreasedContrast\(\);/);
    expect(card).toMatch(/if \(!skyTheme \|\| moreContrast\) return null;/);
    // The hero asks for the crossfade before it repaints across the switch.
    expect(card).toMatch(/if \(!posed && !launchRun && moodDark != null && lastMoodDark\.current != null && lastMoodDark\.current !== moodDark\) \{\s*crossfadeScreen\(\);/);
    const hook = read('src/hooks/useIncreasedContrast.ts');
    expect(hook).toMatch(/isDarkerSystemColorsEnabled/);
    expect(hook).toMatch(/isReduceTransparencyEnabled/);
    expect(hook).toMatch(/isHighTextContrastEnabled/);
  });
});

describe('wiring', () => {
  it('the hero publishes the live sky, the palettes read it, the card offers it', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toMatch(/publishSkyTheme\(\s*\{ top: liveSky\.top, bottom: liveSky\.bottom, passage: liveSky\.passage, t: liveSky\.t \},\s*\{ day: skyDayKey\(new Date\(liveMinuteKey \* 60_000\)\), times: skyToday \?\? today, tomorrowFajr \},\s*\)/);
    // The hour decides light or dark: the hooks take it off the palette.
    expect(read('src/hooks/useAppPalette.ts')).toMatch(/isDark: palette\.isDark/);
    expect(read('src/AppNavigationRoot.tsx')).toMatch(/const isDark = palette\.isDark;/);
    expect(card).toMatch(/if \(posed\) return;[\s\S]{0,200}publishSkyTheme\(/);
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
