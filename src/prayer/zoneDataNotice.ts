/**
 * WHAT TODAY AND THE SETTINGS SAY ABOUT A PHONE'S OUT-OF-DATE ZONE DATA.
 *
 * Morocco's own words where the phone is in Morocco (#82); for a zone that
 * keeps one offset all year now (`FIXED_ZONES`, #117), the offset, the year
 * and how far the phone's clock is out. Null where there is nothing to say:
 * the phone's zone data is current, the zone is not one the app knows the
 * latest change of, or the clock was set by hand and the times already read
 * right on it (`phoneClockSetByHand`).
 */
import type { TFunction } from 'i18next';
import {
  deviceZoneClock,
  FIXED_ZONES,
  MOROCCO_CLOCK,
  phoneClockRunsOnStaleZone,
  zoneDataLagMinutes,
} from '../providers/locationClock';

/** "UTC+3", "UTC+3:30", "UTC−6" (a real minus sign). */
export function utcOffsetLabel(minutes: number): string {
  const a = Math.abs(minutes);
  const m = a % 60;
  return `UTC${minutes < 0 ? '−' : '+'}${Math.floor(a / 60)}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** The key that changes when the notice would say something new: the zone and how far it is out. */
export function zoneDataNoticeKey(): string | null {
  const clock = deviceZoneClock();
  if (!clock || !phoneClockRunsOnStaleZone(clock)) return null;
  return `${clock.zone}:${zoneDataLagMinutes(clock)}`;
}

export function zoneDataNotice(t: TFunction, where: 'home' | 'settings'): string | null {
  const clock = deviceZoneClock();
  if (!clock || !phoneClockRunsOnStaleZone(clock)) return null;
  if (clock.zone === MOROCCO_CLOCK.zone)
    return t(where === 'home' ? 'home.zoneDataStaleNotice' : 'settings.zoneDataStale');
  const fixed = FIXED_ZONES[clock.zone];
  if (!fixed) return null;
  return t(where === 'home' ? 'home.zoneDataStaleFixedNotice' : 'settings.zoneDataStaleFixed', {
    offset: utcOffsetLabel(fixed.offsetMinutes),
    since: fixed.since,
    minutes: Math.abs(zoneDataLagMinutes(clock)),
  });
}
