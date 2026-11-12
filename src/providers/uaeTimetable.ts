/**
 * The United Arab Emirates, on the phone: the prayer times the General
 * Authority of Islamic Affairs, Endowments and Zakat publishes for its
 * forty-one zones, by its own method (`uaeMethod.ts`, from
 * MihrabHQ/mihrab-methods) at the zone's point, with its correction list
 * for the few times the published table is on the other side of a minute
 * (applied in `localAdhan.ts`). Offline, for any date; nothing is
 * downloaded.
 *
 * Which zone is a reader's. The Authority names each zone's areas — some
 * four hundred — but draws no map of them. `data/uaeAreas.json` places the
 * towns and larger districts of each zone (approximate centres, for this
 * choice only; a zone of one place stands at its own point), and a reader
 * is given the zone of the nearest. A zone's own point is not used for
 * this: it is the zone's western edge, where its evening is computed. The
 * two summits, Jebel Jais and Jebel Hafeet, whose horizon is far lower
 * than the plain's below them, answer only on the mountain.
 *
 * The Authority prints the first Asr; a reader who keeps the Hanafi Asr
 * gets it from the same method at two shadow lengths.
 */
import zones from './data/uaeZones.json';
import areas from './data/uaeAreas.json';
import { computeLocalAdhanTimes } from './localAdhan';
import { ProviderError } from './errors';
import type { PlaceClock } from './locationClock';
import { isCoordinateInUae } from '../utils/uaeRegion';
import type { PrayerTimesResult } from './types';

/** The phone's own id for the method (`localAdhan.ts`); not AlAdhan's, and not offered in the method list. */
export const UAE_METHOD_ID = 42;

export type UaeZone = { id: number; name: string; lat: number; lon: number; dipEast: number; dipWest: number; morningMinutes: number };
export type UaeArea = { zone: number; name: string; lat: number; lon: number };
export const UAE_ZONES: readonly UaeZone[] = zones as UaeZone[];
export const UAE_AREAS: readonly UaeArea[] = areas as UaeArea[];

/** The Emirates keep UTC+4 all year. */
export const UAE_CLOCK = { zone: 'Asia/Dubai' } as PlaceClock & { zone: string };

/** Jebel Hafeet and Jebel Jais: the summit's zone, within this of it. */
const SUMMITS: ReadonlySet<number> = new Set([52, 80]);
const SUMMIT_KM = 6;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

let byId: Map<number, UaeZone> | null = null;
/** The zone that answers for a reader in the Emirates: the nearest listed area's. */
export function uaeZoneFor(latitude: number, longitude: number): UaeZone & { area: string; distanceKm: number } {
  byId ??= new Map(UAE_ZONES.map(z => [z.id, z]));
  let best: UaeArea | null = null;
  let gap = Infinity;
  for (const a of UAE_AREAS) {
    const d = distanceKm(latitude, longitude, a.lat, a.lon);
    if (SUMMITS.has(a.zone) && d > SUMMIT_KM) continue;
    if (d < gap) {
      best = a;
      gap = d;
    }
  }
  const area = best as UaeArea;
  return { ...(byId.get(area.zone) as UaeZone), area: area.name, distanceKm: gap };
}

let byPoint: Map<string, UaeZone> | null = null;
/** The zone a point of the table is, for the horizons and the morning margin it is computed with. */
export function uaeZoneAt(latitude: number, longitude: number): UaeZone | undefined {
  byPoint ??= new Map(UAE_ZONES.map(z => [`${z.lat.toFixed(4)},${z.lon.toFixed(4)}`, z]));
  return byPoint.get(`${latitude.toFixed(4)},${longitude.toFixed(4)}`);
}

/** The Authority's times for the reader's zone. @throws ProviderError('shape') outside the Emirates. */
export async function getUaeTimes(params: { latitude: number; longitude: number; date: Date; school?: number }): Promise<PrayerTimesResult> {
  if (!isCoordinateInUae(params.latitude, params.longitude)) throw new ProviderError('uae', 'shape', 'Outside the United Arab Emirates.');
  const zone = uaeZoneFor(params.latitude, params.longitude);
  return {
    ...computeLocalAdhanTimes({
      latitude: zone.lat,
      longitude: zone.lon,
      date: params.date,
      calculationMethod: UAE_METHOD_ID,
      school: params.school ?? 0,
      placeClock: UAE_CLOCK,
    }),
    timezone: UAE_CLOCK.zone,
    source: 'local',
  };
}
