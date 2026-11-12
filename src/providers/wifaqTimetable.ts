/**
 * United Kingdom — Wifaqul Ulama (Britain), on the phone: the times its
 * yearly timetables print for some eighty towns, by its own method
 * (`wifaqMethod.ts`, from MihrabHQ/mihrab-methods).
 *
 * A reader in one of the towns gets that town's times, computed at the
 * town's point — the printed minute, with the correction list for the few
 * times on the other side of a minute (applied in `localAdhan.ts`).
 * Outside the towns this source has nothing to say. Offline, for any date;
 * nothing is downloaded.
 *
 * The timetables print both Asrs, and the reader's school decides: the
 * Hanafi Asr is the one the correction list is for; the Shafi'i is the
 * same method's, without the list.
 */
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import { wifaqTownAt } from '../utils/wifaqRegion';
import type { PrayerTimesResult } from './types';

/** The phone's own id for the method (`localAdhan.ts`); not AlAdhan's, and not offered in the method list. */
export const WIFAQ_METHOD_ID = 44;

/** Jersey and Longford keep London's clock. */
export const BRITAIN_CLOCK = { zone: 'Europe/London' } as PlaceClock & { zone: string };

/** Wifaqul Ulama's times for the listed town the reader is in. @throws ProviderError('shape') outside its towns. */
export async function getWifaqTimes(params: { latitude: number; longitude: number; date: Date; school?: number }): Promise<PrayerTimesResult> {
  const town = wifaqTownAt(params.latitude, params.longitude);
  if (!town) throw new ProviderError('wifaq', 'shape', 'Outside the towns of Wifaqul Ulama’s timetables.');
  return {
    ...computeLocalAdhanTimes({
      latitude: town.lat,
      longitude: town.lon,
      date: params.date,
      calculationMethod: WIFAQ_METHOD_ID,
      school: params.school ?? 0,
      placeClock: BRITAIN_CLOCK,
    }),
    timezone: BRITAIN_CLOCK.zone,
    source: 'local',
  };
}
