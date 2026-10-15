/**
 * The line under a location in the location lists: the prayer-time source it
 * answers with — "Automatic · Sweden", or the one picked for it.
 */
import { getEffectiveDataProvider } from './effectiveProvider';
import { providerChoiceForKey } from './locationProviders';
import { getProviderLabel } from './providersCatalog';
import type { PrayerAppSettings } from './types';

export function locationSourceLine(
  s: Pick<
    PrayerAppSettings,
    | 'locationMode'
    | 'activeLocationPresetId'
    | 'locationPresets'
    | 'dataProvider'
    | 'dataProviderAuto'
    | 'locationProviders'
    | 'manualLatitude'
    | 'manualLongitude'
    | 'lastFetchedLatitude'
    | 'lastFetchedLongitude'
  >,
  key: string,
  coords: { latitude: number; longitude: number } | null,
  t: (key: string, opts: Record<string, unknown>) => string,
): string {
  const c = providerChoiceForKey(s, key);
  const used = getEffectiveDataProvider(c.auto, c.provider, coords);
  return c.auto
    ? t('settings.providerAutoLine', { label: getProviderLabel(used) })
    : getProviderLabel(used);
}
