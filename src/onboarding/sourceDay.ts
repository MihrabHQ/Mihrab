/**
 * Today's times as Today will show them: from the reader's own source,
 * with their own offsets.
 *
 * The onboarding previews compute on the phone (`previewTimes.ts`), which
 * is what lets ʿaṣr move under the finger. But where the source is a
 * published table — Islamiska Förbundet, Habous, the Algerian ministry —
 * the calculation can be a minute off it, and the screens presented that
 * minute as fact: "You're ready — Today in Stockholm", ʿAṣr 2:49 PM, and
 * Today a moment later saying 2:50 PM. A list titled "today" has to be
 * the list Today shows.
 *
 * So this asks the source the way Today does (`getOrFetchPrayerDay`, the
 * same provider and parameters as `usePrayerDay`) and answers null until
 * it has; the screens show the preview meanwhile and swap in the source's
 * day when it lands. For a source computed on the phone that is the same
 * frame or the next; for one asked over the network, a moment.
 */
import { useEffect, useState } from 'react';
import { getOrFetchPrayerDay } from '../prayer/prayerStorage';
import {
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../settings/effectiveProvider';
import { applyOffsets } from '../settings/prayerOffsets';
import type { PrayerAppSettings } from '../settings/types';
import type { TimingsMap } from '../types/prayer';

type SourceDaySettings = Pick<
  PrayerAppSettings,
  | 'locationMode'
  | 'manualLatitude'
  | 'manualLongitude'
  | 'lastFetchedLatitude'
  | 'lastFetchedLongitude'
  | 'dataProviderAuto'
  | 'dataProvider'
  | 'calculationMethod'
  | 'school'
  | 'prayerOffsets'
>;

/** The source Today will ask for these settings, or null without a place. */
export function effectiveProviderFor(settings: SourceDaySettings) {
  const coords = resolveCoordsFromSettings(settings as PrayerAppSettings);
  if (!coords) return null;
  return getEffectiveDataProvider(
    settings.dataProviderAuto,
    settings.dataProvider,
    coords,
    settings.calculationMethod,
  );
}

/** Today's times from the source, under `school` (default: the stored one), or null until known. */
export function useSourceDay(
  settings: SourceDaySettings,
  school: number = settings.school,
): TimingsMap | null {
  const coords = resolveCoordsFromSettings(settings as PrayerAppSettings);
  const lat = coords?.latitude;
  const lng = coords?.longitude;
  const key = [
    lat,
    lng,
    school,
    settings.calculationMethod,
    settings.dataProvider,
    settings.dataProviderAuto,
    JSON.stringify(settings.prayerOffsets ?? {}),
  ].join('|');
  const [day, setDay] = useState<{ key: string; timings: TimingsMap } | null>(null);
  useEffect(() => {
    if (lat == null || lng == null) return undefined;
    let live = true;
    const provider = getEffectiveDataProvider(
      settings.dataProviderAuto,
      settings.dataProvider,
      { latitude: lat, longitude: lng },
      settings.calculationMethod,
    );
    getOrFetchPrayerDay({
      provider,
      latitude: lat,
      longitude: lng,
      calculationMethod: settings.calculationMethod,
      school,
      date: new Date(),
    })
      .then(d => {
        if (!live) return;
        setDay({ key, timings: applyOffsets(d.timings, settings.prayerOffsets ?? {}) });
      })
      // No answer leaves the preview on screen, which is what it was for.
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // `key` carries every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return day && day.key === key ? day.timings : null;
}
