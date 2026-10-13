/**
 * The page bar's colours, from the selected theme rendered for the PAGE's
 * mode rather than the app's.
 *
 * A night page is dark whatever the app is doing; its scrubber needs the
 * theme's dark accent and dark surfaces. A paper page is light; it needs
 * the light accent over its own chrome. Reading the app's current palette
 * gave the night page a deep light-mode accent (invisible) and unthemed
 * surfaces whenever the app was in light — which is where the surah bubble
 * used to fall apart.
 */
import { useMemo } from 'react';
import { useAppearanceSettings } from '../context/PrayerSettingsContext';
import { resolveThemePaletteForMode, type AppPalette } from '../theme/appPalette';
import { useSkyTheme } from '../theme/skyTheme';
import {
  isThemedDarkPage,
  scrubberChrome,
  toneIsDark,
  TONE_PAGE_BG,
  type MushafTone,
  type ToneChrome,
} from './mushafTone';

/** The selected theme, rendered for this page's mode. */
export function usePagePalette(tone: MushafTone): AppPalette {
  const { slice } = useAppearanceSettings();
  const {
    appearance,
    useSystemDynamicTheme,
    pureBlackDark,
    appAccentId,
    appAccentCustomHex,
    tintedSurfaces,
  } = slice;
  const sky = useSkyTheme(appearance === 'sky');
  return useMemo(
    () =>
      resolveThemePaletteForMode(
        {
          appearance,
          useSystemDynamicTheme,
          // A night page is the OLED black whatever the app is set to
          // (`TONE_PAGE_BG`), so the theme rendered for it is the
          // pure-black one — its surfaces are the ones that sit on that
          // ground. The app's own setting still decides the app.
          pureBlackDark: pureBlackDark || toneIsDark(tone),
          appAccentId,
          appAccentCustomHex,
          tintedSurfaces,
          sky,
        },
        toneIsDark(tone),
      ),
    [
      sky,
      tone,
      appearance,
      useSystemDynamicTheme,
      pureBlackDark,
      appAccentId,
      appAccentCustomHex,
      tintedSurfaces,
    ],
  );
}

export function useScrubberChrome(tone: MushafTone): ToneChrome {
  const pagePalette = usePagePalette(tone);
  return useMemo(() => scrubberChrome(tone, pagePalette), [tone, pagePalette]);
}

/**
 * The page's ground. The print's own (`TONE_PAGE_BG`) — except a night
 * page under the Sky theme, which takes the hour's dark ground (the
 * night's indigo, the evening's purple) so the theme carries into the
 * screen read longest; at the same lightness as the OLED page is dark,
 * and still absolute black when Pure black is on, since the palette
 * rendered for the page already honours that. Paper and sepia are paper
 * and sepia whatever the hour.
 */
export function usePageGround(tone: MushafTone): string {
  const { slice } = useAppearanceSettings();
  const pagePalette = usePagePalette(tone);
  if (slice.appearance === 'sky' && isThemedDarkPage(tone, pagePalette)) return String(pagePalette.bg);
  return TONE_PAGE_BG[tone];
}
