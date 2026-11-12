/**
 * Tunisia — the Institut National de la Météorologie, on the phone: the
 * prayer times it gives for the governorates' seats, Aïn Draham and Rjim
 * Maatoug, by its own method (`tunisiaMethod.ts`, from
 * MihrabHQ/mihrab-methods).
 *
 * A reader in one of the places gets that place's times, computed at its
 * point with its horizon — the minute the Institute gives, with the
 * correction list for the few times on the other side of a minute
 * (applied in `localAdhan.ts`). Outside the places this source has
 * nothing to say: the Institute answers each delegation with the horizon
 * of its own height, and the others were not read. Offline, for any date;
 * nothing is downloaded.
 *
 * The Institute gives no sunrise: the one shown is the method's, the
 * mirror of its sunset, held to nothing. Its Asr is at one shadow length;
 * a Hanafi reader's is the method's at two.
 */
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import { tunisiaPlaceAt } from '../utils/tunisiaRegion';
import type { PrayerTimesResult } from './types';

/** The phone's own id for the method (`localAdhan.ts`); not AlAdhan's, and not offered in the method list. */
export const TUNISIA_METHOD_ID = 45;

/** Tunisia keeps UTC+1 all year. */
export const TUNISIA_CLOCK = { zone: 'Africa/Tunis' } as PlaceClock & { zone: string };

/** The Institute's times for the listed place the reader is in. @throws ProviderError('shape') outside its places. */
export async function getTunisiaTimes(params: { latitude: number; longitude: number; date: Date; school?: number }): Promise<PrayerTimesResult> {
  const place = tunisiaPlaceAt(params.latitude, params.longitude);
  if (!place) throw new ProviderError('tunisia', 'shape', 'Outside the places the Institute’s method is held to.');
  return {
    ...computeLocalAdhanTimes({
      latitude: place.lat,
      longitude: place.lon,
      date: params.date,
      calculationMethod: TUNISIA_METHOD_ID,
      school: params.school ?? 0,
      placeClock: TUNISIA_CLOCK,
    }),
    timezone: TUNISIA_CLOCK.zone,
    source: 'local',
  };
}
