/**
 * The app's palette, resolved ONCE and handed down.
 *
 * `useAppPalette()` is called by nearly every component that draws — two
 * hundred call sites, and far more instances: every row of every list is
 * one. Each of them used to resolve the palette for itself, which meant
 * that each instance, on mount, held two pieces of state, subscribed
 * three times to native events (`Appearance` twice, `AppState` once),
 * subscribed to the sky, and built its own copy of the palette; and,
 * because the resolving read the whole settings object, each of them
 * rendered again on ANY change to ANY setting — a switch on the
 * Notifications page re-rendered every row of every screen kept alive
 * under it.
 *
 * The answer was always the same for all of them. So it is worked out
 * here, by the one provider `PrayerSettingsProvider` renders, and a
 * consumer reads it from context: no state, no subscriptions, and a
 * render only when the palette itself is a different object.
 *
 * WHAT IS KEPT, EXACTLY. `useResolvedAppPalette` is the old hook's body,
 * unchanged: the authoritative system scheme (useSystemColorScheme), the
 * Android `bump` that gives the palette a new identity on every
 * Appearance event so `PlatformColor` attributes are resolved again
 * (task #90), and the sky under the Sky theme. A new palette object still
 * re-renders every consumer; that is the point of `bump` and it holds.
 */
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';
import { useSystemColorScheme } from '../hooks/useSystemColorScheme';
import type { PrayerAppSettings } from '../settings/types';
import { resolveAppPalette, type AppPalette } from './appPalette';
import { useSkyTheme } from './skyTheme';

export type AppPaletteValue = {
  palette: AppPalette;
  isDark: boolean;
};

/** The settings the palette is made of, and no others. */
export type PaletteSettings = Pick<
  PrayerAppSettings,
  | 'appearance'
  | 'useSystemDynamicTheme'
  | 'pureBlackDark'
  | 'appAccentId'
  | 'appAccentCustomHex'
  | 'tintedSurfaces'
>;

export const AppPaletteContext = createContext<AppPaletteValue | null>(null);

/**
 * Palette + isDark with a belt-and-braces Appearance subscription —
 * task #90 follow-up.
 *
 * `useColorScheme()` from RN should fire whenever the system scheme
 * flips, but on Android with `configChanges="uiMode"` and the Material
 * You dynamic palette, some devices (Pixel 8 / 10 in particular) emit
 * the appearance event without invalidating PlatformColor's cached
 * attribute resolution. The result: the user toggles dark mode from
 * the notification panel, the JS scheme updates, but the colorSurface
 * attribute stays resolved against the previous theme.
 *
 * Subscribing manually to `Appearance` here gives us a second wakeup
 * signal independent of `useColorScheme()`. The `bump` counter is
 * included as a useMemo dep so the palette object identity changes on
 * every appearance event, forcing every consumer of the palette
 * (which spreads it into View `style` props) to re-render — and that
 * re-render is what causes RN's ViewManager to re-resolve the
 * PlatformColor attribute references against the now-current theme.
 */
export function useResolvedAppPalette(settings: PaletteSettings): AppPaletteValue {
  // Authoritative scheme (re-reads on appearance change + foreground) so the
  // palette never lags behind the OS in "System" mode — see useSystemColorScheme.
  const systemScheme = useSystemColorScheme();

  // Wake-up counter that increments on every Appearance event. We don't
  // care about the value, only that it changes — that's what forces the
  // useMemo below to recompute and pushes new style objects to consumers.
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Appearance.addChangeListener(() => {
      setBump(n => n + 1);
    });
    return () => {
      sub.remove();
    };
  }, []);

  // The hero's sky, only under the Sky theme (theme/skyTheme.ts).
  const sky = useSkyTheme(settings.appearance === 'sky');

  const palette = useMemo(
    () =>
      resolveAppPalette({
        appearance: settings.appearance,
        useSystemDynamicTheme: settings.useSystemDynamicTheme,
        systemScheme,
        pureBlackDark: settings.pureBlackDark,
        appAccentId: settings.appAccentId,
        appAccentCustomHex: settings.appAccentCustomHex,
        tintedSurfaces: settings.tintedSurfaces,
        sky,
      }),
    // `bump` is included so a manual Appearance event re-runs this even
    // when systemScheme appears unchanged from React's perspective.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      settings.appearance,
      settings.useSystemDynamicTheme,
      settings.pureBlackDark,
      settings.appAccentId,
      settings.appAccentCustomHex,
      settings.tintedSurfaces,
      systemScheme,
      sky,
      bump,
    ],
  );

  // One object per palette: a consumer's render is decided by its identity.
  // The palette's own answer for `isDark`: under the Sky theme the hour decides it.
  return useMemo(() => ({ palette, isDark: palette.isDark }), [palette]);
}

/** Rendered by `PrayerSettingsProvider`, so wherever there are settings there is a palette. */
export function AppPaletteProvider({
  settings,
  children,
}: {
  settings: PaletteSettings;
  children: ReactNode;
}) {
  const value = useResolvedAppPalette(settings);
  return <AppPaletteContext.Provider value={value}>{children}</AppPaletteContext.Provider>;
}
