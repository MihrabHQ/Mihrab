import {
  regionalProviderCovers,
  regionalProviderForCoords,
} from './regionalProviders';
import { isCoordinateInTurkey } from '../utils/turkeyRegion';
import type { PrayerAppSettings, PrayerDataProviderId } from './types';

/** When automatic mode is on and coordinates are outside Sweden, use this source. */
export const AUTO_DEFAULT_OUTSIDE_SWEDEN: PrayerDataProviderId = 'aladhan';

/** Minimal hook state shape for resolving coordinates (avoids circular imports). */
export type ProviderCoordState = {
  phase: string;
  latitude?: number;
  longitude?: number;
};

/**
 * A coordinate that is a place: finite, and not (0, 0), the "no location
 * set" the settings hold before one is chosen or while the location store
 * cannot be read (`storage.ts`). Taken for a place, it was out of every
 * national source's country, and a source picked by hand went to Automatic
 * for a location nobody had set (`locationProviders.ts`).
 */
function placeOrNull(
  latitude: unknown,
  longitude: unknown,
): { latitude: number; longitude: number } | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number')
    return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export function resolveCoordsForProvider(
  settings: PrayerAppSettings,
  state: ProviderCoordState,
): { latitude: number; longitude: number } | null {
  if (settings.locationMode === 'manual') {
    return placeOrNull(settings.manualLatitude, settings.manualLongitude);
  }
  if (state.phase === 'ready') {
    const fix = placeOrNull(state.latitude, state.longitude);
    if (fix) return fix;
  }
  return placeOrNull(
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
  );
}

/** Coords for Settings UI when Home may not be mounted (GPS: last fetch only). */
export function resolveCoordsFromSettings(
  settings: PrayerAppSettings,
): { latitude: number; longitude: number } | null {
  if (settings.locationMode === 'manual') {
    return placeOrNull(settings.manualLatitude, settings.manualLongitude);
  }
  return placeOrNull(
    settings.lastFetchedLatitude,
    settings.lastFetchedLongitude,
  );
}

export function getEffectiveDataProvider(
  dataProviderAuto: boolean,
  dataProvider: PrayerDataProviderId,
  coords: { latitude: number; longitude: number } | null,
  /**
   * The calculation method setting. Automatic takes Diyanet — near a place
   * it lists or in Türkiye — and MUIS, JAKIM and Kemenag only while this is
   * Automatic too: a method the reader chose is theirs, and the source's own
   * would set it aside without a word.
   */
  calculationMethod: PrayerAppSettings['calculationMethod'],
): PrayerDataProviderId {
  const methodIsAutomatic = calculationMethod === 'auto';
  if (dataProviderAuto) {
    // Automatic: a country with its own published tables gets them; near a
    // place Diyanet lists, Diyanet's table; everywhere else the global
    // default. Switches as the user moves.
    // The countries live in `regionalProviders.ts` — this branch does not
    // name any of them, which is the point of the table.
    return (
      regionalProviderForCoords(coords, methodIsAutomatic) ??
      AUTO_DEFAULT_OUTSIDE_SWEDEN
    );
  }

  // Manual provider — honour the user's pick, with ONE safety guard. A
  // regional source only holds data for its own country and maps anything
  // else to its nearest listed city, so a user who pinned it and then
  // travelled would get a neighbouring country's schedule presented as
  // their own. Redirect only when we KNOW the coordinate is out of region;
  // with no coords yet the pick stands and is re-resolved once location
  // loads. The reverse — forcing a regional source on someone inside its
  // country — is left to automatic mode, because a deliberate pick of
  // something else is a choice worth respecting.
  // Not covered: what Automatic picks there — the source that fits best
  // (`locationProviders.ts` also turns the location's setting to Automatic).
  if (!regionalProviderCovers(dataProvider, coords)) {
    return (
      regionalProviderForCoords(coords, methodIsAutomatic) ??
      AUTO_DEFAULT_OUTSIDE_SWEDEN
    );
  }
  return dataProvider;
}

/**
 * Is the source Diyanet here only for being near a place it lists — not
 * pinned by hand, and not Türkiye's own? Then a calculation method chosen
 * under Calculation takes the source back to AlAdhan with that method
 * (`getEffectiveDataProvider`), so the method picker is offered rather than
 * hidden as it is under a source with a fixed method.
 */
export function isDiyanetByProximity(
  dataProviderAuto: boolean,
  dataProvider: PrayerDataProviderId,
  coords: { latitude: number; longitude: number } | null,
  calculationMethod: PrayerAppSettings['calculationMethod'],
): boolean {
  if (!coords || isCoordinateInTurkey(coords.latitude, coords.longitude))
    return false;
  return (
    getEffectiveDataProvider(
      dataProviderAuto,
      dataProvider,
      coords,
      calculationMethod,
    ) === 'diyanet' &&
    // Would a method of the reader's own move it? Not for a pinned Diyanet.
    getEffectiveDataProvider(dataProviderAuto, dataProvider, coords, 3) !==
      'diyanet'
  );
}
