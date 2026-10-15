/**
 * EACH LOCATION KEEPS ITS OWN PRAYER-TIME SOURCE.
 *
 * "My location" (the phone's own position), each saved location, and a
 * place picked by search without saving it each remember the source chosen
 * for them — Automatic, or a source picked by hand. Changing the source for
 * one never changes it for another, and switching location brings that
 * location's choice back.
 *
 * A source picked by hand is kept for as long as it covers where the
 * location is. When it does not — "My location" has travelled out of the
 * source's country, or a place was picked there — the location goes back to
 * Automatic, which picks the source that fits best there.
 *
 * The rest of the app reads one source: `dataProvider` / `dataProviderAuto`
 * hold the ACTIVE location's choice, the way `manualLatitude` & co. hold
 * the active saved location's coordinates. `locationProviders` keeps every
 * location's, keyed by `locationKeyOf`; `applyLocationProviders` keeps the
 * two in step on every settings change.
 */
import { regionalProviderCovers } from './regionalProviders';
import { resolveCoordsFromSettings } from './effectiveProvider';
import type { LocationPreset, PrayerAppSettings, PrayerDataProviderId } from './types';

export type LocationProviderChoice = { auto: boolean; provider: PrayerDataProviderId };

/** "My location" — the phone's own position. */
export const MY_LOCATION_KEY = 'my';
/** A place picked by search or coordinates and not saved. */
export const UNSAVED_PLACE_KEY = 'manual';

type Locational = Pick<
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
>;

/** Which location the app is on. */
export function locationKeyOf(s: Pick<PrayerAppSettings, 'locationMode' | 'activeLocationPresetId'>): string {
  if (s.locationMode !== 'manual') return MY_LOCATION_KEY;
  return s.activeLocationPresetId ?? UNSAVED_PLACE_KEY;
}

const AUTOMATIC = (provider: PrayerDataProviderId): LocationProviderChoice => ({ auto: true, provider });

/** A saved location's choice (Automatic until one is made for it). */
export function providerChoiceForPreset(s: Locational, preset: Pick<LocationPreset, 'id'>): LocationProviderChoice {
  if (locationKeyOf(s) === preset.id) return { auto: s.dataProviderAuto, provider: s.dataProvider };
  return s.locationProviders?.[preset.id] ?? AUTOMATIC(s.dataProvider);
}

/**
 * The settings after `patch`, with the active location's source in step:
 * a change of location brings that location's choice in (its own, or
 * Automatic for a location that has none yet) and keeps the one left; a
 * change of source is kept for the active location only; and a source
 * picked by hand that does not cover where the location is goes back to
 * Automatic.
 */
export function applyLocationProviders<T extends Locational>(prev: T, patch: Partial<T>): T {
  const next = { ...prev, ...patch } as T;
  const map: Record<string, LocationProviderChoice> = { ...(prev.locationProviders ?? {}) };
  const prevKey = locationKeyOf(prev);
  const nextKey = locationKeyOf(next);
  const sourceChanged = 'dataProvider' in patch || 'dataProviderAuto' in patch;

  if (prevKey !== nextKey) {
    map[prevKey] = { auto: prev.dataProviderAuto, provider: prev.dataProvider };
    if (!sourceChanged) {
      const incoming = map[nextKey] ?? AUTOMATIC(prev.dataProvider);
      next.dataProviderAuto = incoming.auto;
      next.dataProvider = incoming.provider;
    }
  }

  // A source picked by hand stays while it covers the location; past that, Automatic.
  if (!next.dataProviderAuto) {
    const coords = resolveCoordsFromSettings(next as unknown as PrayerAppSettings);
    if (coords && !regionalProviderCovers(next.dataProvider, coords)) next.dataProviderAuto = true;
  }

  map[nextKey] = { auto: next.dataProviderAuto, provider: next.dataProvider };
  // A deleted saved location takes its choice with it.
  const ids = new Set((next.locationPresets ?? []).map(p => p.id));
  for (const k of Object.keys(map)) {
    if (k !== MY_LOCATION_KEY && k !== UNSAVED_PLACE_KEY && !ids.has(k)) delete map[k];
  }
  next.locationProviders = map;
  return next;
}

/**
 * Settings saved before locations kept their own sources: every location
 * then shared one choice, so each starts from it — nothing changes for
 * anyone until they choose differently for a location.
 */
export function seedLocationProviders<T extends Locational>(s: T): T {
  if (s.locationProviders && typeof s.locationProviders === 'object') return s;
  const choice = { auto: s.dataProviderAuto, provider: s.dataProvider };
  const map: Record<string, LocationProviderChoice> = { [MY_LOCATION_KEY]: choice, [UNSAVED_PLACE_KEY]: choice };
  for (const p of s.locationPresets ?? []) map[p.id] = choice;
  return { ...s, locationProviders: map };
}

/** A stored map, cleaned: unknown sources and malformed entries are dropped. */
export function coerceLocationProviders(
  value: unknown,
  known: readonly string[],
): Record<string, LocationProviderChoice> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, LocationProviderChoice> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const c = v as Partial<LocationProviderChoice> | null;
    if (!c || typeof c.auto !== 'boolean' || typeof c.provider !== 'string') continue;
    out[k] = known.includes(c.provider)
      ? { auto: c.auto, provider: c.provider as PrayerDataProviderId }
      : { auto: true, provider: 'aladhan' };
  }
  return out;
}

/** The choice a location holds (the active one's from the mirrored fields). */
export function providerChoiceForKey(s: Locational, key: string): LocationProviderChoice {
  if (key === locationKeyOf(s)) return { auto: s.dataProviderAuto, provider: s.dataProvider };
  return s.locationProviders?.[key] ?? AUTOMATIC(s.dataProvider);
}
