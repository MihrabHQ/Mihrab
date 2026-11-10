import { useContext } from 'react';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import type { AppPalette } from '../theme/appPalette';
import {
  AppPaletteContext,
  useResolvedAppPalette,
  type AppPaletteValue,
} from '../theme/appPaletteContext';

export type { AppPalette };

/**
 * The app's colours, and whether they are dark.
 *
 * Read from the one palette `PrayerSettingsProvider` resolves for the
 * whole tree (theme/appPaletteContext.tsx, which has the why): a consumer
 * holds no state and no subscriptions of its own, and renders again only
 * when the palette is a different object — not when some unrelated
 * setting changed.
 */
export function useAppPalette(): AppPaletteValue {
  const shared = useContext(AppPaletteContext);
  if (shared) return shared;
  // No palette above: a tree with settings but without their provider (a
  // test that stands the settings in by hand). Resolved here, as every
  // caller once did. Whether there is a provider does not change during a
  // component's life, so the hooks below are the same ones on every render.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useOwnAppPalette();
}

function useOwnAppPalette(): AppPaletteValue {
  const { settings } = usePrayerSettings();
  return useResolvedAppPalette(settings);
}
